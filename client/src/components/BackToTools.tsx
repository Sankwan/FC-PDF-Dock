import { Link, useLocation } from "wouter";
import { ArrowLeft, CircleHelp } from "lucide-react";
import { tools } from "@/components/ToolsSection";
import { guideFor } from "@/lib/guides";

/** Top of every tool page: back to the tools, and this tool's guide. */
const BackToTools = () => {
  const [location] = useLocation();
  const tool = tools.find((t) => t.link === location);
  const guide = tool && guideFor(tool.id);
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <Link href="/#tools" className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-brand">
        <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
        Back to All Tools
      </Link>
      {guide && (
        <Link href={`/guides#${guide.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-brand-tint">
          <CircleHelp size={16} /> How to use
        </Link>
      )}
    </div>
  );
};

export default BackToTools;
