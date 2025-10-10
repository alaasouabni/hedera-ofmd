import React from "react";
import type { DashboardData } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Stat } from "./ui/Stat";
import { Badge } from "./ui/Badge";
import { AddressPill } from "./ui/AddressPill";
import { Wallet, Factory, HandCoins } from "lucide-react";
import { motion } from "framer-motion";

const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

export function VoucherCards({
  role,
  data,
}: {
  role: "sponsor" | "merchant" | "supplier";
  data: DashboardData;
}) {
  if (role === "sponsor") {
    const cards = data?.sponsor?.cards ?? [];
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {cards.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--muted)]">
            No issued vouchers yet.
          </Card>
        ) : (
          cards.map((c, i) => (
            <motion.div key={i} {...fade} transition={{ delay: 0.02 * i }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Factory size={16} /> Issued to
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <AddressPill addr={c.merchant} />
                  <Row k="Issued (hOFD)" v={c.issuedHOFD ?? "—"} />
                  <Row k="Merchant Spent" v={c.merchantSpentHOFD ?? "—"} />
                  <Row
                    k="Supplier Redeemed"
                    v={c.supplierRedeemedHOFD ?? "—"}
                  />
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    );
  }

  if (role === "merchant") {
    const top = data?.merchant?.topSuppliers ?? [];
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <motion.div {...fade}>
          <Stat
            icon={<Wallet size={18} />}
            label="Unspent vOFD"
            value={data?.merchant?.unspentVOFD ?? "—"}
            hint="Current token balance (8 decimals)"
          />
        </motion.div>
        <motion.div {...fade} transition={{ delay: 0.04 }}>
          <Stat
            label="Spent (lifetime)"
            value={data?.merchant?.spentHOFD ?? "0"}
            hint="Total voucher value sent to suppliers"
          />
        </motion.div>
        <motion.div {...fade} transition={{ delay: 0.08 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HandCoins size={16} /> Top suppliers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {top.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">
                  No spends yet.
                </div>
              ) : (
                <ul className="text-xs space-y-2 max-h-56 overflow-auto pr-1">
                  {top.slice(0, 8).map((s, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <AddressPill addr={s.supplier} />
                      <Badge tone="blue">{s.amountHOFD}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const recent = data?.supplier?.recentMerchants ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <motion.div {...fade}>
        <Stat
          label="Unclaimed vOFD"
          value={data?.supplier?.unclaimedVOFD ?? "—"}
          hint="Current token balance (8 decimals)"
        />
      </motion.div>
      <motion.div {...fade} transition={{ delay: 0.04 }}>
        <Stat
          label="Claimed (lifetime)"
          value={data?.supplier?.claimedHOFD ?? "0"}
          hint="Total hOFD redeemed"
        />
      </motion.div>
      <motion.div {...fade} transition={{ delay: 0.08 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HandCoins size={16} /> Recent merchants
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="text-xs text-[var(--muted)]">
                No recent spends.
              </div>
            ) : (
              <ul className="text-xs space-y-2 max-h-56 overflow-auto pr-1">
                {recent.slice(0, 8).map((m, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <AddressPill addr={m.merchant} />
                    <Badge tone="green">{m.amountHOFD}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--muted)]">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
