"use client";

import { useId } from "react";
import styles from "./ModernTimeInput.module.css";

type ModernTimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
  controlClassName?: string;
  id?: string;
};

export default function ModernTimeInput({
  value,
  onChange,
  label,
  required,
  className = "",
  controlClassName = "",
  id,
}: ModernTimeInputProps) {
  const generatedId = useId();
  const inputId = id ?? `time-${generatedId.replaceAll(":", "")}`;

  return (
    <label className={`${styles.field} ${className}`} htmlFor={inputId}>
      {label ? <span className="input-label">{label}{required ? " *" : ""}</span> : null}
      <span className={`${styles.control} ${controlClassName}`}>
        <span className={styles.icon} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
        </span>
        <input
          id={inputId}
          type="time"
          value={value}
          required={required}
          className={styles.input}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              event.currentTarget.focus();
            }
          }}
        />
        <span className={styles.suffix} aria-hidden>Uhr</span>
      </span>
    </label>
  );
}
