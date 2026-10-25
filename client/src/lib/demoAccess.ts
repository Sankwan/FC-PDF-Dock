/** Public pilot credentials, deliberately not a security boundary or API token. */
export const DEMO_EMAIL = "demo@pdfdock.test";
export const DEMO_CODE = "246810";
const SESSION_KEY = "pdfdock.demo-session";
export const demoUser = { email: DEMO_EMAIL, firstName: "Demo", lastName: "Tester" };

export const matchesDemoCredentials = (email: string, code: string) =>
  email.trim().toLowerCase() === DEMO_EMAIL && code === DEMO_CODE;

// Tab-scoped storage is kept entirely separate from verified staff profiles.
export const readDemoSession = (enabled: boolean): boolean => {
  try {
    if (!enabled) { sessionStorage.removeItem(SESSION_KEY); return false; }
    return sessionStorage.getItem(SESSION_KEY) === "active";
  } catch { return false; }
};
export const writeDemoSession = (active: boolean) => {
  try {
    if (active) sessionStorage.setItem(SESSION_KEY, "active");
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* Demo still works for this page when storage is unavailable. */ }
};
