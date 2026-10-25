import { Link } from "wouter";
import {
  ArrowRight, Combine, Scissors, LayoutGrid, FileDown, ScanLine, ImagePlus, Images, FileType2, FileText,
  TextSearch, FileBadge2, Stamp, PenLine, ShieldCheck, EyeOff, Server, FilePenLine, ListChecks, QrCode, Image, type LucideIcon,
} from "lucide-react";
import { features } from "@/brand";

export interface Tool {
  id: string;
  title: string;
  description: string;
  link: string;
  icon: LucideIcon;
  group: "organise" | "convert" | "official";
  isNew?: boolean;
  serverTool?: boolean;
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
  { id: "pdf-to-word", title: "PDF to Word", description: "Turn a PDF into an editable Word document. Head office only for now.", link: "/pdf-to-word", icon: FileText, group: "convert", serverTool: true },
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

const visibleTools = tools.filter((t) => features.pdfToWord || t.id !== "pdf-to-word");

const ToolCard = ({ tool }: { tool: Tool }) => {
  const Icon = tool.icon;
  return (
    <Link
      href={tool.link}
      className="group relative flex gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
        <Icon size={20} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-foreground">{tool.title}</span>
          {tool.isNew && <span className="rounded-full bg-brand-logo/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">New</span>}
          {tool.serverTool && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title="Uses the FC head-office server">
              <Server size={10} /> Head office
            </span>
          )}
        </span>
        <span className="mt-1 block text-sm leading-snug text-muted-foreground">{tool.description}</span>
      </span>
      <ArrowRight size={16} className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  );
};

const ToolsSection = () => (
  <section id="tools" className="scroll-mt-16 bg-background py-12">
    <div className="container mx-auto space-y-10 px-4 sm:px-6 lg:px-8">
      {GROUPS.map((g) => (
        <div key={g.id}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2">
            <h2 className="text-lg font-bold text-foreground">{g.title}</h2>
            <p className="text-sm text-muted-foreground">{g.blurb}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleTools.filter((t) => t.group === g.id).map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        </div>
      ))}
    </div>
  </section>
);

export default ToolsSection;
