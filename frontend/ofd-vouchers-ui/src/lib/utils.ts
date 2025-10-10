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
 */
export async function fetchDashboard(ctx: {
  evmAddress: string;
  hederaAccountId?: string;
}) {
  const evm = ctx.evmAddress.toLowerCase();
  const voucher = new ethers.Contract(VOUCHER, voucherModuleAbi, evmRead);

  // --- Filtered event queries (only this user) ---
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
  //   - Spend(merchant=any, supplier=evm) -> recent merchants who paid you
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
    issueByMerchant.set(merchant, (issueByMerchant.get(merchant) || 0n) + amt);
  }

  // For each merchant you issued to, compute how much they’ve spent (across network).
  // NOTE: we cannot perfectly link Redeem back to *your* issues (no sponsor in Redeem event).
  const sponsorCards = Array.from(issueByMerchant.entries()).map(
    ([merchant, issued]) => {
      return {
        merchant,
        issuedHOFD: format18(issued),
        merchantSpentHOFD: "—", // optional: fill by querying Spend(merchant=thatMerchant)
        supplierRedeemedHOFD: "—", // cannot attribute to sponsor from events alone
      };
    }
  );

  // If you want merchantSpentHOFD per card, you can fetch & sum now (kept light by default).
  // Example (uncomment to compute):
  // for (const card of sponsorCards) {
  //   const m = card.merchant;
  //   const logs = (await voucher.queryFilter(voucher.filters.Spend(m, null), DEPLOY_BLOCK, "latest")).filter(isEventLog);
  //   const spent = logs.reduce((acc, l) => acc + (l.args.amount as bigint), 0n);
  //   card.merchantSpentHOFD = format18(spent);
  // }

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
        amountHOFD: format18(amount),
      }));
  })();

  // vOFD balance (HTS) for current user (as merchant or supplier)
  let vofdBalanceHuman: string | "—" = "—";
  console.log("ctx.hederaAccountId:",ctx.hederaAccountId);
  if (ctx.hederaAccountId) {
    const raw = await fetchVOFDBalance(ctx.hederaAccountId); // int64 units (8d)
    console.log("aaaaaaaaaaaaaaa:",raw.toString());
    vofdBalanceHuman = (Number(raw) / 1e8).toLocaleString(undefined, {
      maximumFractionDigits: 8,
    });
  }

  const merchant = {
    unspentVOFD: vofdBalanceHuman,
    spentHOFD: format18(spentTotalAsMerchant),
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
      amountHOFD: format18(l.args.amount as bigint),
    }));

  const supplier = {
    unclaimedVOFD: vofdBalanceHuman,
    claimedHOFD: format18(claimedHOFD),
    recentMerchants,
  };

  return { sponsor: { cards: sponsorCards }, merchant, supplier };
}

// re-export HAPI HTS helpers for UI
export { hederaAssociateToken, hederaApproveVOFDAllowance };

// writers (ethers signer via WC EVM)
// export async function evmWrite() {
//   const { getEvmSigner } = await import("./evm");
//   const signer = await getEvmSigner();
//   return signer;
// }
