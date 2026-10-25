export interface ToolPreferences { visits: Record<string, number> }
const empty = (): ToolPreferences => ({ visits: {} });
// Account-scoped browser preferences. No file names, document contents or timestamps.
const key = (scope: string) => {
  let hash = 2166136261; for (const c of scope) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `pdfdock.tools.v1.${(hash >>> 0).toString(16)}`;
};
export function parseToolPreferences(raw: string | null): ToolPreferences {
  try {
    const parsed = JSON.parse(raw || "null"); if (!parsed || typeof parsed !== "object") return empty();
    const valid = (id: unknown): id is string => typeof id === "string" && /^[a-z][a-z0-9-]{0,59}$/.test(id);
    const visits = Object.fromEntries(Object.entries(parsed.visits && typeof parsed.visits === "object" ? parsed.visits : {}).filter(([id, n]) => valid(id) && Number.isSafeInteger(n) && Number(n) > 0).map(([id, n]) => [id, Math.min(Number(n), 1_000_000)]));
    return { visits };
  } catch { return empty(); }
}
export function readToolPreferences(scope: string): ToolPreferences { try { return parseToolPreferences(localStorage.getItem(key(scope))); } catch { return empty(); } }
export function saveToolPreferences(scope: string, value: ToolPreferences) { try { localStorage.setItem(key(scope), JSON.stringify(value)); } catch { /* Preferences continue in memory. */ } }
export const recordToolVisit = (p: ToolPreferences, id: string): ToolPreferences => ({ ...p, visits: { ...p.visits, [id]: Math.min((p.visits[id] || 0) + 1, 1_000_000) } });
export const searchText = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const matchesTool = (tool: { title: string; description: string; id: string }, query: string) => {
  const aliases: Record<string, string> = { "pdf-to-word": "docx editable export", "word-to-pdf": "docx", "scan": "camera scanner photo", "ocr-pdf": "recognize recognise searchable text", "compress-pdf": "reduce size shrink", "organize-pdf": "organize reorder arrange", "merge-pdfs": "join combine", "pdf-properties": "metadata author", "redact-pdf": "remove sensitive hide privacy", "letterhead": "official letter template" };
  const haystack = searchText(`${tool.title} ${tool.description} ${aliases[tool.id] || ""}`);
  return searchText(query).split(" ").filter(Boolean).every(token => haystack.split(" ").some(word => word.startsWith(token)));
};
