// ZBLL 静态站点前端逻辑：公开浏览 + 本地 .zbll 工作区
(function () {
    'use strict';

    var DATA = window.ZBLL_DATA;
    var WS = window.ZBLL_WORKSPACE;
    var appEl = document.getElementById('app');
    if (!DATA || !appEl || !WS) {
        if (appEl) appEl.innerHTML = '<div class="container mt-5"><div class="empty-state">数据加载失败：未找到页面数据</div></div>';
        return;
    }

    var CAT_BADGE = {
        'U': 'bg-primary', 'T': 'bg-danger', 'L': 'bg-warning text-dark',
        'Pi': 'bg-success', 'S': 'bg-orange', 'AS': 'bg-dark', 'H': 'bg-secondary'
    };
    var LABEL_TO_NAME = {
        '耿': 'Xuanyi Geng (耿暄一)', 'Tymon': 'Tymon Kolasiński', '杜': 'Yufang Du (杜昱方)',
        '董': 'Yize Dong (董一泽)', 'Feliks': 'Feliks Zemdegs', '南': 'Seung Hyuk Nahm',
        'Park': 'Max Park', '藩': 'Bofan Zhang (张博藩)', 'Leo': 'Leo Borromeo',
        '懿': 'Yi Shen (沈懿)', 'Matty': 'Matty Hiroto Inaba', 'Luke': 'Luke Garrett',
        '昆': 'Zhaokun Li (李昭昆)', '连': 'Yunzhi Lian (连允之)'
    };
    var currentView = 'home';
    var activeWorkspace = null;
    var themeKey = 'zbll_theme';

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function viewData() { return activeWorkspace || DATA; }
    function isWorkspace() { return !!activeWorkspace; }
    function systemTheme() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function applyTheme(theme, persist) {
        theme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        if (persist) { try { localStorage.setItem(themeKey, theme); } catch (e) {} }
        var button = document.getElementById('theme-toggle');
        if (!button) return;
        var dark = theme === 'dark';
        var icon = button.querySelector('.theme-toggle-icon');
        if (icon) icon.textContent = dark ? '☀' : '☾';
        var label = dark ? '切换到浅色模式' : '切换到深色模式';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-pressed', dark ? 'true' : 'false');
    }
    function initTheme() {
        var saved = null;
        try { saved = localStorage.getItem(themeKey); } catch (e) {}
        applyTheme(saved === 'light' || saved === 'dark' ? saved :
            (document.documentElement.getAttribute('data-theme') || systemTheme()), false);
        var button = document.getElementById('theme-toggle');
        if (button) button.addEventListener('click', function () {
            applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
        });
    }
    initTheme();

    function getScrollKey(view) { return 'zbll_scroll_' + view; }
    function saveScroll() {
        try { localStorage.setItem(getScrollKey(currentView), String(window.pageYOffset || window.scrollY || 0)); } catch (e) {}
    }
    function restoreScroll(view) {
        var y = 0;
        try { y = parseInt(localStorage.getItem(getScrollKey(view)), 10) || 0; } catch (e) {}
        document.documentElement.style.scrollBehavior = 'auto';
        document.body.style.scrollBehavior = 'auto';
        window.scrollTo(0, y);
    }
    function findCategory(catId) {
        var cats = viewData().categories || [];
        for (var i = 0; i < cats.length; i++) if (cats[i].id === catId) return cats[i];
        return null;
    }
    function findFormula(catId, subId, uid) {
        var cat = findCategory(catId);
        if (!cat) return null;
        for (var i = 0; i < cat.subcategories.length; i++) {
            var sub = cat.subcategories[i];
            if (sub.id !== subId) continue;
            for (var j = 0; j < sub.formulas.length; j++) {
                if (sub.formulas[j].uid === uid) return { category: cat, subcat: sub, formula: sub.formulas[j], index: j };
            }
        }
        return null;
    }
    function subcatRange(cat) {
        if (!cat.subcategories || !cat.subcategories.length) return '';
        var first = cat.subcategories[0].id;
        var last = cat.subcategories[cat.subcategories.length - 1].id;
        return first === last ? first : first + '-' + last;
    }
    function displayFormulaId(sub, formula, index) {
        return isWorkspace() ? sub.id + '-' + (index + 1) : (formula.name || formula.id || sub.id + '-' + (index + 1));
    }
    function lineText(line) {
        var marks = line.marks && line.marks.length ? ' （' + line.marks.join(' ') + '）' : '';
        return (line.alg || '') + marks;
    }

    function renderHome() {
        var data = viewData();
        var html = '<div class="container mt-5"><h1 class="text-center mb-5">ZBLL 公式数据库</h1>';
        if (!isWorkspace()) {
            html += '<div class="player-stats">';
            (DATA.meta.playerStats || []).forEach(function (p) {
                if (p.wca) {
                    var name = LABEL_TO_NAME[p.label] || p.label;
                    html += '<a class="player-stat-box" href="https://www.worldcubeassociation.org/persons/' + encodeURIComponent(p.wca) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(name) + '">' + escapeHtml(p.label) + ' <b>' + p.count + '</b></a>';
                } else html += '<span class="player-stat-box">' + escapeHtml(p.label) + ' <b>' + p.count + '</b></span>';
            });
            html += '</div>';
        } else html += '<div class="workspace-mode-hint">当前工作区：' + escapeHtml(activeWorkspace.name) + '</div>';
        html += '<div class="row row-cols-1 row-cols-md-3 g-4">';
        (data.categories || []).forEach(function (cat) {
            var total = 0;
            (cat.subcategories || []).forEach(function (sub) { total += sub.formulas.length; });
            html += '<div class="col"><a href="#/category/' + encodeURIComponent(cat.id) + '" class="category-card"><div class="card"><div class="card-body text-center">';
            html += '<h2 class="card-title">' + escapeHtml(cat.id) + '</h2><img src="images/' + encodeURIComponent(cat.id) + '.svg" class="category-thumb" alt="' + escapeHtml(cat.id) + '">';
            html += '<p class="card-text">' + total + '个情况</p><span class="badge ' + (CAT_BADGE[cat.id] || 'bg-secondary') + '">' + escapeHtml(subcatRange(cat)) + '</span>';
            html += '</div></div></a></div>';
        });
        html += '</div></div>';
        appEl.innerHTML = html;
    }

    function renderCategory(catId) {
        var cat = findCategory(catId);
        if (!cat) { appEl.innerHTML = '<div class="container"><div class="empty-state">分类不存在：' + escapeHtml(catId) + '</div></div>'; return; }
        var html = '<div class="container"><nav aria-label="breadcrumb"><ol class="breadcrumb"><li class="breadcrumb-item"><a href="#/">首页</a></li><li class="breadcrumb-item active">' + escapeHtml(cat.id) + ' Case</li></ol></nav>';
        html += '<h1 class="category-title">' + escapeHtml(cat.id) + ' Case</h1>';
        (cat.subcategories || []).forEach(function (sub) {
            var total = sub.formulas.length;
            html += '<div class="subcategory-card" id="card-' + escapeHtml(sub.id) + '"><div class="sticky-header" id="header-' + escapeHtml(sub.id) + '" data-subcat="' + escapeHtml(sub.id) + '"><div class="d-flex justify-content-between align-items-center"><div class="d-flex align-items-center"><h3>' + escapeHtml(sub.id) + '</h3><img src="images/' + encodeURIComponent(sub.id) + '.svg" class="subcat-thumb" alt="' + escapeHtml(sub.id) + '"><span class="badge bg-secondary">' + total + '个情况</span></div><div class="d-flex align-items-center"><span class="toggle-icon" id="icon-' + escapeHtml(sub.id) + '">▼</span></div></div></div>';
            html += '<div class="formula-grid" id="subcat-' + escapeHtml(sub.id) + '">';
            if (sub.formulas.length) {
                html += '<div class="sortable-container" data-category="' + escapeHtml(cat.id) + '" data-subcategory="' + escapeHtml(sub.id) + '">';
                sub.formulas.forEach(function (formula, index) { html += renderFormulaCard(cat.id, sub.id, formula, index); });
                html += '</div>';
            } else if (!isWorkspace()) html += '<div class="empty-state"><p class="mb-0">该子分类下暂无公式</p></div>';
            if (isWorkspace()) html += '<button type="button" class="workspace-add" data-action="add-formula" data-category="' + escapeHtml(cat.id) + '" data-subcategory="' + escapeHtml(sub.id) + '">＋</button>';
            html += '</div></div>';
        });
        html += '</div>';
        appEl.innerHTML = html;
        restoreSubcategoryState(cat);
        if (isWorkspace()) bindSorting();
    }

    function renderFormulaCard(catId, subId, formula, index) {
        var cat = findCategory(catId), sub = cat.subcategories.filter(function (s) { return s.id === subId; })[0];
        var id = displayFormulaId(sub, formula, index), uid = formula.uid || formula.id || (subId + '-' + index);
        var html = '<div class="sortable-item" data-uid="' + escapeHtml(uid) + '" draggable="' + (isWorkspace() ? 'true' : 'false') + '"><div class="formula-card' + (formula.learned ? ' formula-card-learned' : '') + '">';
        if (isWorkspace()) html += '<div class="workspace-drag-handle" title="拖动排序" aria-label="拖动排序">⠿</div>';
        html += '<div class="formula-top">';
        if (formula.image) html += '<img src="' + escapeHtml(formula.image) + '" class="formula-image" alt="' + escapeHtml(id) + '" loading="lazy">';
        else html += '<div class="formula-image d-flex align-items-center justify-content-center bg-light"><span class="text-muted">无图</span></div>';
        html += '<div class="formula-info"><div class="formula-id">' + escapeHtml(id) + '</div>';
        if (formula.notes) html += '<div style="margin-top: 6px;"><pre class="formula-notes">' + escapeHtml(formula.notes) + '</pre></div>';
        html += '</div></div>';
        if (formula.lines && formula.lines.length) {
            html += '<div class="formula-lines">';
            formula.lines.forEach(function (line) {
                html += '<div class="formula-line"><span class="formula-line-alg">' + escapeHtml(line.alg) + '</span>';
                if (line.marks && line.marks.length) {
                    html += '<span class="formula-marks-group">';
                    line.marks.forEach(function (mark) { html += '<span class="formula-marks" title="' + escapeHtml(LABEL_TO_NAME[mark] || mark) + '">' + escapeHtml(mark) + '</span>'; });
                    html += '</span>';
                }
                html += '</div>';
            });
            html += '</div>';
        } else if (isWorkspace()) html += '<div class="workspace-empty">暂无公式</div>';
        if (isWorkspace()) {
            html += '<div class="workspace-card-actions">';
            html += '<button type="button" class="btn btn-sm btn-outline-primary workspace-action" data-action="edit-formula" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '">编辑</button>';
            html += '<button type="button" class="btn btn-sm btn-outline-secondary workspace-action" data-action="add-variant" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '">添加变体</button>';
            html += '<button type="button" class="btn btn-sm btn-outline-danger workspace-action" data-action="delete-formula" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '">删除</button>';
            html += '<button type="button" class="btn btn-sm ' + (formula.learned ? 'btn-success' : 'btn-outline-success') + ' workspace-action workspace-learn-btn" data-action="toggle-learned" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '">' + (formula.learned ? '已学' : '未学') + '</button>';
            html += '</div>';
        }
        html += '</div></div>';
        return html;
    }

    function toggleSubcategory(subcatId) {
        var content = document.getElementById('subcat-' + subcatId), icon = document.getElementById('icon-' + subcatId), header = document.getElementById('header-' + subcatId);
        if (!content || !icon || !header) return;
        var open = content.style.display === 'none';
        content.style.display = open ? 'block' : 'none'; icon.textContent = open ? '▼' : '▶'; header.classList.toggle('sticky-header-collapsed', !open);
        try { localStorage.setItem('subcat_' + subcatId, open ? 'open' : 'closed'); } catch (e) {}
    }
    function restoreSubcategoryState(cat) {
        (cat.subcategories || []).forEach(function (sub) {
            var content = document.getElementById('subcat-' + sub.id), icon = document.getElementById('icon-' + sub.id), header = document.getElementById('header-' + sub.id);
            var saved = null; try { saved = localStorage.getItem('subcat_' + sub.id); } catch (e) {}
            var open = saved === 'open';
            content.style.display = open ? 'block' : 'none'; icon.textContent = open ? '▼' : '▶'; header.classList.toggle('sticky-header-collapsed', !open);
        });
    }

    function bindSorting() {
        document.querySelectorAll('.sortable-container').forEach(function (container) {
            var dragged = null;
            container.querySelectorAll('.sortable-item').forEach(function (item) {
                item.addEventListener('dragstart', function (e) { dragged = item; item.classList.add('workspace-dragging'); e.dataTransfer.effectAllowed = 'move'; });
                item.addEventListener('dragend', function () { item.classList.remove('workspace-dragging'); dragged = null; });
                item.addEventListener('dragover', function (e) { if (dragged && dragged !== item) { e.preventDefault(); item.classList.add('workspace-drag-over'); } });
                item.addEventListener('dragleave', function () { item.classList.remove('workspace-drag-over'); });
                item.addEventListener('drop', async function (e) {
                    e.preventDefault(); item.classList.remove('workspace-drag-over');
                    if (!dragged || dragged === item) return;
                    var cat = findCategory(container.dataset.category), sub = cat && cat.subcategories.filter(function (s) { return s.id === container.dataset.subcategory; })[0];
                    if (!sub) return;
                    var from = sub.formulas.findIndex(function (f) { return f.uid === dragged.dataset.uid; }), to = sub.formulas.findIndex(function (f) { return f.uid === item.dataset.uid; });
                    if (from < 0 || to < 0) return;
                    var moved = sub.formulas.splice(from, 1)[0]; sub.formulas.splice(to, 0, moved);
                    await WS.put(activeWorkspace); renderCategory(container.dataset.category);
                });
            });
        });
    }

    function showOverlay(id, show) { var el = document.getElementById(id); if (el) el.hidden = !show; }
    function setWorkspaceMessage(text, error) {
        var el = document.getElementById('workspace-message'); if (!el) return;
        el.textContent = text || ''; el.classList.toggle('is-error', !!error);
    }
    async function refreshWorkspaceList() {
        var listEl = document.getElementById('workspace-list'), currentEl = document.getElementById('workspace-current');
        if (!listEl) return;
        var list = await WS.list();
        currentEl.textContent = activeWorkspace ? '当前：' + activeWorkspace.name : '当前：公开数据';
        listEl.innerHTML = list.length ? list.map(function (item) {
            return '<button type="button" class="workspace-list-item' + (activeWorkspace && activeWorkspace.id === item.id ? ' active' : '') + '" data-workspace-id="' + escapeHtml(item.id) + '"><span>' + escapeHtml(item.name) + '</span><small>' + escapeHtml(new Date(item.updatedAt).toLocaleString()) + '</small></button>';
        }).join('') : '<div class="workspace-empty">还没有本地工作区</div>';
        ['workspace-export', 'workspace-rename', 'workspace-delete'].forEach(function (id) { var button = document.getElementById(id); if (button) button.disabled = !activeWorkspace; });
        var nav = document.getElementById('workspace-open'); if (nav) nav.textContent = activeWorkspace ? '工作区：' + activeWorkspace.name : '本地工作区';
    }
    async function openWorkspaceManager() { setWorkspaceMessage(''); showOverlay('workspace-overlay', true); await refreshWorkspaceList(); }
    async function activateWorkspace(id) { activeWorkspace = id ? await WS.activate(id) : await WS.activate(null); router(); await refreshWorkspaceList(); }
    async function createWorkspace() {
        var name = window.prompt('请输入工作区名称', '我的 ZBLL 工作区');
        if (name === null) return;
        name = name.trim() || '我的 ZBLL 工作区';
        activeWorkspace = await WS.create(DATA, name); showOverlay('workspace-overlay', false); router();
    }
    function splitNotes(notes, formula, subId) {
        var text = String(notes || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), parts = text.split('\n');
        var number = String(formula && (formula.id || '')).match(/(\d+)$/);
        var header = parts.shift() || ('ZBLL ' + subId + ' ' + (number ? number[1] : ''));
        return { header: header, body: parts.join('\n') };
    }
    function parseFormulaLines(text) {
        return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(function (raw) {
            var line = raw.trim(), marks = [], match = line.match(/(?:（([^）]*)）|\(([^)]*)\))\s*$/);
            if (match) { marks = (match[1] || match[2] || '').split(/[\s,，]+/).filter(Boolean); line = line.slice(0, match.index).trim(); }
            return line ? { alg: line, marks: marks } : null;
        }).filter(Boolean);
    }
    function openFormulaEditor(catId, subId, formula) {
        var cat = findCategory(catId), sub = cat && cat.subcategories.filter(function (s) { return s.id === subId; })[0];
        if (!sub) return;
        var isNew = !formula;
        document.getElementById('editor-subcategory').value = subId;
        document.getElementById('editor-uid').value = formula ? formula.uid : '';
        document.getElementById('editor-formula').value = formula ? (formula.lines || []).map(lineText).join('\n') : '';
        var note = splitNotes(formula && formula.notes, formula, subId);
        document.getElementById('editor-note-header').textContent = note.header;
        document.getElementById('editor-note-body').value = note.body;
        document.getElementById('editor-image').value = '';
        document.getElementById('editor-clear-image').checked = false;
        document.getElementById('editor-overlay').dataset.category = catId;
        document.getElementById('editor-overlay').dataset.isNew = isNew ? '1' : '0';
        document.getElementById('editor-title').textContent = isNew ? '添加公式' : '编辑公式';
        showOverlay('editor-overlay', true); document.getElementById('editor-formula').focus();
    }
    function readFileData(file) {
        return new Promise(function (resolve, reject) { if (!file) return resolve(null); var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(file); });
    }
    async function saveFormulaEditor(e) {
        e.preventDefault(); if (!activeWorkspace) return;
        var overlay = document.getElementById('editor-overlay'), catId = overlay.dataset.category, subId = document.getElementById('editor-subcategory').value, uid = document.getElementById('editor-uid').value;
        var cat = findCategory(catId), sub = cat && cat.subcategories.filter(function (s) { return s.id === subId; })[0]; if (!sub) return;
        var formula = uid ? sub.formulas.find(function (f) { return f.uid === uid; }) : null;
        var notes = document.getElementById('editor-note-header').textContent, body = document.getElementById('editor-note-body').value.replace(/^\s+|\s+$/g, '');
        if (body) notes += '\n' + body;
        var input = document.getElementById('editor-image'), image = document.getElementById('editor-clear-image').checked ? '' : (formula ? formula.image : '');
        if (input.files && input.files[0]) image = await readFileData(input.files[0]);
        if (!formula) { formula = { uid: 'f-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), id: 'new-' + Date.now(), image: image || '', notes: notes, lines: [], learned: false }; sub.formulas.push(formula); }
        formula.lines = parseFormulaLines(document.getElementById('editor-formula').value); formula.notes = notes; formula.image = image || ''; formula.learned = !!formula.learned;
        await WS.put(activeWorkspace); showOverlay('editor-overlay', false); renderCategory(catId);
    }
    async function addVariant(catId, subId, uid) {
        var ref = findFormula(catId, subId, uid); if (!ref) return;
        var alg = window.prompt('输入新公式（只输入一行）'); if (alg === null || !alg.trim()) return;
        var markText = window.prompt('标注（可选，多个用空格分隔），如：耿 Tymon', ''); if (markText === null) return;
        ref.formula.lines = ref.formula.lines || []; ref.formula.lines.push({ alg: alg.trim(), marks: markText.trim().split(/[\s,，]+/).filter(Boolean) });
        await WS.put(activeWorkspace); renderCategory(catId);
    }
    async function handleWorkspaceAction(button) {
        var action = button.dataset.action, catId = button.dataset.category, subId = button.dataset.subcategory, uid = button.dataset.uid;
        if (action === 'add-formula') return openFormulaEditor(catId, subId, null);
        var ref = uid ? findFormula(catId, subId, uid) : null;
        if (action === 'edit-formula' && ref) return openFormulaEditor(catId, subId, ref.formula);
        if (action === 'add-variant') return addVariant(catId, subId, uid);
        if (!ref) return;
        if (action === 'delete-formula') { if (!window.confirm('确定删除这条公式卡吗？')) return; ref.subcat.formulas.splice(ref.index, 1); }
        if (action === 'toggle-learned') ref.formula.learned = !ref.formula.learned;
        await WS.put(activeWorkspace); renderCategory(catId);
    }

    async function handleWorkspaceManagerClick(e) {
        var item = e.target.closest('[data-workspace-id]');
        if (item) { await activateWorkspace(item.dataset.workspaceId); return; }
        var id = e.target.id;
        try {
            if (id === 'workspace-new') return createWorkspace();
            if (id === 'workspace-import') return document.getElementById('workspace-file').click();
            if (id === 'workspace-export' && activeWorkspace) return WS.exportFile(activeWorkspace);
            if (id === 'workspace-rename' && activeWorkspace) { var name = window.prompt('新的工作区名称', activeWorkspace.name); if (name && name.trim()) { activeWorkspace.name = name.trim(); await WS.put(activeWorkspace); await refreshWorkspaceList(); } return; }
            if (id === 'workspace-delete' && activeWorkspace) { if (!window.confirm('删除当前工作区？导出的 .zbll 文件不受影响。')) return; await WS.remove(activeWorkspace.id); var all = await WS.list(); activeWorkspace = all[0] || null; await WS.activate(activeWorkspace ? activeWorkspace.id : null); showOverlay('workspace-overlay', false); router(); return; }
            if (id === 'workspace-exit') { await activateWorkspace(null); showOverlay('workspace-overlay', false); return; }
            if (id === 'workspace-close') return showOverlay('workspace-overlay', false);
        } catch (error) { setWorkspaceMessage(error.message || '工作区操作失败', true); }
    }
    async function importWorkspaceFile(e) {
        var file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return;
        try { activeWorkspace = await WS.importFile(file); showOverlay('workspace-overlay', false); router(); }
        catch (error) { showOverlay('workspace-overlay', true); setWorkspaceMessage(error.message || '导入失败：文件格式无效', true); }
    }

    function router() {
        var hash = location.hash || '#/', match = hash.match(/^#\/category\/([A-Za-z]+)$/), nextView = match ? 'cat:' + match[1] : 'home';
        saveScroll(); if (match) renderCategory(match[1]); else renderHome(); currentView = nextView;
        requestAnimationFrame(function () { restoreScroll(nextView); });
        var nav = document.getElementById('workspace-open'); if (nav) nav.textContent = activeWorkspace ? '工作区：' + activeWorkspace.name : '本地工作区';
    }
    function initWorkspace() {
        return WS.ready.then(async function () { var id = WS.activeId(); activeWorkspace = id ? await WS.get(id) : null; if (id && !activeWorkspace) await WS.activate(null); router(); }).catch(function (error) { console.warn(error); router(); });
    }

    document.addEventListener('click', function (e) {
        var header = e.target.closest('.sticky-header');
        if (header && header.dataset.subcat) { toggleSubcategory(header.dataset.subcat); return; }
        var action = e.target.closest('.workspace-action'); if (action) { handleWorkspaceAction(action); return; }
        var add = e.target.closest('.workspace-add'); if (add) { openFormulaEditor(add.dataset.category, add.dataset.subcategory, null); return; }
        if (e.target.id === 'workspace-open') openWorkspaceManager();
        if (e.target.id === 'editor-close' || e.target.id === 'editor-cancel') showOverlay('editor-overlay', false);
    });
    document.getElementById('workspace-overlay').addEventListener('click', function (e) { if (e.target === this) showOverlay('workspace-overlay', false); });
    document.getElementById('editor-overlay').addEventListener('click', function (e) { if (e.target === this) showOverlay('editor-overlay', false); });
    document.getElementById('formula-editor-form').addEventListener('submit', saveFormulaEditor);
    document.getElementById('workspace-file').addEventListener('change', importWorkspaceFile);
    document.getElementById('workspace-overlay').addEventListener('click', handleWorkspaceManagerClick);
    window.addEventListener('hashchange', router);
    var scrollTimer = null;
    window.addEventListener('scroll', function () { if (scrollTimer) clearTimeout(scrollTimer); scrollTimer = setTimeout(saveScroll, 150); });
    window.addEventListener('zbll-workspace-changed', function (e) { activeWorkspace = e.detail || null; router(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { showOverlay('workspace-overlay', false); showOverlay('editor-overlay', false); } });
    initWorkspace();
})();
