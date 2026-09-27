import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const faqs = [
  {
    id: "upload",
    question: "Do my files get uploaded anywhere?",
    answer:
      "No. Every tool except PDF to Word works entirely inside your browser, on your own computer or phone. PDF to Word sends the file to Head-Office server to convert and then deletes it straight away.",
  },
  {
    id: "size",
    question: "What's the largest file I can use?",
    answer:
      "It depends on your device's memory. Files up to 100MB work on most computers; on phones, files under 50MB are more reliable. Very large scans may take a minute or two.",
  },
  {
    id: "browsers",
    question: "Which browsers work?",
    answer:
      "Current versions of Chrome, Edge, Firefox and Safari. For installing the app and scanning with a phone camera, use Chrome or Edge on Android and Windows, and Safari on iPhone.",
  },
  {
    id: "account",
    question: "What do you keep about me?",
    answer:
      "Only your official email address, so the tools stay for FC staff. PDFDock doesn't record which tools you use or what files you open.",
  },
];

const FAQ = () => {
  const [openId, setOpenId] = useState<string>("upload");

  return (
    <section id="faq" className="bg-background py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-lg font-bold text-foreground">Questions</h2>
        <div className="max-w-3xl divide-y divide-border rounded-xl border border-border bg-card">
          {faqs.map((faq) => {
            const open = openId === faq.id;
            return (
              <div key={faq.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/60"
                  onClick={() => setOpenId(open ? "" : faq.id)}
                >
                  <span className={`text-sm font-semibold ${open ? "text-brand" : "text-foreground"}`}>{faq.question}</span>
                  {open ? <Minus size={15} className="shrink-0" /> : <Plus size={15} className="shrink-0" />}
                </button>
                {open && <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
