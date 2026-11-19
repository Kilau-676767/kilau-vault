import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { notes, noteLinks, vaults } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { buildFtsMatchQuery } from '../utils/fts';
import type { AppContext } from '../types';

export const aiRoutes = new Hono<AppContext>();

aiRoutes.use('*', authMiddleware);

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Priority 1: Call Tavily AI Search when user configures a Tavily API Key.
 */
async function performTavilySearch(
  query: string,
  tavilyApiKey: string
): Promise<WebSearchResult[]> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyApiKey.trim(),
        query,
        max_results: 5,
        search_depth: 'basic',
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        results?: { title?: string; url?: string; content?: string }[];
      };
      if (data.results && data.results.length > 0) {
        return data.results.map((r) => ({
          title: r.title || '网页结果',
          url: r.url || '',
          snippet: (r.content || '').slice(0, 300),
        }));
      }
    }
  } catch {
    // Fall through on network error
  }
  return [];
}

/**
 * Priority 3: Built-in zero-key fallback search (DuckDuckGo HTML + Wikipedia API).
 */
async function performFreeFallbackSearch(query: string): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];
  try {
    const ddgRes = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KilauVaultBot/1.0)',
        },
      }
    );
    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      const links: { url: string; title: string }[] = [];
      const snippets: string[] = [];

      let m: RegExpExecArray | null;
      while ((m = linkRegex.exec(html)) !== null && links.length < 5) {
        let rawUrl = m[1];
        const uddg = /[?&]uddg=([^&]+)/.exec(rawUrl);
        if (uddg) rawUrl = decodeURIComponent(uddg[1]);
        links.push({ url: rawUrl, title: decodeHtmlEntities(m[2]) });
      }
      while ((m = snippetRegex.exec(html)) !== null && snippets.length < 5) {
        snippets.push(decodeHtmlEntities(m[1]));
      }
      for (let i = 0; i < links.length; i++) {
        results.push({
          title: links[i].title,
          url: links[i].url,
          snippet: snippets[i] || '',
        });
      }
    }
  } catch {
    // ignore DDG failure
  }

  if (results.length < 2) {
    try {
      const hasCjk = /[\u4e00-\u9fa5]/.test(query);
      const wikiHost = hasCjk ? 'zh.wikipedia.org' : 'en.wikipedia.org';
      const searchWiki = async (q: string) => {
        const wikiRes = await fetch(
          `https://${wikiHost}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
            q
          )}&srlimit=4&format=json&utf8=1`
        );
        if (!wikiRes.ok) return [];
        const data = (await wikiRes.json()) as {
          query?: { search?: { title: string; snippet: string }[] };
        };
        return data.query?.search ?? [];
      };

      let hits = await searchWiki(query);
      if (hits.length === 0) {
        // Extract shorter keyword tokens if full sentence query had no Wikipedia matches
        const shortTokens = tokenizeQuery(query)
          .filter((t) => t.length >= 2)
          .slice(0, 3)
          .join(' ');
        if (shortTokens) {
          hits = await searchWiki(shortTokens);
        }
      }

      for (const item of hits) {
        results.push({
          title: `${item.title} - Wikipedia`,
          url: `https://${wikiHost}/wiki/${encodeURIComponent(item.title)}`,
          snippet: decodeHtmlEntities(item.snippet),
        });
      }
    } catch {
      // ignore Wikipedia failure
    }
  }

  return results.slice(0, 5);
}

/**
 * Extract web citation URLs from provider-native search responses or markdown links.
 */
