import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { brand } from "@/brand";
import { tools } from "@/components/ToolsSection";

const quickTools = [
  { label: "Merge PDFs", href: "/merge-pdfs", accent: true },
  { label: "Split PDF", href: "/split-pdf", accent: false },
  { label: "Compress", href: "/compress-pdf", accent: false },
  { label: "Word to PDF", href: "/word-to-pdf", accent: true },
  { label: "PDF → Image", href: "/pdf-to-image", accent: false },
  { label: "Watermark", href: "/watermark-pdf", accent: false },
  { label: "Sign PDF", href: "/sign-pdf", accent: true },
  { label: "OCR PDF", href: "/ocr-pdf", accent: true },
];

const Hero = () => {
  return (
    <section className="bg-card overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-0 min-h-[420px]">
          <div className="lg:col-span-3 flex flex-col justify-center py-14 lg:pr-12 lg:border-r lg:border-brand-tint">
            <div className="inline-flex items-center gap-2 mb-5">
              <div className="w-6 h-0.5 bg-brand" />
              <span className="text-brand text-xs font-semibold uppercase tracking-widest">100% Browser-Based, Offline · Zero Upload</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-heading text-foreground leading-[1.05] mb-5">
              {brand.name}
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mb-8 leading-relaxed">
              {brand.description}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="#tools"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand text-white font-semibold hover:bg-brand-dark transition-colors text-sm"
              >
                Browse All Tools <ArrowRight size={16} />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border text-foreground font-semibold hover:border-brand hover:text-brand transition-colors text-sm"
              >
                How It Works
              </a>
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-col justify-center py-10 lg:pl-10">
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-4">Quick Access</p>
            <div className="grid grid-cols-2 gap-2">
              {quickTools.map((tool) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className={`group flex items-center justify-between px-3 py-3 border transition-colors ${
                    tool.accent
                ? "border-brand bg-brand-tint hover:bg-brand-tint text-foreground"
                : "border-border hover:border-brand text-foreground hover:bg-brand-tint"
                  }`}
                >
                  <span className="text-sm font-medium">{tool.label}</span>
                  <ArrowRight size={13} className="opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-brand-tint grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold text-foreground">{tools.length}</div>
                <div className="text-muted-foreground text-xs mt-0.5">Tools</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">0</div>
                <div className="text-muted-foreground text-xs mt-0.5">Uploads</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">Free</div>
                <div className="text-muted-foreground text-xs mt-0.5">Forever</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
