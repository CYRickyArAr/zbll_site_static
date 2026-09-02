// ZBLL 静态站点前端逻辑：hash 路由 + 首页/分类页渲染 + 子分类折叠
(function () {
    'use strict';

    var DATA = window.ZBLL_DATA;
    if (!DATA) {
        document.getElementById('app').innerHTML = '<div class="container mt-5"><div class="empty-state">数据加载失败：未找到 window.ZBLL_DATA</div></div>';
        return;
    }

    // 分类徽章颜色
    var CAT_BADGE = {
        'U': 'bg-primary',
        'T': 'bg-danger',
        'L': 'bg-warning text-dark',
        'Pi': 'bg-success',
        'S': 'bg-orange',
        'AS': 'bg-dark',
        'H': 'bg-secondary'
    };

    // 选手短标签 -> WCA 官方姓名（纯前端，用于悬浮 title；不改数据/导出脚本）
    var LABEL_TO_NAME = {
        '耿': 'Xuanyi Geng (耿暄一)',
        'Tymon': 'Tymon Kolasiński',
        '杜': 'Yufang Du (杜昱方)',
        '董': 'Yize Dong (董一泽)',
        'Feliks': 'Feliks Zemdegs',
        '南': 'Seung Hyuk Nahm',
        'Park': 'Max Park',
        '藩': 'Bofan Zhang (张博藩)',
        'Leo': 'Leo Borromeo',
        '懿': 'Yi Shen (沈懿)',
        'Matty': 'Matty Hiroto Inaba',
        'Luke': 'Luke Garrett',
        '昆': 'Zhaokun Li (李昭昆)',
        '连': 'Yunzhi Lian (连允之)'
    };

    var appEl = document.getElementById('app');

    // 当前视图标识：'home' 或 'cat:' + 分类ID（用于记住每个页面的滚动位置）
    var currentView = 'home';

    // 主题：首次跟随系统，用户切换后记住选择
    var THEME_KEY = 'zbll_theme';

    function systemTheme() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme, persist) {
        theme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        if (persist) {
            try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
        }
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

    function initThemeToggle() {
        var saved = null;
        try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
        var theme = saved === 'light' || saved === 'dark' ? saved :
            (document.documentElement.getAttribute('data-theme') || systemTheme());
        applyTheme(theme, false);
        var button = document.getElementById('theme-toggle');
        if (button) {
            button.addEventListener('click', function () {
                var current = document.documentElement.getAttribute('data-theme') || 'light';
                applyTheme(current === 'dark' ? 'light' : 'dark', true);
            });
        }
    }

    initThemeToggle();

    function getScrollKey(view) {
        return 'zbll_scroll_' + view;
    }

    function saveScroll() {
        try {
            localStorage.setItem(getScrollKey(currentView), String(window.pageYOffset || window.scrollY || 0));
        } catch (e) {}
    }

    function restoreScroll(view) {
        try {
            var y = parseInt(localStorage.getItem(getScrollKey(view)), 10) || 0;
            // 强制瞬时滚动（0 动画），覆盖浏览器「平滑滚动」偏好
            document.documentElement.style.scrollBehavior = 'auto';
            document.body.style.scrollBehavior = 'auto';
            window.scrollTo(0, y);
        } catch (e) {
            window.scrollTo(0, 0);
        }
    }

    function getCategory(catId) {
        for (var i = 0; i < DATA.categories.length; i++) {
            if (DATA.categories[i].id === catId) return DATA.categories[i];
        }
        return null;
    }

    // 子分类范围字符串，如 "H1-H4"、"U1-U6"
    function subcatRange(cat) {
        if (!cat.subcategories.length) return '';
        var first = cat.subcategories[0].id;
        var last = cat.subcategories[cat.subcategories.length - 1].id;
        return first === last ? first : first + '-' + last;
    }

    // ===== 首页 =====
    function renderHome() {
        var html = '<div class="container mt-5">';
        html += '<h1 class="text-center mb-5">ZBLL 公式数据库</h1>';

        // 选手统计条
        html += '<div class="player-stats">';
        DATA.meta.playerStats.forEach(function (p) {
            if (p.wca) {
                var hoverName = (LABEL_TO_NAME[p.label] || p.label);
                html += '<a class="player-stat-box" href="https://www.worldcubeassociation.org/persons/' + encodeURIComponent(p.wca) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(hoverName) + '">' + escapeHtml(p.label) + ' <b>' + p.count + '</b></a>';
            } else {
                html += '<span class="player-stat-box">' + escapeHtml(p.label) + ' <b>' + p.count + '</b></span>';
            }
        });
        html += '</div>';

        // 分类卡片
        html += '<div class="row row-cols-1 row-cols-md-3 g-4">';
        DATA.categories.forEach(function (cat) {
            var badge = CAT_BADGE[cat.id] || 'bg-secondary';
            var total = 0;
            cat.subcategories.forEach(function (s) { total += s.formulas.length; });
            var range = subcatRange(cat);
            html += '<div class="col">';
            html += '<a href="#/category/' + cat.id + '" class="category-card">';
            html += '<div class="card"><div class="card-body text-center">';
            html += '<h2 class="card-title">' + escapeHtml(cat.id) + '</h2>';
            html += '<img src="images/' + cat.id + '.svg" class="category-thumb" alt="' + escapeHtml(cat.id) + '">';
            html += '<p class="card-text">' + total + '个公式</p>';
            html += '<span class="badge ' + badge + '">' + escapeHtml(range) + '</span>';
            html += '</div></div></a></div>';
        });
        html += '</div></div>';

        appEl.innerHTML = html;
    }

    // ===== 分类页 =====
    function renderCategory(catId) {
        var cat = getCategory(catId);
        if (!cat) {
            appEl.innerHTML = '<div class="container"><div class="empty-state">分类不存在：' + escapeHtml(catId) + '</div></div>';
            return;
        }

        var html = '<div class="container">';

        // 面包屑
        html += '<nav aria-label="breadcrumb"><ol class="breadcrumb">';
        html += '<li class="breadcrumb-item"><a href="#/">首页</a></li>';
        html += '<li class="breadcrumb-item active">' + escapeHtml(cat.id) + ' Case</li>';
        html += '</ol></nav>';

        html += '<h1 class="category-title">' + escapeHtml(cat.id) + ' Case</h1>';

        // 子分类
        cat.subcategories.forEach(function (sub) {
            var total = sub.formulas.length;
            html += '<div class="subcategory-card" id="card-' + sub.id + '">';
            html += '<div class="sticky-header" id="header-' + sub.id + '" data-subcat="' + sub.id + '">';
            html += '<div class="d-flex justify-content-between align-items-center">';
            html += '<div class="d-flex align-items-center">';
            html += '<h3>' + escapeHtml(sub.id) + '</h3>';
            html += '<img src="images/' + sub.id + '.svg" class="subcat-thumb" alt="' + escapeHtml(sub.id) + '">';
            html += '<span class="badge bg-secondary">' + total + '个公式</span>';
            html += '</div>';
            html += '<div class="d-flex align-items-center">';
            html += '<span class="toggle-icon" id="icon-' + sub.id + '">▼</span>';
            html += '</div></div></div>';

            // 公式列表
            html += '<div class="formula-grid" id="subcat-' + sub.id + '">';
            if (sub.formulas.length) {
                html += '<div class="sortable-container">';
                sub.formulas.forEach(function (f) {
                    html += renderFormulaCard(f);
                });
                html += '</div>';
            } else {
                html += '<div class="empty-state"><p class="mb-0">该子分类下暂无公式</p></div>';
            }
            html += '</div></div>';
        });

        html += '</div>';
        appEl.innerHTML = html;

        // 恢复折叠状态
        restoreSubcategoryState(cat);
    }

    function renderFormulaCard(f) {
        var html = '<div class="sortable-item" data-id="' + escapeHtml(f.id) + '">';
        html += '<div class="formula-card">';

        html += '<div class="formula-top">';
        if (f.image) {
            html += '<img src="' + escapeHtml(f.image) + '" class="formula-image" alt="' + escapeHtml(f.id) + '" loading="lazy">';
        } else {
            html += '<div class="formula-image d-flex align-items-center justify-content-center bg-light"><span class="text-muted">无图</span></div>';
        }

        // 信息区：名称 + 备注
        html += '<div class="formula-info">';
        html += '<div class="formula-id">' + escapeHtml(f.name) + '</div>';
        if (f.notes) {
            html += '<div style="margin-top: 6px;"><pre class="formula-notes">' + escapeHtml(f.notes) + '</pre></div>';
        }
        html += '</div></div>';

        // 公式行
        if (f.lines && f.lines.length) {
            html += '<div class="formula-lines">';
            f.lines.forEach(function (line) {
                html += '<div class="formula-line">';
                html += '<span class="formula-line-alg">' + escapeHtml(line.alg) + '</span>';
                if (line.marks && line.marks.length) {
                    html += '<span class="formula-marks-group">';
                    line.marks.forEach(function (mark) {
                        html += '<span class="formula-marks">' + escapeHtml(mark) + '</span>';
                    });
                    html += '</span>';
                }
                html += '</div>';
            });
            html += '</div>';
        }

        // 标签
        if (f.tags && f.tags.length) {
            html += '<div class="tags-container">';
            f.tags.forEach(function (tag) {
                html += '<span class="badge bg-secondary">' + escapeHtml(tag) + '</span>';
            });
            html += '</div>';
        }

        html += '</div></div>';
        return html;
    }

    // ===== 子分类折叠 =====
    function toggleSubcategory(subcatId) {
        var content = document.getElementById('subcat-' + subcatId);
        var icon = document.getElementById('icon-' + subcatId);
        var header = document.getElementById('header-' + subcatId);
        if (!content || !icon || !header) return;

        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▼';
            header.classList.remove('sticky-header-collapsed');
            try { localStorage.setItem('subcat_' + subcatId, 'open'); } catch (e) {}
        } else {
            content.style.display = 'none';
            icon.textContent = '▶';
            header.classList.add('sticky-header-collapsed');
            try { localStorage.setItem('subcat_' + subcatId, 'closed'); } catch (e) {}
        }
    }

    function restoreSubcategoryState(cat) {
        cat.subcategories.forEach(function (sub) {
            var content = document.getElementById('subcat-' + sub.id);
            var icon = document.getElementById('icon-' + sub.id);
            var header = document.getElementById('header-' + sub.id);
            var saved = null;
            try { saved = localStorage.getItem('subcat_' + sub.id); } catch (e) {}
            if (saved === 'open') {
                content.style.display = 'block';
                icon.textContent = '▼';
                header.classList.remove('sticky-header-collapsed');
            } else {
                content.style.display = 'none';
                icon.textContent = '▶';
                header.classList.add('sticky-header-collapsed');
            }
        });
    }

    // ===== 路由 =====
    function router() {
        var hash = location.hash || '#/';
        var m = hash.match(/^#\/category\/([A-Za-z]+)$/);
        var nextView = m ? ('cat:' + m[1]) : 'home';

        // 切换前保存当前视图的滚动位置
        saveScroll();

        if (m) {
            renderCategory(m[1]);
        } else {
            renderHome();
        }

        currentView = nextView;

        // 渲染完成后恢复目标视图上次的滚动位置
        requestAnimationFrame(function () {
            restoreScroll(nextView);
        });
    }

    // 事件委托：子分类折叠点击
    document.addEventListener('click', function (e) {
        var header = e.target.closest('.sticky-header');
        if (header && header.dataset.subcat) {
            toggleSubcategory(header.dataset.subcat);
        }
    });

    // 滚动时防抖保存当前位置（覆盖刷新、直接关闭页面等未触发路由切换的场景）
    var scrollTimer = null;
    window.addEventListener('scroll', function () {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(saveScroll, 150);
    });

    window.addEventListener('hashchange', router);
    document.addEventListener('DOMContentLoaded', router);
    // 若 DOM 已就绪，立即执行
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        router();
    }

    // ===== 工具 =====
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
})();
