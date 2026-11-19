# Kilau Vault · 个人双链知识库与图谱系统

基于 **React + CodeMirror 6 + force-graph + Hono + Cloudflare D1** 构建的 Web 端双链知识库毕业设计项目，支持全栈免费部署于 Cloudflare 边缘网络。

## 核心功能模块
1. **账户与多知识库系统**：JWT 鉴权、PBKDF2 密码哈希、多 Vault 切换与创建、新用户自动初始化示例知识库。
2. **工作区与文件管理**：树形目录（新建/重命名/删除）、多标签页、源码/分屏/阅读三模式切换、每日日记（Daily Note）、一键打包导出 `.zip`。
3. **Markdown 编辑器**：基于 CodeMirror 6，支持语法高亮、`[[` 双链智能自动补全、LaTeX 数学公式（KaTeX）、Mermaid 流程图实时渲染。
4. **双向链接引擎**：自动解析 `[[双链]]` 与 `#标签`；右侧边栏展示**反向链接（已链接提及）**与**未链接提及（支持一键转为双链）**。
5. **知识图谱可视化与图算法分析**：基于 `force-graph` 的交互式力导向图谱，后端实时计算 **PageRank 核心枢纽节点**、**节点度中心性**、**BFS 社群聚类着色**、**孤立节点检测**与**网络密度**。
6. **快速检索、数据看板与公开分享**：`Ctrl/Cmd + P` 全局检索面板、60 天活跃热力图看板、支持设置密码与有效期的公开分享短链（`/share/:code`）。

---

## 本地运行指南

### 1. 启动后端 (Cloudflare Workers + 本地 D1)
```bash
cd backend
npm install
npx wrangler d1 migrations apply web_obsidian_db --local --yes
npm run dev
# 后端运行在 http://127.0.0.1:8787
```

### 2. 启动前端 (Vite + React)
```bash
cd frontend
npm install
npm run dev
# 前端运行在 http://localhost:5173 (已配置 /api 代理至 8787)
```

---

## 部署到 Cloudflare 免费服务

1. **创建线上 D1 数据库**：
   ```bash
   cd backend
   npx wrangler login
   npx wrangler d1 create web_obsidian_db
   # 将输出的 database_id 填入 backend/wrangler.toml
   npx wrangler d1 migrations apply web_obsidian_db --remote --yes
   npm run deploy
   ```
2. **部署前端到 Cloudflare Pages**：
   - 将代码推送至 GitHub，在 Cloudflare Dashboard -> Pages 中连接仓库。
   - 构建目录：`frontend`，构建命令：`npm run build`，输出目录：`dist`。
   - 设置环境变量 `VITE_API_URL` 为你的 Workers 线上域名即可。
