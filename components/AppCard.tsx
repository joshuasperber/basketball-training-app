import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  variant?: "default" | "elevated";
  id?: string;
};

export default function AppCard({ children, className = "", variant = "default", id }: Props) {
  const surface =
    variant === "elevated"
      ? "border-zinc-700/80 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 shadow-lg shadow-black/40"
      : "border-zinc-800 bg-zinc-900/90";
  return (
    <div id={id} className={`rounded-2xl border p-4 ${surface} ${className}`}>
      {children}
    </div>
  );
}
