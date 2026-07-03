"use client";

// iOS-style switch used for boolean filters (e.g. "Show inactive items").
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-3 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
          checked ? "bg-sky-500" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-[15px] font-medium text-slate-300">{label}</span>
    </label>
  );
}
