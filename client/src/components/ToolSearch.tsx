import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { visibleTools } from "./ToolsSection";
import { matchesTool } from "@/lib/toolPreferences";
import { useToolPreferences } from "@/context/ToolPreferences";

export default function ToolSearch() {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const { preferences } = useToolPreferences();
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(v => !v); }
    };
    window.addEventListener("keydown", handle); return () => window.removeEventListener("keydown", handle);
  }, []);
  const results = visibleTools.filter(t => matchesTool(t, query)).sort((a, b) => (preferences.visits[b.id] || 0) - (preferences.visits[a.id] || 0));
  return <><button type="button" onClick={() => { setQuery(""); setOpen(true); }} aria-label="Search tools" aria-keyshortcuts="Control+K Meta+K" title="Search tools (Ctrl or Command + K)" className="flex h-11 items-center gap-2 rounded-lg px-3 text-white hover:bg-white/10"><Search size={20} /><span className="hidden text-sm font-medium sm:inline">Search tools</span><kbd className="hidden rounded border border-white/30 px-1.5 py-0.5 text-xs text-white/80 lg:inline">⌘ / Ctrl K</kbd></button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="w-[calc(100%-2rem)] max-w-xl gap-3 p-5">
      <DialogTitle>Find a tool</DialogTitle><DialogDescription>Search by name or task. Your most-used tools appear first.</DialogDescription>
      <label htmlFor="global-tool-search" className="sr-only">Search tools by name or task</label><input id="global-tool-search" type="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try scan, reduce size or PDF to Word" className="w-full rounded-lg border border-input bg-background px-3 py-3" />
      <p role="status" className="type-support text-muted-foreground">{results.length} tools found</p>
      <div className="max-h-[50vh] overflow-y-auto">{results.map(tool => <Link key={tool.id} href={tool.link} onClick={() => setOpen(false)} className="flex min-h-14 items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted"><tool.icon size={19} className="shrink-0 text-brand"/><span className="type-tool-title min-w-0 flex-1">{tool.title}</span></Link>)}{!results.length && <p className="type-support py-5 text-muted-foreground">No matching tools. Try scan, merge or Word.</p>}</div>
    </DialogContent></Dialog>
  </>;
}
