import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { vaults, notes, noteLinks } from '../db/schema';
import { parseMarkdownMeta } from './markdown';

export async function seedDefaultVault(
  db: DrizzleD1Database,
  d1: D1Database,
  userId: string
) {
  const now = Date.now();
  const vaultId = crypto.randomUUID();

  await db.insert(vaults).values({
    id: vaultId,
    userId,
    name: '我的第二大脑',
    description: '默认个人双链知识库',
    createdAt: now,
    updatedAt: now,
  });

  const sampleNotes = [
    {
      id: crypto.randomUUID(),
      path: '欢迎使用 Kilau Vault.md',
      title: '欢迎使用 Kilau Vault',
      content: `# 欢迎使用 Kilau Vault 👋

这是一个基于 **React + CodeMirror 6 + Hono + Cloudflare D1** 构建的 Web 端个人双链知识库系统。

## 核心特性体验
- **双向链接**：在编辑器中输入 \`[[\` 即可唤起笔记补全，例如前往 [[知识图谱与PageRank算法]] 或 [[卡片盒笔记法]]。
- **实时数学公式**：支持 LaTeX 语法，如质能方程 $E = mc^2$，或欧拉公式：
$$e^{i\\pi} + 1 = 0$$
- **Mermaid 流程图**：支持在代码块中直接渲染架构图。
- **右侧反向链接**：点击右侧边栏的「反向链接」，可以查看哪些笔记引用了当前文章，甚至发现“未链接提及”。

## 下一步推荐阅读
- [[卡片盒笔记法]]
- [[知识图谱与PageRank算法]]
- [[Cloudflare边缘计算架构]]

#入门指南 #知识管理`,
    },
    {
      id: crypto.randomUUID(),
      path: '方法论/卡片盒笔记法.md',
      title: '卡片盒笔记法',
      content: `# 卡片盒笔记法 (Zettelkasten)

卡片盒笔记法是由德国社会学家卢曼提出的一种高效知识管理方法。

## 核心原则
1. **原子化**：每张卡片只记录一个核心概念，保持独立且完整。
2. **用自己的话重写**：不要单纯复制粘贴，消化后用自己的语言表达。
3. **建立连接**：笔记的价值在于连接而非孤立存放。通过 \`[[双链]]\` 将新卡片连接到已有的知识网络中。

可以结合 [[欢迎使用 Kilau Vault]] 中的指引开始构建你的网络，并用 [[知识图谱与PageRank算法]] 来发现核心知识枢纽。

#方法论 #知识管理`,
    },
    {
      id: crypto.randomUUID(),
      path: '技术原理/知识图谱与PageRank算法.md',
      title: '知识图谱与PageRank算法',
      content: `# 知识图谱与 PageRank 算法

本系统在图谱视图中引入了图论分析算法，帮助发现个人知识库中的隐性结构。

## 1. 节点中心性 (PageRank)
通过计算笔记之间的有向引用关系，识别出被高频引用的“核心枢纽笔记”：
$$PR(u) = \\frac{1-d}{N} + d \\sum_{v \\in B_u} \\frac{PR(v)}{L(v)}$$

其中阻尼系数 $d = 0.85$。在图谱中，PageRank 值越高的节点显示半径越大。

## 2. 社群聚类 (Connected Components)
通过广度优先搜索（BFS）识别互相关联的知识子图，并为不同主题社群自动着色。

相关阅读：[[Cloudflare边缘计算架构]]、[[卡片盒笔记法]]。

#算法 #图论 #毕设亮点`,
    },
    {
      id: crypto.randomUUID(),
      path: '技术原理/Cloudflare边缘计算架构.md',
      title: 'Cloudflare边缘计算架构',
      content: `# Cloudflare 边缘计算架构

本项目采用全栈 Serverless 边缘架构进行零成本部署：

\`\`\`mermaid
graph LR
  A[用户浏览器] --> B[Cloudflare Pages 前端]
  A --> C[Cloudflare Workers API]
  C --> D[(Cloudflare D1 数据库)]
\`\`\`

- **前端**：Vite + React + CodeMirror 6 + force-graph
- **后端**：Hono 轻量级 TypeScript 框架
- **数据库**：Cloudflare D1 (SQLite) + Drizzle ORM

参见 [[欢迎使用 Kilau Vault]] 与 [[知识图谱与PageRank算法]]。

#架构 #Cloudflare`,
    },
    {
      id: crypto.randomUUID(),
      path: '方法论',
      title: '方法论',
      content: '',
      isFolder: true,
    },
    {
      id: crypto.randomUUID(),
      path: '技术原理',
      title: '技术原理',
      content: '',
      isFolder: true,
    },
  ];

  const titleToId = new Map<string, string>();
  for (const n of sampleNotes) {
    if (!n.isFolder) {
      titleToId.set(n.title, n.id);
    }
  }

  for (const n of sampleNotes) {
    if (n.isFolder) {
      await db.insert(notes).values({
        id: n.id,
        vaultId,
        path: n.path,
        title: n.title,
        content: '',
        tags: '[]',
        wordCount: 0,
        isFolder: true,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    const meta = parseMarkdownMeta(n.content);
    await db.insert(notes).values({
      id: n.id,
      vaultId,
      path: n.path,
      title: n.title,
      content: n.content,
      tags: JSON.stringify(meta.tags),
      wordCount: meta.wordCount,
      isFolder: false,
      createdAt: now,
      updatedAt: now,
    });
    await d1
      .prepare('INSERT INTO notes_fts (note_id, vault_id, title, content) VALUES (?, ?, ?, ?)')
      .bind(n.id, vaultId, n.title, n.content)
      .run();
  }

  for (const n of sampleNotes) {
    if (n.isFolder) continue;
    const meta = parseMarkdownMeta(n.content);
    for (const targetTitle of meta.links) {
      await db.insert(noteLinks).values({
        id: crypto.randomUUID(),
        vaultId,
        sourceNoteId: n.id,
        targetNoteId: titleToId.get(targetTitle) ?? null,
        targetTitle,
      });
    }
  }

  return vaultId;
}
