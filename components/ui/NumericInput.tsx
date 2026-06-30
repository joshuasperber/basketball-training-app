"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  min?: number;
  max?: number;
};

/** Erlaubt leeres Feld beim Tippen (kein führendes 0-Problem wie bei type=number). */
export default function NumericInput({ value, onValueChange, min, max, className, onBlur, ...rest }: Props) {
  const [text, setText] = useState(() => (value == null || Number.isNaN(value) ? "" : String(value)));

  useEffect(() => {
    const external = value == null || Number.isNaN(value) ? "" : String(value);
    setText((current) => (current === "" && external === "0" ? current : external));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      className={className}
      value={text}
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
        if (text === "" && min != null) {
          onValueChange(min);
          setText(String(min));
        } else if (text !== "") {
          let parsed = Number.parseInt(text, 10);
          if (min != null) parsed = Math.max(min, parsed);
          if (max != null) parsed = Math.min(max, parsed);
          onValueChange(parsed);
          setText(String(parsed));
        }
        onBlur?.(event);
      }}
    />
  );
}
