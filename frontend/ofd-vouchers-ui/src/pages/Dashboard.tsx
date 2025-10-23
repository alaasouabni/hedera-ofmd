// pages/Dashboard.tsx
import React from "react";
import { RoleTabs } from "../components/RoleTabs";
import { SponsorView } from "../components/SponsorView";
import { MerchantView } from "../components/MerchantView";
import { SupplierView } from "../components/SupplierView";
import { useWallet } from "../components/wallet/WalletProvider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Shield, Building2, HandCoins, Sparkles, Coins } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";

export function Dashboard() {
  // match your WalletCtx shape
  const { roles, owner, connecting, connect } = useWallet() as any;

  // role flags safe even if roles is undefined
  const allowed = {
    sponsor: Boolean(roles?.sponsor),
    merchant: Boolean(roles?.merchant),
    supplier: Boolean(roles?.supplier),
  };

  const first =
    (["sponsor", "merchant", "supplier", "undefined"] as const).find(
      (r) => (allowed as any)[r]
    ) || "undefined";

  const [role, setRole] = React.useState<
    "sponsor" | "merchant" | "supplier" | "undefined"
  >(first);

  React.useEffect(() => {
    setRole(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles?.sponsor, roles?.merchant, roles?.supplier]);

  const icon =
    role === "sponsor" ? (
      <Shield size={16} />
    ) : role === "merchant" ? (
      <Building2 size={16} />
    ) : (
      <HandCoins size={16} />
    );

  // Wallet disconnected UI: use `owner` presence as the connection indicator
  if (!owner) {
    return (
      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-[var(--glass)] flex items-center justify-center ring-1 ring-[var(--border)]">
              <Sparkles size={16} />
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
              Dashboard
            </h1>
          </div>
        </div>

        <Card className="bg-[var(--panel)]">
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="text-[var(--muted)]">Wallet disconnected</span>
              <Badge tone="rose" className="ml-1">
                Not connected
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-4 flex flex-col gap-3 items-start">
            <div className="text-sm text-[var(--muted)]">
              Connect your wallet to view and manage roles, positions and
              vouchers.
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  typeof connect === "function"
                    ? connect()
                    : window.alert(
                        "Please connect your wallet using your wallet modal/extension."
                      )
                }
                disabled={Boolean(connecting)}
                className="inline-flex h-9 items-center rounded-xl px-3 ring-1 ring-[var(--border)] hover:bg-[var(--glass)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {connecting ? "Connecting..." : "Connect Wallet"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  // Main dashboard when connected (owner exists)
  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-[var(--glass)] flex items-center justify-center ring-1 ring-[var(--border)]">
            <Sparkles size={16} />
          </div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
            Dashboard
          </h1>
        </div>
        <RoleTabs value={role} onChange={setRole} allowed={allowed} />
      </div>

      {/* Active role badge */}
      <Card className="bg-[var(--panel)]">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            {icon}
            <span className="text-[var(--muted)]">Active role</span>
            <Badge tone="blue" className="ml-1 capitalize">
              {role}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 text-xs text-[var(--muted)]">
          Use the tabs to switch roles. Each view shows role-specific actions
          and voucher insights.
        </CardContent>
      </Card>

      {/* Supplier CTA → Manage Positions */}
      {(allowed.sponsor || allowed.supplier || allowed.merchant) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Coins size={16} /> Manage Positions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm">
            <div className="text-[var(--muted)]">
              Open new positions and manage minting from one place.
            </div>
            <Link
              to="/positions"
              className="inline-flex h-9 items-center rounded-xl px-3 ring-1 ring-[var(--border)] hover:bg-[var(--glass)]"
            >
              Open
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Views */}
      <div className="space-y-4">
        {role === "sponsor" && <SponsorView />}
        {role === "merchant" && <MerchantView />}
        {role === "supplier" && <SupplierView />}
      </div>

      {/* No roles fallback */}
      {!allowed.sponsor && !allowed.merchant && !allowed.supplier && (
        <Card>
          <CardContent className="py-6 text-sm text-[var(--muted)]">
            No roles assigned to this wallet yet. Ask an admin to grant a role.
          </CardContent>
        </Card>
      )}
    </section>
  );
}
