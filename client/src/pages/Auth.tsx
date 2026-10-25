import { ICT_HELP_URL } from "@/lib/support";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Check, FileText, Loader2, Mail, ScanLine, ShieldCheck, WifiOff } from "lucide-react";
import { brand, features } from "@/brand";
import { ApiError, authFetch, useAuth, type StaffUser } from "@/context/Auth";
import { DEMO_EMAIL, DEMO_CODE, matchesDemoCredentials } from "@/lib/demoAccess";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./Auth.css";

const domain = features.staffEmailDomain;
const emailProblem = (email: string): string | null => {
  const e = email.trim().toLowerCase();
  if (!e) return "Enter your official email address.";
  if (!e.includes("@")) return `Enter your full address, like firstname.lastname@${domain}.`;
  const at = e.lastIndexOf("@");
  if (e.slice(at + 1) !== domain) return `Use your official @${domain} address.`;
  if (!/^[a-z]+(?:-[a-z]+)*(?:\.[a-z]+(?:-[a-z]+)*)+\d{0,3}$/.test(e.slice(0, at))) return `Use the firstname.lastname@${domain} format.`;
  return null;
};

const WorkflowPreview = () => (
  <figure className="auth-art">
    <div className="auth-photo">
      <img src="/images/kakum-canopy.jpg" alt="A canopy walkway among the trees at Kakum National Park, Ghana" width="1400" height="1050" fetchPriority="high" />
      <span className="auth-photo-caption">Kakum National Park, Ghana</span>
    </div>
    <div className="auth-document" aria-label="Illustrative document workflow preview">
      <div className="auth-document-top"><FileText size={18} /><span>Field report</span><span className="auth-example">Example</span></div>
      <div className="auth-document-body"><img src={brand.mark} alt="" width="34" height="34" /><strong>From paper<br />to a finished PDF.</strong><div className="auth-document-lines" aria-hidden="true"><span /><span /><span /></div></div>
      <div className="auth-document-done"><Check size={14} /> Ready to save</div>
    </div>
    <figcaption className="auth-workflow"><span><ScanLine size={16} /> Scan</span><ArrowRight size={14} aria-hidden="true" /><span>Prepare</span><ArrowRight size={14} aria-hidden="true" /><span>Save & share</span></figcaption>
  </figure>
);

