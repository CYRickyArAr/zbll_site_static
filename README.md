# ZBLL 公式数据库（静态版）

ZBLL（魔方顶层公式）学习网站的**纯静态只读版**，可直接部署到 GitHub Pages。

- 472 条 ZBLL 公式全集，含图片、多行公式与选手实战标注。
- 分类：H（40 条）、U/T/L/Pi/S/AS（各 72 条）。
- 数据来源：原 Flask + SQLite 项目 `zbll_database_6.0_全公式` 一次性导出。

## 目录结构

```
index.html       入口（SPA，hash 路由）
data.js          静态数据 window.ZBLL_DATA
css/style.css    样式
js/app.js        hash 路由 + 渲染 + 子分类折叠
images/          472 张公式 SVG
```

## 本地预览

直接双击 `index.html`（`file://`），或启动静态服务器：

```bash
python -m http.server 8000
# 打开 http://localhost:8000
```

## 部署到 GitHub Pages

1. 将本目录推送到 GitHub 仓库（`main` 分支）。
2. 仓库 Settings → Pages → Source 选 **Deploy from a branch** → 分支 `main`、目录 `/ (root)` → Save。
3. 访问 `https://<username>.github.io/<仓库名>/`。

注意：所有资源均用**相对路径**，且 `.nojekyll` 已禁用 Jekyll 处理。

## 重新导出数据

当原数据库 `data/zbll.db` 更新后，运行导出脚本重新生成 `data.js` 与 `images/`：

```
原项目 .workbuddy/intermediate/export_static/export_data.py
```

（脚本只读原库，产出写到本目录。）
