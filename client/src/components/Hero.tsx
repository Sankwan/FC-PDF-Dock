import { Link } from "wouter";
import { HardDrive, ScanLine, FileBadge2, EyeOff, Combine, WifiOff, Server } from "lucide-react";
import { useAuth } from "@/context/Auth";

const quick = [
  { label: "Scan document", href: "/scan", icon: ScanLine },
  { label: "Letterhead", href: "/letterhead", icon: FileBadge2 },
  { label: "Redact PDF", href: "/redact-pdf", icon: EyeOff },
  { label: "Merge PDFs", href: "/merge-pdfs", icon: Combine },
];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const Hero = () => {
  const { user } = useAuth();
  return (
    <section className="border-b border-border bg-card">
      <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-brand">{greeting()}{user?.firstName ? `, ${user.firstName}` : ""}</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-foreground sm:text-4xl" style={{ textWrap: "balance" } as React.CSSProperties}>
              Work on your document today?
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Most tools work on your own computer or phone without uploading files. PDF to Word uses the FC head-office server.
            </p>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><HardDrive size={15} className="text-brand" /> Files stay on this device</li>
              <li className="flex items-center gap-2"><WifiOff size={15} className="text-brand" /> Offline access available</li>
              <li className="flex items-center gap-2"><Server size={15} className="text-brand" /> PDF to Word: head office only</li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quick start</p>
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              {quick.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:bg-brand-tint"
                >
                  <Icon size={18} className="shrink-0 text-brand" />
                  <span className="truncate">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
