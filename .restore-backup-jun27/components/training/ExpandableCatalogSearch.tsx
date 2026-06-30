"use client";

import { useEffect, useRef } from "react";

type ExpandableCatalogSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  ariaLabel: string;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="catalog-search__icon">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

export default function ExpandableCatalogSearch({
  value,
  onChange,
  placeholder,
  expanded,
  onExpandedChange,
  ariaLabel,
}: ExpandableCatalogSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpen = expanded || Boolean(value.trim());

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  return (
    <div
      className={`catalog-search ${isOpen ? "catalog-search--expanded" : "catalog-search--compact"}`}
      onClick={() => {
        if (!isOpen) onExpandedChange(true);
      }}
    >
      <SearchIcon />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="input catalog-search__input"
        onFocus={() => onExpandedChange(true)}
        onBlur={() => {
          if (!value.trim()) {
            onExpandedChange(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange("");
            onExpandedChange(false);
            inputRef.current?.blur();
          }
        }}
      />
      {isOpen ? (
        <button
          type="button"
          className="catalog-search__clear"
          aria-label={value ? "Suche leeren" : "Suche schließen"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            if (value) {
              onChange("");
              inputRef.current?.focus();
              return;
            }
            onExpandedChange(false);
            inputRef.current?.blur();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
