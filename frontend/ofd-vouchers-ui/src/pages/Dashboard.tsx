import React from "react";
import { RoleTabs } from "../components/RoleTabs";
import { SponsorView } from "../components/SponsorView";
import { MerchantView } from "../components/MerchantView";
import { SupplierView } from "../components/SupplierView";
import { useWallet } from "../components/wallet/WalletProvider";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Shield, Building2, HandCoins, Sparkles } from "lucide-react";

export function Dashboard() {
  const { roles } = useWallet();
  const allowed = {
    sponsor: roles.sponsor,
    merchant: roles.merchant,
    supplier: roles.supplier,
  };

  const first =
    (["sponsor", "merchant", "supplier"] as const).find(
      (r) => (allowed as any)[r]
    ) || "merchant";

  const [role, setRole] = React.useState<"sponsor" | "merchant" | "supplier">(
    first
  );

  React.useEffect(() => {
    setRole(first);
  }, [roles.sponsor, roles.merchant, roles.supplier]);

  const icon =
    role === "sponsor" ? (
      <Shield size={16} />
    ) : role === "merchant" ? (
      <Building2 size={16} />
    ) : (
      <HandCoins size={16} />
    );

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
