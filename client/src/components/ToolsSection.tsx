import { Link } from "wouter";
import {
  Combine, Scissors, LayoutGrid, FileDown, ScanLine, ImagePlus, Images, FileType2, FileText,
  TextSearch, FileBadge2, Stamp, PenLine, ShieldCheck, EyeOff, FilePenLine, ListChecks, QrCode, Image, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Search, Clock3 } from "lucide-react";
import { useToolPreferences } from "@/context/ToolPreferences";
import { matchesTool } from "@/lib/toolPreferences";

export interface Tool {
  id: string;
  title: string;
  description: string;
  link: string;
  icon: LucideIcon;
  group: "organise" | "convert" | "official";
  isNew?: boolean;
}

export const tools: Tool[] = [
  { id: "pdf-properties", title: "PDF properties", description: "View, edit or clear the title, author and other document properties.", link: "/pdf-properties", icon: FilePenLine, group: "official", isNew: true },
  { id: "pdf-forms", title: "PDF forms", description: "Fill interactive form fields and export their values.", link: "/pdf-forms", icon: ListChecks, group: "official", isNew: true },
  { id: "qr-codes", title: "QR codes", description: "Create a QR image or read a code from a picture on this device.", link: "/qr-codes", icon: QrCode, group: "official", isNew: true },
  { id: "convert-images", title: "Convert images", description: "Convert HEIC, TIFF and other images to JPG, PNG or WebP.", link: "/convert-images", icon: Image, group: "convert", isNew: true },
  { id: "merge-pdfs", title: "Merge PDFs", description: "Combine several PDFs into one, in the order you choose.", link: "/merge-pdfs", icon: Combine, group: "organise" },
  { id: "split-pdf", title: "Split PDF", description: "Pull out pages or split a PDF into separate files.", link: "/split-pdf", icon: Scissors, group: "organise" },
  { id: "organize-pdf", title: "Organise pages", description: "Reorder, rotate, delete or copy pages, with a preview of every page.", link: "/organize-pdf", icon: LayoutGrid, group: "organise", isNew: true },
  { id: "compress-pdf", title: "Compress PDF", description: "Shrink PDFs for email and WhatsApp. Text stays sharp and searchable.", link: "/compress-pdf", icon: FileDown, group: "organise" },

  { id: "scan", title: "Scan document", description: "Use your phone camera to scan papers into a clean PDF, then save or share it.", link: "/scan", icon: ScanLine, group: "convert", isNew: true },
  { id: "image-to-pdf", title: "Image to PDF", description: "Turn photos and images into a PDF.", link: "/image-to-pdf", icon: ImagePlus, group: "convert" },
  { id: "pdf-to-image", title: "PDF to Image", description: "Save PDF pages as JPG, PNG or WebP images.", link: "/pdf-to-image", icon: Images, group: "convert" },
  { id: "word-to-pdf", title: "Word to PDF", description: "Convert .docx documents to PDF on this device.", link: "/word-to-pdf", icon: FileType2, group: "convert" },
  { id: "pdf-to-word", title: "PDF to Word", description: "Create editable text or page images in Word, on this device.", link: "/pdf-to-word", icon: FileText, group: "convert" },
  { id: "ocr-pdf", title: "OCR PDF", description: "Make scanned PDFs searchable so you can find and copy text.", link: "/ocr-pdf", icon: TextSearch, group: "convert" },

  { id: "letterhead", title: "Letterhead", description: "Put the official FC letterhead on a letter, or get a blank letterhead for Word.", link: "/letterhead", icon: FileBadge2, group: "official", isNew: true },
  { id: "watermark-pdf", title: "Watermark", description: "Mark pages CONFIDENTIAL, DRAFT, CERTIFIED TRUE COPY or your own text.", link: "/watermark-pdf", icon: Stamp, group: "official" },
  { id: "sign-pdf", title: "Sign PDF", description: "Draw your signature and place it. Later, check if a signed file was changed.", link: "/sign-pdf", icon: PenLine, group: "official" },
  { id: "redact-pdf", title: "Redact PDF", description: "Permanently black out Ghana Card numbers, phone numbers and other personal details.", link: "/redact-pdf", icon: EyeOff, group: "official", isNew: true },
  { id: "protect-pdf", title: "Protect PDF", description: "Add a password, or stop others printing, copying or editing.", link: "/protect-pdf", icon: ShieldCheck, group: "official" },
];

