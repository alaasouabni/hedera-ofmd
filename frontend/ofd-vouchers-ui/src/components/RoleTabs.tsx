import { cn } from "../lib/cn";

export function RoleTabs({
  value,
  onChange,
  allowed,
}: {
  value: "sponsor" | "merchant" | "supplier";
  onChange: (v: any) => void;
  allowed: Partial<Record<"sponsor" | "merchant" | "supplier", boolean>>;
}) {
  const base = "h-9 px-3 rounded-lg text-sm transition";
  const tabs = ["sponsor", "merchant", "supplier"] as const;

  return (
    <div className="card p-1 inline-flex items-center gap-1">
      {tabs.map((tab) => {
        const enabled = !!allowed[tab];
        return (
          <button
            key={tab}
            disabled={!enabled}
            onClick={() => enabled && onChange(tab)}
            className={cn(
              base,
              value === tab
                ? "bg-white/70 text-blue-700 shadow-sm"
                : "text-[var(--muted)] hover:bg-white/20",
              !enabled && "opacity-40 cursor-not-allowed"
            )}
            title={!enabled ? "Not allowlisted for this role" : ""}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
