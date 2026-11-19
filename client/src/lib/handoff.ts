/**
 * Passes files from one tool to another in this tab (e.g. Merge → Organise
 * pages, or a finished file → "Next: Sign"). Held in memory only and taken
 * once, by the page it was sent to.
 */
export interface Handoff {
  files: File[];
  outputName?: string;
  from?: string;
  /** the route it's meant for */
  to?: string;
  /** "next": sent from a result's Next buttons; any tool's file picker takes it */
  via?: "next";
}

let pending: Handoff | null = null;

export const handOff = (h: Handoff) => { pending = h; };

/** Takes the pending handoff if it's meant for `path` (or for anyone). */
export const takeHandoff = (path?: string, via?: Handoff["via"]): Handoff | null => {
  const h = pending;
  if (!h || (h.to && path && h.to !== path) || (via && h.via !== via)) return null;
  pending = null;
  return h;
};