const GROUPS: { id: Tool["group"]; title: string; blurb: string }[] = [
  { id: "official", title: "Official documents", blurb: "Letterhead, signatures, redaction and protection" },
  { id: "organise", title: "Organise", blurb: "Combine, split, rearrange and shrink" },
  { id: "convert", title: "Scan & convert", blurb: "Paper, photos, Word and PDF" },
];

export const visibleTools = tools;

const ToolCard = ({ tool }: { tool: Tool }) => {
  const Icon = tool.icon;
  return <Link href={tool.link} className="group flex min-h-40 min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand/60 sm:min-h-0 sm:flex-row sm:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand"><Icon size={20} strokeWidth={1.9} /></span>
      <span className="min-w-0 flex-1"><span className="type-tool-title block">{tool.title}</span><span className="type-support mt-1.5 hidden text-muted-foreground sm:block">{tool.description}</span></span>
  </Link>;
};

export default function ToolsSection() {
  const [query, setQuery] = useState("");
  const { preferences, clearUsage } = useToolPreferences();
  const filtered = visibleTools.filter(t => matchesTool(t, query));
  const frequent = visibleTools.filter(t => preferences.visits[t.id]).sort((a, b) => preferences.visits[b.id] - preferences.visits[a.id]).slice(0, 4);
  const shortcuts = (list: Tool[]) => <div className="flex flex-wrap gap-2">{list.map(t => <Link key={t.id} href={t.link} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:border-brand hover:text-brand"><t.icon size={16} />{t.title}</Link>)}</div>;
  return <section id="tools" className="scroll-mt-20 bg-background py-10"><div className="container mx-auto space-y-8 px-4 sm:px-6 lg:px-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="type-section-title">Your tools</h2><p className="type-support mt-1 text-muted-foreground">Find the right tool for your document.</p></div><div className="relative w-full sm:max-w-sm"><label htmlFor="tool-search" className="sr-only">Search all tools</label><Search size={19} className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground"/><input id="tool-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tools, e.g. Word or scan" className="min-h-12 w-full rounded-lg border border-input bg-card py-3 pl-10 pr-3" /></div></div>
    {!query.trim() && <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="type-label flex items-center gap-2"><Clock3 size={17}/>Most used</h3>{frequent.length > 0 && <button type="button" onClick={clearUsage} className="type-support underline underline-offset-4 text-muted-foreground">Clear usage</button>}</div>{frequent.length ? shortcuts(frequent) : <p className="type-support text-muted-foreground">Tools you open most often will appear here.</p>}<p className="type-caption text-muted-foreground">Tool usage stays in this browser. Document names and contents are not recorded.</p></div>}
    {query.trim() ? <div><p role="status" className="type-support mb-4 text-muted-foreground">{filtered.length} tool{filtered.length === 1 ? "" : "s"} found</p>{filtered.length ? <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-3">{filtered.map(t => <ToolCard key={t.id} tool={t}/>)}</div> : <div className="py-8"><h3 className="type-tool-title">No matching tools</h3><p className="type-support mt-2 text-muted-foreground">Try a task such as scan, merge or Word.</p><button type="button" onClick={() => setQuery("")} className="mt-3 text-brand underline underline-offset-4">Clear search</button></div>}</div> : GROUPS.map(g => <div key={g.id}><div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3"><h3 className="type-section-title">{g.title}</h3><p className="type-support text-muted-foreground">{g.blurb}</p></div><div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-3">{visibleTools.filter(t => t.group === g.id).map(t => <ToolCard key={t.id} tool={t}/>)}</div></div>)}
  </div></section>;
}
