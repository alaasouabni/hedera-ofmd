// lib/utils.ts
import { evmRead } from "./evm";
import { ethers, type Log, type EventLog } from "ethers";
import { voucherModuleAbi, erc20Abi } from "./contracts";
import {
  hederaApproveVOFDAllowance,
  hederaAssociateToken,
  fetchVOFDBalance,
} from "./hedera";

export const readProviders = { ethers };

const VOUCHER = import.meta.env.VITE_VOUCHER_MODULE as string;
const HOFD = import.meta.env.VITE_HOFD as string;
const VOFD = import.meta.env.VITE_VOFD as string;
// keep your deploy block or env override
const DEPLOY_BLOCK = Number(import.meta.env.VITE_VOUCHER_DEPLOY_BLOCK || 0);

// --- NEW: backend base ---
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  "http://localhost:4000";

// ---------- small helpers ----------
function isEventLog(l: Log | EventLog): l is EventLog {
  return (l as EventLog).args !== undefined;
}
export function format18(v: bigint) {
  return ethers.formatUnits(v, 18);
}
export function toHOFDWeiMultiple1e10(userStr: string): bigint {
  const wei = ethers.parseUnits(userStr || "0", 18);
  if (wei % 10_000_000_000n !== 0n) {
    throw new Error(
      "Amount must be multiple of 1e-10 OFD (for 18->8 conversion)"
    );
  }
  return wei;
}

/** ── NEW: render-friendly number helpers (≤6 dp, trim zeros) ─────────────── */
function clipDecimals(s: string, dp = 6): string {
  const [i, d = ""] = s.split(".");
  const clipped = d.slice(0, dp).replace(/0+$/, "");
  return clipped ? `${i}.${clipped}` : i;
}
function fmt18Short(x: string | number | bigint | undefined | null): string {
  if (x == null) return "—";
  try {
    if (typeof x === "string") {
      if (/^\d+$/.test(x))
        return clipDecimals(ethers.formatUnits(BigInt(x), 18));
      if (/^\d+(\.\d+)?$/.test(x)) return clipDecimals(x);
    }
    if (typeof x === "bigint") return clipDecimals(ethers.formatUnits(x, 18));
    if (typeof x === "number")
      return clipDecimals(ethers.formatUnits(BigInt(Math.floor(x)), 18));
  } catch {}
  return String(x);
}

// ---------- roles & owner ----------
export async function fetchOwner(): Promise<string> {
  const c = new ethers.Contract(VOUCHER, voucherModuleAbi, evmRead);
  return await c.owner();
}

export async function fetchRoles(
  addr: string
): Promise<{ sponsor: boolean; merchant: boolean; supplier: boolean }> {
  const c = new ethers.Contract(VOUCHER, voucherModuleAbi, evmRead);
  const [s, m, u] = await Promise.all([
    c.isSponsor(addr),
    c.isMerchant(addr),
    c.isSupplier(addr),
  ]);
  return { sponsor: !!s, merchant: !!m, supplier: !!u };
}

// ---------- dashboard (scoped to the connected user) ----------
export type DashboardData = Awaited<ReturnType<typeof fetchDashboard>>;

/**
 * Fetch cards scoped to the CURRENT user only.
 * - evmAddress: the user’s 0x address (lowercased inside)
 * - hederaAccountId: the user’s Hedera 0.0.x (for HTS balance)
 *
 * CHANGE: voucher *events* are now fetched from the backend.
 * If backend is unavailable, we fallback to the previous on-chain approach.
 */
