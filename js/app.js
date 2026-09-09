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
    var workspaceExportController = null;
    var workspaceContextTarget = null;
    var workspaceShortcutTarget = null;
    var inlineEditor = null;
    var selectedFormulaLineKey = null;

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
    function canShowFormulaEditor() { return isWorkspace() || !activeWorkspace; }
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
        var publicLabel = publicCopy ? (publicCopy.name || '大神版（已编辑）') : '默认大神版';
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

    var workspaceHelpFitCanvas = null;
    var workspaceHelpFitTimer = null;
    function fitWorkspaceHelpText() {
        var help = document.querySelector('.workspace-help');
        if (!help) return;
        help.style.removeProperty('--workspace-help-font-size');
        var available = help.clientWidth;
        var text = help.textContent || '';
        if (!available || !text.trim()) return;
        var style = window.getComputedStyle(help);
        var maxSize = parseFloat(style.fontSize) || 15.2;
        var minSize = 8;
        if (!workspaceHelpFitCanvas) workspaceHelpFitCanvas = document.createElement('canvas');
        var context = workspaceHelpFitCanvas.getContext('2d');
        if (!context) return;
        context.font = style.font;
        var textWidth = context.measureText(text).width;
        if (!textWidth || textWidth <= available) return;
        var fittedSize = Math.max(minSize, Math.floor((available / textWidth) * maxSize * 100) / 100);
        help.style.setProperty('--workspace-help-font-size', fittedSize + 'px');
    }
    function scheduleWorkspaceHelpFit() {
        if (workspaceHelpFitTimer) window.cancelAnimationFrame(workspaceHelpFitTimer);
        workspaceHelpFitTimer = window.requestAnimationFrame(function () {
            workspaceHelpFitTimer = null;
            fitWorkspaceHelpText();
        });
    }

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
        } else {
            // 用与大神版统计框相同的隐形占位保留首页分类卡位置，切换时不发生上下跳动。
            html += '<div class="player-stats workspace-mode-slot">';
            getPlayerStats(DATA).forEach(function (p) {
                html += '<span class="player-stat-box workspace-mode-placeholder" aria-hidden="true">' + escapeHtml(p.label) + ' <b>' + p.count + '</b></span>';
            });
            html += '<div class="workspace-mode-hint">当前自定义公式库：' + escapeHtml(activeWorkspace.name) + '</div></div>';
        }
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
        updateToggleAllButton();
    }

    function renderCategory(catId) {
        var cat = findCategory(catId);
        if (!cat) { appEl.innerHTML = '<div class="container"><div class="empty-state">分类不存在：' + escapeHtml(catId) + '</div></div>'; updateToggleAllButton(); return; }
        var html = '<div class="container"><nav aria-label="breadcrumb"><ol class="breadcrumb"><li class="breadcrumb-item"><a href="#/">首页</a></li><li class="breadcrumb-item active">' + escapeHtml(cat.id) + ' Case</li></ol></nav>';
        html += '<div class="category-title-row"><h1 class="category-title">' + escapeHtml(cat.id) + ' Case</h1></div>';
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
        // 跨大神版/自定义定位按当前显示位置（如 T3-8），而非各公式库各自的内部 uid。
        var positionAnchor = sub.id + '-' + (index + 1);
        // SortableJS 使用 forceFallback 模式接管拖动；不要再设置原生 draggable，避免出现双重拖影。
        var html = '<div class="sortable-item" data-uid="' + escapeHtml(uid) + '" id="formula-position-' + escapeHtml(positionAnchor) + '">';
        var canEditContent = canEditFormulaContent();
        var editing = !!inlineEditor && inlineEditor.catId === catId && inlineEditor.subId === subId && inlineEditor.uid === uid;
        var notesOnly = editing && inlineEditor.notesOnly;
        var note = splitNotes(formula.notes, formula, subId);
        html += '<div class="formula-card' + (formula.learned ? ' learned' : '') + ' learning-enabled has-card-editor' + (canEditContent ? ' content-editable' : '') + (editing ? ' inline-editing' : '') + (notesOnly ? ' notes-only-editing' : '') + '">';
        if (isEditableView()) html += '<div class="drag-handle" title="拖动排序" aria-label="拖动排序">⋮⋮</div>';
        html += '<div class="row"><div class="col-4">';
        if (editing && !notesOnly) {
            var editImage = inlineEditor.imageCleared ? '' : (inlineEditor.selectedImage || formula.image || '');
            html += '<div class="inline-image-editor"><label class="drag-area inline-image-drop" title="点击选择图片">';
            html += '<img class="inline-image-preview" alt="图片预览"' + (editImage ? ' src="' + escapeHtml(editImage) + '"' : ' hidden') + '>';
            html += '<span class="inline-image-prompt"' + (editImage ? ' hidden' : '') + '>📷<small>选择图片</small></span>';
            html += '<input type="file" class="inline-image-input d-none" accept="image/png,image/jpeg,image/gif,image/svg+xml"></label>';
            html += '<button type="button" class="btn btn-sm btn-outline-secondary workspace-action inline-image-clear" data-action="clear-inline-image">清除图片</button></div>';
        } else if (formula.image) html += '<img src="' + escapeHtml(formula.image) + '" class="formula-image" alt="' + escapeHtml(id) + '" loading="lazy">';
        else html += '<div class="formula-image d-flex align-items-center justify-content-center bg-light"><span class="text-muted">无图</span></div>';
        html += '</div><div class="col-8"><div class="formula-id">' + escapeHtml(id) + '</div>';
        if (editing) {
            html += '<div class="inline-note-editor"><div class="formula-notes formula-note-fixed inline-note-header">' + escapeHtml(note.header) + '</div>';
            html += '<textarea class="workspace-textarea form-control note-body inline-note-body" rows="4" placeholder="可以在这里写备注">' + escapeHtml(note.body) + '</textarea></div>';
        } else if (formula.notes) {
            html += '<div class="formula-note-display formula-notes"><div class="formula-note-fixed">' + escapeHtml(note.header) + '</div>';
            if (note.body) html += '<div class="formula-note-body-display">' + escapeHtml(note.body) + '</div>';
            html += '</div>';
        }
        html += '</div></div>';
        if (editing && !notesOnly) {
            html += '<label class="workspace-label inline-formula-label">公式</label>';
            html += '<textarea class="workspace-textarea form-control inline-formula-input" rows="4" placeholder="输入公式">' + escapeHtml((formula.lines || []).map(lineText).join('\n')) + '</textarea>';
        } else if (formula.lines && formula.lines.length) {
            html += '<div class="formula-lines">';
            formula.lines.forEach(function (line, lineIndex) {
                var lineKey = catId + '::' + subId + '::' + uid + '::' + lineIndex;
                html += '<div class="formula-line' + (selectedFormulaLineKey === lineKey ? ' selected' : '') + '" data-formula-line-key="' + escapeHtml(lineKey) + '" role="button" tabindex="0" aria-selected="' + (selectedFormulaLineKey === lineKey ? 'true' : 'false') + '"><span class="formula-line-alg">' + escapeHtml(line.alg) + '</span>';
                if (line.marks && line.marks.length) {
                    html += '<span class="formula-marks-group">';
                    line.marks.forEach(function (mark) { html += '<span class="formula-marks" title="' + escapeHtml(LABEL_TO_NAME[mark] || mark) + '">' + escapeHtml(mark) + '</span>'; });
                    html += '</span>';
                }
                html += '</div>';
            });
            html += '</div>';
        }
        if (editing) {
            html += '<div class="action-buttons inline-editor-actions"><div class="action-buttons-row">';
            html += '<button type="button" class="btn btn-secondary btn-sm workspace-action" data-action="cancel-inline-edit">取消</button>';
            html += '<button type="button" class="btn btn-primary btn-sm workspace-action" data-action="save-inline-edit">保存</button>';
            html += '</div></div>';
        } else if (canShowFormulaEditor()) {
            html += '<div class="action-buttons">';
            if (canEditContent) html += '<button type="button" class="add-variant-btn workspace-action" title="添加一行公式" aria-label="添加一行公式" data-action="add-variant" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '">＋</button>';
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
    function selectFormulaLine(line) {
        if (!line || line.closest('.inline-editing')) return;
        var lineKey = line.getAttribute('data-formula-line-key') || null;
        var shouldClear = selectedFormulaLineKey === lineKey;
        selectedFormulaLineKey = shouldClear ? null : lineKey;
        document.querySelectorAll('.formula-line.selected').forEach(function (item) {
            item.classList.remove('selected');
            item.setAttribute('aria-selected', 'false');
        });
        if (shouldClear) return;
        line.classList.add('selected');
        line.setAttribute('aria-selected', 'true');
    }
    function updateToggleAllButton() {
        var button = document.getElementById('toggle-all-subcategories');
        if (!button) return;
        var headers = document.querySelectorAll('.sticky-header[id^="header-"]'), openCount = 0;
        button.hidden = !headers.length;
        if (!headers.length) return;
        headers.forEach(function (header) { var content = document.getElementById('subcat-' + header.dataset.subcat); if (content && content.style.display !== 'none') openCount++; });
        var collapse = openCount === headers.length;
        var label = collapse ? '全部折叠' : '全部展开';
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = collapse
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 12h8"></path></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M12 8v8M8 12h8"></path></svg>';
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
                        if (inlineEditor) {
                            Array.prototype.forEach.call(evt.to.children, function (item, index) {
                                var formula = sub.formulas[index];
                                var positionAnchor = sub.id + '-' + (index + 1);
                                item.id = 'formula-position-' + positionAnchor;
                                var idNode = item.querySelector('.formula-id');
                                if (idNode) idNode.textContent = displayFormulaId(sub, formula, index);
                            });
                        } else renderCategory(evt.to.dataset.category);
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
        var cancel = document.getElementById('workspace-export-cancel');
        if (cancel) { cancel.hidden = !workspaceExportController; cancel.disabled = false; }
    }
    async function refreshWorkspaceList() {
        var listEl = document.getElementById('workspace-list'), publicListEl = document.getElementById('workspace-public-list');
        if (!listEl) return;
        var publicCopies = await WS.listPublicCopies(DATA);
        var list = (await WS.list()).filter(function (item) { return !isPublicLibraryItem(item); });
        var selectedId = '', selectedPublic = 'default';
        try { selectedId = localStorage.getItem(selectedWorkspaceKey) || ''; } catch (e) {}
        if (!selectedId && activeWorkspace) selectedId = activeWorkspace.id;
        selectedPublic = selectedPublicId(publicCopies);
        var selected = list.find(function (item) { return item.id === selectedId; });
        if (publicListEl) {
            publicListEl.innerHTML =
                '<div class="workspace-list-row"><button type="button" class="workspace-list-item' + (selectedPublic === 'default' ? ' active' : '') + '" data-public-library="default"><span>默认大神版</span><small>仅预览</small></button><button type="button" class="workspace-item-menu-trigger" data-workspace-menu="public" data-target-id="default" aria-haspopup="menu" aria-label="默认大神版的更多操作" title="更多操作">…</button></div>' +
                publicCopies.map(function (item) {
                    return '<div class="workspace-list-row"><button type="button" class="workspace-list-item' + (selectedPublic === item.id ? ' active' : '') + '" data-public-library="' + escapeHtml(item.id) + '"><span>' + escapeHtml(item.name || '大神版（已编辑）') + '</span><small>' + escapeHtml(new Date(item.updatedAt).toLocaleString()) + '</small></button><button type="button" class="workspace-item-menu-trigger" data-workspace-menu="public" data-target-id="' + escapeHtml(item.id) + '" aria-haspopup="menu" aria-label="' + escapeHtml(item.name || '大神版（已编辑）') + '的更多操作" title="更多操作">…</button></div>';
                }).join('');
        }
        listEl.innerHTML = list.length ? list.map(function (item) {
            return '<div class="workspace-list-row"><button type="button" class="workspace-list-item' + (selectedId === item.id ? ' active' : '') + '" data-workspace-id="' + escapeHtml(item.id) + '"><span>' + escapeHtml(item.name) + '</span><small>' + escapeHtml(new Date(item.updatedAt).toLocaleString()) + '</small></button><button type="button" class="workspace-item-menu-trigger" data-workspace-menu="custom" data-target-id="' + escapeHtml(item.id) + '" aria-haspopup="menu" aria-label="' + escapeHtml(item.name) + '的更多操作" title="更多操作">…</button></div>';
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
        hideWorkspaceContextMenu();
        workspaceShortcutTarget = null;
        setWorkspaceMessage('');
        if (workspaceProgressState) setWorkspaceProgress(workspaceProgressState.value, workspaceProgressState.text);
        else setWorkspaceProgress(null);
        showOverlay('workspace-overlay', true);
        scheduleWorkspaceHelpFit();
        await refreshWorkspaceList();
        scheduleWorkspaceHelpFit();
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
        if (workspaceExportController) { setWorkspaceMessage('已有导出正在进行，请先等待或取消。', true); return; }
        if (button) button.disabled = true;
        workspaceExportController = new AbortController();
        setWorkspaceMessage('正在导出，请稍候…');
        setWorkspaceProgress(0, '开始导出');
        try {
            await WS.exportFile(target, setWorkspaceProgress, workspaceExportController.signal);
            setWorkspaceMessage('已下载 ' + (target.name || 'zbll-workspace').replace(/[\\/:*?"<>|]/g, '_') + '.zbll');
            setTimeout(function () { if (!workspaceExportController) setWorkspaceProgress(null); }, 1200);
        } catch (error) {
            if (workspaceExportController.signal.aborted || (error && error.name === 'AbortError')) {
                setWorkspaceMessage('已取消导出。');
                setWorkspaceProgress(null);
            } else {
                setWorkspaceMessage(error && error.message ? error.message : '导出失败，请重试。', true);
                setWorkspaceProgress(null);
            }
        } finally {
            workspaceExportController = null;
            await refreshWorkspaceList();
        }
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
        var name = window.prompt('请输入新建自定义公式库名称', '');
        if (!name || !name.trim()) return;
        name = name.trim();
        var workspace = await WS.create(DATA, name);
        setWorkspaceMessage('');
        try { localStorage.setItem(selectedWorkspaceKey, workspace.id); } catch (e) {}
        if (activeWorkspace) { publicCopy = null; activeWorkspace = await WS.activate(workspace.id); router(); }
        await refreshWorkspaceList();
    }
    async function createPublicLibrary() {
        var name = window.prompt('请输入新建大神版公式库名称', '');
        if (!name || !name.trim()) return;
        var copy = await WS.createPublicCopy(DATA, name.trim());
        setWorkspaceMessage('');
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
    function readFileData(file) {
        return new Promise(function (resolve, reject) { if (!file) return resolve(null); var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(file); });
    }
    function findInlineCard(uid) {
        return document.querySelector('.sortable-item[data-uid="' + CSS.escape(uid) + '"] .formula-card');
    }
    function rerenderAtSameCard(catId, uid, previousTop) {
        renderCategory(catId);
        requestAnimationFrame(function () {
            var card = findInlineCard(uid);
            if (card && typeof previousTop === 'number') window.scrollBy(0, card.getBoundingClientRect().top - previousTop);
        });
    }
    function openFormulaEditor(catId, subId, formula) {
        if (!formula) return;
        var state = inlineEditor = {
            catId: catId,
            subId: subId,
            uid: formula.uid || formula.id,
            notesOnly: isPublicCopy(),
            selectedImage: null,
            imageCleared: false
        };
        renderCategory(catId);
        requestAnimationFrame(function () {
            if (inlineEditor !== state) return;
            var card = findInlineCard(state.uid);
            var field = card && card.querySelector(state.notesOnly ? '.inline-note-body' : '.inline-formula-input');
            if (field) {
                field.focus();
                var end = field.value.length;
                field.setSelectionRange(end, end);
            }
        });
    }
    function cancelInlineEditor(button) {
        if (!inlineEditor) return;
        var state = inlineEditor, card = button && button.closest('.formula-card');
        var top = card ? card.getBoundingClientRect().top : null;
        inlineEditor = null;
        rerenderAtSameCard(state.catId, state.uid, top);
    }
    async function saveInlineEditor(button) {
        if (!inlineEditor) return;
        var state = inlineEditor, card = button && button.closest('.formula-card');
        if (!card) return;
        var ref = findFormula(state.catId, state.subId, state.uid);
        if (!ref) return;
        var header = card.querySelector('.inline-note-header');
        var bodyInput = card.querySelector('.inline-note-body');
        var notes = header ? header.textContent : '';
        var body = bodyInput ? bodyInput.value.replace(/^\s+|\s+$/g, '') : '';
        if (body) notes += '\n' + body;
        ref.formula.notes = notes;
        if (state.notesOnly) ref.formula.localNoteEdited = true;
        if (!state.notesOnly) {
            var formulaInput = card.querySelector('.inline-formula-input');
            ref.formula.lines = parseFormulaLines(formulaInput ? formulaInput.value : '');
            if (state.imageCleared) ref.formula.image = '';
            else if (state.selectedImage) ref.formula.image = state.selectedImage;
        }
        ref.formula.learned = !!ref.formula.learned;
        var top = card.getBoundingClientRect().top;
        await persistCurrentData();
        inlineEditor = null;
        rerenderAtSameCard(state.catId, state.uid, top);
    }
    function updateInlineImage(file, area) {
        if (!file || !inlineEditor || inlineEditor.notesOnly) return;
        var state = inlineEditor;
        readFileData(file).then(function (dataUrl) {
            if (inlineEditor !== state) return;
            state.selectedImage = dataUrl;
            state.imageCleared = false;
            var image = area && area.querySelector('.inline-image-preview');
            var prompt = area && area.querySelector('.inline-image-prompt');
            if (image) { image.src = dataUrl; image.hidden = false; }
            if (prompt) prompt.hidden = true;
        }).catch(function () { window.alert('图片读取失败'); });
    }
    function clearInlineImage(button) {
        if (!inlineEditor || inlineEditor.notesOnly) return;
        inlineEditor.selectedImage = null;
        inlineEditor.imageCleared = true;
        var editor = button.closest('.inline-image-editor');
        var image = editor && editor.querySelector('.inline-image-preview');
        var prompt = editor && editor.querySelector('.inline-image-prompt');
        var input = editor && editor.querySelector('.inline-image-input');
        if (input) input.value = '';
        if (image) { image.removeAttribute('src'); image.hidden = true; }
        if (prompt) prompt.hidden = false;
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
    async function handleWorkspaceAction(button) {
        var action = button.dataset.action, catId = button.dataset.category, subId = button.dataset.subcategory, uid = button.dataset.uid;
        if (action === 'cancel-inline-edit') { cancelInlineEditor(button); return; }
        if (action === 'save-inline-edit') { await saveInlineEditor(button); return; }
        if (action === 'clear-inline-image') { clearInlineImage(button); return; }
        if (action === 'add-formula' || action === 'delete-formula') return;
        if (!isWorkspace() && action === 'add-variant') return;
        var editable = await ensureEditableData();
        if (!editable) return;
        var cancelledInlineEditor = false;
        if (inlineEditor && action !== 'edit-formula' && action !== 'toggle-learned') {
            inlineEditor = null;
            cancelledInlineEditor = true;
            renderCategory(catId);
        }
        var ref = uid ? findFormula(catId, subId, uid) : null;
        if (action === 'edit-formula' && ref) return openFormulaEditor(catId, subId, ref.formula);
        if (action === 'add-variant') return addVariant(catId, subId, uid, cancelledInlineEditor ? null : button.closest('.formula-card'));
        if (!ref) return;
        if (action === 'toggle-learned') {
            ref.formula.learned = !ref.formula.learned;
            if (inlineEditor) {
                await persistCurrentData();
                var card = button.closest('.formula-card');
                if (card) card.classList.toggle('learned', ref.formula.learned);
                button.classList.toggle('learned', ref.formula.learned);
                button.title = ref.formula.learned ? '取消已学' : '标记已学';
                button.setAttribute('aria-label', button.title);
                return;
            }
        }
        await persistCurrentData(); renderCategory(catId);
    }

    function hideWorkspaceContextMenu() {
        var menu = document.getElementById('workspace-context-menu');
        if (menu) menu.hidden = true;
        workspaceContextTarget = null;
    }
    async function selectWorkspaceManagerItem(kind, id) {
        setWorkspaceMessage('');
        workspaceShortcutTarget = { kind: kind, id: id };
        if (kind === 'public') {
            var publicMode = id || 'default';
            try { localStorage.setItem(publicModeKey, publicMode); } catch (ignore) {}
            if (!activeWorkspace) await activatePublicLibrary(publicMode);
            else await refreshWorkspaceList();
            return;
        }
        try { localStorage.setItem(selectedWorkspaceKey, id); } catch (ignore) {}
        if (activeWorkspace) await activateWorkspace(id);
        else await refreshWorkspaceList();
    }
    function openWorkspaceContextMenu(kind, id, clientX, clientY, focusMenu) {
        var menu = document.getElementById('workspace-context-menu');
        if (!menu) return;
        setWorkspaceMessage('');
        workspaceContextTarget = { kind: kind, id: id };
        workspaceShortcutTarget = workspaceContextTarget;
        Array.prototype.forEach.call(menu.querySelectorAll('[data-context-group]'), function (group) {
            group.hidden = group.dataset.contextGroup !== kind;
        });
        var publicDefault = kind === 'public' && id === 'default';
        var publicExport = document.getElementById('workspace-public-export');
        var customExport = document.getElementById('workspace-custom-export');
        if (publicExport) publicExport.disabled = kind !== 'public';
        if (customExport) customExport.disabled = kind !== 'custom';
        ['workspace-public-rename', 'workspace-public-delete'].forEach(function (buttonId) {
            var button = document.getElementById(buttonId);
            if (button) button.disabled = kind !== 'public' || publicDefault;
        });
        ['workspace-rename', 'workspace-delete'].forEach(function (buttonId) {
            var button = document.getElementById(buttonId);
            if (button) button.disabled = kind !== 'custom';
        });
        menu.hidden = false;
        menu.style.left = '0px';
        menu.style.top = '0px';
        var margin = 8;
        var left = Math.max(margin, Math.min(clientX, window.innerWidth - menu.offsetWidth - margin));
        var top = Math.max(margin, Math.min(clientY, window.innerHeight - menu.offsetHeight - margin));
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        if (focusMenu) {
            var first = menu.querySelector('[data-context-group]:not([hidden]) .workspace-context-action:not(:disabled)');
            if (first) first.focus();
        }
    }
    async function getContextPublicCopy(target) {
        if (target && target.kind === 'public') return target.id === 'default' ? null : await WS.getPublicCopy(DATA, target.id);
        return getSelectedPublicCopy();
    }
    async function getContextWorkspace(target) {
        if (target && target.kind === 'custom') return await WS.get(target.id);
        return getSelectedWorkspace();
    }
    function focusedWorkspaceTarget() {
        var menu = document.getElementById('workspace-context-menu');
        if (menu && !menu.hidden && workspaceContextTarget) return workspaceContextTarget;
        var active = document.activeElement;
        if (active && active.closest) {
            var item = active.closest('.workspace-list-item');
            if (!item) {
                var row = active.closest('.workspace-list-row');
                item = row && row.querySelector('.workspace-list-item');
            }
            if (item) {
                return item.hasAttribute('data-public-library')
                    ? { kind: 'public', id: item.dataset.publicLibrary || 'default' }
                    : { kind: 'custom', id: item.dataset.workspaceId };
            }
        }
        return workspaceShortcutTarget;
    }
    function workspaceDeletionSelectionPlan(target) {
        var list = document.getElementById(target.kind === 'public' ? 'workspace-public-list' : 'workspace-list');
        if (!list) return { wasSelected: false, next: null };
        var items = Array.prototype.slice.call(list.querySelectorAll('.workspace-list-item'));
        var index = items.findIndex(function (item) {
            return target.kind === 'public'
                ? item.dataset.publicLibrary === target.id
                : item.dataset.workspaceId === target.id;
        });
        if (index < 0) return { wasSelected: false, next: null };
        var nextItem = items[index + 1] || items[index - 1] || null;
        var nextTarget = nextItem ? (target.kind === 'public'
            ? { kind: 'public', id: nextItem.dataset.publicLibrary || 'default' }
            : { kind: 'custom', id: nextItem.dataset.workspaceId }) : null;
        return { wasSelected: items[index].classList.contains('active'), next: nextTarget };
    }
    function runWorkspaceShortcut(action, target) {
        if (!target) return false;
        if (target.kind === 'public' && target.id === 'default') {
            setWorkspaceMessage(action === 'rename' ? '默认大神版不能重命名。' : '默认大神版不能删除。', true);
            return true;
        }
        var buttonId = target.kind === 'public'
            ? (action === 'rename' ? 'workspace-public-rename' : 'workspace-public-delete')
            : (action === 'rename' ? 'workspace-rename' : 'workspace-delete');
        var button = document.getElementById(buttonId);
        if (!button) return false;
        workspaceContextTarget = target;
        workspaceShortcutTarget = target;
        button.disabled = false;
        button.click();
        return true;
    }

    async function handleWorkspaceManagerClick(e) {
        var menuTrigger = e.target.closest('[data-workspace-menu]');
        if (menuTrigger) {
            var triggerRect = menuTrigger.getBoundingClientRect();
            await openWorkspaceContextMenu(menuTrigger.dataset.workspaceMenu, menuTrigger.dataset.targetId, triggerRect.right - 4, triggerRect.bottom + 4, false);
            return;
        }
        if (!e.target.closest('#workspace-context-menu')) hideWorkspaceContextMenu();
        var publicItem = e.target.closest('[data-public-library]');
        if (publicItem) {
            await selectWorkspaceManagerItem('public', publicItem.dataset.publicLibrary || 'default');
            return;
        }
        var item = e.target.closest('[data-workspace-id]');
        if (item) {
            await selectWorkspaceManagerItem('custom', item.dataset.workspaceId);
            return;
        }
        var control = e.target.closest('[id]');
        var id = control ? control.id : '';
        var contextTarget = control && control.classList.contains('workspace-context-action') ? workspaceContextTarget : null;
        if (contextTarget) hideWorkspaceContextMenu();
        try {
            if (id === 'workspace-public-new') return createPublicLibrary();
            if (id === 'workspace-new') return createWorkspace();
            if (id === 'workspace-import') return document.getElementById('workspace-file').click();
            if (id === 'workspace-export-cancel') {
                if (workspaceExportController) {
                    workspaceExportController.abort();
                    control.disabled = true;
                    setWorkspaceMessage('正在取消导出…');
                }
                return;
            }
            if (id === 'workspace-public-export') {
                return exportWorkspace(WS.exportPublic(DATA, await getContextPublicCopy(contextTarget)), control);
            }
            if (id === 'workspace-custom-export') {
                return exportWorkspace(await getContextWorkspace(contextTarget), control);
            }
            if (id === 'workspace-public-rename') {
                var selectedPublicCopy = await getContextPublicCopy(contextTarget);
                if (!selectedPublicCopy) { setWorkspaceMessage('默认大神版不能重命名，请先选择一个大神版副本。', true); await refreshWorkspaceList(); return; }
                var publicName = window.prompt('新的大神版公式库名称', selectedPublicCopy.name || '大神版（已编辑）');
                if (publicName && publicName.trim()) {
                    selectedPublicCopy.name = publicName.trim();
                    await WS.putPublicCopy(selectedPublicCopy);
                    if (publicCopy && publicCopy.id === selectedPublicCopy.id) publicCopy = selectedPublicCopy;
                    await refreshWorkspaceList();
                }
                return;
            }
            if (id === 'workspace-public-delete') {
                var publicToDelete = await getContextPublicCopy(contextTarget);
                if (!publicToDelete) { setWorkspaceMessage('默认大神版不能删除，请先选择一个大神版副本。', true); await refreshWorkspaceList(); return; }
                if (!window.confirm('删除选中的大神版副本？导出的 .zbll 文件不受影响。')) return;
                var removedPublicId = publicToDelete.id;
                var publicSelectionPlan = workspaceDeletionSelectionPlan({ kind: 'public', id: removedPublicId });
                await WS.remove(removedPublicId);
                if (publicSelectionPlan.wasSelected) {
                    var nextPublicTarget = publicSelectionPlan.next || { kind: 'public', id: 'default' };
                    workspaceShortcutTarget = nextPublicTarget;
                    try { localStorage.setItem(publicModeKey, nextPublicTarget.id); } catch (e) {}
                } else if (workspaceShortcutTarget && workspaceShortcutTarget.kind === 'public' && workspaceShortcutTarget.id === removedPublicId) {
                    workspaceShortcutTarget = null;
                }
                if (publicCopy && publicCopy.id === removedPublicId) {
                    publicCopy = publicSelectionPlan.next && publicSelectionPlan.next.id !== 'default'
                        ? await WS.getPublicCopy(DATA, publicSelectionPlan.next.id)
                        : null;
                    router();
                }
                await refreshWorkspaceList();
                return;
            }
            if (id === 'workspace-rename') {
                var selectedWorkspace = await getContextWorkspace(contextTarget);
                if (!selectedWorkspace) { setWorkspaceMessage('请先选择要重命名的自定义公式库。', true); await refreshWorkspaceList(); return; }
                var name = window.prompt('新的自定义公式库名称', selectedWorkspace.name);
                if (name && name.trim()) {
                    selectedWorkspace.name = name.trim();
                    await WS.put(selectedWorkspace);
                    if (activeWorkspace && activeWorkspace.id === selectedWorkspace.id) activeWorkspace = selectedWorkspace;
                    await refreshWorkspaceList();
                }
                return;
            }
            if (id === 'workspace-delete') {
                var selectedToDelete = await getContextWorkspace(contextTarget);
                if (!selectedToDelete) { setWorkspaceMessage('请先选择要删除的自定义公式库。', true); await refreshWorkspaceList(); return; }
                if (!window.confirm('删除选中的自定义公式库？导出的 .zbll 文件不受影响。')) return;
                var removedId = selectedToDelete.id;
                var customSelectionPlan = workspaceDeletionSelectionPlan({ kind: 'custom', id: removedId });
                await WS.remove(removedId);
                if (customSelectionPlan.wasSelected) {
                    workspaceShortcutTarget = customSelectionPlan.next;
                    try {
                        if (customSelectionPlan.next) localStorage.setItem(selectedWorkspaceKey, customSelectionPlan.next.id);
                        else localStorage.removeItem(selectedWorkspaceKey);
                    } catch (e) {}
                } else if (workspaceShortcutTarget && workspaceShortcutTarget.kind === 'custom' && workspaceShortcutTarget.id === removedId) {
                    workspaceShortcutTarget = null;
                }
                if (activeWorkspace && activeWorkspace.id === removedId) {
                    if (customSelectionPlan.next) {
                        publicCopy = null;
                        activeWorkspace = await WS.activate(customSelectionPlan.next.id);
                    } else {
                        activeWorkspace = null;
                        await WS.activate(null);
                        var publicCopies = await WS.listPublicCopies(DATA);
                        var publicMode = selectedPublicId(publicCopies);
                        publicCopy = publicMode === 'default' ? null : await WS.getPublicCopy(DATA, publicMode);
                    }
                    router();
                }
                await refreshWorkspaceList();
                return;
            }
            if (id === 'workspace-close') { hideWorkspaceContextMenu(); return showOverlay('workspace-overlay', false); }
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
        inlineEditor = null;
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
        var formulaLine = e.target.closest('.formula-line');
        if (formulaLine) { selectFormulaLine(formulaLine); return; }
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
    });
    document.getElementById('workspace-overlay').addEventListener('click', function (e) { if (e.target === this) { hideWorkspaceContextMenu(); showOverlay('workspace-overlay', false); } });
    document.getElementById('workspace-file').addEventListener('change', importWorkspaceFile);
    document.getElementById('workspace-overlay').addEventListener('click', handleWorkspaceManagerClick);
    document.getElementById('workspace-overlay').addEventListener('contextmenu', function (e) {
        var item = e.target.closest('.workspace-list-item');
        if (!item) return;
        e.preventDefault();
        var kind = item.hasAttribute('data-public-library') ? 'public' : 'custom';
        var id = kind === 'public' ? item.dataset.publicLibrary : item.dataset.workspaceId;
        openWorkspaceContextMenu(kind, id, e.clientX, e.clientY, false);
    });
    document.getElementById('workspace-overlay').addEventListener('scroll', hideWorkspaceContextMenu, true);
    document.addEventListener('change', function (e) {
        if (!e.target.classList.contains('inline-image-input') || !e.target.files || !e.target.files[0]) return;
        updateInlineImage(e.target.files[0], e.target.closest('.inline-image-drop'));
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var formulaLine = e.target.closest('.formula-line');
        if (!formulaLine) return;
        e.preventDefault();
        selectFormulaLine(formulaLine);
    });
    document.addEventListener('dragover', function (e) {
        var area = e.target.closest('.inline-image-drop');
        if (!area) return;
        e.preventDefault();
        area.classList.add('highlight');
    });
    document.addEventListener('dragleave', function (e) {
        var area = e.target.closest('.inline-image-drop');
        if (area) area.classList.remove('highlight');
    });
    document.addEventListener('drop', function (e) {
        var area = e.target.closest('.inline-image-drop');
        if (!area) return;
        e.preventDefault();
        area.classList.remove('highlight');
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files[0]) updateInlineImage(files[0], area);
    });
    window.addEventListener('hashchange', router);
    window.addEventListener('resize', function () {
        hideWorkspaceContextMenu();
        scheduleWorkspaceHelpFit();
    });
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
    document.addEventListener('keydown', function (e) {
        var menu = document.getElementById('workspace-context-menu');
        if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && !document.getElementById('workspace-overlay').hidden) {
            var item = e.target.closest('.workspace-list-item');
            if (item) {
                e.preventDefault();
                var rect = item.getBoundingClientRect();
                var kind = item.hasAttribute('data-public-library') ? 'public' : 'custom';
                var id = kind === 'public' ? item.dataset.publicLibrary : item.dataset.workspaceId;
                openWorkspaceContextMenu(kind, id, rect.left + 28, rect.top + 28, true);
            }
            return;
        }
        if ((e.key === 'F2' || e.key === 'Delete') && !document.getElementById('workspace-overlay').hidden) {
            var shortcutTarget = focusedWorkspaceTarget();
            if (shortcutTarget && runWorkspaceShortcut(e.key === 'F2' ? 'rename' : 'delete', shortcutTarget)) e.preventDefault();
            return;
        }
        if (menu && !menu.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            var actions = Array.prototype.filter.call(menu.querySelectorAll('[data-context-group]:not([hidden]) .workspace-context-action'), function (button) { return !button.disabled; });
            if (actions.length) {
                e.preventDefault();
                var current = actions.indexOf(document.activeElement);
                var next = e.key === 'ArrowDown' ? (current + 1) % actions.length : (current <= 0 ? actions.length - 1 : current - 1);
                actions[next].focus();
            }
            return;
        }
        if (e.key !== 'Escape') return;
        if (menu && !menu.hidden) { hideWorkspaceContextMenu(); return; }
        if (inlineEditor) { cancelInlineEditor(findInlineCard(inlineEditor.uid)); return; }
        showOverlay('workspace-overlay', false);
    });
    initWorkspace();
})();
