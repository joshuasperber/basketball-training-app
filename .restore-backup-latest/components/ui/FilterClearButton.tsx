type FilterClearButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
};

export default function FilterClearButton({ onClick, disabled = false, label = "Löschen" }: FilterClearButtonProps) {
  return (
    <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={onClick} disabled={disabled} aria-label="Filter löschen">
      {label}
    </button>
  );
}
