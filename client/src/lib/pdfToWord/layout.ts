/** Independent geometry-to-document reconstruction. Coordinates are points, top-down. */
export interface WordSpan { text: string; x: number; y: number; width: number; size: number; bold?: boolean; italic?: boolean }
export interface WordLine { spans: WordSpan[]; y: number; size: number; cells: WordSpan[][] }
export type WordBlock = { type: "paragraph"; lines: WordLine[] } | { type: "table"; rows: WordSpan[][][] };
export const spanText = (spans: WordSpan[]) => spans.map((s, i) => (i && s.x - (spans[i - 1].x + spans[i - 1].width) > s.size * .15 && !/^\s/.test(s.text) ? " " : "") + s.text).join("").trim();

export function reconstructPage(input: WordSpan[]): WordBlock[] {
  const spans = input.filter(s => s.text.trim() && Number.isFinite(s.x + s.y + s.size)).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: WordLine[] = [];
  for (const span of spans) {
    let line = lines.slice(-4).find(l => Math.abs(l.y - span.y) <= Math.max(2, Math.min(l.size, span.size) * .3));
    if (!line) { line = { spans: [], y: span.y, size: span.size, cells: [] }; lines.push(line); }
    line.spans.push(span); line.size = Math.max(line.size, span.size);
  }
  for (const line of lines) {
    line.spans.sort((a, b) => a.x - b.x);
    for (const span of line.spans) {
      const cell = line.cells.at(-1), previous = cell?.at(-1);
      if (!previous || span.x - previous.x - previous.width > Math.max(18, span.size * 1.6)) line.cells.push([span]);
      else cell!.push(span);
    }
  }
  lines.sort((a, b) => a.y - b.y);
  const blocks: WordBlock[] = [];
  for (let i = 0; i < lines.length;) {
    const first = lines[i];
    // Conservative table detection: repeated column starts, close rows and at
    // least three rows. Two prose columns must never become a Word table.
    const count = first.cells.length;
    let end = i + 1;
    if (count >= 2) while (end < lines.length) {
      const next = lines[end];
      if (next.cells.length !== count || next.y - lines[end - 1].y > first.size * 3.5 || next.cells.some((c, j) => Math.abs(c[0].x - first.cells[j][0].x) > 10)) break;
      end++;
    }
    const candidate = lines.slice(i, end);
    const numericColumn = candidate.slice(1).some(l => l.cells.slice(1).some(c => /^[\d,.$%()\s+-]+$/.test(spanText(c))));
    if (end - i >= 3 && count >= 2 && numericColumn) {
      blocks.push({ type: "table", rows: candidate.map(l => l.cells) }); i = end; continue;
    }
    // Multi-column prose is read by column, not across the page. Only split
    // sustained wide gutters; short headings and table cells remain intact.
    if (count === 2 && first.cells[1][0].x - (first.cells[0].at(-1)!.x + first.cells[0].at(-1)!.width) > 30) {
      let stop = i + 1;
      while (stop < lines.length && lines[stop].cells.length === 2 && Math.abs(lines[stop].cells[1][0].x - first.cells[1][0].x) < 12 && lines[stop].y - lines[stop - 1].y < first.size * 6) stop++;
      if (stop - i >= 3) {
        for (let column = 0; column < 2; column++) for (const l of lines.slice(i, stop)) blocks.push({ type: "paragraph", lines: [{ ...l, spans: l.cells[column], cells: [l.cells[column]] }] });
        i = stop; continue;
      }
    }
    const previous = blocks.at(-1);
    const previousLine = previous?.type === "paragraph" ? previous.lines.at(-1) : undefined;
    const list = /^\s*(?:[•●▪–-]|\d+[.)])\s/.test(spanText(first.spans));
    if (previous?.type === "paragraph" && previousLine && !list && first.cells.length === 1 && previousLine.cells.length === 1 && Math.abs(first.size - previousLine.size) < 1 && Math.abs(first.spans[0].x - previousLine.spans[0].x) < 8 && first.y - previousLine.y < first.size * 1.65 && !/[.!?:;]$/.test(spanText(previousLine.spans))) previous.lines.push(first);
    else blocks.push({ type: "paragraph", lines: [first] });
    i++;
  }
  return blocks;
}
