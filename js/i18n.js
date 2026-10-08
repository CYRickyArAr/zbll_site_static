/* Interface-only localization. Library data and solver identities are never translated in storage. */
(function () {
    'use strict';
    // Chinese strings are explicit, stable translation keys; missing English entries fall back to Chinese.
    var en = {
        'ZBLL公式库': 'ZBLL Library', 'ZBLL 公式库': 'ZBLL Library',
        'nav.brand': 'ZBLL Library', '语言': 'Language', '关于本站': 'About this site', '最近更新：': 'Last updated:', '关闭': 'Close',
        '公式筛选': 'Filter cases', '全部': 'All', '已学': 'Learned', '未学': 'Unlearned',
        '切换到浅色模式': 'Switch to light mode', '切换到深色模式': 'Switch to dark mode',
        '打开本地工作区': 'Open local libraries', '本地工作区': 'Local Libraries',
        '网站介绍': 'About the site', 'GitHub 仓库': 'GitHub repository', '关于作者': 'About the author',
        '注：公式实战使用过不一定代表是当前主力公式': 'An algorithm used in a recorded solve may not be the solver’s current main algorithm.',
        '本站公式整理自 ': 'Algorithms are compiled from solve reconstructions on ',
        '、': ', ', ' 的复盘记录，数据真实可靠。': ', based on actual solves.', '魔方星球': 'CubeStation',
        'WCA 主页': 'WCA profile', '粗饼主页': 'Cubing.com profile', '粗饼': 'Cubing.com',
        'bilibili 主页': 'bilibili profile', '内容仅供学习与参考': 'For learning and reference',
        '本站持续更新': 'Continuously updated', '问题反馈': 'Report an issue',
        '正在加载公式库': 'Loading algorithm library', '取消导出': 'Cancel export',
        '大神公式只读；可按 case 勾选显示，自己的公式可随时增删改。修改保存在当前浏览器。': 'Pro algorithms are read-only. Choose which to show per case and edit your own algorithms. Changes stay in this browser.',
        '导入 .zbll 文件': 'Import a .zbll file', '导入 .zbll': 'Import .zbll', '导出 .zbll': 'Export .zbll',
        '公式库': 'Libraries', '新建公式库': 'New library', '重命名': 'Rename', '删除': 'Delete',
        '默认大神版': 'Default Pro Library', '仅预览': 'Preview only', '默认大神版仅预览': 'Default Pro Library — preview only',
        '更多操作': 'More actions', '{name}的更多操作': 'More actions for {name}',
        '数据加载失败：未找到页面数据': 'Unable to load: site data is missing.',
        '当前是默认大神版（仅预览）。创建自己的公式库后即可修改，是否创建？': 'The Default Pro Library is preview-only. Create your own library to make changes?',
        '保存失败，请重试': 'Could not save. Please try again.', '有未保存的修改，放弃这些修改？': 'Discard your unsaved changes?',
        '已学习': 'Learned', '全部情况': 'All cases', '{category} 分类': 'Category {category}',
        '{scope}学习进度': '{scope} learning progress', '已学习 {learned}/{total}个情况': 'Learned {learned}/{total} cases',
        '{count}个情况': '{count} cases', '{label}，已学习 {count}': '{label}, learned {count}',
        '{label}（已学习 {count}）': '{label} (learned {count})', '切换分类': 'Choose category', '切换子分类': 'Choose subcategory',
        '分类不存在：{category}': 'Category not found: {category}', '该子分类下暂无公式': 'No algorithms in this subcategory.',
        '拖动排序': 'Drag to reorder', '点击选择图片': 'Click to choose an image', '图片预览': 'Image preview',
        '选择图片': 'Choose image', '无图': 'No image', '可以在这里写备注': 'Write notes here',
        '清除图片': 'Clear image', '恢复图片': 'Restore image', '我的': 'Mine',
        '暂无显示的公式，点编辑勾选大神公式或添加自己的公式。': 'No algorithms shown. Edit to select pro algorithms or add your own.',
        '取消': 'Cancel', '保存': 'Save', '编辑': 'Edit', '取消已学': 'Mark as unlearned', '标记已学': 'Mark as learned',
        '默认大神版不能保存排序，请先选择或新建公式库。': 'Choose or create a personal library to save the case order.',
        '处理中': 'Working', '请先选择要导出的公式库。': 'Select a library to export first.',
        '已有导出正在进行，请先等待或取消。': 'An export is already running. Please wait or cancel it.',
        '正在导出，请稍候…': 'Exporting, please wait…', '开始导出': 'Starting export', '已下载 {name}': 'Downloaded {name}',
        '已取消导出。': 'Export cancelled.', '导出失败，请重试。': 'Export failed. Please try again.',
        '请输入新建公式库名称': 'Name your new library', '我的公式库': 'My Library', '已创建：{name}': 'Created: {name}',
        '标记（可选）': 'Marks (optional)', '标记': 'Marks', '公式': 'Algorithm', '输入公式': 'Enter algorithm',
        '标记（可选），多个标记用空格分隔': 'Optional marks; separate multiple marks with spaces',
        '删除这条公式（不影响大神公式）': 'Delete this personal algorithm (pro algorithms are not affected)',
        '大神公式': 'Pro Algorithms', '我的公式': 'My Algorithms', '全选': 'Select all', '全不选': 'Select none', '＋ 添加': '＋ Add',
        '旧卡片来源未关联（不会覆盖个人内容）': 'Source case not linked (your content will be kept)', '选择对应 case': 'Choose the source case',
        '图片正在读取，请稍候': 'Reading image. Please wait.', '个人公式不能为空；不需要的行请删除。': 'Personal algorithms cannot be empty. Delete unused rows.',
        '图片读取失败': 'Could not read the image.', '暂无可恢复的图片。请选择图片，或先关联对应的 case。': 'No image to restore. Choose an image or link the source case first.',
        '正在取消导出…': 'Cancelling export…', '请先选择要重命名的公式库。': 'Select a library to rename first.', '新的公式库名称': 'New library name',
        '请先选择要删除的公式库。': 'Select a library to delete first.', '删除选中的公式库？导出的 .zbll 文件不受影响。': 'Delete the selected library? Exported .zbll files will not be affected.',
        '工作区操作失败': 'Library operation failed.', '已导入公式库：{name}': 'Imported library: {name}', '导入失败：文件格式无效': 'Import failed: invalid file format.',
        '本地公式库暂时不可用，已保留原数据，本次只能浏览默认大神版。\n{detail}': 'Local libraries are unavailable. Your data has been kept; only the Default Pro Library is available for now.\n{detail}',
        '请重试': 'Please try again.', '图片合集暂时不可用，正在使用原图。': 'The image bundle is unavailable. Using individual images.',
        '操作失败：{detail}': 'Operation failed: {detail}',
        '不是支持的 .zbll 公式库文件': 'This is not a supported .zbll library file.',
        '公式库分类数量不一致': 'The library has an incompatible category count.', '公式库分类结构无效': 'Invalid library category structure.',
        '公式库子分类结构无效': 'Invalid library subcategory structure.', '公式库来源目录无效': 'Invalid source catalog.',
        '公式库来源标识无效或重复': 'Invalid or duplicate source identifiers.', '大神公式行无效或 ID 重复': 'Invalid pro algorithm or duplicate ID.',
        'case 数据无效或 ID 重复': 'Invalid case data or duplicate ID.', '已清除图片的备份无效': 'Invalid cleared-image backup.',
        'case 来源引用无效': 'Invalid source case reference.', '显示的大神公式引用无效或重复': 'Invalid or duplicate visible pro algorithm reference.',
        '个人公式行无效或 ID 重复': 'Invalid personal algorithm or duplicate ID.', '选中公式引用无效': 'Invalid selected algorithm reference.',
        '旧公式库包含无效公式': 'The legacy library contains invalid algorithms.', '本地保存失败': 'Local save failed.',
        '当前浏览器不支持本地公式库存储': 'This browser does not support local library storage.', '请关闭其他旧版网站标签页后重试': 'Close other tabs running an older version of this site, then try again.',
        '导入的公式库': 'Imported Library', '导出已取消': 'Export cancelled', '准备公式库数据': 'Preparing library data',
        '整理图片和公式 {done}/{total}': 'Preparing images and algorithms {done}/{total}'
    };
    var zh = { 'nav.brand': 'ZBLL 公式库' };
    var shortNames = { '耿': 'Xuanyi', '杜': 'Yufang', '董': 'Yize', '藩': 'Bofan', '昆': 'Zhaokun', '懿': 'Yi', '连': 'Yunzhi', '南': 'Nahm' };
    var fullNames = {
        '耿': 'Xuanyi Geng (耿暄一)', 'Tymon': 'Tymon Kolasiński', '杜': 'Yufang Du (杜昱方)', '董': 'Yize Dong (董一泽)',
        'Feliks': 'Feliks Zemdegs', '南': 'Seung Hyuk Nahm', 'Park': 'Max Park', '藩': 'Bofan Zhang (张博藩)',
        'Leo': 'Leo Borromeo', '懿': 'Yi Shen (沈懿)', 'Matty': 'Matty Hiroto Inaba', 'Luke': 'Luke Garrett',
        '昆': 'Zhaokun Li (李昭昆)', '连': 'Yunzhi Lian (连允之)'
    };
    var language, busy = 0, key = 'zbll_language';
    try { language = localStorage.getItem(key); } catch (_) {}
    if (language !== 'zh' && language !== 'en') language = /^zh(?:-|$)/i.test((navigator.languages || [])[0] || navigator.language || 'zh') ? 'zh' : 'en';
    function own(map, name) { return Object.prototype.hasOwnProperty.call(map, name); }
    function esc(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function t(id, args) {
        var text = language === 'en' && own(en, id) ? en[id] : own(zh, id) ? zh[id] : id;
        return String(text).replace(/\{(\w+)\}/g, function (match, name) { return args && own(args, name) ? String(args[name]) : match; });
    }
    function mark(name) { return language === 'en' && own(shortNames, name) ? shortNames[name] : name; }
    function fullName(name) { if (!own(fullNames, name)) return name; var text = fullNames[name]; return language === 'en' ? text.replace(/ \([^)]*\)$/, '') : text; }
    function argsOf(node, attr) { try { return JSON.parse(node.getAttribute(attr) || '{}'); } catch (_) { return {}; } }
    function html(id, args) { return '<span data-i18n="' + esc(id) + '" data-i18n-args="' + esc(JSON.stringify(args || {})) + '">' + esc(t(id, args)) + '</span>'; }
    function attr(name, id, args) { return ' ' + name + '="' + esc(t(id, args)) + '" data-i18n-' + name + '="' + esc(id) + '" data-i18n-' + name + '-args="' + esc(JSON.stringify(args || {})) + '"'; }
    function translate(root) {
        root = root || document;
        root.querySelectorAll('[data-i18n]').forEach(function (node) { node.textContent = t(node.dataset.i18n, argsOf(node, 'data-i18n-args')); });
        ['title', 'aria-label', 'aria-valuetext', 'placeholder', 'alt'].forEach(function (name) {
            root.querySelectorAll('[data-i18n-' + name + ']').forEach(function (node) { node.setAttribute(name, t(node.getAttribute('data-i18n-' + name), argsOf(node, 'data-i18n-' + name + '-args'))); });
        });
        root.querySelectorAll('[data-solver-label]').forEach(function (node) { node.textContent = mark(node.dataset.solverLabel); });
        root.querySelectorAll('[data-solver-title]').forEach(function (node) { node.title = fullName(node.dataset.solverTitle); });
        root.querySelectorAll('[data-local-date]').forEach(function (node) { node.textContent = new Date(node.dataset.localDate).toLocaleString(language === 'en' ? 'en-US' : 'zh-CN'); });
    }
    function setText(node, id, args) {
        node.dataset.i18n = id; node.dataset.i18nArgs = JSON.stringify(args || {}); node.textContent = t(id, args);
    }
    function error(code, args) { var e = new Error(t(code, args)); e.i18nKey = code; e.i18nArgs = args || {}; return e; }
    function errorText(e, fallback) { return e && e.i18nKey ? t(e.i18nKey, e.i18nArgs) : e && e.message ? t('操作失败：{detail}', { detail: e.message }) : t(fallback || '工作区操作失败'); }
    function setBusy(delta) {
        busy = Math.max(0, busy + delta);
        var button = document.getElementById('language-toggle');
        if (button) button.disabled = !!busy;
        if (busy) closeMenu(false);
    }
    function setLanguage(next) {
        if (busy || (next !== 'zh' && next !== 'en')) return false;
        try { localStorage.setItem(key, next); } catch (_) {}
        if (next === language) return true;
        language = next;
        document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
        document.documentElement.dataset.language = language;
        window.dispatchEvent(new CustomEvent('zbll-language-changed'));
        return true;
    }
    function closeMenu(focus) {
        var menu = document.getElementById('language-menu'), button = document.getElementById('language-toggle');
        if (!menu || menu.hidden) return;
        menu.hidden = true; button.setAttribute('aria-expanded', 'false');
        if (focus) button.focus({ preventScroll: true });
    }
    function initMenu() {
        var button = document.getElementById('language-toggle'), menu = document.getElementById('language-menu');
        button.disabled = !!busy;
        button.addEventListener('click', function () {
            if (!menu.hidden) { closeMenu(true); return; }
            menu.hidden = false; button.setAttribute('aria-expanded', 'true');
            var rect = button.getBoundingClientRect();
            menu.style.top = Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8) + 'px';
            menu.style.left = Math.max(8, Math.min(rect.left + (rect.width - menu.offsetWidth) / 2, window.innerWidth - menu.offsetWidth - 8)) + 'px';
            menu.querySelectorAll('[data-language-choice]').forEach(function (item) { item.setAttribute('aria-checked', String(item.dataset.languageChoice === language)); });
            menu.querySelector('[aria-checked="true"]').focus({ preventScroll: true });
        });
        menu.addEventListener('click', function (event) {
            var item = event.target.closest('[data-language-choice]');
            if (item && setLanguage(item.dataset.languageChoice)) closeMenu(true);
        });
        document.addEventListener('pointerdown', function (event) { if (!menu.contains(event.target) && !button.contains(event.target)) closeMenu(false); });
        document.addEventListener('keydown', function (event) {
            if (menu.hidden) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeMenu(true); }
            else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) >= 0) {
                event.preventDefault(); event.stopImmediatePropagation();
                var items = Array.from(menu.querySelectorAll('button')), index = items.indexOf(document.activeElement);
                index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
                items[index].focus();
            } else if (event.key === 'Tab') closeMenu(false);
        }, true);
        window.addEventListener('resize', function () { closeMenu(false); });
    }
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.language = language;
    window.ZBLL_I18N = { t: t, html: html, attr: attr, escape: esc, mark: mark, fullName: fullName, translate: translate, setText: setText,
        error: error, errorText: errorText, setBusy: setBusy, language: function () { return language; }, setLanguage: setLanguage, initMenu: initMenu };
})();