const AuthPage = ({ fromLink = false }: { fromLink?: boolean }) => {
  const [, navigate] = useLocation();
  const { setSignedIn, enterDemo, offline } = useAuth();
  const [mode, setMode] = useState<"demo" | "staff">(features.demoMode && !fromLink ? "demo" : "staff");

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

  const demo = mode === "demo";
  const showCode = demo || step === "code";
  const switchMode = (next: "demo" | "staff") => {
    setMode(next); setStep("email"); setEmail(""); setCode(""); setError(null); setNotice(null); setPrefilled(false);
  };
  const submitDemo = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) { setError({ message: "Enter the demo email shown below.", field: "email" }); return; }
    if (!matchesDemoCredentials(email, code)) {
      setError({ message: "Use the demo email and code shown below, or select Fill demo details." }); return;
    }
    enterDemo();
    navigate("/");
  };
  const fillDemo = () => { setEmail(DEMO_EMAIL); setCode(DEMO_CODE); setError(null); };

  return (
    <div className="auth-page">
      <a href="#sign-in-form" className="auth-skip">Skip to sign in</a>
      <header className="auth-header">
        <div className="auth-brand"><img src={brand.logo} alt="Forestry Commission logo" width="76" height="54" /><span><strong>{brand.shortName}</strong><span>{brand.orgName}</span></span></div>
        <a href={ICT_HELP_URL} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold underline underline-offset-4" aria-label="Help: email ICT">Help</a>
      </header>
      <main className="auth-main">
        <section className="auth-intro" aria-labelledby="auth-title">
          <h1 id="auth-title">Less paperwork.<br /><span>More fieldwork.</span></h1>
          <p>Scan, prepare and share your documents.<br className="auth-desktop-break" /> One workspace for the work you do.</p>
        </section>
        <WorkflowPreview />
        <section id="sign-in-form" tabIndex={-1} className="auth-form-section" aria-labelledby="sign-in-title">
          <h2 id="sign-in-title">Welcome to {brand.name}.</h2>
          <p className="auth-form-intro">{demo ? "Take the tools for a test run. No staff account needed." : "Sign in with your official email. We’ll send you a code."}</p>
          {features.demoMode && <div className="auth-modes" role="group" aria-label="Choose access type">
            <button type="button" aria-pressed={demo} disabled={busy} onClick={() => switchMode("demo")}>Demo access</button>
            <button type="button" aria-pressed={!demo} disabled={busy} onClick={() => switchMode("staff")}>Staff sign-in</button>
          </div>}
          {offline && !demo && <p className="auth-message"><WifiOff size={18} /> You’re offline. Connect to receive a sign-in code.</p>}
          {notice && !demo && <p className="auth-message" role="status"><Mail size={18} /> {notice}</p>}
          {error && !error.field && <p className="auth-error" role="alert">{error.message}</p>}
          <form onSubmit={demo ? submitDemo : step === "email" ? requestCode : verify} noValidate className="auth-form" aria-busy={busy}>
            <div>
              <div className="auth-label-row"><Label htmlFor="email">{demo ? "Demo email" : "Official email"}</Label>
                {!demo && step === "code" && <button type="button" disabled={busy} onClick={() => { setStep("email"); setError(null); setNotice(null); }}>Change address</button>}
              </div>
              <Input id="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
                placeholder={demo ? DEMO_EMAIL : `firstname.lastname@${domain}`} value={email} readOnly={!demo && step === "code"} disabled={busy}
                onChange={e => { setEmail(e.target.value); if (error) setError(null); }}
                aria-invalid={error?.field === "email"} aria-describedby={error?.field === "email" ? "email-error" : undefined} />
              {error?.field === "email" && <p id="email-error" role="alert" className="auth-field-error">{error.message}</p>}
            </div>
            {showCode && <div>
              <Label htmlFor="code">{demo ? "Demo code" : "6-digit email code"}</Label>
              <Input id="code" ref={codeRef} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" placeholder="6-digit code" value={code} disabled={busy}
                onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); if (error) setError(null); }}
                aria-invalid={error?.field === "code"} aria-describedby={error?.field === "code" ? "code-error" : undefined} className="auth-code" />
              {error?.field === "code" && <p id="code-error" role="alert" className="auth-field-error">{error.message}</p>}
            </div>}
            <button type="submit" disabled={busy} className="auth-submit">
              {busy ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" />{step === "email" ? "Sending code…" : "Checking code…"}</> : <>{demo ? "Open the tools" : step === "email" ? "Email me a code" : "Confirm & continue"}<ArrowRight size={18} aria-hidden="true" /></>}
            </button>
            {!demo && step === "code" && <p className="auth-resend">{prefilled ? "Code filled from your email. " : "Check your inbox and junk folder. "}
              {cooldown > 0 ? <span>Resend in {cooldown}s.</span> : <button type="button" disabled={busy} onClick={() => requestCode()}>Send a new code</button>}
            </p>}
          </form>
          {demo && <div className="auth-demo-details"><div><strong>Use these demo details</strong><button type="button" onClick={fillDemo}>Fill demo details <ArrowRight size={14} aria-hidden="true" /></button></div><p><span>{DEMO_EMAIL}</span><span>Code: <b>{DEMO_CODE}</b></span></p><p className="auth-demo-note">Public test access · Use sample documents.</p></div>}
          <p className="auth-privacy"><ShieldCheck size={18} aria-hidden="true" /><span>{demo ? "Demo access opens the tools on this device. It doesn’t create a staff account." : "Document tools process files on this device. Staff sign-in uses the sign-in service."}</span></p>
        </section>
      </main>
      <footer className="auth-footer"><span>Built for {brand.orgName} staff.</span><span>Photo: <a href="https://commons.wikimedia.org/wiki/File:Kakum_National_Park,_Ghana.jpg" target="_blank" rel="noreferrer">ZSM</a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a> · cropped</span></footer>
    </div>
  );
};
export default AuthPage;
