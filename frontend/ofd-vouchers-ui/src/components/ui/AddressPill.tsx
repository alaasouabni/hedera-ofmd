import { Copy, ExternalLink } from "lucide-react";
import { cn } from "../../lib/cn";

export function shortAddr(a?: string, n = 4) {
  if (!a) return "—";
  const s = a.toLowerCase();
  return s.length > 2 * n + 2 ? `${s.slice(0, 2 + n)}…${s.slice(-n)}` : s;
}

export function AddressPill({
  addr,
  href,
  className,
}: {
  addr?: string;
  href?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-xl bg-white/30 border border-white/20 px-2.5 py-1 text-xs",
        className
      )}
    >
      <code className="font-mono">{shortAddr(addr)}</code>
      {addr && (
        <>
          <button
            className="opacity-70 hover:opacity-100"
            title="Copy"
            onClick={() => navigator.clipboard.writeText(addr)}
          >
            <Copy size={14} />
          </button>
          {href && (
            <a
              className="opacity-70 hover:opacity-100"
              href={href}
              target="_blank"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </>
      )}
    </span>
  );
}