function extractNativeWebSources(
  llmData: Record<string, unknown>,
  answer: string
): WebSearchResult[] {
  const seen = new Set<string>();
  const out: WebSearchResult[] = [];

  const addSource = (title: string, url: string, snippet = '') => {
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http') || seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    out.push({ title: title.trim() || cleanUrl, url: cleanUrl, snippet });
  };

  // 1. OpenAI / OpenRouter annotations
  const choices = llmData.choices as
    | {
        message?: {
          annotations?: {
            type?: string;
            url_citation?: { url?: string; title?: string };
          }[];
        };
      }[]
    | undefined;
  for (const ann of choices?.[0]?.message?.annotations ?? []) {
    if (ann.url_citation?.url) {
      addSource(ann.url_citation.title || ann.url_citation.url, ann.url_citation.url);
    }
  }

  // 2. Zhipu GLM web_search results array
  const zhipuSearch = llmData.web_search as
    | { title?: string; link?: string; content?: string }[]
    | undefined;
  for (const item of zhipuSearch ?? []) {
    if (item.link) addSource(item.title || item.link, item.link, item.content || '');
  }

  // 3. Perplexity / generic citations array
  const citations = llmData.citations as string[] | undefined;
  for (const url of citations ?? []) {
    if (typeof url === 'string') addSource(url, url);
  }

  // 4. Markdown links [title](https://...) inside answer
  const mdLinkRegex = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLinkRegex.exec(answer)) !== null && out.length < 8) {
    addSource(m[1], m[2]);
  }

  return out.slice(0, 6);
}

/**
 * Detect provider-native web search parameters based on API Base URL.
 */
function getNativeSearchParams(baseUrl: string): Record<string, unknown> | null {
  const lower = baseUrl.toLowerCase();

  if (lower.includes('deepseek.com') || lower.includes('getdeepseek.com')) {
    return {
      tools: [
        { type: 'deepseek_web_search', name: 'deepseek_web_search' },
        { type: 'deepseek_read_url', name: 'deepseek_read_url' },
      ],
    };
  }
  if (lower.includes('dashscope.aliyuncs.com')) {
    return { enable_search: true };
  }
  if (lower.includes('open.bigmodel.cn')) {
    return {
      tools: [
        {
          type: 'web_search',
          web_search: { enable: true, search_result: true },
        },
      ],
    };
  }
  if (lower.includes('api.moonshot.cn')) {
    return {
      tools: [{ type: 'builtin_function', function: { name: '$web_search' } }],
    };
  }
  if (lower.includes('openrouter.ai')) {
    return { plugins: [{ id: 'web' }] };
  }
  if (lower.includes('generativelanguage.googleapis.com')) {
    return { tools: [{ google_search: {} }] };
  }
  if (lower.includes('api.openai.com')) {
    return { web_search_options: { search_context_size: 'medium' } };
  }
  return null;
}

function tokenizeQuery(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens = new Set<string>();

  const words = lower.match(/[a-z0-9_]{2,}/g) ?? [];
  for (const w of words) tokens.add(w);

  const cjk = lower.match(/[\u4e00-\u9fa5]/g) ?? [];
  for (let i = 0; i < cjk.length; i++) {
    tokens.add(cjk[i]);
    if (i + 1 < cjk.length) {
      tokens.add(cjk[i] + cjk[i + 1]);
    }
  }

  return Array.from(tokens);
}

function scoreNoteRelevance(
  title: string,
  content: string,
  tagsJson: string,
  tokens: string[]
): number {
  if (tokens.length === 0) return 1;
  const lowerTitle = title.toLowerCase();
  const lowerContent = content.toLowerCase();
  const lowerTags = tagsJson.toLowerCase();

  let score = 0;
  for (const tk of tokens) {
    const weight = tk.length >= 2 ? 2.5 : 0.6;
    if (lowerTitle.includes(tk)) score += 6 * weight;
    if (lowerTags.includes(tk)) score += 4 * weight;

    let idx = lowerContent.indexOf(tk);
    let hits = 0;
    while (idx !== -1 && hits < 5) {
      hits++;
      idx = lowerContent.indexOf(tk, idx + tk.length);
    }
    score += hits * weight;
  }
  return score;
}

