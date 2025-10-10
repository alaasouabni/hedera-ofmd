import { ThemeToggle } from "../ThemeToggle";
import { WalletBadge } from "../wallet/WalletBadge";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <div className="card flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 shadow-glow" />
              <div>
                <div className="text-sm font-semibold">OFD Vouchers</div>
                <div className="text-[11px] text-[var(--muted)]">
                  Hedera · HSCS + HTS
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <WalletBadge />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-7xl px-4 pb-8">
        <div className="text-[11px] text-[var(--muted)]">
          © {new Date().getFullYear()} OFD
        </div>
      </footer>
    </div>
  );
}
