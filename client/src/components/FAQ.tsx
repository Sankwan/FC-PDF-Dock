import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const faqs = [
  {
    id: "upload",
    question: "Do my files get uploaded anywhere?",
    answer:
      "Most tools process files in your browser. PDF to Word sends your PDF to the FC conversion server, which deletes its temporary working files after the request finishes.",
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
      "Your staff account uses your official email address. Scanner drafts are saved in this browser for recovery, so clear them when you finish on a shared device. Drafts older than 24 hours are removed when you next open the scanner. PDFDock does not keep a history of the documents you process.",
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