export async function fetchDashboard(ctx: {
  evmAddress: string;
  hederaAccountId?: string;
}) {
  const evm = ctx.evmAddress.toLowerCase();

  // --- 1) Try backend-first (recommended) ---
  try {
    const url = new URL(`${API_BASE}/vouchers/dashboard`);
    url.searchParams.set("address", evm);

    const r = await fetch(url.toString(), { credentials: "include" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const payload = await r.json();
    console.log("Raw dashboard payload from backend:", payload);

    /** Normalize big 18d amounts coming from backend into human strings */
    if (payload?.sponsor?.cards) {
      payload.sponsor.cards = payload.sponsor.cards.map((c: any) => ({
        ...c,
        issuedHOFD: fmt18Short(c.issuedHOFD),
        merchantSpentHOFD: fmt18Short(c.merchantSpentHOFD),
        supplierRedeemedHOFD: fmt18Short(c.supplierRedeemedHOFD),
      }));
    }
    if (payload?.merchant) {
      payload.merchant.spentHOFD = fmt18Short(payload.merchant.spentHOFD);
      if (Array.isArray(payload.merchant.topSuppliers)) {
        payload.merchant.topSuppliers = payload.merchant.topSuppliers.map(
          (s: any) => ({
            ...s,
            amountHOFD: fmt18Short(s.amountHOFD),
          })
        );
      }
    }
    if (payload?.supplier) {
      payload.supplier.claimedHOFD = fmt18Short(payload.supplier.claimedHOFD);
      if (Array.isArray(payload.supplier.recentMerchants)) {
        payload.supplier.recentMerchants = payload.supplier.recentMerchants.map(
          (m: any) => ({
            ...m,
            amountHOFD: fmt18Short(m.amountHOFD),
          })
        );
      }
    }

    // If backend didn’t include vOFD balances, fill them using Mirror (keeps previous behavior).
    const haveMerchantBalance = !!payload?.merchant?.unspentVOFD;
    const haveSupplierBalance = !!payload?.supplier?.unclaimedVOFD;
    console.log("Dashboard vOFD balances present?", {
      haveMerchantBalance,
      haveSupplierBalance,
    });
    if (!haveMerchantBalance || !haveSupplierBalance) {
      if (ctx.hederaAccountId) {
        console.log("Fetching missing vOFD balances from Mirror Node");
        const raw = await fetchVOFDBalance(ctx.hederaAccountId);
        const human = (Number(raw) / 1e8).toLocaleString(undefined, {
          maximumFractionDigits: 8,
        });
        payload.merchant = payload.merchant || {};
        payload.supplier = payload.supplier || {};
        if (!haveMerchantBalance) payload.merchant.unspentVOFD = human;
        if (!haveSupplierBalance) payload.supplier.unclaimedVOFD = human;
      }
    }
    console.log("Fetched dashboard from backend:", payload);
    return payload;
  } catch {
    console.warn("Backend dashboard fetch failed, falling back to on-chain");
    // swallow and fallback to on-chain
    const voucher = new ethers.Contract(VOUCHER, voucherModuleAbi, evmRead);

    // Sponsor view: Issue(sponsor=evm, merchant=any)
    const issueLogsSelf = (
      await voucher.queryFilter(
        voucher.filters.Issue(evm, null),
        DEPLOY_BLOCK,
        "latest"
      )
    ).filter(isEventLog);

    // Merchant view: Spend(merchant=evm, supplier=any)
    const spendLogsAsMerchant = (
      await voucher.queryFilter(
        voucher.filters.Spend(evm, null),
        DEPLOY_BLOCK,
        "latest"
      )
    ).filter(isEventLog);

    // Supplier view:
    //   - Spend(merchant=any, supplier=evm)
    //   - Redeem(supplier=evm)
    const spendLogsAsSupplier = (
      await voucher.queryFilter(
        voucher.filters.Spend(null, evm),
        DEPLOY_BLOCK,
        "latest"
      )
    ).filter(isEventLog);
    const redeemLogsSelf = (
      await voucher.queryFilter(
        voucher.filters.Redeem(evm),
        DEPLOY_BLOCK,
        "latest"
      )
    ).filter(isEventLog);

    // --- Sponsor cards (only issues you performed) ---
    const issueByMerchant = new Map<string, bigint>();
    for (const l of issueLogsSelf) {
      const merchant = (l.args.merchant as string).toLowerCase();
      const amt = l.args.amount as bigint;
      issueByMerchant.set(
        merchant,
        (issueByMerchant.get(merchant) || 0n) + amt
      );
    }
    const sponsorCards = Array.from(issueByMerchant.entries()).map(
      ([merchant, issued]) => {
        return {
          merchant,
          issuedHOFD: fmt18Short(issued),
          merchantSpentHOFD: "—",
          supplierRedeemedHOFD: "—",
        };
      }
    );

    // --- Merchant aggregates (only you as merchant) ---
    const spentTotalAsMerchant = spendLogsAsMerchant.reduce(
      (acc, l) => acc + (l.args.amount as bigint),
      0n
    );
    const topSuppliers = (() => {
      const bySup = new Map<string, bigint>();
      for (const l of spendLogsAsMerchant) {
        const s = (l.args.supplier as string).toLowerCase();
        const amt = l.args.amount as bigint;
        bySup.set(s, (bySup.get(s) || 0n) + amt);
      }
      return Array.from(bySup.entries())
        .sort((a, b) => Number(b[1] - a[1]))
        .map(([supplier, amount]) => ({
          supplier,
          amountHOFD: fmt18Short(amount),
        }));
    })();

    // vOFD balance (HTS) for current user (as merchant or supplier)
    let vofdBalanceHuman: string | "—" = "—";
    if (ctx.hederaAccountId) {
      const raw = await fetchVOFDBalance(ctx.hederaAccountId); // int64 units (8d)
      vofdBalanceHuman = (Number(raw) / 1e8).toLocaleString(undefined, {
        maximumFractionDigits: 8,
      });
    }

    const merchant = {
      unspentVOFD: vofdBalanceHuman,
      spentHOFD: fmt18Short(spentTotalAsMerchant),
      topSuppliers,
    };

    // --- Supplier aggregates (only you as supplier) ---
    const claimedHOFD = redeemLogsSelf.reduce(
      (acc, l) => acc + (l.args.net as bigint),
      0n
    );
    const recentMerchants = spendLogsAsSupplier
      .slice()
      .sort((a, b) => a.blockNumber! - b.blockNumber! || a.index - b.index)
      .slice(-5)
      .reverse()
      .map((l) => ({
        merchant: l.args.merchant as string,
        amountHOFD: fmt18Short(l.args.amount as bigint),
      }));

    const supplier = {
      unclaimedVOFD: vofdBalanceHuman,
      claimedHOFD: fmt18Short(claimedHOFD),
      recentMerchants,
    };

    return { sponsor: { cards: sponsorCards }, merchant, supplier };
  }

  // --- 2) Fallback: Previous on-chain event logic (unchanged) ---
}

// re-export HAPI HTS helpers for UI
export { hederaAssociateToken, hederaApproveVOFDAllowance };

// writers (ethers signer via WC EVM)
// export async function evmWrite() {
//   const { getEvmSigner } = await import("./evm");
//   const signer = await getEvmSigner();
//   return signer;
// }
