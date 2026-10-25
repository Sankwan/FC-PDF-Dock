import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
export default function NotFound() {
  return (
    <section className="flex min-h-[60vh] items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
        <AlertCircle className="mb-4 h-8 w-8 text-brand" aria-hidden />
        <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
        <p className="mt-3 text-muted-foreground">This address may have changed. Choose a document tool to continue.</p>
        <Link href="/#tools" className="mt-6 inline-flex min-h-11 items-center rounded-md bg-brand px-5 font-semibold text-white hover:bg-brand-dark">Back to all tools</Link>
      </div>
    </section>
  );
}
