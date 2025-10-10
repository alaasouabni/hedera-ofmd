import { cn } from "../../lib/cn";
import React from "react";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...p }, ref) => (
  <input
    ref={ref}
    className={cn(
      "w-full h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 px-3 text-sm",
      "placeholder:text-[var(--muted)]/70",
      "focus-visible:focus-ring",
      className
    )}
    {...p}
  />
));
Input.displayName = "Input";
