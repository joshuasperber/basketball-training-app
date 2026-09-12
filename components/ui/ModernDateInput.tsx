"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker, type Matcher } from "react-day-picker";
import { de } from "react-day-picker/locale";
import styles from "./ModernDateInput.module.css";

type ModernDateInputProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  min?: string;
  max?: string;
  required?: boolean;
  className?: string;
  controlClassName?: string;
  id?: string;
};

function parseDateKey(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const date = parseDateKey(value);
  return date
    ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
    : "Datum wählen";
}

function isAllowed(value: string, min?: string, max?: string) {
  return (!min || value >= min) && (!max || value <= max);
}

export default function ModernDateInput({
  value,
  onChange,
  label,
  min,
  max,
  required,
  className = "",
  controlClassName = "",
  id,
}: ModernDateInputProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => parseDateKey(value) ?? new Date());
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const selectedDate = parseDateKey(value);
  const minDate = parseDateKey(min);
  const maxDate = parseDateKey(max);
  const today = new Date();
  const todayKey = toDateKey(today);
  const disabled: Matcher[] = [
    ...(minDate ? [{ before: minDate } satisfies Matcher] : []),
    ...(maxDate ? [{ after: maxDate } satisfies Matcher] : []),
  ];

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function toggleCalendar() {
    if (open) {
      setOpen(false);
      return;
    }
    const nextMonth = selectedDate ?? new Date();
    setMonth(nextMonth);
    const rect = buttonRef.current?.getBoundingClientRect();
    const width = Math.min(328, window.innerWidth - 24);
    const height = 390;
    const left = rect ? Math.min(Math.max(12, rect.left), window.innerWidth - width - 12) : 12;
    const below = (rect?.bottom ?? 0) + 8;
    const top = rect && below + height > window.innerHeight ? Math.max(12, rect.top - height - 8) : below;
    setPosition({ top, left });
    setOpen(true);
  }

  function selectDate(date?: Date) {
    if (!date) return;
    const next = toDateKey(date);
    if (!isAllowed(next, min, max)) return;
    onChange(next);
    setMonth(date);
    setOpen(false);
    buttonRef.current?.focus();
  }

  const calendar = open ? (
    <div
      ref={popoverRef}
      className={styles.popover}
      role="dialog"
      aria-label="Datum auswählen"
      style={{ position: "fixed", zIndex: 11000, top: position.top, left: position.left }}
    >
      <p className={styles.eyebrow}>Datum auswählen</p>
      <DayPicker
        mode="single"
        locale={de}
        weekStartsOn={1}
        month={month}
        onMonthChange={setMonth}
        selected={selectedDate}
        onSelect={selectDate}
        disabled={disabled}
        startMonth={minDate}
        endMonth={maxDate}
        showOutsideDays
        fixedWeeks
        autoFocus
        classNames={{
          root: styles.calendar,
          months: styles.months,
          month: styles.month,
          month_caption: styles.monthCaption,
          caption_label: styles.captionLabel,
          nav: styles.nav,
          button_previous: styles.navButton,
          button_next: styles.navButton,
          chevron: styles.chevron,
          month_grid: styles.monthGrid,
          weekdays: styles.weekdays,
          weekday: styles.weekday,
          weeks: styles.weeks,
          week: styles.week,
          day: styles.day,
          day_button: styles.dayButton,
          selected: styles.selected,
          today: styles.today,
          outside: styles.outside,
          disabled: styles.disabled,
        }}
      />
      <div className={styles.footer} aria-live="polite">
        <span>{value ? formatDate(value) : "Noch kein Datum gewählt"}</span>
        <button type="button" disabled={!isAllowed(todayKey, min, max)} onClick={() => selectDate(today)}>Heute</button>
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`${styles.field} ${className}`}>
      {label ? <label className="input-label" htmlFor={id}>{label}{required ? " *" : ""}</label> : null}
      <button ref={buttonRef} id={id} type="button" className={`${styles.trigger} ${open ? styles.triggerOpen : ""} ${controlClassName}`} aria-haspopup="dialog" aria-expanded={open} onClick={toggleCalendar}>
        <span className={styles.icon} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 3v3M17 3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><path d="M8 13h2M14 13h2M8 16.5h2M14 16.5h2" /></svg>
        </span>
        <span className={`${styles.value} ${value ? "" : styles.empty}`}>{formatDate(value)}</span>
        <span className={styles.triggerChevron} aria-hidden><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6.5 8 3.5 3.5L13.5 8" /></svg></span>
      </button>
      {mounted && calendar ? createPortal(calendar, document.body) : null}
    </div>
  );
}
