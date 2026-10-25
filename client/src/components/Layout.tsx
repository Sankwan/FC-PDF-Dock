import React from "react";
import Header from "./Header";
import Footer from "./Footer";
import { useAuth } from "@/context/Auth";
import { features } from "@/brand";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isDemo } = useAuth();
  return (
    <div className="app-shell flex min-h-screen flex-col bg-card">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-card focus:p-3 focus:text-foreground">Skip to main content</a>
      <Header />
      {isDemo && <div role="status" className="border-b border-border bg-brand-tint px-4 py-2 text-center text-sm text-foreground">Demo session · Use sample documents. {features.pdfToWord ? "PDF to Word sends PDFs to the Railway test server." : "Server-based PDF to Word is unavailable."}</div>}
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-grow">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;
