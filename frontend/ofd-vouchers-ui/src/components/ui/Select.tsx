import { cn } from "../../lib/cn";

export function Select({
  className,
  ...p
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 px-3 text-sm focus-visible:focus-ring",
        className
      )}
      {...p}
    />
  );
}
