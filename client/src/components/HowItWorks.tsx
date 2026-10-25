import { ShieldCheck } from "lucide-react";

const steps = [
  { title: "Choose a file", desc: "Pick a file or drag it in. Document tools process the file on this device." },
  { title: "Set it up", desc: "Decide what you want to do with the document. You see a preview first." },
  { title: "Save or share", desc: "Download the result, or on a phone, share it straight to WhatsApp or email." },
];

const HowItWorks = () => (
  <section id="how-it-works" className="border-t border-border bg-card py-12">
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <h2 className="mb-6 text-lg font-bold text-foreground">How it works</h2>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-xl border border-border bg-background p-5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
            <span>
              <span className="block font-semibold text-foreground">{s.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{s.desc}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-col gap-4 rounded-xl bg-chrome p-6 sm:flex-row sm:items-center">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/10 text-brand-logo">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h3 className="font-semibold text-white">Private by design</h3>
          <p className="mt-1 text-sm text-white/70">
            Document conversion and editing run inside your browser. Set up the required engines before working offline. Scanner drafts stay in this browser until you clear them; recovery expires after 24 hours.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default HowItWorks;
