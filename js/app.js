// ZBLL 静态站点前端逻辑：公开浏览 + 本地 .zbll 工作区
(function () {
    'use strict';

    var I18N = window.ZBLL_I18N, t = I18N.t, tx = I18N.html, ta = I18N.attr;
    var siteHelpDialog = document.getElementById('site-help-dialog');
    var siteHelpOpen = document.getElementById('site-help-open');
    function syncModalScrollLock() {
        var workspaceOverlay = document.getElementById('workspace-overlay');
        var isOpen = siteHelpDialog.open || (workspaceOverlay && !workspaceOverlay.hidden);
        document.documentElement.classList.toggle('has-modal', !!isOpen);
    }
    siteHelpOpen.addEventListener('click', function () {
        if (siteHelpDialog.open) return;
        siteHelpDialog.showModal();
        syncModalScrollLock();
    });
    document.getElementById('site-help-close').addEventListener('click', function () { siteHelpDialog.close(); });
    siteHelpDialog.addEventListener('click', function (e) {
        var rect = siteHelpDialog.getBoundingClientRect();
        if (e.target === siteHelpDialog && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) siteHelpDialog.close();
    });
    siteHelpDialog.addEventListener('close', function () {
        syncModalScrollLock();
        siteHelpOpen.focus({ preventScroll: true });
    });
    siteHelpDialog.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') e.stopPropagation();
    });

    var DATA = window.ZBLL_DATA;
    var WS = window.ZBLL_WORKSPACE;
    var appEl = document.getElementById('app');
    if (!DATA || !appEl || !WS) {
        if (appEl) appEl.innerHTML = '<div class="container mt-5"><div class="empty-state">' + tx('数据加载失败：未找到页面数据') + '</div></div>';
        return;
    }

    var CAT_BADGE = {
        'U': 'bg-primary', 'T': 'bg-danger', 'L': 'bg-warning text-dark',
        'Pi': 'bg-success', 'S': 'bg-orange', 'AS': 'bg-dark', 'H': 'bg-secondary'
    };
    function solverText(mark) { return '<span data-solver-label="' + escapeHtml(mark) + '">' + escapeHtml(I18N.mark(mark)) + '</span>'; }
    function solverBadge(mark) {
        return '<span class="formula-marks" data-solver-title="' + escapeHtml(mark) + '" title="' + escapeHtml(I18N.fullName(mark)) + '">' + solverText(mark) + '</span>';
    }
    var currentView = '';
    var activeWorkspace = null;
    var themeKey = 'zbll_theme';
    var filterKey = 'zbll_filter';
    var selectedWorkspaceKey = 'zbll_selected_workspace';
    var renderSnapshotKey = 'zbll_render_snapshot_v5';
    var workspaceProgressState = null;
    var workspaceExportController = null;
    var workspaceContextTarget = null;
    var workspaceShortcutTarget = null;
    var inlineEditor = null;
    var workspaceWritePending = false;
    var ownMarkHintsCleanup = null;

    // initTheme() 会调用预热，因此状态必须在任何 init 调用之前初始化。
    var formulaImagePreloadCache = Object.create(null);
    var selectionRequestId = 0;
    var prefetchTickPending = false;
    var pageLoaded = document.readyState === 'complete';
    window.addEventListener('load', function () { pageLoaded = true; schedulePrefetchTick(); }, { once: true });
    var prefetchQueue = [];
    var prefetchBusy = 0;
    var prefetchPaused = 0;
    var PREFETCH_CONCURRENCY = 2;
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function viewData() { return activeWorkspace || DATA; }
    function isWorkspace() { return !!activeWorkspace; }
    function isEditableView() { return true; }
    function canEditFormulaContent() { return isWorkspace(); }
    function canShowFormulaEditor() { return true; }
    function usesLearnedStats() { return true; }
    function updateWorkspaceNav() {
        var nav = document.getElementById('workspace-open');
        // 右上角按钮跟随当前选中的库：默认大神版，或用户自己的公式库名。
        var publicLabel = t('默认大神版');
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
            delete label.dataset.i18n;
            label.textContent = navText;
            delete nav.dataset.i18nTitle;
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
    }
    async function ensureEditableData() {
        if (activeWorkspace) return activeWorkspace;
        if (!window.confirm(t('当前是默认大神版（仅预览）。创建自己的公式库后即可修改，是否创建？'))) return null;
        await createWorkspace();
        return activeWorkspace;
    }
    async function persistCurrentData() {
        if (!activeWorkspace) return;
        workspaceWritePending = true;
        try { return await WS.put(activeWorkspace); }
        finally { workspaceWritePending = false; }
    }
    function operationError(error) { window.alert(I18N.errorText(error, '保存失败，请重试')); }
    function editorSnapshot() {
        if (!inlineEditor) return '';
        var card = findInlineCard(inlineEditor.uid);
        return JSON.stringify({ fields: card ? Array.from(card.querySelectorAll('input:not([type="file"]), textarea, select')).map(function (el) { return [el.name, el.value, el.type === 'checkbox' ? el.checked : null]; }) : [], lineIds: card ? Array.from(card.querySelectorAll('.own-line-row')).map(function (row) { return row.dataset.lineId; }) : [], image: inlineEditor.selectedImage, cleared: inlineEditor.imageCleared, imagePending: inlineEditor.imagePending });
    }
    function editorDirty() { return !!inlineEditor && editorSnapshot() !== inlineEditor.initialSnapshot; }
    function discardEditor(render) {
        if (workspaceWritePending || (inlineEditor && inlineEditor.saving)) return false;
        if (editorDirty() && !window.confirm(t('有未保存的修改，放弃这些修改？'))) return false;
        var previous = inlineEditor;
        inlineEditor = null;
        if (previous && render !== false) renderCategory(previous.catId);
        return true;
    }
    async function saveCandidate(candidate) {
        workspaceWritePending = true;
        try { await WS.put(candidate); activeWorkspace = candidate; }
        finally { workspaceWritePending = false; }
    }
    function getPlayerStats(data) {
        var counts = Object.create(null), order = Object.create(null), wcaMap = Object.create(null);
        (DATA.meta.playerStats || []).forEach(function (item, index) {
            counts[item.label] = 0;
            order[item.label] = index;
            wcaMap[item.label] = item.wca || '';
        });
        (data.categories || []).forEach(function (cat) {
            (cat.subcategories || []).forEach(function (sub) {
                (sub.formulas || []).forEach(function (formula) {
                    var caseMarks = Object.create(null);
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
    var imageLibrary = window.ZBLL_IMAGE_LIBRARY;
    function imageSource(path) { return imageLibrary ? imageLibrary.source(path) : path; }
    function bundledImage(path) { return !!(imageLibrary && imageLibrary.has(path)); }
    function categoryImagePath(categoryId, theme) {
        return 'images/' + (theme === 'dark' ? '' : 'light/') + encodeURIComponent(categoryId) + '.svg?v=20260924';
    }
    var allThemeImagesScheduled = false;
    var themeSwitchId = 0;
    function preloadThemeImage(path) {
        return preloadFormulaImage(path);
    }
    function visibleThemeImagePaths(theme) {
        return Array.prototype.map.call(appEl.querySelectorAll('.category-thumb[data-category], .case-thumb[data-thumb]'), function (image) {
            return categoryImagePath(themeImageId(image), theme);
        });
    }
    function themeImageId(image) {
        return image.getAttribute('data-category') || image.getAttribute('data-thumb');
    }
    function scheduleRemainingThemeImages() {
        if ((imageLibrary && imageLibrary.state !== 'fallback') || allThemeImagesScheduled || lowDataMode() || slowLink()) return;
        allThemeImagesScheduled = true;
        var paths = [];
        (DATA.categories || []).forEach(function (category) {
            [category.id].concat((category.subcategories || []).map(function (sub) { return sub.id; })).forEach(function (id) {
                paths.push(categoryImagePath(id, 'light'), categoryImagePath(id, 'dark'));
            });
        });
        // 两套主题的缩略图优先级最低：排在公式图后面，队尾追加。
        queuePrefetchTail(paths);
        schedulePrefetchTick();
    }
    function warmThemeImages() {
        if ((imageLibrary && imageLibrary.state !== 'fallback') || lowDataMode()) return;
        var otherTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        // 另一套主题的缩略图也走统一队列：之前是 forEach 一次性全部发出，
        // 在慢网络下会形成并发尖峰、跟当前可见内容抢带宽。
        queuePrefetchTail(visibleThemeImagePaths(otherTheme));
        scheduleRemainingThemeImages();
        schedulePrefetchTick();
    }
    function applyTheme(theme, persist) {
        theme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        appEl.querySelectorAll('.category-thumb[data-category], .case-thumb[data-thumb]').forEach(function (image) {
            image.src = imageSource(categoryImagePath(themeImageId(image), theme));
        });
        if (persist) { try { localStorage.setItem(themeKey, theme); } catch (e) {} }
        var button = document.getElementById('theme-toggle');
        if (!button) return;
        var dark = theme === 'dark';
        var labelKey = dark ? '切换到浅色模式' : '切换到深色模式';
        button.setAttribute('data-i18n-title', labelKey);
        button.setAttribute('data-i18n-aria-label', labelKey);
        var label = t(labelKey);
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-pressed', dark ? 'true' : 'false');
    }
    function switchThemeWhenReady() {
        var targetTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        var requestId = ++themeSwitchId;
        function switchCurrentView() {
            var paths = visibleThemeImagePaths(targetTheme);
            Promise.all(paths.map(preloadThemeImage)).then(function () {
                if (requestId !== themeSwitchId) return;
                if (visibleThemeImagePaths(targetTheme).join('|') !== paths.join('|')) {
                    switchCurrentView();
                    return;
                }
                applyTheme(targetTheme, true);
            });
        }
        switchCurrentView();
    }
    function initTheme() {
        var saved = null;
        try { saved = localStorage.getItem(themeKey); } catch (e) {}
        applyTheme(saved === 'light' || saved === 'dark' ? saved :
            (document.documentElement.getAttribute('data-theme') || systemTheme()), false);
        var button = document.getElementById('theme-toggle');
        if (button) button.addEventListener('click', function () {
            switchThemeWhenReady();
        });
        warmThemeImages();
    }
    initTheme();

    function cancelFormulaImagePreload() {
        prefetchQueue = [];
        allThemeImagesScheduled = false;
    }
    function preloadFormulaImage(path) {
        if (!path || /^(?:data|blob):/i.test(path)) return Promise.resolve(false);
        if (formulaImagePreloadCache[path]) return formulaImagePreloadCache[path];
        var image = new Image();
        var promise = new Promise(function (resolve) {
            var settled = false;
            var timer = window.setTimeout(function () { finish(false); }, 10000);
            function finish(ok) {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                image.onload = image.onerror = null;
                if (!ok) {
                    image.removeAttribute('src');
                    delete formulaImagePreloadCache[path];
                }
                resolve(ok);
            }
            image.onload = function () {
                if (typeof image.decode === 'function') image.decode().then(function () { finish(true); }, function () { finish(true); });
                else finish(true);
            };
            image.onerror = function () { finish(false); };
            image.src = imageSource(path);
        });
        formulaImagePreloadCache[path] = promise;
        return promise;
    }
    function scheduleCategoryFormulaImages(cat) {
        if (!cat || lowDataMode()) return;
        // 本分类（全部子分类）优先：切子分类是最高频操作；
        // 再按显示顺序由近及远铺开其它分类，让相邻大类的切换也变快。
        var cats = viewData().categories || [];
        var index = 0;
        cats.forEach(function (item, i) { if (item.id === cat.id) index = i; });
        var priority = formulaPathsOf(cat.subcategories);
        if (!slowLink()) {
            cats.map(function (item, i) { return { item: item, distance: Math.abs(i - index) }; })
                .filter(function (entry) { return entry.item.id !== cat.id; })
                .sort(function (a, z) { return a.distance - z.distance; })
                .forEach(function (entry) { priority = priority.concat(formulaPathsOf(entry.item.subcategories)); });
        }
        queuePrefetchFront(priority);
        schedulePrefetchTick();
    }

    // ===== 图片预取队列 =====
    // 后台预取最多 2 个并发，首屏 load 后才在空闲时推进。
    // 切换时暂停新后台请求；已经发出的请求不能据此取消。
    function prefetchConnection() {
        return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    }
    function lowDataMode() {
        var c = prefetchConnection();
        return !!(c && c.saveData);
    }
    function slowLink() {
        var c = prefetchConnection();
        return !!(c && /(slow-2g|2g|3g)$/.test(c.effectiveType || ''));
    }
    function formulaPathsOf(subs) {
        var paths = [];
        (subs || []).forEach(function (sub) {
            (sub.formulas || []).forEach(function (formula) { if (formula.image) paths.push(formula.image); });
        });
        return paths;
    }
    function queuePrefetchTail(paths) {
        (paths || []).forEach(function (path) {
            if (!path || bundledImage(path) || formulaImagePreloadCache[path] || prefetchQueue.indexOf(path) !== -1) return;
            prefetchQueue.push(path);
        });
    }
    function queuePrefetchFront(paths) {
        var incoming = [];
        (paths || []).forEach(function (path) {
            if (!path || bundledImage(path) || formulaImagePreloadCache[path]) return;
            if (incoming.indexOf(path) !== -1) return;
            incoming.push(path);
            // 已排在队列里（但位置靠后）的要提出来重新排到队首，
            // 否则跳到远处的分类时，它的图还压在队尾。
            var at = prefetchQueue.indexOf(path);
            if (at !== -1) prefetchQueue.splice(at, 1);
        });
        if (incoming.length) prefetchQueue = incoming.concat(prefetchQueue);
    }
    function pumpPrefetch() {
        if ((imageLibrary && imageLibrary.state === 'loading') || !pageLoaded || lowDataMode() || document.hidden) return;
        while (!prefetchPaused && prefetchBusy < PREFETCH_CONCURRENCY && prefetchQueue.length) {
            (function (path) {
                prefetchBusy++;
                preloadFormulaImage(path).then(function () {
                    prefetchBusy--;
                    if (prefetchQueue.length && !prefetchPaused) schedulePrefetchTick();
                });
            })(prefetchQueue.shift());
        }
    }
    function schedulePrefetchTick() {
        if (!pageLoaded || lowDataMode() || prefetchTickPending || !prefetchQueue.length) return;
        prefetchTickPending = true;
        function tick() { prefetchTickPending = false; pumpPrefetch(); }
        if (window.requestIdleCallback) window.requestIdleCallback(tick, { timeout: 2500 });
        else window.setTimeout(tick, 250);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) schedulePrefetchTick(); });

    var workspaceHelpFitCanvas = null;
    var workspaceHelpFitTimer = null;
    function fitWorkspaceHelpText() {
        var help = document.querySelector('.workspace-help');
        if (!help) return;
        help.style.removeProperty('--workspace-help-font-size');
        if (I18N.language() === 'en') return;
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
        var caseBar = document.querySelector('.case-bar');
        return (nav ? nav.offsetHeight : 60) + (caseBar ? caseBar.offsetHeight : 0) + 8;
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
        return findVisible('.sortable-item[id]');
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
        if (inlineEditor) { try { sessionStorage.removeItem(renderSnapshotKey); } catch (e) {} return; }
        if (!appEl || !appEl.innerHTML) return;
        try {
            var navOpen = document.getElementById('workspace-open');
            var anchor = firstVisibleAnchor();
            var snapshot = {
                language: I18N.language(),
                hash: location.hash || '#/',
                scrollY: window.pageYOffset || window.scrollY || 0,
                anchor: anchor,
                appHtml: appEl.innerHTML,
                nav: {
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
                if (sub.formulas[j].uid === uid || sub.formulas[j].id === uid) return { category: cat, subcat: sub, formula: sub.formulas[j], index: j };
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
    function displayFormulaId(sub, formula) {
        // Case identity is independent of its current position in a personal library.
        return formula.id || formula.name || formula.uid || sub.id;
    }
    function lineText(line) {
        var marks = line.marks && line.marks.length ? ' （' + line.marks.join(' ') + '）' : '';
        return (line.alg || '') + marks;
    }
    function selectedFormulaLineIndex(formula) {
        return formula && formula.selectedLineId ? formula.lines.findIndex(function (line) { return line.id === formula.selectedLineId; }) : -1;
    }

    function renderLearnedProgress(learned, total, label, className, scope) {
        total = Math.max(0, Number(total) || 0);
        learned = Math.min(total, Math.max(0, Number(learned) || 0));
        var scopeText = scope === '全部情况' ? t(scope) : t('{category} 分类', { category: scope });
        return '<div class="learning-progress ' + escapeHtml(className) + '">' +
            '<div class="learning-progress-meta"><span class="learning-progress-label">' + tx(label) + '</span>' +
            '<span class="learning-progress-count"><strong>' + learned + '</strong><span>/' + total + '</span></span></div>' +
            '<progress class="learning-progress-track" value="' + learned + '" max="' + (total || 1) + '"' + ta('aria-label', '{scope}学习进度', { scope: scopeText }) + ta('aria-valuetext', '已学习 {learned}/{total}个情况', { learned: learned, total: total }) + '></progress></div>';
    }

    function renderHome() {
        clearOwnMarkHints();
        selectionRequestId++;
        clearSorting();
        cancelFormulaImagePreload();
        var data = viewData();
        var totalCases = 0, learnedCases = 0;
        (data.categories || []).forEach(function (cat) {
            (cat.subcategories || []).forEach(function (sub) {
                totalCases += sub.formulas.length;
                learnedCases += sub.formulas.filter(function (formula) { return formula.learned; }).length;
            });
        });
        var html = '<div class="container mt-5">';
        if (usesLearnedStats()) html += '<div class="index-title-wrap"><h1 class="text-center mb-5">' + tx('ZBLL 公式库') + '</h1>' + renderLearnedProgress(learnedCases, totalCases, '已学习', 'index-learning-progress', '全部情况') + '</div>';
        else html += '<h1 class="text-center mb-5">' + tx('ZBLL 公式库') + '</h1>';
        html += '<div class="player-stats">';
        getPlayerStats(data).forEach(function (p) {
            if (p.wca) {
                html += '<a class="player-stat-box" href="https://www.worldcubeassociation.org/persons/' + encodeURIComponent(p.wca) + '" target="_blank" rel="noopener noreferrer" data-solver-title="' + escapeHtml(p.label) + '" title="' + escapeHtml(I18N.fullName(p.label)) + '">' + solverText(p.label) + ' <b>' + p.count + '</b></a>';
            } else html += '<span class="player-stat-box" title="' + escapeHtml(I18N.mark(p.label) + '：' + p.count) + '">' + solverText(p.label) + ' <b>' + p.count + '</b></span>';
        });
        html += '</div>';
        html += '<div class="category-grid">';
        (data.categories || []).forEach(function (cat) {
            var total = 0;
            (cat.subcategories || []).forEach(function (sub) { total += sub.formulas.length; });
            html += '<div class="category-grid-item"><a href="#/category/' + encodeURIComponent(cat.id) + '" class="category-card"><div class="card"><div class="card-body category-card-body">';
            html += '<img src="' + escapeHtml(imageSource(categoryImagePath(cat.id, document.documentElement.getAttribute('data-theme')))) + '" class="category-thumb" data-category="' + escapeHtml(cat.id) + '" alt="' + escapeHtml(cat.id) + '"><div class="category-card-info"><h2 class="card-title">' + escapeHtml(cat.id) + '</h2>';
            var learned = 0;
            (cat.subcategories || []).forEach(function (sub) { learned += sub.formulas.filter(function (formula) { return formula.learned; }).length; });
            html += usesLearnedStats() ? renderLearnedProgress(learned, total, '已学习', 'category-learning-progress', cat.id) : '<p class="card-text">' + tx('{count}个情况', { count: total }) + '</p>';
            html += '<span class="badge ' + (CAT_BADGE[cat.id] || 'bg-secondary') + '">' + escapeHtml(subcatRange(cat)) + '</span>';
            html += '</div></div></div></a></div>';
        });
        html += '</div></div>';
        appEl.innerHTML = html;
        warmThemeImages();
    }

    // 分类页两级选择器：第一行 7 个分类，第二行当前分类的 6 个子分类。
    function caseCountText(learned, total) { return learned + '/' + total; }
    // 第一行（分类）是否显示魔方图。分类图只有顶面色块、信息量低，暂时关掉；
    // 想恢复就把这里改成 true（行上的 has-thumb 类会自动跟着变）。
    var SHOW_CATEGORY_THUMB = false;

    function renderCaseChip(attrs, label, countText, current, thumbId) {
        var theme = document.documentElement.getAttribute('data-theme');
        var thumb = thumbId
            ? '<img class="case-thumb" src="' + escapeHtml(imageSource(categoryImagePath(thumbId, theme))) + '" data-thumb="' + escapeHtml(thumbId) + '" alt="">'
            : '';
        return '<button type="button" class="case-chip' + (current ? ' is-current' : '') + '" ' + attrs
            + ' aria-current="' + (current ? 'true' : 'false') + '"'
            + ta('aria-label', '{label}，已学习 {count}', { label: label, count: countText })
            + ta('title', '{label}（已学习 {count}）', { label: label, count: countText })
            + ' tabindex="' + (current ? '0' : '-1') + '">'
            + thumb
            + '<span class="case-chip-label">' + escapeHtml(label) + '</span>'
            + '<small>' + escapeHtml(countText) + '</small></button>';
    }
    function caseCounts(subcategories) {
        var total = 0, learned = 0;
        (subcategories || []).forEach(function (sub) {
            total += sub.formulas.length;
            learned += sub.formulas.filter(function (formula) { return formula.learned; }).length;
        });
        return { total: total, learned: learned };
    }
    function activeSubcatId(cat) {
        var subs = cat.subcategories || [];
        var saved = null;
        try { saved = localStorage.getItem('zbll_active_subcat_' + cat.id); } catch (e) {}
        var found = subs.filter(function (sub) { return sub.id === saved; })[0];
        return found ? found.id : (subs[0] ? subs[0].id : '');
    }
    function activeSubcatOf(cat) {
        var subs = cat.subcategories || [], id = activeSubcatId(cat);
        return subs.filter(function (sub) { return sub.id === id; })[0] || subs[0] || null;
    }
    function renderCaseBar(cat, activeSub) {
        var data = viewData();
        var html = '<div class="case-bar">';
        html += '<div class="case-bar-row case-bar-categories' + (SHOW_CATEGORY_THUMB ? ' has-thumb' : '') + '">'
            + '<div class="case-bar-scroll" role="group"' + ta('aria-label', '切换分类') + '>';
        (data.categories || []).forEach(function (item) {
            var counts = caseCounts(item.subcategories);
            html += renderCaseChip('data-case-category="' + escapeHtml(item.id) + '"', item.id,
                caseCountText(counts.learned, counts.total), item.id === cat.id, SHOW_CATEGORY_THUMB ? item.id : '');
        });
        html += '</div></div>';
        html += '<div class="case-bar-row case-bar-subcategories">'
            + '<div class="case-bar-scroll" role="group"' + ta('aria-label', '切换子分类') + '>';
        (cat.subcategories || []).forEach(function (sub) {
            var learned = sub.formulas.filter(function (formula) { return formula.learned; }).length;
            html += renderCaseChip('data-case-subcategory="' + escapeHtml(sub.id) + '"', sub.id,
                caseCountText(learned, sub.formulas.length), !!activeSub && sub.id === activeSub.id, sub.id);
        });
        html += '</div></div>';
        html += '</div>';
        return html;
    }
    // 内容顶部对齐到吸顶选择器下方（固定在导航栏与选择器之下，故用 navOffset()）。
    function scrollToContentTop() {
        var bar = document.querySelector('.case-bar');
        var target = document.querySelector('.subcategory-card') || (bar && bar.nextElementSibling);
        if (!target) return;
        window.scrollTo(0, Math.max(0, window.pageYOffset + target.getBoundingClientRect().top - navOffset()));
    }
    // 当前视图实际显示的缩略图和公式图。
    function categoryViewImagePaths(cat, activeSub) {
        var theme = document.documentElement.getAttribute('data-theme');
        var paths = [];
        if (SHOW_CATEGORY_THUMB) (viewData().categories || []).forEach(function (item) { paths.push(categoryImagePath(item.id, theme)); });
        (cat.subcategories || []).forEach(function (sub) { paths.push(categoryImagePath(sub.id, theme)); });
        (activeSub ? [activeSub] : (cat.subcategories || [])).forEach(function (sub) {
            (sub.formulas || []).forEach(function (formula) { if (formula.image) paths.push(formula.image); });
        });
        return paths;
    }
    // 插 DOM 之前先把图解码完：innerHTML 会把 <img> 全部重建，SVG 要重新光栅化，
    // 不预热就会出现“空白一两帧”的闪烁。已缓存时这一步几乎零耗时。
    function preloadCategoryView(cat, activeSub) {
        if (!cat) return Promise.resolve(false);
        // 交互请求优先：暂停后台预取，拿到带宽后立即开始加载这一屏要用的图。
        prefetchPaused++;
        var release = function () { prefetchPaused = Math.max(0, prefetchPaused - 1); schedulePrefetchTick(); };
        var all = Promise.all(categoryViewImagePaths(cat, activeSub).map(preloadFormulaImage));
        // 渲染最多等 150ms，但后台要等目标图加载结束才恢复，避免再次抢带宽。
        all.then(release, release);
        return Promise.race([all, new Promise(function (resolve) { window.setTimeout(resolve, 150, false); })]);
    }

    // 切换子分类：先预热图片，再重渲染并回到内容顶部。
    function selectSubcategory(catId, subId) {
        if (!discardEditor()) return;
        var cat = findCategory(catId);
        var sub = cat ? (cat.subcategories || []).filter(function (item) { return item.id === subId; })[0] : null;
        if (!cat || !sub) return;
        var requestId = ++selectionRequestId, hash = location.hash, data = viewData();
        preloadCategoryView(cat, sub).then(function () {
            if (requestId !== selectionRequestId || hash !== location.hash || data !== viewData()) return;
            try { localStorage.setItem('zbll_active_subcat_' + catId, subId); } catch (e) {}
            renderCategory(catId);
            scrollToContentTop();
        });
    }

    // 分别复用缩略图、公式图，不能把无图占位 div 当成 img，也不跨角色配对。
    function adoptImages(staging) {
        ['img.case-thumb', 'img.formula-image'].forEach(function (selector) {
            var oldImages = Array.prototype.slice.call(appEl.querySelectorAll(selector));
            var newImages = Array.prototype.slice.call(staging.querySelectorAll(selector));
            newImages.forEach(function (image, index) {
                var old = oldImages[index];
                if (!old) return;
                ['src', 'alt', 'class', 'data-thumb', 'data-category', 'data-subcategory'].forEach(function (attr) {
                    var value = image.getAttribute(attr);
                    if (value === null) old.removeAttribute(attr);
                    else if (old.getAttribute(attr) !== value || (attr === 'src' && old.complete && !old.naturalWidth)) old.setAttribute(attr, value);
                });
                image.parentNode.replaceChild(old, image);
            });
        });
    }
    // 统一入口：先在游离容器里建好新 DOM，回收旧 <img> 后整体提交。
    function commitHtml(html) {
        var staging = document.createElement('div');
        staging.innerHTML = html;
        adoptImages(staging);
        appEl.replaceChildren.apply(appEl, Array.prototype.slice.call(staging.childNodes));
    }

    function renderCategory(catId) {
        clearOwnMarkHints();
        selectionRequestId++;
        clearSorting();
        cancelFormulaImagePreload();
        var cat = findCategory(catId);
        if (!cat) { cancelFormulaImagePreload(); appEl.innerHTML = '<div class="container"><div class="empty-state">' + tx('分类不存在：{category}', { category: catId }) + '</div></div>'; currentCatId = ''; currentSubId = ''; return; }
        var activeSub = activeSubcatOf(cat);
        // 横栏放在 .container 外面（全宽，像 Word 的功能区）；只给读屏用的一级标题留在容器里。
        // 不再有可见的面包屑与标题：进页面就是吸顶选择器。
        var html = renderCaseBar(cat, activeSub);
        html += '<div class="container container-flush"><h1 class="visually-hidden">' + escapeHtml(cat.id) + ' Case</h1>';
        if (activeSub) {
            var subTotal = activeSub.formulas.length;
            html += '<div class="subcategory-card" id="card-' + escapeHtml(activeSub.id) + '">';
            html += '<div class="formula-grid" id="subcat-' + escapeHtml(activeSub.id) + '">';
            if (subTotal) {
                html += '<div class="sortable-container" data-category="' + escapeHtml(cat.id) + '" data-subcategory="' + escapeHtml(activeSub.id) + '">';
                activeSub.formulas.forEach(function (formula, index) { html += renderFormulaCard(cat.id, activeSub.id, formula, index); });
                html += '</div>';
            } else html += '<div class="empty-state"><p class="mb-0">' + tx('该子分类下暂无公式') + '</p></div>';
            html += '</div></div>';
        }
        html += '</div>';
        // 重建 DOM 前保留两行选择器的横向位置。手机点 U6 等靠右的按钮时，
        // 不能随着内容重渲染跳回最左侧；切换大类则让新的子分类行从头显示。
        var rowSelectors = ['.case-bar-categories .case-bar-scroll', '.case-bar-subcategories .case-bar-scroll'];
        var rowScroll = rowSelectors.map(function (selector, index) {
            var row = appEl.querySelector(selector);
            return row && (index === 0 || currentCatId === cat.id) ? row.scrollLeft : 0;
        });
        commitHtml(html);
        rowSelectors.forEach(function (selector, index) {
            var row = appEl.querySelector(selector);
            if (row) row.scrollLeft = rowScroll[index];
        });
        currentCatId = cat.id;
        currentSubId = activeSub ? activeSub.id : '';
        initOwnMarkHints();
        scheduleCategoryFormulaImages(cat);
        warmThemeImages();
        applyZbllFilter(getZbllFilter());
        if (activeWorkspace) bindSorting();
    }

    function renderFormulaCard(catId, subId, formula, index) {
        var cat = findCategory(catId), sub = cat.subcategories.filter(function (s) { return s.id === subId; })[0];
        var id = displayFormulaId(sub, formula), uid = formula.uid || formula.id || (subId + '-' + index);
        // 显示位置仅用于页面锚点；大神来源与个人设置始终使用稳定 ID。
        var positionAnchor = sub.id + '-' + (index + 1);
        // SortableJS 使用 forceFallback 模式接管拖动；不要再设置原生 draggable，避免出现双重拖影。
        var html = '<div class="sortable-item" data-uid="' + escapeHtml(uid) + '" id="formula-position-' + escapeHtml(positionAnchor) + '">';
        var canEditContent = canEditFormulaContent();
        var editing = !!inlineEditor && inlineEditor.catId === catId && inlineEditor.subId === subId && inlineEditor.uid === uid;
        var note = splitNotes(formula.notes, formula, subId);
        html += '<div class="formula-card' + (formula.learned ? ' learned' : '') + ' learning-enabled has-card-editor' + (canEditContent ? ' content-editable' : '') + (editing ? ' inline-editing' : '') + '">';
        if (isEditableView()) html += '<div class="drag-handle"' + ta('title', '拖动排序') + ta('aria-label', '拖动排序') + '>⋮⋮</div>';
        html += '<div class="row"><div class="col-4">';
        if (editing) {
            var editImage = inlineEditor.imageCleared ? '' : (inlineEditor.selectedImage || formula.image || '');
            html += '<div class="inline-image-editor"><label class="drag-area inline-image-drop"' + ta('title', '点击选择图片') + '>';
            html += '<img class="inline-image-preview"' + ta('alt', '图片预览') + (editImage ? ' src="' + escapeHtml(imageSource(editImage)) + '"' : ' hidden') + '>';
            html += '<span class="inline-image-prompt"' + (editImage ? ' hidden' : '') + '>📷<small>' + tx('选择图片') + '</small></span>';
            html += '<input type="file" class="inline-image-input d-none" accept="image/png,image/jpeg,image/gif,image/svg+xml"></label></div>';
        } else if (formula.image) html += '<img src="' + escapeHtml(imageSource(formula.image)) + '" class="formula-image" alt="' + escapeHtml(id) + '">';
        else html += '<div class="formula-image d-flex align-items-center justify-content-center bg-light"><span class="text-muted">' + tx('无图') + '</span></div>';
        html += '</div><div class="col-8"><div class="formula-id">' + escapeHtml(id) + '</div>';
        if (editing) {
            html += '<div class="inline-note-editor"><div class="formula-notes formula-note-fixed inline-note-header">' + escapeHtml(note.header) + '</div>';
            html += '<textarea class="workspace-textarea form-control note-body inline-note-body" rows="4"' + ta('placeholder', '可以在这里写备注') + '>' + escapeHtml(note.body) + '</textarea></div>';
        } else if (formula.notes) {
            html += '<div class="formula-note-display formula-notes"><div class="formula-note-fixed">' + escapeHtml(note.header) + '</div>';
            if (note.body) {
                // 备注正文：引用式外观，固定一行，超出用省略号；完整内容在悬停提示和编辑框里。
                html += '<div class="formula-note-body-display" title="' + escapeHtml(note.body) + '">'
                    + '<span class="formula-note-text">' + escapeHtml(note.body) + '</span></div>';
            }
            html += '</div>';
        }
        html += '</div></div>';
        if (editing) {
            // Keep the image action in normal flow below the fixed-height image/note row.
            html += '<div class="inline-image-actions"><button type="button" class="btn btn-sm btn-outline-secondary workspace-action inline-image-clear" data-action="' + (editImage ? 'clear-inline-image' : 'restore-inline-image') + '">' + tx(editImage ? '清除图片' : '恢复图片') + '</button></div>';
            html += renderLineEditor(formula, subId);
        } else if (formula.lines && formula.lines.length) {
            html += '<div class="formula-lines">';
            var canSelectLine = isWorkspace();
            var selectedLineIndex = canSelectLine ? selectedFormulaLineIndex(formula) : -1;
            formula.lines.forEach(function (line, lineIndex) {
                var cardKey = catId + '::' + subId + '::' + uid;
                var lineKey = catId + '::' + subId + '::' + uid + '::' + lineIndex;
                var selected = canSelectLine && selectedLineIndex === lineIndex;
                var lineAttrs = canSelectLine ? ' data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '" data-formula-card-key="' + escapeHtml(cardKey) + '" data-formula-line-key="' + escapeHtml(lineKey) + '" data-formula-line-index="' + lineIndex + '" role="button" tabindex="0" aria-selected="' + (selected ? 'true' : 'false') + '"' : '';
                html += '<div class="formula-line' + (canSelectLine ? ' selectable' : '') + (selected ? ' selected' : '') + '"' + lineAttrs + '><span class="formula-line-alg">' + escapeHtml(line.alg) + '</span>';
                if (line.origin === 'custom') html += '<span class="formula-origin">' + tx('我的') + '</span>';
                if (line.marks && line.marks.length) {
                    html += '<span class="formula-marks-group">';
                    line.marks.forEach(function (mark) { html += solverBadge(mark); });
                    html += '</span>';
                }
                html += '</div>';
            });
            html += '</div>';
        }
        if (!editing && !(formula.lines || []).length) html += '<p class="case-lines-empty">' + tx('暂无显示的公式，点编辑勾选大神公式或添加自己的公式。') + '</p>';
        if (editing) {
            html += '<div class="action-buttons inline-editor-actions"><div class="action-buttons-row">';
            html += '<button type="button" class="btn btn-secondary btn-sm workspace-action" data-action="cancel-inline-edit">' + tx('取消') + '</button>';
            html += '<button type="button" class="btn btn-primary btn-sm workspace-action" data-action="save-inline-edit">' + tx('保存') + '</button>';
            html += '</div></div>';
        } else if (canShowFormulaEditor()) {
            html += '<div class="action-buttons">';
            html += '<div class="action-buttons-row"><button type="button" class="btn btn-outline-secondary btn-sm workspace-action" data-action="edit-formula" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '">' + tx('编辑') + '</button></div></div>';
        }
        html += '<button type="button" class="learn-btn workspace-action' + (formula.learned ? ' learned' : '') + '" data-action="toggle-learned" data-category="' + escapeHtml(catId) + '" data-subcategory="' + escapeHtml(subId) + '" data-uid="' + escapeHtml(uid) + '"' + ta('title', formula.learned ? '取消已学' : '标记已学') + ta('aria-label', formula.learned ? '取消已学' : '标记已学') + '><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg></button>';
        html += '</div></div>';
        return html;
    }

    function selectFormulaLine(line) {
        if (workspaceWritePending || !line || line.closest('.inline-editing')) return;
        if (!isWorkspace()) {
            ensureEditableData().catch(operationError);
            return;
        }
        var cardKey = line.getAttribute('data-formula-card-key') || '';
        var lineKey = line.getAttribute('data-formula-line-key') || null;
        var lineIndex = parseInt(line.getAttribute('data-formula-line-index'), 10);
        if (!cardKey || !lineKey) return;
        var ref = findFormula(line.getAttribute('data-category'), line.getAttribute('data-subcategory'), line.getAttribute('data-uid'));
        if (!ref || !Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= (ref.formula.lines || []).length) return;
        var lineId = ref.formula.lines[lineIndex].id;
        var previousSelection = ref.formula.selectedLineId;
        var shouldClear = previousSelection === lineId;
        if (shouldClear) delete ref.formula.selectedLineId;
        else ref.formula.selectedLineId = lineId;
        var card = line.closest('.formula-card');
        (card || document).querySelectorAll('.formula-line.selected').forEach(function (item) {
            item.classList.remove('selected');
            item.setAttribute('aria-selected', 'false');
        });
        var saveResult = persistCurrentData();
        if (saveResult && typeof saveResult.catch === 'function') saveResult.catch(function (error) {
            if (previousSelection) ref.formula.selectedLineId = previousSelection; else delete ref.formula.selectedLineId;
            if (card && card.isConnected) card.querySelectorAll('.formula-line').forEach(function (el, index) {
                var selected = ref.formula.lines[index].id === previousSelection;
                el.classList.toggle('selected', selected); el.setAttribute('aria-selected', String(selected));
            });
            operationError(error);
        });
        if (shouldClear) return;
        line.classList.add('selected');
        line.setAttribute('aria-selected', 'true');
    }
    var sortableInstances = [];
    var sortableLoadPromise = null;
    var sortableBindToken = 0;
    // SortableJS 仅在可编辑视图加载，不阻塞只读首屏。
    function ensureSortable() {
        if (window.Sortable) return Promise.resolve(true);
        if (sortableLoadPromise) return sortableLoadPromise;
        sortableLoadPromise = new Promise(function (resolve) {
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js';
            script.onload = function () {
                if (!window.Sortable) { sortableLoadPromise = null; script.remove(); }
                resolve(!!window.Sortable);
            };
            script.onerror = function () {
                sortableLoadPromise = null;
                script.remove();
                resolve(false);
            };
            document.head.appendChild(script);
        });
        return sortableLoadPromise;
    }
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

    function clearSorting() {
        sortableBindToken++;
        sortableInstances.forEach(function (instance) { instance.destroy(); });
        sortableInstances = [];
        if (isDraggingFormula) {
            isDraggingFormula = false;
            if (scrollRafId) window.cancelAnimationFrame(scrollRafId);
            scrollRafId = null;
            document.documentElement.style.scrollBehavior = '';
        }
    }
    function bindSorting() {
        clearSorting();
        var token = sortableBindToken;
        ensureSortable().then(function (ready) {
            if (ready && token === sortableBindToken && activeWorkspace) bindSortingInstances();
        });
    }
    function bindSortingInstances() {
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
                filter: function () { return workspaceWritePending || !!(inlineEditor && inlineEditor.saving); },
                forceFallback: true,
                fallbackOnBody: true,
                scroll: false,
                invertSwap: false,
                swapThreshold: 6,
                onChoose: function () {
                    if (!activeWorkspace) {
                        openWorkspaceManager().then(function () {
                            setWorkspaceMessage('默认大神版不能保存排序，请先选择或新建公式库。', true);
                        });
                        return false;
                    }
                },
                onStart: function (evt) {
                    if (!activeWorkspace) {
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
                        var previousOrder = sub.formulas;
                        sub.formulas = reordered;
                        try { await persistCurrentData(); }
                        catch (error) {
                            sub.formulas = previousOrder;
                            previousOrder.forEach(function (f) {
                                var item = Array.from(evt.to.children).find(function (el) { return el.dataset.uid === f.uid; });
                                if (item) evt.to.appendChild(item);
                            });
                            operationError(error); return;
                        }
                        if (inlineEditor) {
                            Array.prototype.forEach.call(evt.to.children, function (item, index) {
                                var positionAnchor = sub.id + '-' + (index + 1);
                                item.id = 'formula-position-' + positionAnchor;
                            });
                        } else renderCategory(evt.to.dataset.category);
                    }
                }
            });
            sortableInstances.push(sortable);
        });
    }

    function showOverlay(id, show) {
        var el = document.getElementById(id);
        if (el) el.hidden = !show;
        syncModalScrollLock();
    }
    function setWorkspaceMessage(text, error, args) {
        var el = document.getElementById('workspace-message'); if (!el) return;
        I18N.setText(el, text || '', args); el.classList.toggle('is-error', !!error);
    }
    function setWorkspaceFailure(error, fallback) {
        if (error && error.i18nKey) setWorkspaceMessage(error.i18nKey, true, error.i18nArgs);
        else if (error && error.message) setWorkspaceMessage('操作失败：{detail}', true, { detail: error.message });
        else setWorkspaceMessage(fallback, true);
    }
    function setWorkspaceProgress(value, text, message) {
        workspaceProgressState = value === null || value === undefined ? null : { value: value, text: text || '', message: message };
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
        if (label) label.textContent = (message ? t(message.key, message.args) : t(text || '处理中')) + ' · ' + value + '%';
        var cancel = document.getElementById('workspace-export-cancel');
        if (cancel) { cancel.hidden = !workspaceExportController; cancel.disabled = false; }
    }
    async function refreshWorkspaceList() {
        var listEl = document.getElementById('workspace-list');
        if (!listEl) return;
        var list = await WS.list();
        listEl.innerHTML = '<div class="workspace-list-row"><button type="button" class="workspace-list-item' + (!activeWorkspace ? ' active' : '') + '" data-public-library="default">' + tx('默认大神版') + '<small>' + tx('仅预览') + '</small></button><span class="workspace-item-lock"' + ta('aria-label', '默认大神版仅预览') + ta('title', '默认大神版仅预览') + '><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg></span></div>' +
            list.map(function (item) {
                return '<div class="workspace-list-row"><button type="button" class="workspace-list-item' + (activeWorkspace && activeWorkspace.id === item.id ? ' active' : '') + '" data-workspace-id="' + escapeHtml(item.id) + '"><span>' + escapeHtml(item.name) + '</span><small data-local-date="' + escapeHtml(item.updatedAt) + '">' + escapeHtml(new Date(item.updatedAt).toLocaleString(I18N.language() === 'en' ? 'en-US' : 'zh-CN')) + '</small></button><button type="button" class="workspace-item-menu-trigger" data-workspace-menu="custom" data-target-id="' + escapeHtml(item.id) + '" aria-haspopup="menu"' + ta('aria-label', '{name}的更多操作', { name: item.name }) + ta('title', '更多操作') + '>…</button></div>';
            }).join('');
        updateWorkspaceNav();
    }
    async function openWorkspaceManager() {
        hideWorkspaceContextMenu();
        workspaceShortcutTarget = null;
        setWorkspaceMessage('');
        if (workspaceProgressState) setWorkspaceProgress(workspaceProgressState.value, workspaceProgressState.text, workspaceProgressState.message);
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
    async function exportWorkspace(target, button) {
        if (!target) { setWorkspaceMessage('请先选择要导出的公式库。', true); return; }
        if (workspaceExportController) { setWorkspaceMessage('已有导出正在进行，请先等待或取消。', true); return; }
        if (button) button.disabled = true;
        workspaceExportController = new AbortController();
        setWorkspaceMessage('正在导出，请稍候…');
        setWorkspaceProgress(0, '开始导出');
        try {
            await WS.exportFile(target, setWorkspaceProgress, workspaceExportController.signal);
            setWorkspaceMessage('已下载 {name}', false, { name: (target.name || 'zbll-workspace').replace(/[\\/:*?"<>|]/g, '_') + '.zbll' });
            setTimeout(function () { if (!workspaceExportController) setWorkspaceProgress(null); }, 1200);
        } catch (error) {
            if (workspaceExportController.signal.aborted || (error && error.name === 'AbortError')) {
                setWorkspaceMessage('已取消导出。');
                setWorkspaceProgress(null);
            } else {
                setWorkspaceFailure(error, '导出失败，请重试。');
                setWorkspaceProgress(null);
            }
        } finally {
            workspaceExportController = null;
            await refreshWorkspaceList();
        }
    }
    async function activateWorkspace(id) {
        if (!discardEditor()) return;
        activeWorkspace = await WS.activate(id);
        try { if (activeWorkspace) localStorage.setItem(selectedWorkspaceKey, id); else localStorage.removeItem(selectedWorkspaceKey); } catch (e) {}
        await refreshWorkspaceList();
    }
    async function createWorkspace() {
        if (!discardEditor()) return;
        var name = window.prompt(t('请输入新建公式库名称'), t('我的公式库'));
        if (!name || !name.trim()) return;
        var workspace = await WS.create(DATA, name.trim());
        await activateWorkspace(workspace.id);
        setWorkspaceMessage('已创建：{name}', false, { name: workspace.name });
    }
    function splitNotes(notes, formula, subId) {
        var text = String(notes || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), parts = text.split('\n');
        var number = String(formula && (formula.id || '')).match(/(\d+)$/);
        var header = parts.shift() || ('ZBLL ' + subId + ' ' + (number ? number[1] : ''));
        return { header: header, body: parts.join('\n') };
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
    function clearOwnMarkHints() {
        if (ownMarkHintsCleanup) ownMarkHintsCleanup();
        ownMarkHintsCleanup = null;
    }
    function initOwnMarkHints() {
        clearOwnMarkHints();
        var inputs = Array.from(appEl.querySelectorAll('.own-marks'));
        if (!inputs.length || typeof ResizeObserver !== 'function') return;
        var observer, motion, disposed = false, fullHint = t('标记（可选）');
        function refresh() {
            if (disposed) return;
            try {
                inputs.forEach(function (input) {
                    var field = input.parentElement, hint = field.querySelector('.own-mark-hint');
                    var style = getComputedStyle(input);
                    input.placeholder = motion.matches ? t('标记') : fullHint;
                    hint.style.font = style.font;
                    hint.style.letterSpacing = style.letterSpacing;
                    hint.style.left = (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) + 'px';
                    hint.style.right = (parseFloat(style.borderRightWidth) + parseFloat(style.paddingRight)) + 'px';
                    var copy = hint.querySelector('.own-mark-copy');
                    var textWidth = copy.querySelector('span').getBoundingClientRect().width;
                    var available = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                    var step = copy.getBoundingClientRect().width;
                    hint.style.setProperty('--own-mark-shift', -step + 'px');
                    hint.style.setProperty('--own-mark-duration', (step / 20) + 's');
                    field.classList.toggle('is-hint-overflow', !motion.matches && available > 0 && textWidth > available + 0.5);
                });
            } catch (error) { clearOwnMarkHints(); }
        }
        ownMarkHintsCleanup = function () {
            disposed = true;
            if (observer) observer.disconnect();
            if (motion) {
                if (motion.removeEventListener) motion.removeEventListener('change', refresh);
                else motion.removeListener(refresh);
            }
            if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', refresh);
            inputs.forEach(function (input) {
                input.placeholder = fullHint;
                input.parentElement.classList.remove('is-hint-overflow');
            });
        };
        try {
            motion = window.matchMedia('(prefers-reduced-motion: reduce)');
            observer = new ResizeObserver(refresh);
            inputs.forEach(function (input) { observer.observe(input); });
            if (motion.addEventListener) motion.addEventListener('change', refresh);
            else motion.addListener(refresh);
            if (document.fonts) {
                document.fonts.ready.then(refresh);
                if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', refresh);
            }
            refresh();
        } catch (error) { clearOwnMarkHints(); }
    }
    function ownLineRow(line) {
        // 一整行：公式与标记并排输入，最右侧删除整条；保留内外框。
        // algs 单行输入，历史数据里可能存在的换行先折成空格，避免保存时把两段公式粘在一起。
        var alg = String(line.alg || '').replace(/\s*\n\s*/g, ' ');
        return '<div class="own-line-row" data-line-id="' + escapeHtml(line.id) + '">'
            + '<div class="own-line-fields">'
            + '<label class="own-line-field"><span class="visually-hidden">' + tx('公式') + '</span><input type="text" class="form-control own-alg"' + ta('placeholder', '输入公式') + ' value="' + escapeHtml(alg) + '"></label>'
            + '<label class="own-line-field"><span class="visually-hidden">' + tx('标记（可选），多个标记用空格分隔') + '</span><input type="text" class="form-control own-marks"' + ta('placeholder', '标记（可选）') + ta('title', '标记（可选），多个标记用空格分隔') + ' value="' + escapeHtml(line.marks.join(' ')) + '">'
            + '<span class="own-mark-hint" aria-hidden="true"><span class="own-mark-track"><span class="own-mark-copy">' + tx('标记（可选）') + '&nbsp;</span><span class="own-mark-copy">' + tx('标记（可选）') + '&nbsp;</span></span></span></label>'
            + '</div>'
            + '<button type="button" class="workspace-action own-line-remove" data-action="remove-own-line"' + ta('title', '删除这条公式（不影响大神公式）') + '>' + tx('删除') + '</button></div>';
    }
    function sourceChoices(formula) {
        return WS.sourceLines(activeWorkspace, formula).map(function (line) {
            var marks = (line.marks || []).map(function (mark) {
                return solverBadge(mark);
            }).join('');
            return '<label class="formula-line source-line-choice"><input type="checkbox" name="source-line" value="' + escapeHtml(line.id) + '"' + (formula.visibleSourceLineIds.indexOf(line.id) >= 0 ? ' checked' : '') + '><span class="source-line-content"><span class="formula-line-alg">' + escapeHtml(line.alg) + '</span>' + (marks ? '<span class="formula-marks-group">' + marks + '</span>' : '') + '</span></label>';
        }).join('');
    }
    function renderLineEditor(formula, subId) {
        var html = '<section class="case-line-editor"><div class="case-editor-heading"><strong>' + tx('大神公式') + '</strong><button type="button" class="btn btn-sm btn-outline-secondary workspace-action" data-action="source-all">' + tx('全选') + '</button><button type="button" class="btn btn-sm btn-outline-secondary workspace-action" data-action="source-none">' + tx('全不选') + '</button></div>';
        if (!formula.sourceCaseKey) {
            html += '<label class="source-repair-label">' + tx('旧卡片来源未关联（不会覆盖个人内容）') + '<select class="form-control source-repair"><option value="" data-i18n="选择对应 case">' + escapeHtml(t('选择对应 case')) + '</option>';
            activeWorkspace.sources.filter(function (s) { return s.subcategory === subId && s.category === inlineEditor.catId; }).forEach(function (s) { html += '<option value="' + escapeHtml(s.key) + '">' + escapeHtml(s.formulaId) + '</option>'; });
            html += '</select></label>';
        }
        html += '<div class="source-line-choices">' + sourceChoices(formula) + '</div><div class="case-editor-heading"><strong>' + tx('我的公式') + '</strong><button type="button" class="btn btn-sm btn-outline-secondary workspace-action" data-action="add-own-line">' + tx('＋ 添加') + '</button></div><div class="own-line-rows">';
        formula.customLines.forEach(function (line) { html += ownLineRow(line); });
        return html + '</div></section>';
    }
    function openFormulaEditor(catId, subId, formula) {
        if (!formula || !discardEditor(false)) return;
        var state = inlineEditor = { catId: catId, subId: subId, uid: formula.uid || formula.id, selectedImage: null, imageCleared: false, imageBeforeClear: formula.clearedImage || '', imagePending: false, saving: false };
        renderCategory(catId);
        state.initialSnapshot = editorSnapshot();
        requestAnimationFrame(function () {
            if (inlineEditor !== state) return;
            var card = findInlineCard(state.uid), field = card && card.querySelector('input[name="source-line"], .own-alg, .inline-note-body');
            if (field) field.focus({ preventScroll: true });
        });
    }
    function cancelInlineEditor(button) {
        if (!inlineEditor) return;
        var state = inlineEditor, card = button && button.closest('.formula-card');
        var top = card ? card.getBoundingClientRect().top : null;
        if (!discardEditor(false)) return;
        rerenderAtSameCard(state.catId, state.uid, top);
    }
    async function saveInlineEditor(button) {
        if (!inlineEditor || inlineEditor.saving) return;
        var state = inlineEditor, card = button && button.closest('.formula-card');
        if (!card) return;
        if (state.imagePending) { window.alert(t('图片正在读取，请稍候')); return; }
        var candidate = WS.clone(activeWorkspace);
        var formula = candidate.categories.find(function (c) { return c.id === state.catId; }).subcategories.find(function (s) { return s.id === state.subId; }).formulas.find(function (f) { return f.uid === state.uid; });
        var header = card.querySelector('.inline-note-header').textContent;
        var body = card.querySelector('.inline-note-body').value;
        formula.notes = header + (body ? '\n' + body : '');
        var repair = card.querySelector('.source-repair');
        if (repair) formula.sourceCaseKey = repair.value || null;
        formula.visibleSourceLineIds = Array.from(card.querySelectorAll('input[name="source-line"]:checked')).map(function (el) { return el.value; });
        formula.customLines = Array.from(card.querySelectorAll('.own-line-row')).map(function (row) {
            return { id: row.dataset.lineId, alg: row.querySelector('.own-alg').value.trim(), marks: row.querySelector('.own-marks').value.split(/[\s,，]+/).filter(Boolean) };
        });
        if (formula.customLines.some(function (line) { return !line.alg; })) { window.alert(t('个人公式不能为空；不需要的行请删除。')); return; }
        if (state.imageCleared) {
            formula.image = '';
            if (state.imageBeforeClear) formula.clearedImage = state.imageBeforeClear;
            else delete formula.clearedImage;
        } else if (state.selectedImage) {
            formula.image = state.selectedImage;
            delete formula.clearedImage;
        }
        WS.normalizeSelection(candidate, formula);
        var top = card.getBoundingClientRect().top;
        state.saving = true; button.disabled = true;
        card.inert = true; card.setAttribute('aria-busy', 'true');
        try {
            await saveCandidate(candidate);
            inlineEditor = null;
            rerenderAtSameCard(state.catId, state.uid, top);
        } catch (error) { operationError(error); }
        finally { state.saving = false; button.disabled = false; card.inert = false; card.removeAttribute('aria-busy'); }
    }
    function updateInlineImage(file, area) {
        if (!file || !inlineEditor || inlineEditor.saving) return;
        var state = inlineEditor;
        var request = state.imageRequest = (state.imageRequest || 0) + 1;
        state.imagePending = true;
        readFileData(file).then(function (dataUrl) {
            if (inlineEditor !== state || state.imageRequest !== request) return;
            state.imagePending = false;
            state.selectedImage = dataUrl;
            state.imageCleared = false;
            syncInlineImage(area && area.closest('.inline-image-editor'));
        }).catch(function () { if (inlineEditor === state && state.imageRequest === request) { state.imagePending = false; window.alert(t('图片读取失败')); } });
    }
    function currentInlineImage() {
        if (!inlineEditor || inlineEditor.imageCleared) return '';
        var ref = findFormula(inlineEditor.catId, inlineEditor.subId, inlineEditor.uid);
        return inlineEditor.selectedImage || (ref && ref.formula.image) || '';
    }
    function syncInlineImage(editor) {
        if (!editor) return;
        var path = currentInlineImage(), image = editor.querySelector('.inline-image-preview');
        if (path) image.src = imageSource(path); else image.removeAttribute('src');
        image.hidden = !path;
        editor.querySelector('.inline-image-prompt').hidden = !!path;
        var button = editor.closest('.formula-card').querySelector('.inline-image-clear');
        button.dataset.action = path ? 'clear-inline-image' : 'restore-inline-image';
        I18N.setText(button, path ? '清除图片' : '恢复图片');
    }
    function clearInlineImage(button) {
        if (!inlineEditor || inlineEditor.saving) return;
        // Keep the actual previous image (including uploads), not a display data URL.
        var previous = currentInlineImage();
        if (previous) inlineEditor.imageBeforeClear = previous;
        inlineEditor.imageRequest = (inlineEditor.imageRequest || 0) + 1;
        inlineEditor.imagePending = false;
        inlineEditor.selectedImage = null;
        inlineEditor.imageCleared = true;
        var editor = button.closest('.formula-card').querySelector('.inline-image-editor');
        editor.querySelector('.inline-image-input').value = '';
        syncInlineImage(editor);
    }
    function restoreInlineImage(button) {
        if (!inlineEditor || inlineEditor.saving) return;
        var ref = findFormula(inlineEditor.catId, inlineEditor.subId, inlineEditor.uid);
        if (!ref) return;
        var repair = button.closest('.formula-card').querySelector('.source-repair');
        var source = repair ? { sourceCaseKey: repair.value || null } : ref.formula;
        var path = inlineEditor.imageBeforeClear || WS.defaultImage(activeWorkspace, source);
        if (!path) { window.alert(t('暂无可恢复的图片。请选择图片，或先关联对应的 case。')); return; }
        inlineEditor.imageRequest = (inlineEditor.imageRequest || 0) + 1;
        inlineEditor.imagePending = false;
        inlineEditor.selectedImage = path;
        inlineEditor.imageCleared = false;
        var editor = button.closest('.formula-card').querySelector('.inline-image-editor');
        editor.querySelector('.inline-image-input').value = '';
        syncInlineImage(editor);
    }
    async function handleWorkspaceAction(button) {
        var action = button.dataset.action, catId = button.dataset.category, subId = button.dataset.subcategory, uid = button.dataset.uid;
        if (workspaceWritePending || (inlineEditor && inlineEditor.saving)) return;
        if (action === 'source-all' || action === 'source-none') {
            button.closest('.formula-card').querySelectorAll('input[name="source-line"]').forEach(function (el) { el.checked = action === 'source-all'; }); return;
        }
        if (action === 'add-own-line') {
            var rows = button.closest('.formula-card').querySelector('.own-line-rows');
            rows.insertAdjacentHTML('beforeend', ownLineRow({ id: WS.makeId(), alg: '', marks: [] })); initOwnMarkHints(); rows.lastElementChild.querySelector('.own-alg').focus(); return;
        }
        if (action === 'remove-own-line') { clearOwnMarkHints(); button.closest('.own-line-row').remove(); initOwnMarkHints(); return; }
        if (action === 'cancel-inline-edit') { cancelInlineEditor(button); return; }
        if (action === 'save-inline-edit') { await saveInlineEditor(button); return; }
        if (action === 'clear-inline-image') { clearInlineImage(button); return; }
        if (action === 'restore-inline-image') { restoreInlineImage(button); return; }
        if (action === 'add-formula' || action === 'delete-formula') return;
        var editable = await ensureEditableData();
        if (!editable) return;
        if (inlineEditor && action !== 'edit-formula' && action !== 'toggle-learned') {
            if (!discardEditor()) return;
        }
        var ref = uid ? findFormula(catId, subId, uid) : null;
        if (action === 'edit-formula' && ref) return openFormulaEditor(catId, subId, ref.formula);
        if (!ref) return;
        if (action === 'toggle-learned') {
            var wasLearned = ref.formula.learned;
            ref.formula.learned = !wasLearned;
            button.disabled = true;
            try { await persistCurrentData(); }
            catch (error) { ref.formula.learned = wasLearned; throw error; }
            finally { button.disabled = false; }
            if (inlineEditor) {
                var card = button.closest('.formula-card');
                if (card) card.classList.toggle('learned', ref.formula.learned);
                button.classList.toggle('learned', ref.formula.learned);
                button.dataset.i18nTitle = ref.formula.learned ? '取消已学' : '标记已学';
                button.setAttribute('data-i18n-aria-label', button.dataset.i18nTitle);
                button.title = t(button.dataset.i18nTitle);
                button.setAttribute('aria-label', button.title);
                return;
            }
            renderCategory(catId);
        }
    }

    function hideWorkspaceContextMenu() {
        var menu = document.getElementById('workspace-context-menu');
        if (menu) menu.hidden = true;
        workspaceContextTarget = null;
    }
    async function selectWorkspaceManagerItem(kind, id) {
        setWorkspaceMessage('');
        workspaceShortcutTarget = { kind: kind, id: id };
        await activateWorkspace(kind === 'public' ? null : id);
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
        var list = document.getElementById('workspace-list');
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
        if (target.kind === 'public' && target.id === 'default') return false;
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
            if (id === 'workspace-new') return await createWorkspace();
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
                return exportWorkspace(WS.exportPublic(DATA), control);
            }
            if (id === 'workspace-custom-export') {
                return exportWorkspace(await getContextWorkspace(contextTarget), control);
            }
            if (id === 'workspace-rename') {
                var selectedWorkspace = await getContextWorkspace(contextTarget);
                if (!selectedWorkspace) { setWorkspaceMessage('请先选择要重命名的公式库。', true); await refreshWorkspaceList(); return; }
                var name = window.prompt(t('新的公式库名称'), selectedWorkspace.name);
                if (name && name.trim()) {
                    if (inlineEditor && inlineEditor.saving) return;
                    selectedWorkspace.name = name.trim();
                    await WS.put(selectedWorkspace);
                    if (activeWorkspace && activeWorkspace.id === selectedWorkspace.id) activeWorkspace = selectedWorkspace;
                    await refreshWorkspaceList();
                }
                return;
            }
            if (id === 'workspace-delete') {
                var selectedToDelete = await getContextWorkspace(contextTarget);
                if (!selectedToDelete) { setWorkspaceMessage('请先选择要删除的公式库。', true); await refreshWorkspaceList(); return; }
                if (!window.confirm(t('删除选中的公式库？导出的 .zbll 文件不受影响。'))) return;
                var removedId = selectedToDelete.id;
                var customSelectionPlan = workspaceDeletionSelectionPlan({ kind: 'custom', id: removedId });
                if (activeWorkspace && activeWorkspace.id === removedId && !discardEditor()) return;
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
                if (activeWorkspace && activeWorkspace.id === removedId) await activateWorkspace(null);
                await refreshWorkspaceList();
                return;
            }
            if (id === 'workspace-close') { hideWorkspaceContextMenu(); return showOverlay('workspace-overlay', false); }
        } catch (error) { setWorkspaceFailure(error, '工作区操作失败'); setWorkspaceProgress(null); await refreshWorkspaceList(); }
    }
    async function importWorkspaceFile(e) {
        var file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return;
        try {
            if (!discardEditor()) return;
            var imported = await WS.importFile(file);
            await activateWorkspace(imported.id);
            setWorkspaceMessage('已导入公式库：{name}', false, { name: imported.name });
            await refreshWorkspaceList();
        }
        catch (error) { showOverlay('workspace-overlay', true); setWorkspaceFailure(error, '导入失败：文件格式无效'); }
    }

    var currentCatId = '';
    var currentSubId = '';
    function currentCategoryId() { return currentCatId; }
    // 由选择器触发的跳转要落在内容顶部，而不是上一次的滚动位置。
    var pendingSelectionScroll = false;

    var lastRouteHash = location.hash || '#/';
    function router() {
        if (!discardEditor(false)) {
            history.replaceState(null, '', lastRouteHash);
            return;
        }
        lastRouteHash = location.hash || '#/';
        var hash = location.hash || '#/', match = hash.match(/^#\/category\/([A-Za-z]+)$/), nextView = match ? 'cat:' + match[1] : 'home';
        inlineEditor = null;
        if (currentView) saveScroll(); if (match) renderCategory(match[1]); else { currentCatId = ''; currentSubId = ''; renderHome(); } currentView = nextView;
        if (pendingSelectionScroll) { pendingSelectionScroll = false; scrollToContentTop(); }
        else restoreScroll(nextView);
        updateWorkspaceNav();
    }
    function initWorkspace() {
        // IndexedDB 与图片合集并行准备，不等待几百次独立图片请求。
        return Promise.all([WS.ready, imageLibrary ? imageLibrary.ready : Promise.resolve(false)]).then(async function () {
            var id = WS.activeId();
            activeWorkspace = id ? await WS.get(id) : null;
            if (!activeWorkspace && id) await WS.activate(null);
            router();
        }).catch(function (error) { console.warn(error); activeWorkspace = null; router(); window.alert(t('本地公式库暂时不可用，已保留原数据，本次只能浏览默认大神版。\n{detail}', { detail: I18N.errorText(error, '请重试') })); }).finally(async function () {
            // 只解码当前屏幕要显示的图；其余图片的字节已经在内存中。
            var images = Array.prototype.slice.call(appEl.querySelectorAll('img'));
            await Promise.race([
                Promise.all(images.map(function (image) {
                    return typeof image.decode === 'function' ? image.decode().catch(function () {}) : Promise.resolve();
                })),
                new Promise(function (resolve) { window.setTimeout(resolve, 1500); })
            ]);
            var hadSnapshot = document.body.classList.contains('zbll-has-snapshot');
            var status = document.getElementById('image-library-status');
            if (status) {
                if (imageLibrary && imageLibrary.state === 'fallback') {
                    status.classList.add('is-fallback');
                    I18N.setText(status, '图片合集暂时不可用，正在使用原图。');
                    window.setTimeout(function () { status.hidden = true; }, 5000);
                } else {
                    // 不设置最短等待时长；快加载/快照恢复不会为了动画额外等待。
                    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    status.setAttribute('aria-hidden', 'true');
                    status.classList.add('is-complete');
                    if (hadSnapshot || reduceMotion) status.hidden = true;
                    else window.setTimeout(function () { status.hidden = true; }, 180);
                }
            }
            document.body.classList.add('zbll-ready');
            document.body.classList.remove('zbll-has-snapshot');
        });
    }

    var defaultDragPromptAt = 0;
    function promptDefaultPublicDrag() {
        var now = Date.now();
        if (now - defaultDragPromptAt < 400) return;
        defaultDragPromptAt = now;
        ensureEditableData().catch(operationError);
    }
    document.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || !e.target.closest('.drag-handle') || activeWorkspace) return;
        e.preventDefault();
        promptDefaultPublicDrag();
    }, true);
    document.addEventListener('click', function (e) {
        // 两级选择器：第一行切分类（走 hash 路由），第二行切子分类（原地重渲染）。
        var caseChip = e.target.closest('.case-chip');
        if (caseChip) {
            var requestId = ++selectionRequestId, hash = location.hash, data = viewData();
            var nextCat = caseChip.getAttribute('data-case-category');
            var nextSub = caseChip.getAttribute('data-case-subcategory');
            if (nextCat) {
                if (nextCat === currentCategoryId() || !discardEditor()) return;
                var targetCat = findCategory(nextCat);
                // 先预热目标分类的图，再改 hash 触发路由渲染，避免切换时图片闪一下。
                preloadCategoryView(targetCat, targetCat ? activeSubcatOf(targetCat) : null).then(function () {
                    if (requestId !== selectionRequestId || hash !== location.hash || data !== viewData()) return;
                    pendingSelectionScroll = true;
                    location.hash = '#/category/' + encodeURIComponent(nextCat);
                });
            } else if (nextSub) {
                if (nextSub !== currentSubId) selectSubcategory(currentCatId, nextSub);
            }
            return;
        }
        var formulaLine = e.target.closest('.formula-line');
        if (formulaLine) { selectFormulaLine(formulaLine); return; }
        if (e.target.closest('.drag-handle') && !activeWorkspace) {
            promptDefaultPublicDrag();
            return;
        }
        var filterButton = e.target.closest('.zbll-filter-btn');
        if (filterButton) { setZbllFilter(filterButton.getAttribute('data-filter')); return; }
        var action = e.target.closest('.workspace-action'); if (action) { handleWorkspaceAction(action).catch(operationError); return; }
        var add = e.target.closest('.workspace-add'); if (add) { handleWorkspaceAction(add).catch(operationError); return; }
        if (e.target.closest('#workspace-open')) { if (inlineEditor && inlineEditor.saving) return; openWorkspaceManager().catch(operationError); return; }
    });
    document.getElementById('workspace-overlay').addEventListener('click', function (e) { if (e.target === this) { hideWorkspaceContextMenu(); showOverlay('workspace-overlay', false); } });
    document.getElementById('workspace-file').addEventListener('change', importWorkspaceFile);
    document.getElementById('workspace-overlay').addEventListener('click', function (e) { handleWorkspaceManagerClick(e).catch(operationError); });
    document.getElementById('workspace-overlay').addEventListener('contextmenu', function (e) {
        var item = e.target.closest('.workspace-list-item');
        if (!item) return;
        e.preventDefault();
        var kind = item.hasAttribute('data-public-library') ? 'public' : 'custom';
        var id = kind === 'public' ? item.dataset.publicLibrary : item.dataset.workspaceId;
        if (kind === 'public' && id === 'default') return;
        openWorkspaceContextMenu(kind, id, e.clientX, e.clientY, false);
    });
    document.getElementById('workspace-overlay').addEventListener('scroll', hideWorkspaceContextMenu, true);
    document.addEventListener('change', function (e) {
        if (e.target.classList.contains('source-repair') && inlineEditor) {
            var holder = e.target.closest('.formula-card').querySelector('.source-line-choices');
            holder.innerHTML = sourceChoices({ sourceCaseKey: e.target.value || null, visibleSourceLineIds: [] });
            return;
        }
        if (!e.target.classList.contains('inline-image-input') || !e.target.files || !e.target.files[0]) return;
        updateInlineImage(e.target.files[0], e.target.closest('.inline-image-drop'));
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var formulaLine = e.target.closest('.formula-line');
        if (!formulaLine || formulaLine.closest('.inline-editing')) return;
        e.preventDefault();
        selectFormulaLine(formulaLine);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        var chip = e.target.closest ? e.target.closest('.case-chip') : null;
        if (!chip) return;
        var buttons = Array.prototype.slice.call(chip.parentNode.querySelectorAll('.case-chip'));
        var index = buttons.indexOf(chip);
        if (index < 0) return;
        e.preventDefault();
        var nextIndex = (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        buttons.forEach(function (item, i) { item.setAttribute('tabindex', i === nextIndex ? '0' : '-1'); });
        buttons[nextIndex].focus();
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
    window.addEventListener('beforeunload', function (e) { if (workspaceWritePending || editorDirty()) { e.preventDefault(); e.returnValue = ''; } });
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
        router();
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
                if (kind === 'public' && id === 'default') return;
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
    I18N.initMenu();
    window.addEventListener('zbll-language-changed', function () {
        var x = window.scrollX, y = window.scrollY;
        var scrolls = Array.from(document.querySelectorAll('.case-bar-scroll, .source-line-choices, .workspace-list')).map(function (node) { return { node: node, left: node.scrollLeft, top: node.scrollTop }; });
        clearOwnMarkHints();
        if (currentView === 'home') renderHome();
        I18N.translate(document);
        updateWorkspaceNav();
        if (workspaceProgressState) setWorkspaceProgress(workspaceProgressState.value, workspaceProgressState.text, workspaceProgressState.message);
        initOwnMarkHints();
        scheduleWorkspaceHelpFit();
        requestAnimationFrame(function () {
            scrolls.forEach(function (item) { if (item.node.isConnected) { item.node.scrollLeft = item.left; item.node.scrollTop = item.top; } });
            window.scrollTo(x, y);
            saveRenderSnapshot();
        });
    });
    I18N.setBusy(1);
    initWorkspace().finally(function () { I18N.setBusy(-1); });
})();
