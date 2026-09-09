// static 本地工作区：数据只保存在当前浏览器或用户导出的 .zbll 文件中。
(function () {
    'use strict';

    var DB_NAME = 'zbll_local_workspaces';
    var STORE_NAME = 'workspaces';
    var DB_VERSION = 1;
    var ACTIVE_KEY = 'zbll_active_workspace';
    var PUBLIC_ID = '__public_copy__';

    function makeId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'ws-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function openDb() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('当前浏览器不支持本地工作区存储'));
                return;
            }
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function () {
                var db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    var store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error || new Error('无法打开本地工作区')); };
        });
    }

    function transaction(db, mode, action) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE_NAME, mode);
            var store = tx.objectStore(STORE_NAME);
            var result;
            try { result = action(store); } catch (error) { reject(error); return; }
            tx.oncomplete = function () { resolve(result); };
            tx.onerror = function () { reject(tx.error || new Error('本地工作区保存失败')); };
            tx.onabort = function () { reject(tx.error || new Error('本地工作区操作已取消')); };
        });
    }

    function requestResult(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error || new Error('本地工作区读取失败')); };
        });
    }

    function fixedNotes(category, formula) {
        var text = String(formula.notes || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (/^ZBLL\s+/i.test(text.trim().split('\n')[0] || '')) return text;
        var number = String(formula.id || '').match(/(\d+)$/);
        return 'ZBLL ' + category + ' ' + (number ? number[1] : '');
    }

    function blankWorkspace(data, name) {
        var now = new Date().toISOString();
        return {
            format: 'zbll-workspace',
            version: 1,
            id: makeId(),
            name: name || '我的zbll公式库',
            sourceFingerprint: data.meta && data.meta.fingerprint || '',
            createdAt: now,
            updatedAt: now,
            categories: (data.categories || []).map(function (category) {
                return {
                    id: category.id,
                    subcategories: (category.subcategories || []).map(function (subcat) {
                        return {
                            id: subcat.id,
                            formulas: (subcat.formulas || []).map(function (formula) {
                                return {
                                    uid: formula.uid || makeId(),
                                    id: formula.id,
                                    image: formula.image || '',
                                    notes: fixedNotes(category.id, formula),
                                    lines: [],
                                    learned: false
                                };
                            })
                        };
                    })
                };
            })
        };
    }

    function publicCopy(data, name) {
        var now = new Date().toISOString();
        return {
            format: 'zbll-workspace',
            version: 1,
            id: makeId(),
            kind: 'public-copy',
            name: name || '大神版（已编辑）',
            sourceFingerprint: data.meta && data.meta.fingerprint || '',
            createdAt: now,
            updatedAt: now,
            categories: (data.categories || []).map(function (category) {
                return {
                    id: category.id,
                    subcategories: (category.subcategories || []).map(function (subcat) {
                        return {
                            id: subcat.id,
                            formulas: (subcat.formulas || []).map(function (formula) {
                                var copied = clone(formula);
                                // 公开 data.js 可能没有 uid；沿用稳定的公式 id，避免首次编辑时找不到对应卡片。
                                copied.uid = copied.uid || copied.id || makeId();
                                copied.id = typeof copied.id === 'string' ? copied.id : copied.uid;
                                copied.image = typeof copied.image === 'string' ? copied.image : '';
                                copied.notes = typeof copied.notes === 'string' ? copied.notes : '';
                                copied.lines = Array.isArray(copied.lines) ? copied.lines : [];
                                copied.learned = copied.learned === true;
                                normalizeSelectedLineSelection(copied);
                                return copied;
                            })
                        };
                    })
                };
            })
        };
    }

    function formulaKey(formula) {
        return String(formula && (formula.uid || formula.id || ''));
    }

    function selectedLineAlgFromFormula(formula) {
        if (!formula || typeof formula !== 'object') return undefined;
        if (typeof formula.selectedLineAlg === 'string') return formula.selectedLineAlg;
        var index = Number(formula.selectedLineIndex);
        var lines = Array.isArray(formula.lines) ? formula.lines : [];
        if (Number.isInteger(index) && index >= 0 && index < lines.length) return lines[index].alg;
        return undefined;
    }

    function mergePublicCopy(data, existing) {
        if (!existing) return null;
        var sameSource = (existing.sourceFingerprint || '') === ((data.meta && data.meta.fingerprint) || '');
        var merged = publicCopy(data);
        merged.id = existing.id || merged.id;
        merged.kind = 'public-copy';
        merged.name = existing.name || merged.name;
        merged.createdAt = existing.createdAt || merged.createdAt;
        merged.updatedAt = existing.updatedAt || merged.updatedAt;
        var oldBySub = {};
        (existing.categories || []).forEach(function (category) {
            (category.subcategories || []).forEach(function (subcat) {
                oldBySub[category.id + '::' + subcat.id] = subcat.formulas || [];
            });
        });
        merged.categories.forEach(function (category) {
            category.subcategories.forEach(function (subcat) {
                var oldFormulas = oldBySub[category.id + '::' + subcat.id] || [];
                var oldByKey = {};
                oldFormulas.forEach(function (formula) { oldByKey[formulaKey(formula)] = formula; });
                subcat.formulas.forEach(function (formula) {
                    var old = oldByKey[formulaKey(formula)];
                    if (old) {
                        formula.learned = old.learned === true;
                        formula.selectedLineAlg = selectedLineAlgFromFormula(old);
                        normalizeSelectedLineSelection(formula);
                        var preserveLocalNote = old.localNoteEdited === true ||
                            (sameSource && typeof old.notes === 'string' && old.notes !== formula.notes);
                        if (preserveLocalNote) {
                            formula.notes = old.notes;
                            formula.localNoteEdited = true;
                        }
                    }
                });
                var currentByKey = {};
                subcat.formulas.forEach(function (formula) { currentByKey[formulaKey(formula)] = formula; });
                var used = {};
                var reordered = oldFormulas.map(function (oldFormula) {
                    var key = formulaKey(oldFormula), formula = currentByKey[key];
                    if (formula) used[key] = true;
                    return formula || null;
                }).filter(Boolean);
                subcat.formulas.forEach(function (formula) {
                    if (!used[formulaKey(formula)]) reordered.push(formula);
                });
                subcat.formulas = reordered;
            });
        });
        return merged;
    }

    function exportPublicWorkspace(data, copy) {
        var workspace = copy ? clone(copy) : publicCopy(data);
        workspace.id = makeId();
        workspace.kind = 'public-copy';
        workspace.name = copy ? (copy.name || '大神版（已编辑）') : '大神版';
        workspace.sourceFingerprint = data.meta && data.meta.fingerprint || workspace.sourceFingerprint || '';
        if (!copy) stripSelectedLineSelections(workspace);
        return workspace;
    }

    function isPublicWorkspace(workspace) {
        return !!workspace && (workspace.id === PUBLIC_ID || workspace.kind === 'public-copy' || workspace.kind === 'public-library');
    }

    function validLine(line) {
        return line && typeof line === 'object' && typeof line.alg === 'string' &&
            Array.isArray(line.marks) && line.marks.every(function (mark) { return typeof mark === 'string'; });
    }

    function normalizeSelectedLineSelection(formula) {
        if (!formula || typeof formula !== 'object') return;
        var lines = Array.isArray(formula.lines) ? formula.lines : [];
        if (typeof formula.selectedLineAlg !== 'string' && formula.selectedLineIndex !== undefined) {
            var index = Number(formula.selectedLineIndex);
            if (Number.isInteger(index) && index >= 0 && index < lines.length) formula.selectedLineAlg = lines[index].alg;
        }
        if (typeof formula.selectedLineAlg === 'string' && lines.some(function (line) { return line.alg === formula.selectedLineAlg; })) {
            delete formula.selectedLineIndex;
        } else {
            delete formula.selectedLineAlg;
            delete formula.selectedLineIndex;
        }
    }

    function stripSelectedLineSelections(workspace) {
        (workspace.categories || []).forEach(function (category) {
            (category.subcategories || []).forEach(function (subcat) {
                (subcat.formulas || []).forEach(function (formula) {
                    delete formula.selectedLineAlg;
                    delete formula.selectedLineIndex;
                });
            });
        });
    }

    function normalizeImported(raw) {
        if (!raw || raw.format !== 'zbll-workspace' || raw.version !== 1 || !Array.isArray(raw.categories)) {
            throw new Error('不是有效的 .zbll 工作区文件');
        }
        var publicData = window.ZBLL_DATA;
        if (publicData && Array.isArray(publicData.categories)) {
            if (raw.categories.length !== publicData.categories.length) throw new Error('工作区分类数量与当前 ZBLL 数据不一致');
            publicData.categories.forEach(function (expected, index) {
                var actual = raw.categories[index];
                if (!actual || actual.id !== expected.id || !Array.isArray(actual.subcategories) || actual.subcategories.length !== expected.subcategories.length) {
                    throw new Error('工作区分类结构与当前 ZBLL 数据不一致');
                }
                expected.subcategories.forEach(function (expectedSub, subIndex) {
                    var actualSub = actual.subcategories[subIndex];
                    if (!actualSub || actualSub.id !== expectedSub.id || !Array.isArray(actualSub.formulas)) throw new Error('工作区子分类结构无效：' + expectedSub.id);
                });
            });
        }
        var workspace = clone(raw);
        workspace.id = makeId();
        workspace.name = String(workspace.name || '导入的 ZBLL 工作区').slice(0, 80);
        workspace.kind = isPublicWorkspace(raw) || /^大神版/.test(String(raw.name || '')) ? 'public-copy' : 'workspace';
        workspace.createdAt = workspace.createdAt || new Date().toISOString();
        workspace.updatedAt = new Date().toISOString();
        workspace.categories.forEach(function (category) {
            if (!category || typeof category.id !== 'string' || !Array.isArray(category.subcategories)) throw new Error('工作区分类数据无效');
            category.subcategories.forEach(function (subcat) {
                if (!subcat || typeof subcat.id !== 'string' || !Array.isArray(subcat.formulas)) throw new Error('工作区子分类数据无效');
                subcat.formulas.forEach(function (formula) {
                    if (!formula || typeof formula !== 'object' || !Array.isArray(formula.lines) || !formula.lines.every(validLine)) throw new Error('工作区公式数据无效');
                    formula.uid = typeof formula.uid === 'string' ? formula.uid : makeId();
                    formula.id = typeof formula.id === 'string' ? formula.id : formula.uid;
                    formula.image = typeof formula.image === 'string' ? formula.image : '';
                    formula.notes = typeof formula.notes === 'string' ? formula.notes : '';
                    formula.learned = formula.learned === true;
                    normalizeSelectedLineSelection(formula);
                });
            });
        });
        return workspace;
    }

    var dbPromise = openDb();
    var api = {
        ready: dbPromise,
        async list() {
            var db = await dbPromise;
            var all = await requestResult(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll());
            return all.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
        },
        async get(id) {
            var db = await dbPromise;
            return requestResult(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id));
        },
        async getPublicCopy(data, id) {
            var existing = await this.get(id || PUBLIC_ID);
            if (!existing || !data) return existing;
            var merged = mergePublicCopy(data, existing);
            if (merged && merged.sourceFingerprint !== existing.sourceFingerprint) await this.putPublicCopy(merged);
            return merged;
        },
        async listPublicCopies(data) {
            var all = await this.list();
            var copies = all.filter(isPublicWorkspace);
            if (!data) return copies;
            var merged = [];
            for (var i = 0; i < copies.length; i++) merged.push(await this.getPublicCopy(data, copies[i].id));
            return merged.filter(Boolean).sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
        },
        async hasPublicCopy() { return !!(await this.getPublicCopy()); },
        async ensurePublicCopy(data) {
            var existing = await this.getPublicCopy(data);
            if (existing) return existing;
            var copy = publicCopy(data);
            await this.put(copy);
            return copy;
        },
        async putPublicCopy(copy) {
            copy.id = copy.id || makeId();
            copy.kind = 'public-copy';
            copy.name = copy.name || '大神版（已编辑）';
            await this.put(copy);
            return copy;
        },
        async createPublicCopy(data, name) {
            var copy = publicCopy(data, name || '大神版（已编辑）');
            await this.putPublicCopy(copy);
            return copy;
        },
        exportPublic(data, copy) {
            return exportPublicWorkspace(data, copy);
        },
        async resetPublicCopy() {
            var db = await dbPromise;
            await transaction(db, 'readwrite', function (store) { store.delete(PUBLIC_ID); });
        },
        async put(workspace) {
            workspace.updatedAt = new Date().toISOString();
            var db = await dbPromise;
            await transaction(db, 'readwrite', function (store) { store.put(workspace); });
            return workspace;
        },
        async remove(id) {
            var db = await dbPromise;
            await transaction(db, 'readwrite', function (store) { store.delete(id); });
            if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
        },
        async create(data, name) {
            var workspace = blankWorkspace(data, name);
            await this.put(workspace);
            return workspace;
        },
        async activate(id) {
            if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY);
            var workspace = id ? await this.get(id) : null;
            window.dispatchEvent(new CustomEvent('zbll-workspace-changed', { detail: workspace || null }));
            return workspace;
        },
        activeId() { return localStorage.getItem(ACTIVE_KEY) || ''; },
        async importFile(file) {
            var text = await file.text();
            var workspace = normalizeImported(JSON.parse(text));
            var existing = await this.list();
            var baseName = workspace.name;
            var suffix = 2;
            while (existing.some(function (item) { return item.name === workspace.name; })) workspace.name = baseName + ' ' + suffix++;
            await this.put(workspace);
            return workspace;
        },
        async exportFile(workspace, onProgress, signal) {
            function progress(value, text) {
                if (typeof onProgress === 'function') onProgress(value, text);
            }
            function checkCancelled() {
                if (signal && signal.aborted) throw new DOMException('导出已取消', 'AbortError');
            }
            checkCancelled();
            progress(0, '准备工作区数据');
            var output = clone(workspace);
            var formulaQueue = [], formulasDone = 0;
            for (var countCi = 0; countCi < output.categories.length; countCi++) {
                var countCategory = output.categories[countCi];
                for (var countSi = 0; countSi < countCategory.subcategories.length; countSi++) {
                    var formulas = countCategory.subcategories[countSi].formulas;
                    formulas.forEach(normalizeSelectedLineSelection);
                    formulaQueue = formulaQueue.concat(formulas);
                }
            }
            var formulasTotal = formulaQueue.length;
            var nextFormula = 0;
            async function processImages() {
                while (true) {
                    checkCancelled();
                    var formulaIndex = nextFormula++;
                    if (formulaIndex >= formulasTotal) return;
                    var formula = formulaQueue[formulaIndex];
                    var image = formula.image;
                    if (image && !/^data:/i.test(image)) {
                        try {
                            var response = await fetch(new URL(image, document.baseURI).href, signal ? { signal: signal } : undefined);
                            if (response.ok) {
                                var blob = await response.blob();
                                checkCancelled();
                                formula.image = await new Promise(function (resolve, reject) {
                                    var reader = new FileReader();
                                    reader.onload = function () { resolve(reader.result); };
                                    reader.onerror = reject;
                                    reader.readAsDataURL(blob);
                                });
                            }
                        } catch (e) {
                            if ((signal && signal.aborted) || (e && e.name === 'AbortError')) throw e;
                            /* 路径图片无法读取时保留原路径 */
                        }
                    }
                    formulasDone++;
                    if (formulasDone === 1 || formulasDone === formulasTotal || formulasDone % 12 === 0) {
                        progress(Math.round((formulasDone / Math.max(1, formulasTotal)) * 100), '整理图片和公式 ' + formulasDone + '/' + formulasTotal);
                        await new Promise(function (resolve) { setTimeout(resolve, 0); });
                    }
                }
            }
            var workerCount = Math.min(16, Math.max(1, formulasTotal));
            var workers = [];
            for (var wi = 0; wi < workerCount; wi++) workers.push(processImages());
            await Promise.all(workers);
            checkCancelled();
            progress(100, '生成 .zbll 文件');
            var blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json;charset=utf-8' });
            checkCancelled();
            progress(100, '准备下载');
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            var downloadName = (workspace.name || 'zbll-workspace').replace(/[\\/:*?"<>|]/g, '_') + '.zbll';
            link.download = downloadName;
            checkCancelled();
            link.click();
            progress(100, '已下载 ' + downloadName);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }
    };

    window.ZBLL_WORKSPACE = api;
})();
