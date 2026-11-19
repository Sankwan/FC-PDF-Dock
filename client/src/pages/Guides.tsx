import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ChevronDown, CircleHelp, HardDrive, Lightbulb, Search, ShieldCheck, Smartphone, WifiOff } from "lucide-react";
import BackToTools from "@/components/BackToTools";
import { tools } from "@/components/ToolsSection";
import { FAQS, GUIDES, type Guide } from "@/lib/guides";
import { matchesTool } from "@/lib/toolPreferences";
import { ICT_HELP_URL } from "@/lib/support";
import { ARTICLES, articleText, articlesUsing } from "@/lib/articles";
import { ArticleCard } from "@/pages/GuideArticle";

const GROUPS = [
  { id: "official", title: "Official documents" },
  { id: "organise", title: "Organise" },
  { id: "convert", title: "Scan, convert & read" },
] as const;

const matchesGuide = (g: Guide, q: string) => {
  const tool = tools.find((t) => t.id === g.id);
  if (!q.trim()) return true;
  if (tool && matchesTool(tool, q)) return true;
  const hay = `${g.when} ${g.steps.join(" ")} ${(g.tips ?? []).join(" ")}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};

const GuideCard = ({ guide, open, onToggle }: { guide: Guide; open: boolean; onToggle: () => void }) => {
  const tool = tools.find((t) => t.id === guide.id);
  if (!tool) return null;
  const Icon = tool.icon;
  return (
    <div id={guide.id} className="scroll-mt-24 rounded-xl border border-border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`${guide.id}-body`}
        className="flex w-full items-start gap-3 p-4 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand"><Icon size={19} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">{tool.title}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{guide.when}</span>
        </span>
        <ChevronDown size={18} className={`mt-1 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={`${guide.id}-body`} className="border-t border-border px-4 pb-4 pt-3">
          <ol className="space-y-2.5">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm leading-6">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          {guide.tips?.length ? (
            <div className="mt-4 rounded-lg bg-muted p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Lightbulb size={14} /> Good to know</p>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-6">{guide.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          ) : null}
          {articlesUsing(guide.id).length ? (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step-by-step for common jobs</p>
              <ul className="space-y-1 text-sm">
                {articlesUsing(guide.id).map((a) => (
                  <li key={a.slug}><Link href={`/guides/${a.slug}`} className="inline-flex min-h-9 items-center gap-1 font-semibold text-brand underline-offset-4 hover:underline">{a.title} <ArrowRight size={13} /></Link></li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link href={tool.link} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
            Open {tool.title} <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </div>
  );
};

const Guides = () => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(typeof window !== "undefined" && window.location.hash ? [window.location.hash.slice(1)] : []));
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Arriving from a tool's "How to use" link: open and show that guide.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    setOpen((s) => new Set(s).add(id));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, []);

  const shown = useMemo(() => GUIDES.filter((g) => matchesGuide(g, query)), [query]);
  const shownArticles = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? ARTICLES.filter((a) => words.every((w) => articleText(a).includes(w))) : ARTICLES;
  }, [query]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-2 flex items-center gap-2">
          <div className="h-0.5 w-4 bg-brand" />
          <span className="text-xs font-semibold uppercase tracking-widest text-brand">Help</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Guides</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Step-by-step help for common jobs and for every tool, plus answers to common questions. Every tool page also has a <span className="font-semibold text-foreground">How to use</span> link that opens its guide here.</p>

        {/* How PDFDock works */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: HardDrive, title: "Stays on your device", text: "Files are processed in your browser. They aren't uploaded or kept by PDFDock." },
            { icon: WifiOff, title: "Works offline", text: "Once loaded, the tools keep working without internet. Set it up from the menu." },
            { icon: Smartphone, title: "Phone or computer", text: "Every tool works on phones. Add PDFDock to your home screen to open it like an app." },
          ].map(({ icon: I, title, text }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-4">
              <I size={20} className="text-brand" />
              <p className="mt-2 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>

        {/* The three steps every tool shares */}
        <div className="mt-6 rounded-xl border border-brand/30 bg-brand-tint p-4 sm:p-5">
          <p className="font-semibold">Every tool works the same way</p>
          <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            {["Pick a tool from the home page, or search for what you want to do (for example \"shrink\" or \"sign\").", "Add your file. Most tools show a live preview, so you see the result before saving.", "Tap Save or Share. Then use Keep going with this file to sign, compress or send it on."].map((t, i) => (
              <li key={i} className="flex gap-2.5"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span><span>{t}</span></li>
            ))}
          </ol>
        </div>

        {/* Search */}
        <div className="relative mt-8">
          <label htmlFor="guide-search" className="sr-only">Search the guides</label>
          <Search size={19} className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground" />
          <input id="guide-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What do you want to do? e.g. shrink, signature, table"
            className="min-h-12 w-full rounded-lg border border-input bg-card py-3 pl-10 pr-3" />
        </div>
        {query.trim() && <p role="status" className="mt-2 text-sm text-muted-foreground">{shown.length + shownArticles.length} guide{shown.length + shownArticles.length === 1 ? "" : "s"} found</p>}

        {shownArticles.length > 0 && (
          <div id="how-do-i" className="mt-8 scroll-mt-24">
            <h2 className="mb-1 text-lg font-bold">How do I…</h2>
            <p className="mb-3 text-sm text-muted-foreground">Step-by-step help for common jobs, using one or more tools.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {shownArticles.map((a) => <ArticleCard key={a.slug} article={a} />)}
            </div>
          </div>
        )}

        {shown.length > 0 && <h2 className="mb-1 mt-12 text-lg font-bold">Tool by tool</h2>}
        <div className="mt-4 space-y-8">
          {GROUPS.map((g) => {
            const list = shown.filter((guide) => tools.find((t) => t.id === guide.id)?.group === g.id);
            if (!list.length) return null;
            return (
              <div key={g.id}>
                <h3 className="mb-3 border-b border-border pb-2 font-bold text-muted-foreground">{g.title}</h3>
                <div className="space-y-2">
                  {list.map((guide) => <GuideCard key={guide.id} guide={guide} open={open.has(guide.id) || (!!query.trim() && list.length <= 2)} onToggle={() => toggle(guide.id)} />)}
                </div>
              </div>
            );
          })}
          {query.trim() && !shown.length && !shownArticles.length && (
            <p className="text-sm text-muted-foreground">No guide matches "{query}". Try a simpler word, or <button type="button" className="font-semibold text-brand underline" onClick={() => setQuery("")}>show all guides</button>.</p>
          )}
        </div>

        {/* FAQ */}
        <h2 id="questions" className="mb-3 mt-12 scroll-mt-24 border-b border-border pb-2 text-lg font-bold">Common questions</h2>
        <div className="space-y-2">
          {FAQS.map((f, i) => (
            <div key={i} className="rounded-xl border border-border bg-card">
              <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i} className="flex w-full items-center gap-3 p-4 text-left font-semibold">
                <span className="flex-1">{f.q}</span>
                <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
              </button>
              {openFaq === i && (
                <div className="border-t border-border px-4 pb-4 pt-3 text-sm leading-6">
                  <p>{f.a}</p>
                  {f.link && <Link href={f.link.href} className="mt-2 inline-flex min-h-10 items-center gap-1.5 font-semibold text-brand underline underline-offset-4">Open {f.link.label} <ArrowRight size={14} /></Link>}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <ShieldCheck size={22} className="shrink-0 text-brand" />
          <p className="flex-1 text-sm">Still stuck, or something isn't working? ICT can help. Say which tool you used and what happened, but don't attach confidential documents.</p>
          <a href={ICT_HELP_URL} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-brand px-4 text-sm font-semibold text-brand hover:bg-brand-tint"><CircleHelp size={16} /> Email ICT</a>
        </div>
      </div>
    </section>
  );
};

export default Guides;
