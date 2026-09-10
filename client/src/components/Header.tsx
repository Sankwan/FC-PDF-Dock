import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Menu, X, Sun, Moon, Download } from "lucide-react";
import { brand } from "@/brand";
import { useTheme } from "@/components/ui/theme-provider";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import InstallGuide from "@/components/InstallGuide";

const ThemeToggle = ({ className = "" }: { className?: string }) => {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-card/10 text-white/70 transition hover:bg-card/20 hover:text-white ${className}`}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
};

const Logo = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 3h13.5L28 11.5V29a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" fill="white"/>
    <path d="M19.5 3L28 11.5h-8.5V3z" fill="#ccc"/>
    <line x1="11" y1="15" x2="21" y2="25" stroke="hsl(var(--brand))" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="21" y1="15" x2="11" y2="25" stroke="hsl(var(--brand))" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

const navItems = [
  { label: "Tools", href: "/#tools" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "FAQ", href: "/#faq" },
];

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [location] = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const { isStandalone } = useInstallPrompt();
  const isDark = resolvedTheme === "dark";

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0A0A0A]/90 backdrop-blur-2xl">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          <div className="flex min-w-0 items-center gap-2">
          {location !== "/" && (
            <button
              type="button"
              aria-label="Go back"
              title="Go back"
              onClick={() => window.history.length > 1 ? window.history.back() : (window.location.href = "/")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-card/10 text-white transition hover:bg-card/20"
            >
              <ArrowLeft size={17} />
            </button>
          )}
          <Link href="/" className="flex min-w-0 items-center gap-2.5 group" onClick={() => setIsMenuOpen(false)}>
            <div className="flex items-center justify-center w-8 h-8 bg-[#0A0A0A] border border-brand">
              <Logo />
            </div>
            <span className="text-xl font-bold tracking-tight font-heading text-white truncate">
              {brand.shortName}
            </span>
          </Link>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-white/60 hover:text-white transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-brand hover:after:w-full after:transition-all"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {!isStandalone && (
              <button
                type="button"
                onClick={() => setInstallOpen(true)}
                aria-label="Save this app to your device"
                title="Save this app to your device"
                className="hidden md:grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-card/10 text-white/70 transition hover:bg-card/20 hover:text-white"
              >
                <Download size={16} />
              </button>
            )}
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            <a
              href="/#tools"
              className="hidden md:inline-flex items-center px-4 py-1.5 bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
            >
              Get Started
            </a>
            <button
              className="md:hidden p-1.5 text-white/60 hover:text-white focus:outline-none"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div className="md:hidden border-t border-[#222] py-4">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-white/60 hover:text-white hover:bg-[#1a1a1a] px-3 py-2.5 text-sm font-medium transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="flex items-center justify-between text-white/60 hover:text-white hover:bg-[#1a1a1a] px-3 py-2.5 text-sm font-medium transition-colors"
              >
                <span>{isDark ? "Dark mode" : "Light mode"}</span>
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              {!isStandalone && (
                <button
                  onClick={() => { setIsMenuOpen(false); setInstallOpen(true); }}
                  className="flex items-center justify-between text-white/60 hover:text-white hover:bg-[#1a1a1a] px-3 py-2.5 text-sm font-medium transition-colors"
                >
                  <span>Save App</span>
                  <Download size={16} />
                </button>
              )}
              <a
                href="/#tools"
                className="mt-2 mx-3 px-4 py-2 bg-brand text-white text-sm font-semibold text-center hover:bg-brand-dark transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Get Started
              </a>
            </div>
          </div>
        )}
      </div>

      <InstallGuide open={installOpen} onOpenChange={setInstallOpen} />
    </header>
  );
};

export default Header;