aiRoutes.post('/chat', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    question?: string;
    scope?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    webSearch?: boolean;
    tavilyApiKey?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
  }>();

  const question = body.question?.trim();
  if (!question) {
    return c.json({ error: '请输入问题' }, 400);
  }
  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return c.json({ error: '请先在设置中配置 API Key' }, 400);
  }

  const baseUrl = (body.baseUrl?.trim() || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const model = body.model?.trim() || 'deepseek-chat';
  const scope = body.scope?.trim() || 'all';

  const db = drizzle(c.env.DB);
  const userVaults = await db
    .select()
    .from(vaults)
    .where(eq(vaults.userId, userId))
    .all();

  if (userVaults.length === 0) {
    return c.json({ error: '当前账户下暂无知识库' }, 400);
  }

  const vaultMap = new Map(userVaults.map((v) => [v.id, v]));
  let targetVaultIds: string[] = [];

  if (scope === 'all') {
    targetVaultIds = userVaults.map((v) => v.id);
  } else {
    if (!vaultMap.has(scope)) {
      return c.json({ error: '指定的知识库不存在或无权限' }, 404);
    }
    targetVaultIds = [scope];
  }

  // Pre-filter candidate notes via SQLite FTS5
  const placeholders = targetVaultIds.map(() => '?').join(',');
  const ftsQuery = buildFtsMatchQuery(question);
  const candidateIds = new Set<string>();

  if (ftsQuery) {
    try {
      const ftsRows = await c.env.DB.prepare(
        `SELECT note_id FROM notes_fts WHERE vault_id IN (${placeholders}) AND notes_fts MATCH ? ORDER BY bm25(notes_fts) LIMIT 24`
      )
        .bind(...targetVaultIds, ftsQuery)
        .all<{ note_id: string }>();
      for (const r of ftsRows.results) candidateIds.add(r.note_id);
    } catch {
      // Fallback below
    }
  }

  const candidateNotes =
    candidateIds.size > 0
      ? await db
          .select()
          .from(notes)
          .where(inArray(notes.id, Array.from(candidateIds)))
          .all()
      : await db
          .select()
          .from(notes)
          .where(and(inArray(notes.vaultId, targetVaultIds), eq(notes.isFolder, false)))
          .limit(30)
          .all();

  const tokens = tokenizeQuery(question);
  const scored = candidateNotes
    .map((n) => ({
      note: n,
      score: scoreNoteRelevance(n.title, n.content, n.tags, tokens),
    }))
    .sort((a, b) => b.score - a.score);

  const topMatches = scored.slice(0, 6).filter((item, idx) => item.score > 0 || idx < 3);

  let contextText = '';
  const sources = topMatches.map(({ note, score }) => {
    const vaultName = vaultMap.get(note.vaultId)?.name ?? '知识库';
    const excerpt = note.content.slice(0, 1400);
    contextText += `\n---\n【来源: ${vaultName} / ${note.title} (${note.path})】\n${excerpt}\n`;
    return {
      noteId: note.id,
      vaultId: note.vaultId,
      vaultName,
      title: note.title,
      path: note.path,
      score: Number(score.toFixed(1)),
    };
  });

  const sourceIds = sources.map((s) => s.noteId);
  let sourceLinks: { source: string; target: string }[] = [];
  if (sourceIds.length > 1) {
    const rawLinks = await db
      .select({
        source: noteLinks.sourceNoteId,
        target: noteLinks.targetNoteId,
      })
      .from(noteLinks)
      .where(
        and(
          inArray(noteLinks.sourceNoteId, sourceIds),
          inArray(noteLinks.targetNoteId, sourceIds)
        )
      )
      .all();
    sourceLinks = rawLinks.filter((l): l is { source: string; target: string } =>
      Boolean(l.target && l.source !== l.target)
    );
  }

  const baseSystemPrompt = `你是 Kilau Vault 个人双链知识库的 AI 助手（对话自己）。
请严格优先基于以下检索到的用户个人知识库笔记内容回答问题，并在回答中自然地标明参考了哪篇笔记。${
    body.webSearch
      ? '同时已开启「联网搜索模式」，如果知识库中信息不足，请结合联网搜索结果进行补充，并在回答中标明网页来源。'
      : '如果知识库中没有足够信息，请明确说明“知识库中暂无直接记录”，再结合通用知识给出补充建议。'
  }

检索范围：${scope === 'all' ? '全部知识库' : vaultMap.get(scope)?.name ?? '指定知识库'}
相关笔记语料：
${contextText || '（当前知识库暂无笔记内容）'}`;

  const nativeSearchParams = body.webSearch ? getNativeSearchParams(baseUrl) : null;
  let webSources: WebSearchResult[] = [];

  const callLlm = async (sysPrompt: string, extraParams: Record<string, unknown> | null) => {
    const payload: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: sysPrompt },
        ...(body.history ?? []).slice(-6),
        { role: 'user', content: question },
      ],
      temperature: 0.4,
      ...(extraParams ?? {}),
    };
    return fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  };

  try {
    let llmRes: Response;
    const hasTavily = Boolean(body.webSearch && body.tavilyApiKey?.trim());

    if (hasTavily) {
      // Priority 1: Self-configured Search API (Tavily)
      webSources = await performTavilySearch(question, body.tavilyApiKey!);
      if (webSources.length > 0) {
        const tavilyPrompt = `${baseSystemPrompt}\n\n【联网实时搜索结果】：\n${webSources
          .map((w, i) => `[网页 ${i + 1}] ${w.title} (${w.url})\n摘要: ${w.snippet}`)
          .join('\n\n')}`;
        llmRes = await callLlm(tavilyPrompt, null);
      } else if (nativeSearchParams) {
        // Tavily returned empty/failed -> degrade to Priority 2 (Model native search)
        llmRes = await callLlm(baseSystemPrompt, nativeSearchParams);
        if (!llmRes.ok && llmRes.status === 400) {
          webSources = await performFreeFallbackSearch(question);
          const fallbackPrompt =
            webSources.length > 0
              ? `${baseSystemPrompt}\n\n【联网实时搜索结果】：\n${webSources
                  .map((w, i) => `[网页 ${i + 1}] ${w.title} (${w.url})\n摘要: ${w.snippet}`)
                  .join('\n\n')}`
              : baseSystemPrompt;
          llmRes = await callLlm(fallbackPrompt, null);
        }
      } else {
        webSources = await performFreeFallbackSearch(question);
        const fallbackPrompt =
          webSources.length > 0
            ? `${baseSystemPrompt}\n\n【联网实时搜索结果】：\n${webSources
                .map((w, i) => `[网页 ${i + 1}] ${w.title} (${w.url})\n摘要: ${w.snippet}`)
                .join('\n\n')}`
            : baseSystemPrompt;
        llmRes = await callLlm(fallbackPrompt, null);
      }
    } else if (body.webSearch && nativeSearchParams) {
      // Priority 2: Model API's native web search tool
      llmRes = await callLlm(baseSystemPrompt, nativeSearchParams);

      if (!llmRes.ok && (llmRes.status === 400 || llmRes.status === 422 || llmRes.status === 404)) {
        webSources = await performFreeFallbackSearch(question);
        const fallbackPrompt =
          webSources.length > 0
            ? `${baseSystemPrompt}\n\n【联网实时搜索结果】：\n${webSources
                .map((w, i) => `[网页 ${i + 1}] ${w.title} (${w.url})\n摘要: ${w.snippet}`)
                .join('\n\n')}`
            : baseSystemPrompt;
        llmRes = await callLlm(fallbackPrompt, null);
      }
    } else if (body.webSearch) {
      // Priority 3: Built-in free fallback (DuckDuckGo + Wikipedia)
      webSources = await performFreeFallbackSearch(question);
      const fallbackPrompt =
        webSources.length > 0
          ? `${baseSystemPrompt}\n\n【联网实时搜索结果】：\n${webSources
              .map((w, i) => `[网页 ${i + 1}] ${w.title} (${w.url})\n摘要: ${w.snippet}`)
              .join('\n\n')}`
          : `${baseSystemPrompt}\n\n【联网实时搜索结果】：暂未检索到相关公开网页结果。`;
      llmRes = await callLlm(fallbackPrompt, null);
    } else {
      llmRes = await callLlm(baseSystemPrompt, null);
    }

    const llmData = (await llmRes.json().catch(() => ({}))) as Record<string, unknown> & {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    if (!llmRes.ok) {
      return c.json(
        { error: llmData.error?.message || `模型接口调用失败 (${llmRes.status})` },
        502
      );
    }

    const answer = llmData.choices?.[0]?.message?.content?.trim() || '模型未返回有效内容';
    if (body.webSearch && webSources.length === 0) {
      webSources = extractNativeWebSources(llmData, answer);
    }
    return c.json({ answer, sources, sourceLinks, webSources });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? `请求大模型服务失败: ${err.message}` : '请求失败' },
      502
    );
  }
});
