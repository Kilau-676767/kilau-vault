export interface ParsedMarkdownMeta {
  links: string[];
  tags: string[];
  wordCount: number;
}

/**
 * Strip fenced code blocks and inline code so we don't accidentally extract
 * [[links]] or #tags from code snippets.
 */
function stripCode(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '');
}

export function parseMarkdownMeta(content: string): ParsedMarkdownMeta {
  const cleaned = stripCode(content);

  // 1. Extract [[WikiLinks]], supporting [[Title|Alias]] and [[Title#Section]]
  const linkSet = new Set<string>();
  const wikiLinkRegex = /\[\[([^[\]\n]+?)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = wikiLinkRegex.exec(cleaned)) !== null) {
    let raw = match[1].trim();
    const pipeIdx = raw.indexOf('|');
    if (pipeIdx !== -1) raw = raw.slice(0, pipeIdx);
    const hashIdx = raw.indexOf('#');
    if (hashIdx !== -1) raw = raw.slice(0, hashIdx);
    const title = raw.trim();
    if (title) {
      linkSet.add(title);
    }
  }

  // 2. Extract #tags (must be preceded by start-of-line or whitespace, not heading #)
  const tagSet = new Set<string>();
  const tagRegex = /(?:^|\s)#([a-zA-Z0-9_\-\u4e00-\u9fa5/]+)/g;
  while ((match = tagRegex.exec(cleaned)) !== null) {
    const tag = match[1].trim();
    if (tag && !/^\d+$/.test(tag)) {
      tagSet.add(tag);
    }
  }

  // 3. Word count (CJK characters + space-separated words)
  const cjkMatches = content.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || [];
  const withoutCjk = content.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, ' ');
  const latinWords = withoutCjk
    .replace(/[#*`>\[\]()!|_-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const wordCount = cjkMatches.length + latinWords.length;

  return {
    links: Array.from(linkSet),
    tags: Array.from(tagSet),
    wordCount,
  };
}

export function extractSnippet(content: string, needle: string, radius = 60): string {
  const lowerContent = content.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const idx = lowerContent.indexOf(lowerNeedle);
  if (idx === -1) return content.slice(0, radius * 2).replace(/\n+/g, ' ');

  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + needle.length + radius);
  let snippet = content.slice(start, end).replace(/\n+/g, ' ').trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  return snippet;
}
