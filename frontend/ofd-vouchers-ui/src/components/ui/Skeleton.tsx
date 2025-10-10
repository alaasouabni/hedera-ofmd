import { cn } from "../../lib/cn";
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-xl bg-white/30", className)} />
  );
}
