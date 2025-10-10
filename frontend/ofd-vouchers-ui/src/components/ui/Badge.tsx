import { cn } from "../../lib/cn";
export function Badge({
  tone = "ink",
  children,
  className,
}: {
  tone?: "ink" | "blue" | "green" | "rose" | "amber";
  children: React.ReactNode;
  className?: string;
}) {
  const toneCls = {
    ink: "bg-white/30 border border-white/25 text-[var(--ink)]",
    blue: "bg-blue-500/10 text-blue-600 border border-blue-400/30",
    green: "bg-emerald-500/10 text-emerald-600 border border-emerald-400/30",
    rose: "bg-rose-500/10 text-rose-600 border border-rose-400/30",
    amber: "bg-amber-500/10 text-amber-600 border border-amber-400/30",
  }[tone];
  return (
    <span
      className={cn("px-2.5 py-1 rounded-lg text-[11px]", toneCls, className)}
    >
      {children}
    </span>
  );
}
