import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, HardDrive, KeyRound, Loader2, Mail, ShieldCheck, WifiOff } from "lucide-react";
import { brand, features } from "@/brand";
import { ApiError, authFetch, useAuth, type StaffUser } from "@/context/Auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const domain = features.staffEmailDomain;

/** Mirrors services/auth/src/staff.js so people see mistakes before submitting. */
const emailProblem = (email: string): string | null => {
  const e = email.trim().toLowerCase();
  if (!e) return "Enter your official email address.";
  if (!e.includes("@")) return `Enter your full address, like firstname.lastname@${domain}.`;
  const [local, host] = [e.slice(0, e.lastIndexOf("@")), e.slice(e.lastIndexOf("@") + 1)];
  if (host !== domain) return `Use your official @${domain} address.`;
  if (!/^[a-z]+(?:-[a-z]+)*(?:\.[a-z]+(?:-[a-z]+)*)+\d{0,3}$/.test(local)) return `Use the firstname.lastname@${domain} format.`;
  return null;
};

const BrandPanel = () => (
  <aside className="relative flex flex-col justify-between gap-10 bg-chrome px-4 py-5 text-white sm:px-10 lg:min-h-screen lg:py-12">
    <div className="flex items-center gap-3">
      <span className="grid h-14 w-[4.5rem] place-items-center rounded-md bg-white p-1.5">
        <img src={brand.logo} alt="Forestry Commission logo" className="h-full w-full object-contain" />
      </span>
      <div className="leading-tight">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-logo">{brand.orgName}</div>
        <div className="text-xl font-bold">{brand.name}</div>
      </div>
    </div>

    <div className="hidden max-w-md lg:block">
      <h1 className="text-3xl font-bold leading-tight sm:text-4xl" style={{ textWrap: "balance" } as React.CSSProperties}>
        Document tools for FC staff
      </h1>
      <p className="mt-3 text-white/70">
        Use these instead of free online PDF websites. Merge, sign, redact, scan and convert on your own device. Your files are never uploaded.
      </p>
      <ul className="mt-8 space-y-4 text-sm">
        <li className="flex gap-3">
          <HardDrive size={18} className="mt-0.5 shrink-0 text-brand-logo" />
          <span className="text-white/80">Files stay on this computer or phone. Only PDF to Word uses the head-office server.</span>
        </li>
        <li className="flex gap-3">
          <WifiOff size={18} className="mt-0.5 shrink-0 text-brand-logo" />
          <span className="text-white/80">Install it once and most tools keep working without internet.</span>
        </li>
        <li className="flex gap-3">
          <KeyRound size={18} className="mt-0.5 shrink-0 text-brand-logo" />
          <span className="text-white/80">No password and no forms. Just a code sent to your official email.</span>
        </li>
      </ul>
    </div>

    <p className="hidden text-xs text-white/45 lg:block">For Forestry Commission staff.</p>
  </aside>
);

const inputClass = "mt-1.5 h-11 rounded-md border-input bg-card focus-visible:ring-brand";

/**
 * One screen for everyone: enter your official email, then the code we send
 * to it. The first time, that also sets up access; there's nothing else to
 * fill in.
 */
