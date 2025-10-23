// components/VoucherCards.tsx
import React from "react";
import type { DashboardData } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Stat } from "./ui/Stat";
import { Badge } from "./ui/Badge";
import { AddressPill } from "./ui/AddressPill";
import { Wallet, Factory, HandCoins, Users } from "lucide-react";
import { motion } from "framer-motion";

/* ----------------------------------------------------------
   RADICAL DESIGN REFRESH (style-only)
   - Stat tiles remain as elevated cards (pro-card)
   - Data lists become flat, border-only sections (no card chrome)
   - Layout: stats row -> list row (2-up on large screens)
   - Token-driven colors via CSS variables; no logic changes
----------------------------------------------------------- */

const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const spring = { type: "spring", stiffness: 260, damping: 28 } as const;

/* ------- format ONLY for the new merchant "issuers" card (18d -> human) ------- */
const TEN18 = 10n ** 18n;
const INT_RE = /^\d+$/;
/** Convert big-int string in wei (18d) to a readable string with up to 6 dp. */
function fmtHOFD18ForIssuers(v?: string | null): string {
  if (v == null) return "—";
  const s = String(v).trim();
  if (!s) return "—";
  // If it already contains a dot, show as-is (we only want to fix raw wei).
  if (!INT_RE.test(s)) return s;
  try {
    const wei = BigInt(s);
    const whole = wei / TEN18;
    const frac = wei % TEN18;
    if (frac === 0n) return whole.toString();
    const fracFull = frac.toString().padStart(18, "0");
    const clipped = fracFull.slice(0, 6).replace(/0+$/, "");
    return clipped ? `${whole.toString()}.${clipped}` : whole.toString();
  } catch {
    return s;
  }
}

