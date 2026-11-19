import { useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { handOff } from "@/lib/handoff";

/** Common follow-ups for a finished PDF, in the order people usually do them. */
const NEXT = [
  { to: "/sign-pdf", label: "Sign" },
  { to: "/compress-pdf", label: "Compress" },
  { to: "/merge-pdfs", label: "Merge with others" },
  { to: "/page-numbers", label: "Page numbers" },
  { to: "/headers-footers", label: "Headers & footers" },
  { to: "/watermark-pdf", label: "Watermark" },
  { to: "/protect-pdf", label: "Password-protect" },
];

/** "Keep going with this file": opens another tool with the result already loaded. */
const NextSteps = ({ file }: { file: File }) => {
  const [location, navigate] = useLocation();
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return null;
  const options = NEXT.filter((n) => n.to !== location).slice(0, 5);
  return (
    <nav aria-label="Next steps" className="pt-1">
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Keep going with this file</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((n) => (
          <button key={n.to} type="button"
            onClick={() => { handOff({ files: [file], to: n.to, via: "next" }); navigate(n.to); window.scrollTo({ top: 0 }); }}
            className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:border-brand hover:text-brand">
            {n.label} <ArrowRight size={12} aria-hidden />
          </button>
        ))}
      </div>
    </nav>
  );
};

export default NextSteps;
