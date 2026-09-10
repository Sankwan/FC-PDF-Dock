import { Link } from "wouter";
import { brand } from "@/brand";

const tools = [
  { label: "Merge PDFs", href: "/merge-pdfs" },
  { label: "Split PDF", href: "/split-pdf" },
  { label: "Compress PDF", href: "/compress-pdf" },
  { label: "Word to PDF", href: "/word-to-pdf" },
  { label: "PDF to Word", href: "/pdf-to-word" },
  { label: "PDF to Image", href: "/pdf-to-image" },
  { label: "Image to PDF", href: "/image-to-pdf" },
  { label: "Watermark PDF", href: "/watermark-pdf" },
  { label: "Protect PDF", href: "/protect-pdf" },
  { label: "Sign PDF", href: "/sign-pdf" },
  { label: "OCR PDF", href: "/ocr-pdf" },
];

const Footer = () => {
  return (
    <footer className="bg-card text-foreground border-t-2 border-brand">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 3h13.5L28 11.5V29a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" fill="#0A0A0A"/>
                <path d="M19.5 3L28 11.5h-8.5V3z" fill="hsl(var(--brand-tint))"/>
                <line x1="11" y1="15" x2="21" y2="25" stroke="hsl(var(--brand))" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="21" y1="15" x2="11" y2="25" stroke="hsl(var(--brand))" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <span className="text-lg font-bold font-heading">{brand.shortName}</span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              All PDF processing happens in your browser. Your files never leave your device. No accounts, no tracking, no fees.
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Built on open-source PDF libraries (pdf-lib, PDF.js, jsPDF) — MIT licensed.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-brand mb-3">PDF Tools</h4>
            <ul className="space-y-1.5">
              {tools.slice(0, 4).map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="text-muted-foreground hover:text-brand text-sm transition-colors">
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-brand mb-3">More Tools</h4>
            <ul className="space-y-1.5">
              {tools.slice(4).map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="text-muted-foreground hover:text-brand text-sm transition-colors">
                    {t.label}
                  </Link>
                </li>
              ))}
              <li>
                <a href="/#how-it-works" className="text-muted-foreground hover:text-brand text-sm transition-colors">How It Works</a>
              </li>
              <li>
                <a href="/#faq" className="text-muted-foreground hover:text-brand text-sm transition-colors">FAQ</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