export function VoucherCards({
  role,
  data,
}: {
  role: "sponsor" | "merchant" | "supplier";
  /** Allow null/undefined so call-sites like {data && <VoucherCards ... />} type-check cleanly */
  data: DashboardData | null | undefined;
}) {
  // Defensive helpers
  const sponsorCards =
    (data?.sponsor?.cards as Array<{
      merchant: string;
      issuedHOFD?: string;
    }>) ?? [];

  const merchantData = (data?.merchant as
    | {
        unspentVOFD: string | null;
        spentHOFD: string | null;
        topSuppliers: Array<{ supplier: string; amountHOFD: string }>;
        // NEW: issuers list for merchant
        issuers?: Array<{ sponsor: string; issuedHOFD: string }>;
      }
    | undefined) ?? {
    unspentVOFD: "—",
    spentHOFD: "0",
    topSuppliers: [] as Array<{ supplier: string; amountHOFD: string }>,
    issuers: [] as Array<{ sponsor: string; issuedHOFD: string }>,
  };

  const supplierData = (data?.supplier as
    | {
        unclaimedVOFD: string | null;
        claimedHOFD: string | null;
        recentMerchants: Array<{ merchant: string; amountHOFD: string }>;
      }
    | undefined) ?? {
    unclaimedVOFD: "—",
    claimedHOFD: "0",
    recentMerchants: [] as Array<{ merchant: string; amountHOFD: string }>,
  };

  /* ------------------------- Reusable UI bits ------------------------- */
  // Elevated cards for KPI tiles only
  const cardChrome = "pro-card"; // from index.css overhaul

  // Border-only sections for lists (no shadow)
  const section =
    "rounded-2xl border border-[var(--border)] bg-[color:var(--surface)]";
  const sectionHead =
    "flex items-center justify-between px-4 py-3 border-b border-[var(--border)] text-[13px] font-semibold text-[color:var(--ink)]";
  const sectionTitle = "flex items-center gap-2";
  const rows = "p-2 grid gap-2 max-h-56 overflow-auto";
  const row =
    "flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 hover:bg-[color:var(--surface-2)] transition-colors";
  const empty = "px-3 py-2 text-xs text-[var(--muted)]";

  const gridStats = "grid gap-5 md:gap-6 md:grid-cols-2";
  const gridLists2 = "grid gap-5 md:gap-6 lg:grid-cols-2";

  if (role === "sponsor") {
    // Convert to a single flat section list, not many cards
    return (
      <div className="grid gap-6">
        <section className={section}>
          <div className={sectionHead}>
            <div className={sectionTitle}>
              <Factory size={16} /> Issued vouchers
            </div>
          </div>
          <div className={rows}>
            {sponsorCards.length === 0 ? (
              <div className={empty}>No issued vouchers yet.</div>
            ) : (
              sponsorCards.slice(0, 12).map((c, i) => (
                <motion.div
                  key={`${c.merchant}-${i}`}
                  className={row}
                  {...fade}
                  transition={{ delay: 0.01 * i, ...spring }}
                >
                  <AddressPill addr={c.merchant} />
                  <Badge tone="amber" className="pro-badge">{c.issuedHOFD ?? "—"}</Badge>
                </motion.div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  }

  if (role === "merchant") {
    const top = merchantData.topSuppliers ?? [];
    const issuers =
      merchantData.issuers ??
      ([] as Array<{ sponsor: string; issuedHOFD: string }>);

    return (
      <div className="grid gap-6">
        {/* KPI tiles */}
        <div className={gridStats}>
          <motion.div
            {...fade}
            transition={{ ...spring }}
            className="[&>*]:w-full"
          >
            <div className={`${cardChrome} p-3`}>
              <Stat
                icon={<Wallet size={18} />}
                label="Unspent vOFD"
                value={merchantData.unspentVOFD ?? "—"}
                hint="Current token balance (8 decimals)"
              />
            </div>
          </motion.div>
          <motion.div
            {...fade}
            transition={{ delay: 0.04, ...spring }}
            className="[&>*]:w-full"
          >
            <div className={`${cardChrome} p-3`}>
              <Stat
                label="Spent (lifetime)"
                value={merchantData.spentHOFD ?? "0"}
                hint="Total voucher value sent to suppliers"
              />
            </div>
          </motion.div>
        </div>

        {/* Data sections */}
        <div className={gridLists2}>
          <section className={section}>
            <div className={sectionHead}>
              <div className={sectionTitle}>
                <HandCoins size={16} /> Top suppliers
              </div>
            </div>
            <div className={rows}>
              {(top?.length ?? 0) === 0 ? (
                <div className={empty}>No spends yet.</div>
              ) : (
                top.slice(0, 8).map((s, i) => (
                  <motion.div
                    key={`${s.supplier}-${i}`}
                    className={row}
                    whileHover={{ y: -1 }}
                    transition={spring}
                  >
                    <AddressPill addr={s.supplier} />
                    <Badge tone="blue" className="pro-badge">
                      {s.amountHOFD ?? "0"}
                    </Badge>
                  </motion.div>
                ))
              )}
            </div>
          </section>

          <section className={section}>
            <div className={sectionHead}>
              <div className={sectionTitle}>
                <Users size={16} /> Sponsors who issued to you
              </div>
            </div>
            <div className={rows}>
              {(issuers?.length ?? 0) === 0 ? (
                <div className={empty}>No issues received yet.</div>
              ) : (
                issuers.slice(0, 8).map((u, i) => (
                  <motion.div
                    key={`${u.sponsor}-${i}`}
                    className={row}
                    whileHover={{ y: -1 }}
                    transition={spring}
                  >
                    <AddressPill addr={u.sponsor} />
                    <Badge tone="green" className="pro-badge">
                      {fmtHOFD18ForIssuers(u.issuedHOFD)}
                    </Badge>
                  </motion.div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // supplier
  const recent = supplierData.recentMerchants ?? [];
  return (
    <div className="grid gap-6">
      <div className={gridStats}>
        <motion.div
          {...fade}
          transition={{ ...spring }}
          className="[&>*]:w-full"
        >
          <div className={`${cardChrome} p-3`}>
            <Stat
              label="Unclaimed vOFD"
              value={supplierData.unclaimedVOFD ?? "—"}
              hint="Current token balance (8 decimals)"
            />
          </div>
        </motion.div>
        <motion.div
          {...fade}
          transition={{ delay: 0.04, ...spring }}
          className="[&>*]:w-full"
        >
          <div className={`${cardChrome} p-3`}>
            <Stat
              label="Claimed (lifetime)"
              value={supplierData.claimedHOFD ?? "0"}
              hint="Total hOFD redeemed"
            />
          </div>
        </motion.div>
      </div>

      <section className={section}>
        <div className={sectionHead}>
          <div className={sectionTitle}>
            <HandCoins size={16} /> Recent merchants
          </div>
        </div>
        <div className={rows}>
          {(recent?.length ?? 0) === 0 ? (
            <div className={empty}>No recent spends.</div>
          ) : (
            recent.slice(0, 8).map((m, i) => (
              <motion.div
                key={`${m.merchant}-${i}`}
                className={row}
                whileHover={{ y: -1 }}
                transition={spring}
              >
                <AddressPill addr={m.merchant} />
                <Badge tone="green" className="pro-badge">
                  {m.amountHOFD ?? "0"}
                </Badge>
              </motion.div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--muted)]">{k}</span>
      <span className="font-semibold tracking-tight text-[var(--ink)]">
        {v}
      </span>
    </div>
  );
}