const AuthPage = ({ fromLink = false }: { fromLink?: boolean }) => {
  const [, navigate] = useLocation();
  const { setSignedIn, offline } = useAuth();

  const [step, setStep] = useState<"email" | "code">(fromLink ? "code" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // The email link carries email+code in the URL fragment (never sent to the
  // server). Read it once, then clear it from the address bar.
  useEffect(() => {
    if (!fromLink) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const e = params.get("email");
    const c = params.get("code");
    if (e) setEmail(e);
    if (c && /^\d{6}$/.test(c)) {
      setCode(c);
      setPrefilled(true);
    }
    if (!e) setStep("email");
    history.replaceState(null, "", "/verify");
  }, [fromLink]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code" && !prefilled) codeRef.current?.focus();
  }, [step, prefilled]);

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const problem = emailProblem(email);
    if (problem) {
      setError({ message: problem, field: "email" });
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await authFetch("/request-code", { method: "POST", body: { email } });
      setStep("code");
      setCode("");
      setPrefilled(false);
      setCooldown(60);
      setNotice(`We sent a 6-digit code to ${email.trim().toLowerCase()}. It expires in 10 minutes.`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "resend_too_soon" && err.retryAfter) {
          setCooldown(err.retryAfter);
          setStep("code");
        }
        setError({ message: err.message, field: err.field });
      } else setError({ message: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError({ message: "Enter the 6-digit code from the email.", field: "code" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user } = await authFetch<{ user: StaffUser }>("/verify", { method: "POST", body: { email, code: digits } });
      setSignedIn(user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? { message: err.message, field: err.field } : { message: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const primary = "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60";

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <BrandPanel />
      <main className="flex items-start justify-center px-4 py-8 sm:px-8 lg:items-center lg:py-10">
        <div className="w-full max-w-md">
          {offline && (
            <div className="mb-6 flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <WifiOff size={18} className="mt-0.5 shrink-0" />
              <span>You're offline. Signing in needs a connection the first time on each device.</span>
            </div>
          )}

          {step === "code" && (
            <button
              type="button"
              onClick={() => { setStep("email"); setError(null); setNotice(null); }}
              className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand"
            >
              <ArrowLeft size={15} /> Use a different address
            </button>
          )}

          <h2 className="text-2xl font-bold text-foreground">{step === "code" ? "Enter your code" : "Sign in"}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {step === "code"
              ? prefilled
                ? "Your code is filled in from the email. Press Confirm to continue."
                : "Check your official mailbox for an email from PDFDock."
              : "Enter your official email and we'll send you a code. First time here? It's the same: there's nothing else to fill in."}
          </p>

          {notice && step === "code" && (
            <div className="mt-5 flex gap-3 rounded-md border border-brand/30 bg-brand-tint p-3 text-sm text-foreground">
              <Mail size={17} className="mt-0.5 shrink-0 text-brand" />
              <span>{notice}</span>
            </div>
          )}

          {error && !error.field && (
            <div role="alert" className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error.message}
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={requestCode} className="mt-7 space-y-5" noValidate>
              <div>
                <Label htmlFor="email" className="text-sm font-semibold">Official email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  placeholder={`firstname.lastname@${domain}`}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error?.field === "email") setError(null); }}
                  aria-invalid={error?.field === "email"}
                  aria-describedby="email-error"
                  className={inputClass}
                />
                {error?.field === "email" && <p id="email-error" className="mt-1.5 text-xs font-medium text-destructive">{error.message}</p>}
              </div>
              <button type="submit" disabled={busy} className={primary}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Email me a code
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-7 space-y-5" noValidate>
              <div>
                <Label htmlFor="code" className="text-sm font-semibold">6-digit code</Label>
                <Input
                  id="code"
                  ref={codeRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  placeholder="000000"
                  value={code}
                  // Digits only, at most 6. No maxLength attribute: it would cut a
                  // pasted "123 456" to "123 45" before the spaces are stripped.
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); if (error?.field === "code") setError(null); }}
                  aria-describedby="code-error"
                  className="mt-1.5 h-14 rounded-md border-input bg-card text-center font-mono text-2xl tracking-[0.5em] focus-visible:ring-brand"
                />
                {error?.field === "code" && <p id="code-error" className="mt-1.5 text-xs font-medium text-destructive">{error.message}</p>}
                {email && <p className="mt-1.5 text-xs text-muted-foreground">For {email.trim().toLowerCase()}</p>}
              </div>
              <button type="submit" disabled={busy} className={primary}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Confirm
              </button>
              <p className="text-center text-sm text-muted-foreground">
                Didn't get it? Check your junk folder, or{" "}
                {cooldown > 0 ? (
                  <span>send a new code in {cooldown}s</span>
                ) : (
                  <button type="button" onClick={() => requestCode()} className="font-semibold text-brand hover:underline">send a new code</button>
                )}
                .
              </p>
            </form>
          )}

          <div className="mt-10 flex items-start gap-2.5 border-t border-border pt-5 text-xs text-muted-foreground">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand" />
            <span>
              We keep only your email address, so we know it's FC staff using the tools. We don't record what you do here, and we never see your documents.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AuthPage;
