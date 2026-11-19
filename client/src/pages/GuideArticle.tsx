import { useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, ChevronDown, CircleHelp, Clock, Lightbulb, ShieldCheck } from "lucide-react";
import { tools } from "@/components/ToolsSection";
import { articleFor, readMinutes, type Article } from "@/lib/articles";
import { ICT_HELP_URL } from "@/lib/support";
import NotFound from "@/pages/not-found";

const toolById = (id: string) => tools.find((t) => t.id === id);

const OpenTool = ({ id }: { id: string }) => {
  const tool = toolById(id);
  if (!tool) return null;
  return (
    <Link href={tool.link} className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-brand/40 bg-card px-3 text-sm font-semibold text-brand hover:bg-brand-tint">
      Open {tool.title} <ArrowRight size={14} />
    </Link>
  );
};

export const ArticleCard = ({ article }: { article: Article }) => (
  <Link href={`/guides/${article.slug}`} className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand/50">
    <span className="font-semibold text-foreground group-hover:text-brand">{article.title}</span>
    <span className="mt-1 flex-1 text-sm text-muted-foreground">{article.summary}</span>
    <span className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1"><Clock size={13} /> {readMinutes(article)} min read</span>
      <span className="ml-auto inline-flex items-center gap-1 font-semibold text-brand">Read guide <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
    </span>
  </Link>
);

const GuideArticle = () => {
  const [, params] = useRoute("/guides/:slug");
  const article = params && articleFor(params.slug);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  if (!article) return <NotFound />;
  let stepNo = 0;

  return (
    <article className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/guides" className="inline-flex min-h-11 items-center gap-1.5 font-semibold hover:text-brand">
            <ArrowLeft size={14} /> All guides
          </Link>
        </nav>

        <div className="mb-2 flex items-center gap-2">
          <div className="h-0.5 w-4 bg-brand" />
          <span className="text-xs font-semibold uppercase tracking-widest text-brand">How do I…</span>
        </div>
        <h1 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">{article.title}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{article.summary}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"><Clock size={13} /> {readMinutes(article)} min read</span>
          <span className="text-xs text-muted-foreground">Tools used:</span>
          {article.tools.map((id) => {
            const t = toolById(id);
            if (!t) return null;
            const I = t.icon;
            return (
              <Link key={id} href={t.link} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold hover:border-brand/50 hover:text-brand">
                <I size={13} /> {t.title}
              </Link>
            );
          })}
        </div>

        <p className="mt-6 leading-7">{article.intro}</p>

        {article.why && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">{article.why.heading}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">{article.why.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        )}

        {article.sections.map((s, si) => (
          <section key={si} className="mt-8">
            <h2 className="mb-3 border-b border-border pb-2 text-lg font-bold">{s.heading}</h2>
            {s.text && <p className="mb-3 leading-7">{s.text}</p>}
            {s.steps?.length ? (
              <ol className="space-y-4">
                {s.steps.map((st, i) => {
                  stepNo += 1;
                  return (
                    <li key={i} className="flex gap-3 leading-7">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{stepNo}</span>
                      <div className="min-w-0">
                        <p>{st.text}</p>
                        {st.tool && <OpenTool id={st.tool} />}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </section>
        ))}

        {article.tips?.length ? (
          <div className="mt-8 rounded-xl bg-muted p-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Lightbulb size={14} /> Good to know</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6">{article.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        ) : null}

        {article.faqs?.length ? (
          <section className="mt-8">
            <h2 className="mb-3 border-b border-border pb-2 text-lg font-bold">Questions</h2>
            <div className="space-y-2">
              {article.faqs.map((f, i) => (
                <div key={i} className="rounded-xl border border-border bg-card">
                  <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i} className="flex w-full items-center gap-3 p-4 text-left font-semibold">
                    <span className="flex-1">{f.q}</span>
                    <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                  </button>
                  {openFaq === i && <p className="border-t border-border px-4 pb-4 pt-3 text-sm leading-6">{f.a}</p>}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {article.related.length ? (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-bold">Related guides</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {article.related.map((slug) => {
                const r = articleFor(slug);
                return r ? (
                  <Link key={slug} href={`/guides/${slug}`} className="group rounded-xl border border-border bg-card p-3 text-sm font-semibold hover:border-brand/50 hover:text-brand">
                    {r.title} <ArrowRight size={13} className="inline transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : null;
              })}
            </div>
          </section>
        ) : null}

        <div className="mt-10 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <ShieldCheck size={22} className="shrink-0 text-brand" />
          <p className="flex-1 text-sm">Didn't solve it? ICT can help. Say what you were trying to do and what happened, but don't attach confidential documents.</p>
          <a href={ICT_HELP_URL} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-brand px-4 text-sm font-semibold text-brand hover:bg-brand-tint"><CircleHelp size={16} /> Email ICT</a>
        </div>
      </div>
    </article>
  );
};

export default GuideArticle;
