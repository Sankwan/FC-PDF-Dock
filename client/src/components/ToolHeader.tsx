import BackToTools from "@/components/BackToTools";

/** The title block every tool page opens with. */
const ToolHeader = ({ category, title, description, children }: { category: string; title: string; description: string; children?: React.ReactNode }) => (
  <>
    <BackToTools />
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-0.5 w-4 bg-brand" />
          <span className="text-xs font-semibold uppercase tracking-widest text-brand">{category}</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  </>
);

export default ToolHeader;
