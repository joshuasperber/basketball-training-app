import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  variant?: "default" | "elevated";
  id?: string;
};

export default function AppCard({ children, className = "", variant = "default", id }: Props) {
  const surface = variant === "elevated" ? "app-card shadow-[var(--shadow-card)]" : "app-card app-card--flat";
  return (
    <div id={id} className={`${surface} ${className}`}>
      {children}
    </div>
  );
}
