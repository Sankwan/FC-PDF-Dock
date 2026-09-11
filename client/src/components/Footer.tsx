import { Link } from "wouter";
import { brand } from "@/brand";

interface FooterLink {
  label: string;
  href: string;
}

const primaryTools: FooterLink[] = [
  { label: "Merge PDFs", href: "/merge-pdfs" },
  { label: "Split PDF", href: "/split-pdf" },
  { label: "Compress PDF", href: "/compress-pdf" },
  { label: "Word to PDF", href: "/word-to-pdf" },
  { label: "PDF to Word", href: "/pdf-to-word" },
  { label: "PDF to Image", href: "/pdf-to-image" },
];

const moreTools: FooterLink[] = [
  { label: "Image to PDF", href: "/image-to-pdf" },
  { label: "Watermark PDF", href: "/watermark-pdf" },
  { label: "Protect PDF", href: "/protect-pdf" },
  { label: "Sign PDF", href: "/sign-pdf" },
  { label: "OCR PDF", href: "/ocr-pdf" },
];

const resources: FooterLink[] = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "FAQ", href: "/#faq" },
];

const FooterColumn = ({ title, links }: { title: string; links: FooterLink[] }) => (
  <div>
    <h4 className="text-xs font-semibold uppercase tracking-widest text-brand mb-3">{title}</h4>
    <ul className="space-y-1.5">
      {links.map((l) => (
        <li key={l.href}>
          {l.href.startsWith("/#") ? (
            <a href={l.href} className="text-muted-foreground hover:text-brand text-sm transition-colors">
              {l.label}
            </a>
          ) : (
            <Link href={l.href} className="text-muted-foreground hover:text-brand text-sm transition-colors">
              {l.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  </div>
);

const Footer = () => {
  return (
    <footer className="bg-card text-foreground border-t-2 border-brand">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr] gap-x-8 gap-y-10">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 3h13.5L28 11.5V29a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" fill="#0A0A0A"/>
                <path d="M19.5 3L28 11.5h-8.5V3z" fill="hsl(var(--brand-tint))"/>
                <line x1="11" y1="15" x2="21" y2="25" stroke="hsl(var(--brand))" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="21" y1="15" x2="11" y2="25" stroke="hsl(var(--brand))" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <span className="text-lg font-bold font-heading">{brand.shortName}</span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4 max-w-sm">
              All PDF processing happens in your browser. Your files never leave your device. No accounts, no tracking, no fees.
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Built on open-source PDF libraries — MIT licensed.
            </p>
          </div>

          <FooterColumn title="PDF Tools" links={primaryTools} />
          <FooterColumn title="More Tools" links={moreTools} />
          <FooterColumn title="Resources" links={resources} />
        </div>
      </div>
    </footer>
  );
};

export default Footer;
