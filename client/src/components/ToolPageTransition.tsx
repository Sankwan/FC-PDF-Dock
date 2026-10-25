import type { ReactNode } from "react";
import { useLocation } from "wouter";

/** Keep the app chrome steady while a tool opens from the right. */
export default function ToolPageTransition({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  return <div key={path} className={path === "/" ? undefined : "tool-page-enter"}>{children}</div>;
}
