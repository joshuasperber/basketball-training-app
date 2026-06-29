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
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        strokeLinecap="round"
      />
    </svg>
  );
}
