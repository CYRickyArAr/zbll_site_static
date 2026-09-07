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
    var currentView = '';
    var activeWorkspace = null;
    var publicCopy = null;
    var themeKey = 'zbll_theme';
    var filterKey = 'zbll_filter';
    var selectedWorkspaceKey = 'zbll_selected_workspace';
    var publicModeKey = 'zbll_public_mode';
    var renderSnapshotKey = 'zbll_render_snapshot_v1';
    var workspaceProgressState = null;
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
    function canEditFormulaContent() { return isWorkspace(); }
    function usesLearnedStats() { return true; }
    function isPublicLibraryItem(item) {
        return !!item && (item.id === '__public_copy__' || item.kind === 'public-copy' || item.kind === 'public-library');
    }
    function selectedPublicId(publicCopies) {
        var id = 'default';
        try { id = localStorage.getItem(publicModeKey) || (publicCopy ? publicCopy.id : 'default'); } catch (e) {}
        if (id === 'edited') id = publicCopies && publicCopies[0] ? publicCopies[0].id : '__public_copy__';
        if (id !== 'default' && publicCopies && !publicCopies.some(function (item) { return item.id === id; })) id = 'default';
        return id;
    }
    function updateWorkspaceNav() {
        var nav = document.getElementById('workspace-open');
        var publicBtn = document.getElementById('nav-public-mode');
        var workspaceBtn = document.getElementById('nav-workspace-mode');
        var publicLabel = publicCopy ? (publicCopy.name || '大神版（已编辑）') : '大神版';
        if (nav) {
            var navText = activeWorkspace ? activeWorkspace.name : publicLabel;
            var label = nav.querySelector('.workspace-nav-label');
            if (!label) {
                nav.textContent = '';
                label = document.createElement('span');
                label.className = 'workspace-nav-label';
                var clip = nav.querySelector('.workspace-nav-clip');
                (clip || nav).appendChild(label);
            }
            label.textContent = navText;
            nav.title = activeWorkspace ? activeWorkspace.name : publicLabel;
            requestAnimationFrame(function () {
                var navStyle = window.getComputedStyle(nav);
                var contentWidth = nav.clientWidth - parseFloat(navStyle.paddingLeft) - parseFloat(navStyle.paddingRight);
                var singleWidth = label.scrollWidth;
                var overflow = singleWidth > contentWidth + 1;
                if (overflow) {
                    label.textContent = navText + ' ' + navText;
                    var spaceWidth = label.scrollWidth - 2 * singleWidth;
                    var shift = singleWidth + spaceWidth;
                    nav.style.setProperty('--workspace-marquee-shift', shift.toFixed(1) + 'px');
                    nav.style.setProperty('--workspace-marquee-duration', Math.max(3, shift / 40).toFixed(1) + 's');
                }
                nav.classList.toggle('is-overflow', overflow);
            });
        }
        if (publicBtn) publicBtn.classList.toggle('active', !activeWorkspace);
        if (workspaceBtn) {
            workspaceBtn.classList.toggle('active', !!activeWorkspace);
            workspaceBtn.textContent = '自定义';
            workspaceBtn.title = activeWorkspace ? activeWorkspace.name : publicLabel;
        }
    }
    async function ensureEditableData() {
        if (activeWorkspace) return activeWorkspace;
        if (publicCopy) return publicCopy;
        await openWorkspaceManager();
        setWorkspaceMessage('默认大神版不能直接编辑，请先在左侧选择或新建一个大神版公式库。', true);
        return null;
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
        var offset = navOffset();
        function findVisible(selector) {
            var candidates = document.querySelectorAll(selector);
            for (var i = 0; i < candidates.length; i++) {
                var rect = candidates[i].getBoundingClientRect();
                if (rect.bottom > offset && rect.top < window.innerHeight) {
                    return { id: candidates[i].id, offset: rect.top - offset };
                }
            }
            return null;
        }
        return findVisible('.sortable-item[id]') || findVisible('.sticky-header[id]');
    }
    function saveScroll() {
        if (!currentView) return;
        try {
            var key = getScrollKey(currentView);
            localStorage.setItem(key, String(window.pageYOffset || window.scrollY || 0));
            var anchor = firstVisibleAnchor();
            if (anchor) {
                localStorage.setItem(key + '_anchor', anchor.id);
                localStorage.setItem(key + '_anchor_offset', String(anchor.offset));
            } else {
                localStorage.removeItem(key + '_anchor');
                localStorage.removeItem(key + '_anchor_offset');
            }
        } catch (e) {}
    }
    function restoreScroll(view) {
        var y = 0, anchor = '', anchorOffset = 0;
        try {
            var key = getScrollKey(view);
            y = parseInt(localStorage.getItem(key), 10) || 0;
            anchor = localStorage.getItem(key + '_anchor') || '';
            anchorOffset = parseFloat(localStorage.getItem(key + '_anchor_offset')) || 0;
        } catch (e) {}
        document.documentElement.style.scrollBehavior = 'auto';
        document.body.style.scrollBehavior = 'auto';
        var anchorEl = anchor ? document.getElementById(anchor) : null;
        if (anchorEl) window.scrollTo(0, Math.max(0, window.pageYOffset + anchorEl.getBoundingClientRect().top - navOffset() - anchorOffset));
        else window.scrollTo(0, y);
        document.documentElement.removeAttribute('data-scroll-restore');
    }
    function saveRenderSnapshot() {
        if (!appEl || !appEl.innerHTML) return;
        try {
            var navOpen = document.getElementById('workspace-open');
            var publicBtn = document.getElementById('nav-public-mode');
            var workspaceBtn = document.getElementById('nav-workspace-mode');
            var anchor = firstVisibleAnchor();
            var snapshot = {
                hash: location.hash || '#/',
                scrollY: window.pageYOffset || window.scrollY || 0,
                anchor: anchor,
                appHtml: appEl.innerHTML,
                nav: {
                    publicActive: publicBtn ? publicBtn.classList.contains('active') : true,
                    workspaceActive: workspaceBtn ? workspaceBtn.classList.contains('active') : false,
                    workspaceTitle: workspaceBtn ? workspaceBtn.title : '',
                    workspaceOpenHtml: navOpen ? navOpen.innerHTML : '',
                    workspaceOpenTitle: navOpen ? navOpen.title : '',
                    workspaceOpenClass: navOpen ? navOpen.className : ''
                }
            };
            try {
                sessionStorage.setItem(renderSnapshotKey, JSON.stringify(snapshot));
            } catch (quotaError) {
                var clone = appEl.cloneNode(true);
                clone.querySelectorAll('img[src^="data:"]').forEach(function (img) { img.removeAttribute('src'); });
                snapshot.appHtml = clone.innerHTML;
                sessionStorage.setItem(renderSnapshotKey, JSON.stringify(snapshot));
            }
        } catch (e) {
            try { sessionStorage.removeItem(renderSnapshotKey); } catch (ignore) {}
        }
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
            } else html += '<div class="empty-state"><p class="mb-0">该子分类下暂无公式</p></div>';
            if (canEditFormulaContent() && getZbllFilter() === 'all') html += '<button type="button" class="workspace-add" data-action="add-formula" data-category="' + escapeHtml(cat.id) + '" data-subcategory="' + escapeHtml(sub.id) + '">＋</button>';
            html += '</div></div>';
        });
        html += '</div>';
        appEl.innerHTML = html;
        updateToggleAllButton();
        applyZbllFilter(getZbllFilter());
        if (activeWorkspace || publicCopy) bindSorting();
    }

    function renderFormulaCard(catId, subId, formula, index) {
        var cat = findCategory(catId), sub = cat.subcategories.filter(function (s) { return s.id === subId; })[0];
        var id = displayFormulaId(sub, formula, index), uid = formula.uid || formula.id || (subId + '-' + index);
        // SortableJS 使用 forceFallback 模式接管拖动；不要再设置原生 draggable，避免出现双重拖影。
        var html = '<div class="sortable-item" data-uid="' + escapeHtml(uid) + '" id="formula-' + escapeHtml(uid) + '">';
        var canEditContent = canEditFormulaContent();
        html += '<div class="formula-card' + (formula.learned ? ' learned' : '') + ' learning-enabled' + (canEditContent ? ' content-editable' : '') + '">';
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
        if (canEditContent) {
            html += '<div class="action-buttons">';
            html += '<button type="button" class="add-variant-btn workspace-action" title="添加一行变体" aria-label="添加一行变体" data-action="add-variant" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '">＋</button>';
            html += '<div class="action-buttons-row"><button type="button" class="btn btn-outline-secondary btn-sm workspace-action" data-action="edit-formula" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '">编辑</button></div></div>';
        }
        html += '<button type="button" class="learn-btn workspace-action' + (formula.learned ? ' learned' : '') + '" data-action="toggle-learned" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '" title="' + (formula.learned ? '取消已学' : '标记已学') + '" aria-label="' + (formula.learned ? '取消已学' : '标记已学') + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg></button>';
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
                onChoose: function () {
                    if (!activeWorkspace && !publicCopy) {
                        openWorkspaceManager().then(function () {
                            setWorkspaceMessage('默认大神版不能直接排序，请先在左侧选择或新建一个大神版公式库。', true);
                        });
                        return false;
                    }
                },
                onStart: function (evt) {
                    if (!activeWorkspace && !publicCopy) {
                        if (evt && evt.item) evt.item.draggable = false;
                        return false;
                    }
                    isDraggingFormula = true;
                    dragMouseY = -1;
                    if (evt && evt.originalEvent && typeof evt.originalEvent.clientY === 'number') {
                        dragMouseY = evt.originalEvent.clientY;
                    }
                    document.documentElement.style.scrollBehavior = 'auto';
                    if (scrollRafId) window.cancelAnimationFrame(scrollRafId);
                    edgeScrollWhileDragging();
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
                    var editable = await ensureEditableData();
                    if (!editable) { renderCategory(evt.to.dataset.category); return; }
                    var order = Array.prototype.map.call(evt.to.children, function (item) { return item.dataset.uid; });
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
    function setWorkspaceProgress(value, text) {
        workspaceProgressState = value === null || value === undefined ? null : { value: value, text: text || '' };
        var wrap = document.getElementById('workspace-progress'); if (!wrap) return;
        var bar = wrap.querySelector('.workspace-progress-bar');
        var label = wrap.querySelector('.workspace-progress-text');
        var visible = value !== null && value !== undefined;
        wrap.hidden = !visible;
        if (!visible) return;
        value = Math.max(0, Math.min(100, Number(value) || 0));
        if (bar) bar.style.width = value + '%';
        var track = wrap.querySelector('.workspace-progress-track');
        if (track) track.setAttribute('aria-valuenow', String(value));
        if (label) label.textContent = (text || '处理中') + ' · ' + value + '%';
    }
    async function refreshWorkspaceList() {
        var listEl = document.getElementById('workspace-list'), publicListEl = document.getElementById('workspace-public-list'), currentEl = document.getElementById('workspace-current');
        if (!listEl) return;
        var publicCopies = await WS.listPublicCopies(DATA);
        var list = (await WS.list()).filter(function (item) { return !isPublicLibraryItem(item); });
        var selectedId = '', selectedPublic = 'default';
        try { selectedId = localStorage.getItem(selectedWorkspaceKey) || ''; } catch (e) {}
        if (!selectedId && activeWorkspace) selectedId = activeWorkspace.id;
        selectedPublic = selectedPublicId(publicCopies);
        var selected = list.find(function (item) { return item.id === selectedId; });
        currentEl.textContent = activeWorkspace ? '当前：' + activeWorkspace.name :
            (publicCopy ? '当前：' + (publicCopy.name || '大神版（已编辑）') : '当前：大神版') + (selected ? '；自定义：' + selected.name : '');
        if (publicListEl) {
            publicListEl.innerHTML =
                '<button type="button" class="workspace-list-item' + (selectedPublic === 'default' ? ' active' : '') + '" data-public-library="default"><span>大神版</span><small>默认</small></button>' +
                publicCopies.map(function (item) {
                    return '<button type="button" class="workspace-list-item' + (selectedPublic === item.id ? ' active' : '') + '" data-public-library="' + escapeHtml(item.id) + '"><span>' + escapeHtml(item.name || '大神版（已编辑）') + '</span><small>' + escapeHtml(new Date(item.updatedAt).toLocaleString()) + '</small></button>';
                }).join('');
        }
        listEl.innerHTML = list.length ? list.map(function (item) {
            return '<button type="button" class="workspace-list-item' + (selectedId === item.id ? ' active' : '') + '" data-workspace-id="' + escapeHtml(item.id) + '"><span>' + escapeHtml(item.name) + '</span><small>' + escapeHtml(new Date(item.updatedAt).toLocaleString()) + '</small></button>';
        }).join('') : '<div class="workspace-empty">暂无自定义公式库</div>';
        var selectedExists = !!selected;
        var publicExportButton = document.getElementById('workspace-public-export');
        if (publicExportButton) publicExportButton.disabled = false;
        var selectedPublicCopyExists = selectedPublic !== 'default' && publicCopies.some(function (item) { return item.id === selectedPublic; });
        ['workspace-public-rename', 'workspace-public-delete'].forEach(function (id) { var button = document.getElementById(id); if (button) button.disabled = !selectedPublicCopyExists; });
        var customExportButton = document.getElementById('workspace-custom-export');
        if (customExportButton) customExportButton.disabled = !selectedExists;
        ['workspace-rename', 'workspace-delete'].forEach(function (id) { var button = document.getElementById(id); if (button) button.disabled = !selectedExists; });
        updateWorkspaceNav();
    }
    async function openWorkspaceManager() {
        setWorkspaceMessage('');
        if (workspaceProgressState) setWorkspaceProgress(workspaceProgressState.value, workspaceProgressState.text);
        else setWorkspaceProgress(null);
        showOverlay('workspace-overlay', true);
        await refreshWorkspaceList();
    }
    async function getSelectedWorkspace() {
        var id = '';
        try { id = localStorage.getItem(selectedWorkspaceKey) || ''; } catch (e) {}
        return id ? await WS.get(id) : null;
    }
    async function getSelectedPublicCopy() {
        var publicCopies = await WS.listPublicCopies(DATA);
        var id = selectedPublicId(publicCopies);
        return id === 'default' ? null : await WS.getPublicCopy(DATA, id);
    }
    async function exportWorkspace(target, button) {
        if (!target) { setWorkspaceMessage('请先选择要导出的公式库。', true); return; }
        if (button) button.disabled = true;
        setWorkspaceMessage('正在导出，请稍候…');
        setWorkspaceProgress(0, '开始导出');
        await WS.exportFile(target, setWorkspaceProgress);
        setWorkspaceMessage('已开始下载 ' + (target.name || 'zbll-workspace').replace(/[\\/:*?"<>|]/g, '_') + '.zbll');
        setTimeout(function () { setWorkspaceProgress(null); }, 1200);
        await refreshWorkspaceList();
    }
    async function activatePublicLibrary(mode) {
        var publicCopies = await WS.listPublicCopies(DATA);
        var id = mode === 'default' ? 'default' : (mode || selectedPublicId(publicCopies));
        if (id !== 'default' && !publicCopies.some(function (item) { return item.id === id; })) id = 'default';
        try { localStorage.setItem(publicModeKey, id); } catch (e) {}
        activeWorkspace = await WS.activate(null);
        publicCopy = id === 'default' ? null : await WS.getPublicCopy(DATA, id);
        router();
        await refreshWorkspaceList();
    }
    async function activateWorkspace(id) {
        if (id) {
            publicCopy = null;
            activeWorkspace = await WS.activate(id);
            try { if (activeWorkspace) localStorage.setItem(selectedWorkspaceKey, id); } catch (e) {}
        }
        else {
            var publicCopies = await WS.listPublicCopies(DATA);
            var publicMode = selectedPublicId(publicCopies);
            activeWorkspace = await WS.activate(null);
            publicCopy = publicMode === 'default' ? null : await WS.getPublicCopy(DATA, publicMode);
        }
        router(); await refreshWorkspaceList();
    }
    async function activateSelectedWorkspace() {
        var id = '';
        try { id = localStorage.getItem(selectedWorkspaceKey) || ''; } catch (e) {}
        var workspace = id ? await WS.get(id) : null;
        if (activeWorkspace && workspace && activeWorkspace.id === workspace.id) return;
        if (!workspace) {
            var list = (await WS.list()).filter(function (item) { return !isPublicLibraryItem(item); });
            if (list.length === 1) workspace = list[0];
        }
        if (workspace) {
            await activateWorkspace(workspace.id);
            return;
        }
        await openWorkspaceManager();
        setWorkspaceMessage('请先在右侧选择或新建一个自定义公式库。', true);
    }
    async function createWorkspace() {
        var name = window.prompt('请输入自定义公式库名称', '');
        if (!name || !name.trim()) return;
        name = name.trim();
        var workspace = await WS.create(DATA, name);
        try { localStorage.setItem(selectedWorkspaceKey, workspace.id); } catch (e) {}
        if (activeWorkspace) { publicCopy = null; activeWorkspace = await WS.activate(workspace.id); router(); }
        await refreshWorkspaceList();
    }
    async function createPublicLibrary() {
        var name = window.prompt('请输入大神版公式库名称', '');
        if (!name || !name.trim()) return;
        var copy = await WS.createPublicCopy(DATA, name.trim());
        try { localStorage.setItem(publicModeKey, copy.id); } catch (e) {}
        if (!activeWorkspace) { publicCopy = copy; router(); }
        await refreshWorkspaceList();
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
        e.preventDefault();
        var editable = await ensureEditableData();
        if (!editable) return;
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
        var editable = await ensureEditableData();
        if (!editable) return;
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
        var editable = await ensureEditableData();
        if (!editable) return;
        var overlay = document.getElementById('editor-overlay'), ref = findFormula(overlay.dataset.category, document.getElementById('editor-subcategory').value, document.getElementById('editor-uid').value);
        if (!ref || !window.confirm('确定删除这条公式卡吗？')) return;
        ref.subcat.formulas.splice(ref.index, 1);
        await persistCurrentData(); showOverlay('editor-overlay', false); renderCategory(overlay.dataset.category);
    }
    async function handleWorkspaceAction(button) {
        var action = button.dataset.action, catId = button.dataset.category, subId = button.dataset.subcategory, uid = button.dataset.uid;
        if (!isWorkspace() && (action === 'add-formula' || action === 'add-variant' || action === 'edit-formula' || action === 'delete-formula')) return;
        var editable = await ensureEditableData();
        if (!editable) return;
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
        var publicItem = e.target.closest('[data-public-library]');
        if (publicItem) {
            var publicMode = publicItem.dataset.publicLibrary || 'default';
            try { localStorage.setItem(publicModeKey, publicMode); } catch (ignore) {}
            if (!activeWorkspace) await activatePublicLibrary(publicMode);
            else await refreshWorkspaceList();
            return;
        }
        var item = e.target.closest('[data-workspace-id]');
        if (item) {
            try { localStorage.setItem(selectedWorkspaceKey, item.dataset.workspaceId); } catch (ignore) {}
            if (activeWorkspace) await activateWorkspace(item.dataset.workspaceId);
            else await refreshWorkspaceList();
            return;
        }
        var id = e.target.id;
        try {
            if (id === 'workspace-public-new') return createPublicLibrary();
            if (id === 'workspace-new') return createWorkspace();
            if (id === 'workspace-import') return document.getElementById('workspace-file').click();
            if (id === 'workspace-public-export') {
                return exportWorkspace(WS.exportPublic(DATA, await getSelectedPublicCopy()), e.target);
            }
            if (id === 'workspace-custom-export') {
                return exportWorkspace(await getSelectedWorkspace(), e.target);
            }
            if (id === 'workspace-public-rename') {
                var selectedPublicCopy = await getSelectedPublicCopy();
                if (!selectedPublicCopy) { setWorkspaceMessage('默认大神版不能重命名，请先选择一个大神版副本。', true); await refreshWorkspaceList(); return; }
                var publicName = window.prompt('新的大神版名称', selectedPublicCopy.name || '大神版（已编辑）');
                if (publicName && publicName.trim()) {
                    selectedPublicCopy.name = publicName.trim();
                    await WS.putPublicCopy(selectedPublicCopy);
                    if (publicCopy && publicCopy.id === selectedPublicCopy.id) publicCopy = selectedPublicCopy;
                    await refreshWorkspaceList();
                }
                return;
            }
            if (id === 'workspace-public-delete') {
                var publicToDelete = await getSelectedPublicCopy();
                if (!publicToDelete) { setWorkspaceMessage('默认大神版不能删除，请先选择一个大神版副本。', true); await refreshWorkspaceList(); return; }
                if (!window.confirm('删除选中的大神版副本？导出的 .zbll 文件不受影响。')) return;
                var removedPublicId = publicToDelete.id;
                await WS.remove(removedPublicId);
                try { if (localStorage.getItem(publicModeKey) === removedPublicId) localStorage.setItem(publicModeKey, 'default'); } catch (e) {}
                if (publicCopy && publicCopy.id === removedPublicId) { publicCopy = null; router(); }
                await refreshWorkspaceList();
                return;
            }
            if (id === 'workspace-rename') {
                var selectedWorkspace = await getSelectedWorkspace();
                if (!selectedWorkspace) { setWorkspaceMessage('请先选择要重命名的自定义公式库。', true); await refreshWorkspaceList(); return; }
                var name = window.prompt('新的工作区名称', selectedWorkspace.name);
                if (name && name.trim()) {
                    selectedWorkspace.name = name.trim();
                    await WS.put(selectedWorkspace);
                    if (activeWorkspace && activeWorkspace.id === selectedWorkspace.id) activeWorkspace = selectedWorkspace;
                    await refreshWorkspaceList();
                }
                return;
            }
            if (id === 'workspace-delete') {
                var selectedToDelete = await getSelectedWorkspace();
                if (!selectedToDelete) { setWorkspaceMessage('请先选择要删除的自定义公式库。', true); await refreshWorkspaceList(); return; }
                if (!window.confirm('删除选中的自定义公式库？导出的 .zbll 文件不受影响。')) return;
                var removedId = selectedToDelete.id;
                await WS.remove(removedId);
                try { if (localStorage.getItem(selectedWorkspaceKey) === removedId) localStorage.removeItem(selectedWorkspaceKey); } catch (e) {}
                if (activeWorkspace && activeWorkspace.id === removedId) { activeWorkspace = null; await WS.activate(null); var publicCopies = await WS.listPublicCopies(DATA); var publicMode = selectedPublicId(publicCopies); publicCopy = publicMode === 'default' ? null : await WS.getPublicCopy(DATA, publicMode); router(); }
                await refreshWorkspaceList();
                return;
            }
            if (id === 'workspace-close') return showOverlay('workspace-overlay', false);
        } catch (error) { setWorkspaceMessage(error.message || '工作区操作失败', true); setWorkspaceProgress(null); await refreshWorkspaceList(); }
    }
    async function importWorkspaceFile(e) {
        var file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return;
        try {
            var imported = await WS.importFile(file);
            if (isPublicLibraryItem(imported)) {
                try { localStorage.setItem(publicModeKey, imported.id); } catch (ignore) {}
                if (!activeWorkspace) { publicCopy = await WS.getPublicCopy(DATA, imported.id); router(); }
                setWorkspaceMessage('已导入到大神版公式库：' + imported.name);
            } else {
                try { localStorage.setItem(selectedWorkspaceKey, imported.id); } catch (ignore) {}
                if (activeWorkspace) { publicCopy = null; activeWorkspace = await WS.activate(imported.id); router(); }
                setWorkspaceMessage('已导入到自定义公式库：' + imported.name);
            }
            await refreshWorkspaceList();
        }
        catch (error) { showOverlay('workspace-overlay', true); setWorkspaceMessage(error.message || '导入失败：文件格式无效', true); }
    }

    function router() {
        var hash = location.hash || '#/', match = hash.match(/^#\/category\/([A-Za-z]+)$/), nextView = match ? 'cat:' + match[1] : 'home';
        if (currentView) saveScroll(); if (match) renderCategory(match[1]); else renderHome(); currentView = nextView;
        restoreScroll(nextView);
        updateWorkspaceNav();
    }
    function initWorkspace() {
        return WS.ready.then(async function () { var id = WS.activeId(); activeWorkspace = id ? await WS.get(id) : null; if (activeWorkspace) publicCopy = null; else { if (id) await WS.activate(null); var publicCopies = await WS.listPublicCopies(DATA); var publicMode = selectedPublicId(publicCopies); publicCopy = publicMode === 'default' ? null : await WS.getPublicCopy(DATA, publicMode); } router(); }).catch(function (error) { console.warn(error); router(); }).finally(function () { document.body.classList.add('zbll-ready'); document.body.classList.remove('zbll-has-snapshot'); });
    }

    var defaultDragPromptAt = 0;
    function promptDefaultPublicDrag() {
        var now = Date.now();
        if (now - defaultDragPromptAt < 400) return;
        defaultDragPromptAt = now;
        openWorkspaceManager().then(function () {
            setWorkspaceMessage('默认大神版不能直接排序，请先在左侧选择或新建一个大神版公式库。', true);
        });
    }
    document.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || !e.target.closest('.drag-handle') || activeWorkspace || publicCopy) return;
        e.preventDefault();
        promptDefaultPublicDrag();
    }, true);
    document.addEventListener('click', function (e) {
        var header = e.target.closest('.sticky-header');
        if (header && header.dataset.subcat) { toggleSubcategory(header.dataset.subcat); return; }
        if (e.target.closest('#toggle-all-subcategories')) { toggleAllSubcategories(); return; }
        if (e.target.closest('.drag-handle') && !activeWorkspace && !publicCopy) {
            promptDefaultPublicDrag();
            return;
        }
        var filterButton = e.target.closest('.zbll-filter-btn');
        if (filterButton) { setZbllFilter(filterButton.getAttribute('data-filter')); return; }
        if (e.target.closest('#nav-public-mode')) { activateWorkspace(null); return; }
        if (e.target.closest('#nav-workspace-mode')) { activateSelectedWorkspace(); return; }
        var action = e.target.closest('.workspace-action'); if (action) { handleWorkspaceAction(action); return; }
        var add = e.target.closest('.workspace-add'); if (add) { handleWorkspaceAction(add); return; }
        if (e.target.closest('#workspace-open')) { openWorkspaceManager(); return; }
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
    window.addEventListener('pagehide', function () { saveScroll(); saveRenderSnapshot(); });
    window.addEventListener('zbll-workspace-changed', function (e) {
        activeWorkspace = e.detail || null;
        if (activeWorkspace) { publicCopy = null; router(); return; }
        WS.listPublicCopies(DATA).then(function (publicCopies) {
            var publicMode = selectedPublicId(publicCopies);
            return publicMode === 'default' ? null : WS.getPublicCopy(DATA, publicMode);
        }).then(function (copy) {
            publicCopy = copy;
            router();
        });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { showOverlay('workspace-overlay', false); showOverlay('editor-overlay', false); } });
    initWorkspace();
})();
