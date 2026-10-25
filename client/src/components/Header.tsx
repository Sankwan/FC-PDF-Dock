import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ChevronDown, CloudDownload, Download, LogOut, Moon, Sun, WifiOff } from "lucide-react";
import { brand, features } from "@/brand";
import { useTheme } from "@/components/ui/theme-provider";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useAuth } from "@/context/Auth";
import InstallGuide from "@/components/InstallGuide";
import OfflineDialog from "@/components/OfflineDialog";

const initials = (first?: string, last?: string) => `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "FC";

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [location] = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const { isStandalone } = useInstallPrompt();
  const { user, offline, isDemo, signOut } = useAuth();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        if (e instanceof KeyboardEvent) triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [location]);

  const menuItem = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-muted";

  return (
    <header className="sticky top-0 z-50 border-b-[3px] border-brand-logo bg-chrome" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {location !== "/" && (
              <button
                type="button"
                aria-label="Go back"
                title="Go back"
                onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = "/"))}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 text-white transition hover:bg-white/10"
              >
                <ArrowLeft size={17} />
              </button>
            )}
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-[3.6rem] shrink-0 place-items-center rounded-md bg-white p-1">
                <img src={brand.logo} alt="" className="h-full w-full object-contain" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brand-logo">{brand.orgName}</span>
                <span className="block truncate text-lg font-bold text-white">{brand.name}</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {offline && (
              <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 sm:inline-flex" title="The head-office server can't be reached. Tools that run on this device still work.">
                <WifiOff size={13} /> Offline
              </span>
            )}
            <a href="/#tools" className="hidden rounded-md px-3 py-2 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white md:inline-block">
              All tools
            </a>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                ref={triggerRef}
                aria-label="Account and app settings"
                aria-controls="app-settings"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-full min-h-11 py-1 pl-1 pr-2 text-white hover:bg-white/10"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-logo text-xs font-bold text-chrome">
                  {features.authRequired ? initials(user?.firstName, user?.lastName) : "FC"}
                </span>
                <span className="hidden max-w-[9rem] truncate text-sm font-medium lg:inline">{user?.firstName ?? "Menu"}</span>
                <ChevronDown size={15} className="text-white/60" />
              </button>

              {menuOpen && (
                <div id="app-settings" className="absolute right-0 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl">
                  {user && (
                    <div className="border-b border-border px-3 pb-3 pt-2">
                      <div className="truncate text-sm font-semibold text-foreground">{user.firstName} {user.lastName}</div>
                      <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                    </div>
                  )}
                  <button type="button" className={menuItem} onClick={() => { setMenuOpen(false); setOfflineOpen(true); }}>
                    <CloudDownload size={16} className="text-brand" /> Set up offline access
                  </button>
                  {!isStandalone && (
                    <button type="button" className={menuItem} onClick={() => { setMenuOpen(false); setInstallOpen(true); }}>
                      <Download size={16} className="text-brand" /> Install the app on this device
                    </button>
                  )}
                  <button type="button" className={menuItem} onClick={() => setTheme(isDark ? "light" : "dark")}>
                    {isDark ? <Sun size={16} className="text-brand" /> : <Moon size={16} className="text-brand" />}
                    {isDark ? "Light mode" : "Dark mode"}
                  </button>
                  {features.authRequired && user && (
                    <button type="button" className={`${menuItem} border-t border-border`} onClick={() => { setMenuOpen(false); signOut(); }}>
                      <LogOut size={16} className="text-muted-foreground" /> {isDemo ? "Leave demo" : "Sign out"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <InstallGuide open={installOpen} onOpenChange={setInstallOpen} />
      <OfflineDialog open={offlineOpen} onOpenChange={setOfflineOpen} />
    </header>
  );
};

export default Header;
