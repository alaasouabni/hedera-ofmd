import { cn } from "../../lib/cn";
import React from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";
export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 h-10 text-sm font-medium transition active:translate-y-[1px]";
  const styles = {
    primary:
      "text-white bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-500/90 hover:to-blue-600/90 shadow-glow",
    outline: "border border-white/20 bg-transparent hover:bg-white/10",
    ghost: "bg-transparent hover:bg-white/10",
    danger:
      "text-white bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-500/90 hover:to-rose-600/90 shadow-glow",
  }[variant];
  return (
    <button
      className={cn("focus-visible:focus-ring", base, styles, className)}
      {...props}
    />
  );
}
