type FilterClearButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
};

export default function FilterClearButton({ onClick, disabled = false, label = "Alle Filter löschen" }: FilterClearButtonProps) {
  return (
    <button
      type="button"
      className="filter-clear-btn"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      ×
    </button>
  );
}
