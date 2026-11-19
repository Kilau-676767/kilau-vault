/**
 * Helpers for managing the SQLite FTS5 virtual table (notes_fts) in Cloudflare D1.
 */

export async function upsertNoteFts(
  d1: D1Database,
  noteId: string,
  vaultId: string,
  title: string,
  content: string
) {
  await d1.batch([
    d1.prepare('DELETE FROM notes_fts WHERE note_id = ?').bind(noteId),
    d1
      .prepare('INSERT INTO notes_fts (note_id, vault_id, title, content) VALUES (?, ?, ?, ?)')
      .bind(noteId, vaultId, title, content),
  ]);
}

export async function deleteNoteFts(d1: D1Database, noteId: string) {
  await d1.prepare('DELETE FROM notes_fts WHERE note_id = ?').bind(noteId).run();
}

/**
 * Sanitize user search string for FTS5 MATCH syntax.
 */
export function buildFtsMatchQuery(raw: string): string {
  const cleaned = raw
    .replace(/["'*(){}[\]^~:\\/-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (cleaned.length === 0) return '';
  return cleaned.map((term) => `"${term}"*`).join(' OR ');
}
