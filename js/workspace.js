// Unified local libraries. Built-in algorithms are immutable sources; each case stores personal overlays.
(function () {
    'use strict';
    var DB_NAME = 'zbll_local_workspaces', STORE = 'workspaces', BACKUPS = 'migration_backups';
    var ACTIVE_KEY = 'zbll_active_workspace', LEGACY_PUBLIC_KEY = 'zbll_public_mode';
    function t(key, args) { return window.ZBLL_I18N ? window.ZBLL_I18N.t(key, args) : key.replace(/\{(\w+)\}/g, function (match, name) { return args && name in args ? args[name] : match; }); }
    function failure(key) { return window.ZBLL_I18N ? window.ZBLL_I18N.error(key) : new Error(key); }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function makeId() { return window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
    function cases(workspace, fn) {
        workspace.categories.forEach(function (cat) { cat.subcategories.forEach(function (sub) { sub.formulas.forEach(function (f) { fn(f, cat, sub); }); }); });
    }
    function caseKey(cat, sub, id) { return JSON.stringify([cat, sub, id]); }
    function lineSignature(line) { return JSON.stringify([line.alg, line.marks]); }
    function validLine(line) { return line && typeof line.alg === 'string' && Array.isArray(line.marks) && line.marks.every(function (m) { return typeof m === 'string'; }); }
    function catalog(data) {
        var result = [];
        cases(data, function (f, cat, sub) {
            var key = caseKey(cat.id, sub.id, f.id), seen = Object.create(null);
            result.push({ key: key, category: cat.id, subcategory: sub.id, formulaId: f.id, lines: (f.lines || []).map(function (line) {
                var signature = lineSignature(line), occurrence = seen[signature] || 0;
                seen[signature] = occurrence + 1;
                return { id: JSON.stringify([key, signature, occurrence]), alg: line.alg, marks: line.marks.slice() };
            }) });
        });
        return result;
    }
    function sourceFor(workspace, formula) { return workspace.sources.find(function (s) { return s.key === formula.sourceCaseKey; }); }
    function sourceLines(workspace, formula) { var source = sourceFor(workspace, formula); return source ? source.lines : []; }
    function defaultImage(workspace, formula) {
        var source = sourceFor(workspace, formula);
        if (!source) return '';
        var cat = window.ZBLL_DATA.categories.find(function (c) { return c.id === source.category; });
        var sub = cat && cat.subcategories.find(function (s) { return s.id === source.subcategory; });
        var original = sub && sub.formulas.find(function (f) { return f.id === source.formulaId; });
        return original ? original.image || '' : '';
    }
    function visibleLines(workspace, formula) {
        return sourceLines(workspace, formula).filter(function (line) { return formula.visibleSourceLineIds.indexOf(line.id) >= 0; }).map(function (line) {
            return { id: 'source:' + line.id, alg: line.alg, marks: line.marks.slice(), origin: 'source' };
        }).concat(formula.customLines.map(function (line) {
            return { id: 'custom:' + line.id, alg: line.alg, marks: line.marks.slice(), origin: 'custom' };
        }));
    }
    function normalizeSelection(workspace, formula) {
        if (formula.selectedLineId && !visibleLines(workspace, formula).some(function (line) { return line.id === formula.selectedLineId; })) delete formula.selectedLineId;
    }
    // Derived lines remain compatible with rendering/statistics, but never enter persistence/export.
    function hydrate(workspace) {
        if (!workspace) return workspace;
        workspace.sources.forEach(function (s) {
            s.lines.forEach(function (line) { Object.freeze(line.marks); Object.freeze(line); });
            Object.freeze(s.lines); Object.freeze(s);
        });
        Object.freeze(workspace.sources);
        cases(workspace, function (f) {
            delete f.lines;
            Object.defineProperty(f, 'lines', { configurable: true, enumerable: false, get: function () { return visibleLines(workspace, f); } });
            normalizeSelection(workspace, f);
        });
        return workspace;
    }
    function newLibrary(data, name) {
        var now = new Date().toISOString();
        var result = { format: 'zbll-workspace', version: 2, kind: 'workspace', id: makeId(), name: name || t('我的公式库'), createdAt: now, updatedAt: now,
            sourceFingerprint: data.meta && data.meta.fingerprint || '', sources: catalog(data), categories: clone(data.categories) };
        cases(result, function (f, cat, sub) {
            f.uid = f.uid || f.id || makeId();
            f.sourceCaseKey = caseKey(cat.id, sub.id, f.id);
            f.visibleSourceLineIds = sourceLines(result, f).map(function (line) { return line.id; });
            f.customLines = []; f.learned = false;
            delete f.lines; delete f.selectedLineAlg; delete f.selectedLineIndex; delete f.selectedLineId;
        });
        return hydrate(result);
    }
    function validateStructure(raw) {
        if (!raw || raw.format !== 'zbll-workspace' || (raw.version !== 1 && raw.version !== 2) || !Array.isArray(raw.categories)) throw failure('不是支持的 .zbll 公式库文件');
        var expected = window.ZBLL_DATA.categories;
        if (raw.categories.length !== expected.length) throw failure('公式库分类数量不一致');
        raw.categories.forEach(function (cat, ci) {
            if (!cat || cat.id !== expected[ci].id || !Array.isArray(cat.subcategories) || cat.subcategories.length !== expected[ci].subcategories.length) throw failure('公式库分类结构无效');
            cat.subcategories.forEach(function (sub, si) {
                if (!sub || sub.id !== expected[ci].subcategories[si].id || !Array.isArray(sub.formulas)) throw failure('公式库子分类结构无效');
            });
        });
    }
    function validateV2(raw) {
        validateStructure(raw);
        if (raw.version !== 2 || !Array.isArray(raw.sources)) throw failure('公式库来源目录无效');
        var keys = new Set();
        raw.sources.forEach(function (s) {
            if (!s || typeof s.key !== 'string' || keys.has(s.key) || typeof s.category !== 'string' || typeof s.subcategory !== 'string' || typeof s.formulaId !== 'string' || s.key !== caseKey(s.category, s.subcategory, s.formulaId) || !Array.isArray(s.lines)) throw failure('公式库来源标识无效或重复');
            keys.add(s.key);
            var ids = new Set();
            s.lines.forEach(function (line) {
                if (!validLine(line) || typeof line.id !== 'string' || !line.id || ids.has(line.id)) throw failure('大神公式行无效或 ID 重复');
                ids.add(line.id);
            });
        });
        var uids = new Set();
        cases(raw, function (f, cat, sub) {
            if (!f || typeof f.uid !== 'string' || !f.uid || uids.has(f.uid) || typeof f.id !== 'string' || typeof f.notes !== 'string' || typeof f.image !== 'string' || typeof f.learned !== 'boolean' || !Array.isArray(f.customLines) || !Array.isArray(f.visibleSourceLineIds)) throw failure('case 数据无效或 ID 重复');
            uids.add(f.uid);
            if (f.clearedImage !== undefined && typeof f.clearedImage !== 'string') throw failure('已清除图片的备份无效');
            var src = sourceFor(raw, f);
            if (f.sourceCaseKey !== null && (!src || src.category !== cat.id || src.subcategory !== sub.id)) throw failure('case 来源引用无效');
            var allowed = new Set((src ? src.lines : []).map(function (line) { return line.id; }));
            var visible = new Set();
            f.visibleSourceLineIds.forEach(function (id) { if (!allowed.has(id) || visible.has(id)) throw failure('显示的大神公式引用无效或重复'); visible.add(id); });
            var customIds = new Set();
            f.customLines.forEach(function (line) {
                if (!validLine(line) || typeof line.id !== 'string' || !line.id || customIds.has(line.id)) throw failure('个人公式行无效或 ID 重复');
                customIds.add(line.id);
            });
            if (f.selectedLineId !== undefined && (typeof f.selectedLineId !== 'string' || !visibleLines(raw, f).some(function (line) { return line.id === f.selectedLineId; }))) throw failure('选中公式引用无效');
        });
        return raw;
    }
    function migrate(raw, data) {
        validateStructure(raw);
        if (raw.version === 2) return hydrate(validateV2(clone(raw)));
        var result = clone(raw), publicKind = raw.id === '__public_copy__' || raw.kind === 'public-copy' || raw.kind === 'public-library';
        result.version = 2; result.kind = 'workspace'; result.sources = catalog(data);
        var usedUids = new Set();
        cases(result, function (f, cat, sub) {
            if (!f || !Array.isArray(f.lines) || !f.lines.every(validLine)) throw failure('旧公式库包含无效公式');
            var oldLines = f.lines, oldSelection = typeof f.selectedLineAlg === 'string' ? f.selectedLineAlg : (oldLines[f.selectedLineIndex] || {}).alg;
            f.id = typeof f.id === 'string' ? f.id : String(f.uid || makeId());
            f.uid = typeof f.uid === 'string' && f.uid && !usedUids.has(f.uid) ? f.uid : makeId(); usedUids.add(f.uid);
            f.image = typeof f.image === 'string' ? f.image : ''; f.notes = typeof f.notes === 'string' ? f.notes : ''; f.learned = f.learned === true;
            // Match immutable original IDs only, never current position, label text or image.
            var key = caseKey(cat.id, sub.id, f.id);
            var source = result.sources.find(function (s) { return s.key === key; });
            if (!source && f.uid) source = result.sources.find(function (s) { return s.key === caseKey(cat.id, sub.id, f.uid); });
            f.sourceCaseKey = source ? source.key : null;
            f.visibleSourceLineIds = publicKind && source ? source.lines.map(function (l) { return l.id; }) : [];
            f.customLines = [];
            var remaining = source ? source.lines.slice() : [];
            oldLines.forEach(function (line) {
                var match = publicKind ? remaining.findIndex(function (s) { return lineSignature(s) === lineSignature(line); }) : -1;
                var id;
                if (match >= 0) id = 'source:' + remaining.splice(match, 1)[0].id;
                else { var own = { id: makeId(), alg: line.alg, marks: line.marks.slice() }; f.customLines.push(own); id = 'custom:' + own.id; }
                if (!f.selectedLineId && oldSelection === line.alg) f.selectedLineId = id;
            });
            delete f.lines; delete f.selectedLineAlg; delete f.selectedLineIndex;
        });
        validateV2(result);
        return hydrate(result);
    }
    function requestResult(request) {
        return new Promise(function (resolve, reject) { request.onsuccess = function () { resolve(request.result); }; request.onerror = function () { reject(request.error); }; });
    }
    function transact(db, stores, action) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(stores, 'readwrite');
            tx.oncomplete = function () { resolve(); };
            tx.onerror = tx.onabort = function () { reject(tx.error || failure('本地保存失败')); };
            try { action(tx); } catch (error) { tx.abort(); reject(error); }
        });
    }
    var ready = new Promise(function (resolve, reject) {
        if (!window.indexedDB) return reject(failure('当前浏览器不支持本地公式库存储'));
        var req = indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = function () {
            var db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
            if (!db.objectStoreNames.contains(BACKUPS)) db.createObjectStore(BACKUPS, { keyPath: 'id' });
        };
        req.onerror = function () { reject(req.error); };
        req.onblocked = function () { reject(failure('请关闭其他旧版网站标签页后重试')); };
        req.onsuccess = function () { req.result.onversionchange = function () { req.result.close(); }; resolve(req.result); };
    }).then(async function (db) {
        var all = await requestResult(db.transaction(STORE).objectStore(STORE).getAll());
        var pending = all.filter(function (w) { return w.version === 1; }).map(function (old) { return { old: old, next: clone(migrate(old, window.ZBLL_DATA)) }; });
        if (pending.length) await transact(db, [STORE, BACKUPS], function (tx) {
            pending.forEach(function (item) {
                tx.objectStore(BACKUPS).add({ id: 'v1:' + item.old.id, savedAt: new Date().toISOString(), original: item.old });
                tx.objectStore(STORE).put(item.next);
            });
        });
        // Keep the actual previous mode, not the last library highlighted in the manager.
        var active = localStorage.getItem(ACTIVE_KEY), oldPublic = localStorage.getItem(LEGACY_PUBLIC_KEY);
        if (!active && oldPublic && oldPublic !== 'default') {
            var oldId = oldPublic === 'edited' ? (all.find(function (w) { return w.kind === 'public-copy' || w.id === '__public_copy__'; }) || {}).id : oldPublic;
            if (all.some(function (w) { return w.id === oldId; })) localStorage.setItem(ACTIVE_KEY, oldId);
        }
        localStorage.removeItem(LEGACY_PUBLIC_KEY);
        return db;
    });
    var api = {
        ready: ready, makeId: makeId, clone: function (w) { return hydrate(clone(w)); }, sourceLines: sourceLines,
        normalizeSelection: normalizeSelection, defaultImage: defaultImage,
        async list() { var db = await ready; var all = await requestResult(db.transaction(STORE).objectStore(STORE).getAll()); return all.map(hydrate).sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); }); },
        async get(id) { if (!id) return null; var db = await ready; return hydrate(await requestResult(db.transaction(STORE).objectStore(STORE).get(id))); },
        async put(workspace) {
            cases(workspace, function (f) { normalizeSelection(workspace, f); });
            var output = clone(workspace); validateV2(output); output.updatedAt = new Date().toISOString();
            var db = await ready;
            await transact(db, [STORE], function (tx) { tx.objectStore(STORE).put(output); });
            workspace.updatedAt = output.updatedAt; return workspace;
        },
        async remove(id) { var db = await ready; await transact(db, [STORE], function (tx) { tx.objectStore(STORE).delete(id); }); if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY); },
        async create(data, name) { var w = newLibrary(data, name); await this.put(w); return w; },
        async activate(id) {
            var w = id ? await this.get(id) : null;
            if (w) localStorage.setItem(ACTIVE_KEY, w.id); else localStorage.removeItem(ACTIVE_KEY);
            window.dispatchEvent(new CustomEvent('zbll-workspace-changed', { detail: w })); return w;
        },
        activeId: function () { return localStorage.getItem(ACTIVE_KEY) || ''; },
        async importFile(file) {
            var w = migrate(JSON.parse(await file.text()), window.ZBLL_DATA);
            w.id = makeId(); w.kind = 'workspace'; w.name = String(w.name || t('导入的公式库')).slice(0, 80);
            w.createdAt = w.createdAt || new Date().toISOString();
            var list = await this.list(), base = w.name, n = 2;
            while (list.some(function (item) { return item.name === w.name; })) w.name = base + ' ' + n++;
            await this.put(w); return w;
        },
        exportPublic: function (data) { return newLibrary(data, t('ZBLL 公式库')); },
        async exportFile(workspace, onProgress, signal) {
            function progress(n, key, args) { if (onProgress) onProgress(n, t(key, args), { key: key, args: args }); }
            function check() { if (signal && signal.aborted) throw new DOMException(t('导出已取消'), 'AbortError'); }
            check(); progress(0, '准备公式库数据');
            var output = clone(workspace); validateV2(output);
            var queue = []; cases(output, function (f) { queue.push(f); });
            var next = 0, done = 0;
            async function worker() {
                while (next < queue.length) {
                    check(); var f = queue[next++];
                    // Include cleared-image backups so restoring also works after export/import.
                    for (var key of ['image', 'clearedImage']) {
                        if (f[key] && !/^data:/i.test(f[key])) {
                            try {
                                var response = await fetch(new URL(f[key], document.baseURI).href, signal ? { signal: signal } : undefined);
                                if (response.ok) {
                                    var blob = await response.blob(); check();
                                    f[key] = await new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = reject; r.readAsDataURL(blob); });
                                }
                            } catch (error) { check(); /* Keep the original path if an image cannot be embedded. */ }
                        }
                    }
                    done++; progress(Math.round(done / queue.length * 100), '整理图片和公式 {done}/{total}', { done: done, total: queue.length });
                }
            }
            await Promise.all(Array.from({ length: Math.min(16, queue.length) }, worker)); check();
            var blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json;charset=utf-8' });
            var url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url;
            a.download = (workspace.name || 'zbll-workspace').replace(/[\\/:*?"<>|]/g, '_') + '.zbll';
            a.click(); progress(100, '已下载 {name}', { name: a.download }); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }
    };
    // Disable language changes only while asynchronous library operations are in flight.
    ['put', 'remove', 'create', 'activate', 'importFile', 'exportFile'].forEach(function (name) {
        var original = api[name];
        api[name] = async function () {
            var i18n = window.ZBLL_I18N;
            if (i18n) i18n.setBusy(1);
            try { return await original.apply(this, arguments); }
            finally { if (i18n) i18n.setBusy(-1); }
        };
    });
    window.ZBLL_WORKSPACE = api;
})();
