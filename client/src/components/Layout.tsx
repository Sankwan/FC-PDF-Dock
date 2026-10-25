import React from "react";
import Header from "./Header";
import Footer from "./Footer";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="app-shell flex min-h-screen flex-col bg-card">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-card focus:p-3 focus:text-foreground">Skip to main content</a>
      <Header />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-grow">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;
