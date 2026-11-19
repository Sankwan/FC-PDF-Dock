import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { PagePreview as Preview } from "@/lib/livePreview";

interface Props {
  preview: Preview | null;
  busy?: boolean;
  error?: string | null;
  page: number;
  pageCount: number;
  onPage?: (n: number) => void;
  caption?: string;
  /** Drawn over the page, sized in the page's own proportions (cqw units). */
  children?: React.ReactNode;
}

/** A live preview of one page, with previous/next when the file has several. */
const PagePreview = ({ preview, busy, error, page, pageCount, onPage, caption = "Live preview", children }: Props) => (
  <figure className="rounded-xl border border-border bg-muted p-3">
    <div
      className="relative mx-auto w-full max-w-[340px] overflow-hidden bg-white shadow-sm"
      style={{ aspectRatio: preview ? `${preview.width} / ${preview.height}` : "1 / 1.414", containerType: "inline-size" }}
    >
      {preview && <img src={preview.url} alt={`Preview of page ${page}`} className="h-full w-full select-none" draggable={false} />}
      {preview && children}
      {(!preview || busy) && !error && (
        <span className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full ${preview ? "bg-card/90 shadow" : "inset-0 m-auto"}`} aria-hidden>
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </span>
      )}
      {error && <p className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-destructive">{error}</p>}
    </div>
    <figcaption className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
      {onPage && pageCount > 1 && (
        <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page"
          className="grid h-9 w-9 place-items-center rounded-md hover:bg-card disabled:opacity-30"><ChevronLeft size={16} /></button>
      )}
      <span className="tabular-nums">{caption}{pageCount ? ` · page ${page} of ${pageCount}` : ""}</span>
      {onPage && pageCount > 1 && (
        <button type="button" onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount} aria-label="Next page"
          className="grid h-9 w-9 place-items-center rounded-md hover:bg-card disabled:opacity-30"><ChevronRight size={16} /></button>
      )}
    </figcaption>
  </figure>
);

export default PagePreview;
