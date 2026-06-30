import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonVariant = "default" | "primary" | "ghost";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: IconButtonVariant;
  label: string;
  children: ReactNode;
};

const variantClass: Record<IconButtonVariant, string> = {
  default: "icon-btn",
  primary: "icon-btn icon-btn--primary",
  ghost: "icon-btn icon-btn--ghost",
};

export default function IconButton({
  variant = "default",
  label,
  className = "",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button type="button" className={`${variantClass[variant]} ${className}`.trim()} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
