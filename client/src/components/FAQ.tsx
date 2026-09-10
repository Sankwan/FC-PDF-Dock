import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const faqs = [
  {
    id: "q1",
    question: "Is this really free, and do I need an account?",
    answer:
      "Yes. No fees, no subscription, no account required. Every tool here is accessible without any payment or sign-up.",
  },
  {
    id: "q2",
    question: "Do my files get uploaded anywhere?",
    answer:
      "No. All processing runs entirely in your browser using JavaScript libraries. Your files never leave your device — there is no server that ever sees them.",
  },
  {
    id: "q3",
    question: "What's the maximum file size?",
    answer:
      "It depends on your device's available memory. Most tools handle files up to 100MB comfortably. For best performance, files under 50MB work best.",
  },
  {
    id: "q5",
    question: "Which browsers are supported?",
    answer:
      "All modern browsers: Chrome, Firefox, Safari, Edge. A few features may behave differently on older Safari versions — an up-to-date Chromium-based browser gives the most consistent results.",
  },
];

const FAQ = () => {
  const [openId, setOpenId] = useState<string>("q1");

  return (
    <section id="faq" className="py-14 bg-card">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">FAQ</span>
          </div>
          <h2 className="text-3xl font-bold font-heading text-foreground">Frequently asked questions</h2>
        </div>

        <div className="max-w-3xl">
          {faqs.map((faq) => (
            <div
              key={faq.id}
              className={`border-b border-border ${openId === faq.id ? "border-l-2 border-l-brand" : ""}`}
            >
              <button
                className="w-full flex items-center justify-between py-4 px-4 text-left hover:bg-muted transition-colors focus:outline-none"
                onClick={() => setOpenId(openId === faq.id ? "" : faq.id)}
              >
                <span className={`text-sm font-semibold pr-4 ${openId === faq.id ? "text-brand" : "text-foreground"}`}>
                  {faq.question}
                </span>
                <span className="flex-shrink-0 text-foreground">
                  {openId === faq.id ? <Minus size={14} /> : <Plus size={14} />}
                </span>
              </button>
              {openId === faq.id && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
