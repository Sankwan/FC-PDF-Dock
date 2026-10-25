import { Link } from "wouter";
import { brand, features, conversionServer } from "@/brand";
import { ORG } from "@/fc/org";
import { tools } from "@/components/ToolsSection";

const Footer = () => (
  <footer className="border-t-[3px] border-brand-logo bg-card text-foreground">
    <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
        <div>
          <div className="flex items-center gap-3">
            <img src={brand.logo} alt="Forestry Commission" className="h-12 w-auto" />
          </div>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            {brand.name} is Forestry Commission's document toolkit for staff. Most tools process files on your device. PDF to Word, when enabled, uses the {conversionServer}.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {ORG.name} · {ORG.headOffice} · {ORG.ministry}
          </p>
        </div>

        <nav aria-label="All tools" className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
          {tools.filter(t => features.pdfToWord || t.id !== "pdf-to-word").map((t) => (
            <Link key={t.id} href={t.link} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-brand">
              {t.title}
            </Link>
          ))}
        </nav>
      </div>

      <p className="mt-10 border-t border-border pt-5 text-center text-xs leading-relaxed text-muted-foreground">
        <span className="font-bold uppercase tracking-wide text-brand">Vision: </span>
        {ORG.vision}
      </p>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        For authorised FC staff. Built on open-source software; see NOTICE.md for licences.
      </p>
    </div>
  </footer>
);

export default Footer;
