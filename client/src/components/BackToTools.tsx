import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

const BackToTools = () => {
  return (
    <Link 
      href="/#tools" 
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-brand transition-colors mb-6 group"
    >
      <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
      Back to All Tools
    </Link>
  );
};

export default BackToTools;
