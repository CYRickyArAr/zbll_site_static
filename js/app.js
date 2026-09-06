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
    var publicCopy = null;
    var themeKey = 'zbll_theme';
    var filterKey = 'zbll_filter';
    var selectedWorkspaceKey = 'zbll_selected_workspace';
    var editorSelectedImage = null;

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function viewData() { return activeWorkspace || publicCopy || DATA; }
    function isWorkspace() { return !!activeWorkspace; }
    function isPublicCopy() { return !activeWorkspace && !!publicCopy; }
    function isEditableView() { return true; }
    function usesLearnedStats() { return isWorkspace() || isPublicCopy(); }
    function updateWorkspaceNav() {
        var nav = document.getElementById('workspace-open');
        var publicBtn = document.getElementById('nav-public-mode');
        var workspaceBtn = document.getElementById('nav-workspace-mode');
        var publicLabel = publicCopy ? '大神版（已编辑）' : '大神版';
        if (nav) nav.textContent = activeWorkspace ? '工作区：' + activeWorkspace.name : publicLabel;
        if (publicBtn) publicBtn.classList.toggle('active', !activeWorkspace);
        if (workspaceBtn) {
            workspaceBtn.classList.toggle('active', !!activeWorkspace);
            workspaceBtn.textContent = '自定义';
            workspaceBtn.title = activeWorkspace ? activeWorkspace.name : '切换到选定的本地工作区';
        }
    }
    async function ensureEditableData() {
        if (activeWorkspace) return activeWorkspace;
        if (!publicCopy) { publicCopy = await WS.ensurePublicCopy(DATA); updateWorkspaceNav(); }
        return publicCopy;
    }
    async function persistCurrentData() {
        if (activeWorkspace) return WS.put(activeWorkspace);
        if (publicCopy) return WS.putPublicCopy(publicCopy);
    }
    function getPlayerStats(data) {
        var counts = {}, order = {}, wcaMap = {};
        (DATA.meta.playerStats || []).forEach(function (item, index) {
            counts[item.label] = 0;
            order[item.label] = index;
            wcaMap[item.label] = item.wca || '';
        });
        (data.categories || []).forEach(function (cat) {
            (cat.subcategories || []).forEach(function (sub) {
                (sub.formulas || []).forEach(function (formula) {
                    var caseMarks = {};
                    (formula.lines || []).forEach(function (line) {
                        (line.marks || []).forEach(function (mark) {
                            caseMarks[mark] = true;
                            if (order[mark] === undefined) order[mark] = 1000 + Object.keys(order).length;
                        });
                    });
                    Object.keys(caseMarks).forEach(function (mark) {
                        counts[mark] = (counts[mark] || 0) + 1;
                    });
                });
            });
        });
        return Object.keys(counts).map(function (label) { return { label: label, count: counts[label], wca: wcaMap[label] || '' }; }).filter(function (item) { return item.count > 0; }).sort(function (a, b) { return b.count - a.count || order[a.label] - order[b.label]; });
    }
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

    function getZbllFilter() {
        var filter = 'all';
        try { filter = localStorage.getItem(filterKey) || 'all'; } catch (e) {}
        return filter === 'learned' || filter === 'unlearned' ? filter : 'all';
    }
    function applyZbllFilter(filter) {
        filter = filter === 'learned' || filter === 'unlearned' ? filter : 'all';
        var actualFilter = usesLearnedStats() ? filter : 'all';
        document.documentElement.setAttribute('data-zbll-filter', actualFilter);
        document.querySelectorAll('.zbll-filter-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === actualFilter);
        });
    }
    function setZbllFilter(filter) {
        filter = filter === 'learned' || filter === 'unlearned' ? filter : 'all';
        try { localStorage.setItem(filterKey, filter); } catch (e) {}
        applyZbllFilter(filter);
        saveScroll();
    }
    applyZbllFilter(getZbllFilter());

    function getScrollKey(view) { return 'zbll_scroll_' + view; }
    function navOffset() {
        var nav = document.querySelector('.navbar');
        return (nav ? nav.offsetHeight : 60) + 8;
    }
    function firstVisibleAnchor() {
        var candidates = document.querySelectorAll('.sortable-item[id], .sticky-header[id]');
        var offset = navOffset();
        for (var i = 0; i < candidates.length; i++) {
            var rect = candidates[i].getBoundingClientRect();
            if (rect.bottom > offset && rect.top < window.innerHeight) return candidates[i].id;
        }
        return '';
    }
    function saveScroll() {
        try {
            var key = getScrollKey(currentView);
            localStorage.setItem(key, String(window.pageYOffset || window.scrollY || 0));
            var anchor = firstVisibleAnchor();
            if (anchor) localStorage.setItem(key + '_anchor', anchor);
        } catch (e) {}
    }
    function restoreScroll(view) {
        var y = 0, anchor = '';
        try {
            var key = getScrollKey(view);
            y = parseInt(localStorage.getItem(key), 10) || 0;
            anchor = localStorage.getItem(key + '_anchor') || '';
        } catch (e) {}
        document.documentElement.style.scrollBehavior = 'auto';
        document.body.style.scrollBehavior = 'auto';
        var anchorEl = anchor ? document.getElementById(anchor) : null;
        if (anchorEl) window.scrollTo(0, Math.max(0, window.pageYOffset + anchorEl.getBoundingClientRect().top - navOffset()));
        else window.scrollTo(0, y);
        document.documentElement.removeAttribute('data-scroll-restore');
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
        return (isWorkspace() || isPublicCopy()) ? sub.id + '-' + (index + 1) : (formula.name || formula.id || sub.id + '-' + (index + 1));
    }
    function lineText(line) {
        var marks = line.marks && line.marks.length ? ' （' + line.marks.join(' ') + '）' : '';
        return (line.alg || '') + marks;
    }

    function renderHome() {
        var data = viewData();
        var totalCases = 0, learnedCases = 0;
        (data.categories || []).forEach(function (cat) {
            (cat.subcategories || []).forEach(function (sub) {
                totalCases += sub.formulas.length;
                learnedCases += sub.formulas.filter(function (formula) { return formula.learned; }).length;
            });
        });
        var html = '<div class="container mt-5">';
        if (usesLearnedStats()) html += '<div class="index-title-wrap"><h1 class="text-center mb-5">ZBLL 公式数据库</h1><span class="index-learned-badge">已学习 ' + learnedCases + '/' + totalCases + '个情况</span></div>';
        else html += '<h1 class="text-center mb-5">ZBLL 公式数据库</h1>';
        if (!isWorkspace()) {
            html += '<div class="player-stats">';
            getPlayerStats(data).forEach(function (p) {
                if (p.wca) {
                    var name = LABEL_TO_NAME[p.label] || p.label;
                    html += '<a class="player-stat-box" href="https://www.worldcubeassociation.org/persons/' + encodeURIComponent(p.wca) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(name) + '">' + escapeHtml(p.label) + ' <b>' + p.count + '</b></a>';
                } else html += '<span class="player-stat-box">' + escapeHtml(p.label) + ' <b>' + p.count + '</b></span>';
            });
            html += '</div>';
        } else html += '<div class="workspace-mode-hint">当前工作区：' + escapeHtml(activeWorkspace.name) + '</div>';
        if (isPublicCopy()) html += '<div class="workspace-mode-hint">当前为大神版（已编辑），修改只保存在本浏览器</div>';
        html += '<div class="row row-cols-1 row-cols-md-3 g-4">';
        (data.categories || []).forEach(function (cat) {
            var total = 0;
            (cat.subcategories || []).forEach(function (sub) { total += sub.formulas.length; });
            html += '<div class="col"><a href="#/category/' + encodeURIComponent(cat.id) + '" class="category-card"><div class="card"><div class="card-body text-center">';
            html += '<h2 class="card-title">' + escapeHtml(cat.id) + '</h2><img src="images/' + encodeURIComponent(cat.id) + '.svg" class="category-thumb" alt="' + escapeHtml(cat.id) + '">';
            var learned = 0;
            (cat.subcategories || []).forEach(function (sub) { learned += sub.formulas.filter(function (formula) { return formula.learned; }).length; });
            html += '<p class="card-text">' + (usesLearnedStats() ? '已学 ' + learned + '/' + total + '个情况' : total + '个情况') + '</p><span class="badge ' + (CAT_BADGE[cat.id] || 'bg-secondary') + '">' + escapeHtml(subcatRange(cat)) + '</span>';
            html += '</div></div></a></div>';
        });
        html += '</div></div>';
        appEl.innerHTML = html;
    }

    function renderCategory(catId) {
        var cat = findCategory(catId);
        if (!cat) { appEl.innerHTML = '<div class="container"><div class="empty-state">分类不存在：' + escapeHtml(catId) + '</div></div>'; return; }
        var html = '<div class="container"><nav aria-label="breadcrumb"><ol class="breadcrumb"><li class="breadcrumb-item"><a href="#/">首页</a></li><li class="breadcrumb-item active">' + escapeHtml(cat.id) + ' Case</li></ol></nav>';
        html += '<div class="category-title-row"><h1 class="category-title">' + escapeHtml(cat.id) + ' Case</h1><button type="button" class="btn btn-outline-secondary collapse-all-btn" id="toggle-all-subcategories">全部展开</button></div>';
        (cat.subcategories || []).forEach(function (sub) {
            var total = sub.formulas.length, learned = sub.formulas.filter(function (formula) { return formula.learned; }).length;
            var saved = null; try { saved = localStorage.getItem('subcat_' + sub.id); } catch (e) {}
            var open = saved === 'open';
            html += '<div class="subcategory-card" id="card-' + escapeHtml(sub.id) + '"><div class="sticky-header' + (open ? '' : ' sticky-header-collapsed') + '" id="header-' + escapeHtml(sub.id) + '" data-subcat="' + escapeHtml(sub.id) + '"><div class="d-flex justify-content-between align-items-center"><div class="d-flex align-items-center"><h3>' + escapeHtml(sub.id) + '</h3><img src="images/' + encodeURIComponent(sub.id) + '.svg" class="subcat-thumb" alt="' + escapeHtml(sub.id) + '"><span class="badge bg-secondary">' + (usesLearnedStats() ? '已学 ' + learned + '/' + total + '个情况' : total + '个情况') + '</span></div><div class="d-flex align-items-center"><span class="toggle-icon" id="icon-' + escapeHtml(sub.id) + '">' + (open ? '▼' : '▶') + '</span></div></div></div>';
            html += '<div class="formula-grid" id="subcat-' + escapeHtml(sub.id) + '" style="display:' + (open ? 'block' : 'none') + '">';
            if (sub.formulas.length) {
                html += '<div class="sortable-container" data-category="' + escapeHtml(cat.id) + '" data-subcategory="' + escapeHtml(sub.id) + '">';
                sub.formulas.forEach(function (formula, index) { html += renderFormulaCard(cat.id, sub.id, formula, index); });
                html += '</div>';
            } else if (!isEditableView()) html += '<div class="empty-state"><p class="mb-0">该子分类下暂无公式</p></div>';
            if (isEditableView() && getZbllFilter() === 'all') html += '<button type="button" class="workspace-add" data-action="add-formula" data-category="' + escapeHtml(cat.id) + '" data-subcategory="' + escapeHtml(sub.id) + '">＋</button>';
            html += '</div></div>';
        });
        html += '</div>';
        appEl.innerHTML = html;
        updateToggleAllButton();
        applyZbllFilter(getZbllFilter());
        if (isEditableView()) bindSorting();
    }

    function renderFormulaCard(catId, subId, formula, index) {
        var cat = findCategory(catId), sub = cat.subcategories.filter(function (s) { return s.id === subId; })[0];
        var id = displayFormulaId(sub, formula, index), uid = formula.uid || formula.id || (subId + '-' + index);
        // SortableJS 使用 forceFallback 模式接管拖动；不要再设置原生 draggable，避免出现双重拖影。
        var html = '<div class="sortable-item" data-uid="' + escapeHtml(uid) + '" id="formula-' + escapeHtml(uid) + '">';
        html += '<div class="formula-card' + (formula.learned ? ' learned' : '') + (isEditableView() ? ' content-editable learning-enabled' : '') + '">';
        if (isEditableView()) html += '<div class="drag-handle" title="拖动排序" aria-label="拖动排序">⋮⋮</div>';
        html += '<div class="row"><div class="col-4">';
        if (formula.image) html += '<img src="' + escapeHtml(formula.image) + '" class="formula-image" alt="' + escapeHtml(id) + '" loading="lazy">';
        else html += '<div class="formula-image d-flex align-items-center justify-content-center bg-light"><span class="text-muted">无图</span></div>';
        html += '</div><div class="col-8"><div class="formula-id">' + escapeHtml(id) + '</div>';
        if (formula.notes) html += '<div class="formula-note-display"><pre class="formula-notes">' + escapeHtml(formula.notes) + '</pre></div>';
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
        }
        if (isEditableView()) {
            html += '<div class="action-buttons">';
            html += '<button type="button" class="add-variant-btn workspace-action" title="添加一行变体" aria-label="添加一行变体" data-action="add-variant" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '">＋</button>';
            html += '<div class="action-buttons-row"><button type="button" class="btn btn-outline-secondary btn-sm workspace-action" data-action="edit-formula" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '">编辑</button></div></div>';
            html += '<button type="button" class="learn-btn workspace-action' + (formula.learned ? ' learned' : '') + '" data-action="toggle-learned" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '" title="' + (formula.learned ? '取消已学' : '标记已学') + '" aria-label="' + (formula.learned ? '取消已学' : '标记已学') + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg></button>';
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
        updateToggleAllButton();
    }
    function updateToggleAllButton() {
        var button = document.getElementById('toggle-all-subcategories');
        if (!button) return;
        var headers = document.querySelectorAll('.sticky-header[id^="header-"]'), openCount = 0;
        headers.forEach(function (header) { var content = document.getElementById('subcat-' + header.dataset.subcat); if (content && content.style.display !== 'none') openCount++; });
        button.textContent = headers.length && openCount === headers.length ? '全部折叠' : '全部展开';
    }
    function toggleAllSubcategories() {
        var headers = document.querySelectorAll('.sticky-header[id^="header-"]'), openCount = 0;
        headers.forEach(function (header) { var content = document.getElementById('subcat-' + header.dataset.subcat); if (content && content.style.display !== 'none') openCount++; });
        var shouldOpen = openCount !== headers.length;
        headers.forEach(function (header) {
            var id = header.dataset.subcat, content = document.getElementById('subcat-' + id), icon = document.getElementById('icon-' + id);
            if (!content || !icon) return;
            content.style.display = shouldOpen ? 'block' : 'none'; icon.textContent = shouldOpen ? '▼' : '▶'; header.classList.toggle('sticky-header-collapsed', !shouldOpen);
            try { localStorage.setItem('subcat_' + id, shouldOpen ? 'open' : 'closed'); } catch (e) {}
        });
        updateToggleAllButton();
    }
    var sortableInstances = [];
    var isDraggingFormula = false;
    var dragMouseY = -1;
    var scrollRafId = null;
    var sortingScrollBound = false;

    function edgeScrollWhileDragging() {
        if (!isDraggingFormula) return;
        var threshold = 60, speed = 15, step = 0;
        if (dragMouseY !== -1) {
            if (dragMouseY < threshold) step = -speed;
            else if (dragMouseY > window.innerHeight - threshold) step = speed;
        }
        if (step) {
            document.documentElement.style.scrollBehavior = 'auto';
            document.body.style.scrollBehavior = 'auto';
            window.scrollBy(0, step);
        }
        scrollRafId = window.requestAnimationFrame(edgeScrollWhileDragging);
    }

    function bindSorting() {
        sortableInstances.forEach(function (instance) { instance.destroy(); });
        sortableInstances = [];
        if (!sortingScrollBound) {
            function trackDragPointer(e) {
                if (!isDraggingFormula) return;
                if (typeof e.clientY !== 'number') return;
                if (e.clientY <= 4) dragMouseY = -10;
                else if (e.clientY >= window.innerHeight - 4) dragMouseY = window.innerHeight + 10;
                else dragMouseY = e.clientY;
            }
            function trackDragLeave(e) {
                if (!isDraggingFormula || typeof e.clientY !== 'number') return;
                if (e.clientY <= 0) dragMouseY = -10;
                else if (e.clientY >= window.innerHeight) dragMouseY = window.innerHeight + 10;
            }
            document.addEventListener('mousemove', trackDragPointer, true);
            document.addEventListener('pointermove', trackDragPointer, true);
            document.addEventListener('dragover', trackDragPointer, true);
            window.addEventListener('mousemove', trackDragPointer, true);
            window.addEventListener('pointermove', trackDragPointer, true);
            document.addEventListener('mouseleave', function (e) {
                trackDragLeave(e);
            }, true);
            window.addEventListener('mouseout', function (e) {
                if (!isDraggingFormula || e.relatedTarget) return;
                trackDragLeave(e);
            }, true);
            sortingScrollBound = true;
        }
        document.querySelectorAll('.sortable-container').forEach(function (container) {
            if (!window.Sortable) return;
            var sortable = new window.Sortable(container, {
                animation: 50,
                handle: '.drag-handle',
                forceFallback: true,
                fallbackOnBody: true,
                scroll: false,
                invertSwap: false,
                swapThreshold: 6,
                onStart: function (evt) {
                    isDraggingFormula = true;
                    dragMouseY = -1;
                    if (evt && evt.originalEvent && typeof evt.originalEvent.clientY === 'number') {
                        dragMouseY = evt.originalEvent.clientY;
                    }
                    document.documentElement.style.scrollBehavior = 'auto';
                    if (scrollRafId) window.cancelAnimationFrame(scrollRafId);
                    edgeScrollWhileDragging();
                    if (!activeWorkspace && !publicCopy) ensureEditableData();
                },
                onMove: function (evt, originalEvent) {
                    if (originalEvent && typeof originalEvent.clientY === 'number') {
                        if (originalEvent.clientY <= 4) dragMouseY = -10;
                        else if (originalEvent.clientY >= window.innerHeight - 4) dragMouseY = window.innerHeight + 10;
                        else dragMouseY = originalEvent.clientY;
                    }
                },
                onEnd: async function (evt) {
                    isDraggingFormula = false;
                    if (scrollRafId) window.cancelAnimationFrame(scrollRafId);
                    scrollRafId = null;
                    document.documentElement.style.scrollBehavior = '';
                    var order = Array.prototype.map.call(evt.to.children, function (item) { return item.dataset.uid; });
                    await ensureEditableData();
                    var cat = findCategory(evt.to.dataset.category), sub = cat && cat.subcategories.filter(function (s) { return s.id === evt.to.dataset.subcategory; })[0];
                    if (!sub) return;
                    var byUid = {}; sub.formulas.forEach(function (formula) { byUid[formula.uid] = formula; });
                    var reordered = order.map(function (uid) { return byUid[uid]; }).filter(Boolean);
                    if (reordered.length === sub.formulas.length) {
                        sub.formulas = reordered;
                        await persistCurrentData();
                        renderCategory(evt.to.dataset.category);
                    }
                }
            });
            sortableInstances.push(sortable);
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
        var list = (await WS.list()).filter(function (item) { return item.id !== '__public_copy__'; });
        var selectedId = '';
        try { selectedId = localStorage.getItem(selectedWorkspaceKey) || ''; } catch (e) {}
        var selected = list.find(function (item) { return item.id === selectedId; });
        currentEl.textContent = activeWorkspace ? '当前：' + activeWorkspace.name :
            (publicCopy ? '当前：大神版（已编辑）' : '当前：大神版') + (selected ? '；自定义：' + selected.name : '');
        listEl.innerHTML = list.length ? list.map(function (item) {
            return '<button type="button" class="workspace-list-item' + ((activeWorkspace && activeWorkspace.id === item.id) || (!activeWorkspace && selectedId === item.id) ? ' active' : '') + '" data-workspace-id="' + escapeHtml(item.id) + '"><span>' + escapeHtml(item.name) + '</span><small>' + escapeHtml(new Date(item.updatedAt).toLocaleString()) + '</small></button>';
        }).join('') : '<div class="workspace-empty">还没有本地工作区</div>';
        var exportButton = document.getElementById('workspace-export');
        if (exportButton) exportButton.disabled = !(activeWorkspace || publicCopy);
        ['workspace-rename', 'workspace-delete'].forEach(function (id) { var button = document.getElementById(id); if (button) button.disabled = !activeWorkspace; });
        var publicStatus = document.getElementById('workspace-public-status');
        if (publicStatus) publicStatus.textContent = publicCopy ? '已编辑' : '未编辑：当前使用最新大神版公式库';
        var resetButton = document.getElementById('workspace-public-reset');
        if (resetButton) resetButton.disabled = !publicCopy;
        updateWorkspaceNav();
    }
    async function openWorkspaceManager() { setWorkspaceMessage(''); showOverlay('workspace-overlay', true); await refreshWorkspaceList(); }
    async function activateWorkspace(id) {
        if (id) {
            publicCopy = null;
            activeWorkspace = await WS.activate(id);
            try { if (activeWorkspace) localStorage.setItem(selectedWorkspaceKey, id); } catch (e) {}
        }
        else { activeWorkspace = await WS.activate(null); publicCopy = await WS.getPublicCopy(); }
        router(); await refreshWorkspaceList();
    }
    async function activateSelectedWorkspace() {
        if (activeWorkspace) return;
        var id = '';
        try { id = localStorage.getItem(selectedWorkspaceKey) || ''; } catch (e) {}
        var workspace = id ? await WS.get(id) : null;
        if (!workspace) {
            var list = (await WS.list()).filter(function (item) { return item.id !== '__public_copy__'; });
            if (list.length === 1) workspace = list[0];
        }
        if (workspace) {
            await activateWorkspace(workspace.id);
            return;
        }
        await openWorkspaceManager();
        setWorkspaceMessage('请先在右上角选择或新建一个自定义工作区。', true);
    }
    async function createWorkspace() {
        var name = window.prompt('请输入工作区名称', '我的 ZBLL 工作区');
        if (name === null) return;
        name = name.trim() || '我的 ZBLL 工作区';
        publicCopy = null; activeWorkspace = await WS.create(DATA, name);
        try { localStorage.setItem(selectedWorkspaceKey, activeWorkspace.id); } catch (e) {}
        showOverlay('workspace-overlay', false); router();
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
    function resetEditorImageUI(currentImage) {
        editorSelectedImage = null;
        var input = document.getElementById('editor-image');
        var currentContainer = document.getElementById('editor-current-image-container');
        var current = document.getElementById('editor-current-image');
        var previewContainer = document.getElementById('editor-preview-container');
        var preview = document.getElementById('editor-preview');
        var fileInfo = document.getElementById('editor-file-info');
        var prompt = document.getElementById('editor-upload-prompt');
        var clearButton = document.getElementById('editor-clear-image');
        if (input) input.value = '';
        if (preview) preview.removeAttribute('src');
        if (fileInfo) fileInfo.textContent = '';
        if (previewContainer) previewContainer.hidden = true;
        if (currentImage) {
            current.src = currentImage;
            currentContainer.hidden = false;
            if (prompt) prompt.style.display = 'none';
            if (clearButton) clearButton.textContent = '清除图片';
        } else {
            if (current) current.removeAttribute('src');
            if (currentContainer) currentContainer.hidden = true;
            if (prompt) prompt.style.display = 'block';
            if (clearButton) clearButton.textContent = '清除图片';
        }
        if (clearButton) clearButton.dataset.cleared = 'false';
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
        resetEditorImageUI(formula && formula.image ? formula.image : '');
        document.getElementById('editor-overlay').dataset.category = catId;
        document.getElementById('editor-overlay').dataset.isNew = isNew ? '1' : '0';
        document.getElementById('editor-title').textContent = isNew ? '添加公式' : '编辑公式';
        document.getElementById('editor-delete').hidden = isNew;
        showOverlay('editor-overlay', true); document.getElementById('editor-formula').focus();
    }
    function readFileData(file) {
        return new Promise(function (resolve, reject) { if (!file) return resolve(null); var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(file); });
    }
    async function saveFormulaEditor(e) {
        e.preventDefault(); await ensureEditableData();
        var overlay = document.getElementById('editor-overlay'), catId = overlay.dataset.category, subId = document.getElementById('editor-subcategory').value, uid = document.getElementById('editor-uid').value;
        var cat = findCategory(catId), sub = cat && cat.subcategories.filter(function (s) { return s.id === subId; })[0]; if (!sub) return;
        var formula = uid ? sub.formulas.find(function (f) { return f.uid === uid; }) : null;
        var notes = document.getElementById('editor-note-header').textContent, body = document.getElementById('editor-note-body').value.replace(/^\s+|\s+$/g, '');
        if (body) notes += '\n' + body;
        var input = document.getElementById('editor-image'), clearButton = document.getElementById('editor-clear-image');
        var image = clearButton && clearButton.dataset.cleared === 'true' ? '' : (formula ? formula.image : '');
        if (editorSelectedImage) image = editorSelectedImage;
        else if (input.files && input.files[0]) image = await readFileData(input.files[0]);
        if (!formula) { formula = { uid: 'f-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), id: 'new-' + Date.now(), image: image || '', notes: notes, lines: [], learned: false }; sub.formulas.push(formula); }
        formula.lines = parseFormulaLines(document.getElementById('editor-formula').value); formula.notes = notes; formula.image = image || ''; formula.learned = !!formula.learned;
        await persistCurrentData(); showOverlay('editor-overlay', false); renderCategory(catId);
    }
    function updateEditorImagePreview(file) {
        if (!file) return;
        readFileData(file).then(function (dataUrl) {
            editorSelectedImage = dataUrl;
            var currentContainer = document.getElementById('editor-current-image-container');
            var previewContainer = document.getElementById('editor-preview-container');
            var preview = document.getElementById('editor-preview');
            var fileInfo = document.getElementById('editor-file-info');
            var prompt = document.getElementById('editor-upload-prompt');
            var clearButton = document.getElementById('editor-clear-image');
            if (preview) preview.src = dataUrl;
            if (fileInfo) fileInfo.textContent = file.name + ' · ' + Math.ceil(file.size / 1024) + ' KB';
            if (previewContainer) previewContainer.hidden = false;
            if (currentContainer) currentContainer.hidden = true;
            if (prompt) prompt.style.display = 'none';
            if (clearButton) clearButton.dataset.cleared = 'false';
        }).catch(function () { window.alert('图片读取失败'); });
    }
    function clearEditorImage() {
        editorSelectedImage = null;
        var input = document.getElementById('editor-image');
        var currentContainer = document.getElementById('editor-current-image-container');
        var previewContainer = document.getElementById('editor-preview-container');
        var prompt = document.getElementById('editor-upload-prompt');
        var clearButton = document.getElementById('editor-clear-image');
        if (input) input.value = '';
        if (currentContainer) currentContainer.hidden = true;
        if (previewContainer) previewContainer.hidden = true;
        if (prompt) prompt.style.display = 'block';
        if (clearButton) clearButton.dataset.cleared = 'true';
    }
    function bindEditorImageDrop() {
        var dragArea = document.getElementById('editor-drag-area');
        var input = document.getElementById('editor-image');
        if (!dragArea || !input) return;
        dragArea.addEventListener('click', function () { input.click(); });
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function (name) {
            dragArea.addEventListener(name, function (e) {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        ['dragenter', 'dragover'].forEach(function (name) {
            dragArea.addEventListener(name, function () { dragArea.classList.add('highlight'); });
        });
        ['dragleave', 'drop'].forEach(function (name) {
            dragArea.addEventListener(name, function () { dragArea.classList.remove('highlight'); });
        });
        dragArea.addEventListener('drop', function (e) {
            var files = e.dataTransfer && e.dataTransfer.files;
            if (files && files[0]) updateEditorImagePreview(files[0]);
        });
        input.addEventListener('change', function () {
            if (input.files && input.files[0]) updateEditorImagePreview(input.files[0]);
        });
    }
    async function addVariant(catId, subId, uid, card) {
        await ensureEditableData();
        var ref = findFormula(catId, subId, uid); if (!ref) return;
        card = card || document.querySelector('.sortable-item[data-uid="' + CSS.escape(uid) + '"] .formula-card');
        if (!card) return;
        var old = card.querySelector('.variant-add-form');
        if (old) { old.remove(); return; }
        var form = document.createElement('div');
        form.className = 'variant-add-form';
        form.innerHTML = '<input type="text" class="form-control form-control-sm mb-2 variant-alg-input" placeholder="输入公式">' +
            '<input type="text" class="form-control form-control-sm mb-2 variant-note-input" placeholder="输入公式备注">' +
            '<div class="d-flex gap-2"><button type="button" class="btn btn-primary btn-sm variant-submit">添加</button>' +
            '<button type="button" class="btn btn-outline-secondary btn-sm variant-cancel">取消</button></div>';
        var actions = card.querySelector('.action-buttons');
        if (actions) card.insertBefore(form, actions);
        else card.appendChild(form);
        form.querySelector('.variant-alg-input').focus();
        form.querySelector('.variant-cancel').addEventListener('click', function () { form.remove(); });
        form.querySelector('.variant-submit').addEventListener('click', async function () {
            var alg = form.querySelector('.variant-alg-input').value.trim();
            var note = form.querySelector('.variant-note-input').value.trim();
            if (!alg) { form.querySelector('.variant-alg-input').focus(); return; }
            ref.formula.lines = ref.formula.lines || [];
            ref.formula.lines.push({ alg: alg, marks: note.split(/[\s,，]+/).filter(Boolean) });
            await persistCurrentData();
            renderCategory(catId);
        });
    }
    async function deleteFromEditor() {
        await ensureEditableData();
        var overlay = document.getElementById('editor-overlay'), ref = findFormula(overlay.dataset.category, document.getElementById('editor-subcategory').value, document.getElementById('editor-uid').value);
        if (!ref || !window.confirm('确定删除这条公式卡吗？')) return;
        ref.subcat.formulas.splice(ref.index, 1);
        await persistCurrentData(); showOverlay('editor-overlay', false); renderCategory(overlay.dataset.category);
    }
    async function handleWorkspaceAction(button) {
        var action = button.dataset.action, catId = button.dataset.category, subId = button.dataset.subcategory, uid = button.dataset.uid;
        await ensureEditableData();
        if (action === 'add-formula') return openFormulaEditor(catId, subId, null);
        var ref = uid ? findFormula(catId, subId, uid) : null;
        if (action === 'edit-formula' && ref) return openFormulaEditor(catId, subId, ref.formula);
        if (action === 'add-variant') return addVariant(catId, subId, uid, button.closest('.formula-card'));
        if (!ref) return;
        if (action === 'delete-formula') { if (!window.confirm('确定删除这条公式卡吗？')) return; ref.subcat.formulas.splice(ref.index, 1); }
        if (action === 'toggle-learned') ref.formula.learned = !ref.formula.learned;
        await persistCurrentData(); renderCategory(catId);
    }

    async function handleWorkspaceManagerClick(e) {
        var item = e.target.closest('[data-workspace-id]');
        if (item) { await activateWorkspace(item.dataset.workspaceId); return; }
        var id = e.target.id;
        try {
            if (id === 'workspace-new') return createWorkspace();
            if (id === 'workspace-import') return document.getElementById('workspace-file').click();
            if (id === 'workspace-export' && (activeWorkspace || publicCopy)) return WS.exportFile(activeWorkspace || publicCopy);
            if (id === 'workspace-public-reset' && publicCopy) {
                if (!window.confirm('删除本地编辑并恢复最新大神版公式库？')) return;
                await WS.resetPublicCopy(); publicCopy = null;
                if (!activeWorkspace) router();
                await refreshWorkspaceList();
                return;
            }
            if (id === 'workspace-rename' && activeWorkspace) { var name = window.prompt('新的工作区名称', activeWorkspace.name); if (name && name.trim()) { activeWorkspace.name = name.trim(); await WS.put(activeWorkspace); await refreshWorkspaceList(); } return; }
            if (id === 'workspace-delete' && activeWorkspace) {
                if (!window.confirm('删除当前工作区？导出的 .zbll 文件不受影响。')) return;
                var removedId = activeWorkspace.id;
                await WS.remove(removedId);
                try { if (localStorage.getItem(selectedWorkspaceKey) === removedId) localStorage.removeItem(selectedWorkspaceKey); } catch (e) {}
                activeWorkspace = null; publicCopy = await WS.getPublicCopy(); await WS.activate(null); showOverlay('workspace-overlay', false); router(); return;
            }
            if (id === 'workspace-exit') { await activateWorkspace(null); showOverlay('workspace-overlay', false); return; }
            if (id === 'workspace-close') return showOverlay('workspace-overlay', false);
        } catch (error) { setWorkspaceMessage(error.message || '工作区操作失败', true); }
    }
    async function importWorkspaceFile(e) {
        var file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return;
        try {
            publicCopy = null; activeWorkspace = await WS.importFile(file);
            try { localStorage.setItem(selectedWorkspaceKey, activeWorkspace.id); } catch (ignore) {}
            showOverlay('workspace-overlay', false); router();
        }
        catch (error) { showOverlay('workspace-overlay', true); setWorkspaceMessage(error.message || '导入失败：文件格式无效', true); }
    }

    function router() {
        var hash = location.hash || '#/', match = hash.match(/^#\/category\/([A-Za-z]+)$/), nextView = match ? 'cat:' + match[1] : 'home';
        saveScroll(); if (match) renderCategory(match[1]); else renderHome(); currentView = nextView;
        requestAnimationFrame(function () { restoreScroll(nextView); });
        updateWorkspaceNav();
    }
    function initWorkspace() {
        return WS.ready.then(async function () { var id = WS.activeId(); activeWorkspace = id ? await WS.get(id) : null; if (activeWorkspace) publicCopy = null; else { if (id) await WS.activate(null); publicCopy = await WS.getPublicCopy(); } router(); }).catch(function (error) { console.warn(error); router(); });
    }

    document.addEventListener('click', function (e) {
        var header = e.target.closest('.sticky-header');
        if (header && header.dataset.subcat) { toggleSubcategory(header.dataset.subcat); return; }
        if (e.target.closest('#toggle-all-subcategories')) { toggleAllSubcategories(); return; }
        var filterButton = e.target.closest('.zbll-filter-btn');
        if (filterButton) { setZbllFilter(filterButton.getAttribute('data-filter')); return; }
        if (e.target.closest('#nav-public-mode')) { activateWorkspace(null); return; }
        if (e.target.closest('#nav-workspace-mode')) { activateSelectedWorkspace(); return; }
        var action = e.target.closest('.workspace-action'); if (action) { handleWorkspaceAction(action); return; }
        var add = e.target.closest('.workspace-add'); if (add) { handleWorkspaceAction(add); return; }
        if (e.target.id === 'workspace-open') openWorkspaceManager();
        if (e.target.id === 'editor-close' || e.target.id === 'editor-cancel') showOverlay('editor-overlay', false);
    });
    document.getElementById('workspace-overlay').addEventListener('click', function (e) { if (e.target === this) showOverlay('workspace-overlay', false); });
    document.getElementById('editor-overlay').addEventListener('click', function (e) { if (e.target === this) showOverlay('editor-overlay', false); });
    document.getElementById('formula-editor-form').addEventListener('submit', saveFormulaEditor);
    document.getElementById('editor-delete').addEventListener('click', deleteFromEditor);
    document.getElementById('editor-clear-image').addEventListener('click', clearEditorImage);
    document.getElementById('workspace-file').addEventListener('change', importWorkspaceFile);
    document.getElementById('workspace-overlay').addEventListener('click', handleWorkspaceManagerClick);
    bindEditorImageDrop();
    window.addEventListener('hashchange', router);
    var scrollTimer = null;
    window.addEventListener('scroll', function () { if (scrollTimer) clearTimeout(scrollTimer); scrollTimer = setTimeout(saveScroll, 150); });
    window.addEventListener('zbll-workspace-changed', function (e) { activeWorkspace = e.detail || null; if (activeWorkspace) publicCopy = null; else WS.getPublicCopy().then(function (copy) { publicCopy = copy; router(); }); router(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { showOverlay('workspace-overlay', false); showOverlay('editor-overlay', false); } });
    initWorkspace();
})();
