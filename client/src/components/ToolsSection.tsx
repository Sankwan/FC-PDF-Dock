import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export const tools = [
  {
    id: "merge-pdfs",
    title: "Merge PDFs",
    description: "Combine multiple PDF files into one document. Drag-and-drop reordering.",
    tag: "Combine",
    link: "/merge-pdfs",
    featured: true,
  },
  {
    id: "split-pdf",
    title: "Split PDF",
    description: "Extract specific pages or split a PDF into multiple files. Custom page ranges.",
    tag: "Extract",
    link: "/split-pdf",
    featured: false,
  },
  {
    id: "compress-pdf",
    title: "Compress PDF",
    description: "Reduce PDF size while keeping quality. Low / medium / high compression.",
    tag: "Reduce Size",
    link: "/compress-pdf",
    featured: false,
  },
  {
    id: "word-to-pdf",
    title: "Word to PDF",
    description: "Convert .docx documents to PDF",
    tag: "Convert",
    link: "/word-to-pdf",
    featured: true,
  },
  {
    id: "pdf-to-word",
    title: "PDF to Word",
    description: "Convert PDF to an editable .docx. The one tool that uses a self-hosted server, not just your browser.",
    tag: "Convert",
    link: "/pdf-to-word",
    featured: true,
  },
  {
    id: "pdf-to-image",
    title: "PDF to Image",
    description: "Convert PDF pages to JPG, PNG, or WebP. Custom quality and page range.",
    tag: "Convert",
    link: "/pdf-to-image",
    featured: false,
  },
  {
    id: "image-to-pdf",
    title: "Image to PDF",
    description: "Turn JPG, PNG, or WebP images into a PDF. Supports multi-image, rotation.",
    tag: "Convert",
    link: "/image-to-pdf",
    featured: false,
  },
  {
    id: "watermark-pdf",
    title: "Watermark PDF",
    description: "Add diagonal text watermarks to every page. Custom text, opacity, and size.",
    tag: "Annotate",
    link: "/watermark-pdf",
    featured: false,
  },
  {
    id: "protect-pdf",
    title: "Protect PDF",
    description:
      "Lock a PDF with a real AES password and strip metadata (author, title, software).",
    tag: "Encrypt + metadata",
    link: "/protect-pdf",
    featured: true,
  },
  {
    id: "sign-pdf",
    title: "Sign PDF",
    description: "Draw a signature, place it on any page, then drag and resize it before export.",
    tag: "Sign",
    link: "/sign-pdf",
    featured: true,
  },
  {
    id: "ocr-pdf",
    title: "OCR PDF",
    description: "Make scanned PDFs searchable and selectable using a local OCR model. Nothing leaves your device.",
    tag: "Recognize",
    link: "/ocr-pdf",
    featured: true,
  },
];

const ToolsSection = () => {
  return (
    <section id="tools" className="bg-background py-14">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-0.5 bg-brand" />
              <span className="text-brand text-xs font-semibold uppercase tracking-widest">Toolkit</span>
            </div>
            <h2 className="text-3xl font-bold font-heading text-foreground leading-tight">
              {tools.length} tools, zero friction
            </h2>
          </div>
          <p className="hidden md:block text-muted-foreground text-sm max-w-xs text-right">
            All processing runs in your browser. No uploads, no accounts, no waiting.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Link
              key={tool.id}
              href={tool.link}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/80 bg-card/70 p-5 shadow-[0_18px_50px_-38px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:bg-card ${
                tool.featured ? "ring-1 ring-brand/40" : ""
              }`}
            >
              {tool.featured && (
                <div className="absolute right-3 top-3 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  New
                </div>
              )}
              <div className="flex items-start justify-between mb-3">
                <span className="rounded-full border border-brand/40 bg-brand-tint px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-brand">
                  {tool.tag}
                </span>
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1.5 group-hover:text-brand transition-colors">
                {tool.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1 mb-3">{tool.description}</p>
              <div className="flex items-center gap-1 text-foreground text-xs font-semibold group-hover:gap-2 transition-all">
                <span>Open tool</span>
                <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { value: "100%", label: "Client-side processing" },
            { value: "0 MB", label: "Data ever uploaded" },
            { value: "Free", label: "No account required" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-4 rounded-2xl border border-white/80 bg-card/65 px-5 py-4 backdrop-blur-xl">
              <span className="text-2xl font-bold text-brand font-heading">{stat.value}</span>
              <span className="text-xs text-foreground leading-tight">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ToolsSection;
