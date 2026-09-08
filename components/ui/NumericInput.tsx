"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  min?: number;
  max?: number;
};

function keepEmptyOverZero(current: string, external: string) {
  if (current === "" && (external === "" || external === "0")) return current;
  return external;
}

type DigitFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
  allowDecimal?: boolean;
};

/** String-Zahlenfeld: 0 darf gelöscht werden, leer bleibt leer (wird vom Aufrufer als 0 gelesen). */
export function DigitField({
  value,
  onValueChange,
  allowDecimal = false,
  className,
  placeholder = "",
  onFocus,
  onBlur,
  ...rest
}: DigitFieldProps) {
  const [text, setText] = useState(value ?? "");
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setText((current) => keepEmptyOverZero(current, value ?? ""));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      pattern={allowDecimal ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
      autoComplete="off"
      enterKeyHint="done"
      className={className}
      placeholder={placeholder}
      value={text}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        const pattern = allowDecimal ? /^\d*[.,]?\d*$/ : /^\d*$/;
        if (next !== "" && !pattern.test(next)) return;
        setText(next);
        onValueChange(next);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        onBlur?.(event);
      }}
    />
  );
}

/** Erlaubt leeres Feld beim Tippen (kein führendes 0-Problem wie bei type=number). Leeres Feld = null; Aufrufer behandeln null als 0. */
export default function NumericInput({ value, onValueChange, min, max, className, onBlur, onFocus, placeholder, ...rest }: Props) {
  const [text, setText] = useState(() => (value == null || Number.isNaN(value) ? "" : String(value)));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    const external = value == null || Number.isNaN(value) ? "" : String(value);
    setText((current) => keepEmptyOverZero(current, external));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      placeholder={placeholder ?? (min === 0 ? "0" : undefined)}
      value={text}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (next !== "" && !/^\d+$/.test(next)) return;
        setText(next);
        if (next === "") {
          onValueChange(null);
          return;
        }
        const parsed = Number.parseInt(next, 10);
        if (!Number.isFinite(parsed)) {
          onValueChange(null);
          return;
        }
        onValueChange(parsed);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        if (text === "") {
          onValueChange(null);
        } else {
          let parsed = Number.parseInt(text, 10);
          if (min != null && min > 0) parsed = Math.max(min, parsed);
          if (max != null) parsed = Math.min(max, parsed);
          onValueChange(parsed);
          setText(String(parsed));
        }
        onBlur?.(event);
      }}
    />
  );
}
