import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useWallet } from "./wallet/WalletProvider";
import {
  fetchDashboard,
  hederaAssociateToken,
  hederaApproveVOFDAllowance,
  toHOFDWeiMultiple1e10,
  readProviders,
} from "../lib/utils";
import { erc20Abi, voucherModuleAbi } from "../lib/contracts";
import { VoucherCards } from "./VoucherCards";

import { Card, CardHeader, CardTitle, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { AddressPill } from "./ui/AddressPill";
import { Badge } from "./ui/Badge";
import { HandCoins, RefreshCw } from "lucide-react";
import { evmWrite } from "../lib/evm";

const VOUCHER = import.meta.env.VITE_VOUCHER_MODULE as string;
const HOFD = import.meta.env.VITE_HOFD as string;
const RPC = import.meta.env.VITE_EVM_RPC as string;

export function SupplierView() {
  const { hedera, evm } = useWallet();

  const [amt, setAmt] = useState("0");
  const [busy, setBusy] = useState<
    null | "assoc" | "redeem-allow" | "redeem-send"
  >(null);

  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchDashboard>
  > | null>(null);

  // ---- hOFD balance state (EVM)
  const [hofdRaw, setHofdRaw] = useState<bigint | null>(null);
  const [hofdDec, setHofdDec] = useState<number>(18);
  const [loadingBal, setLoadingBal] = useState(false);

  const formattedHOFD = useMemo(() => {
    if (hofdRaw == null) return null;
    const s = readProviders.ethers.formatUnits(hofdRaw, hofdDec);
    const [i, d = ""] = s.split(".");
    const dec = d.slice(0, 6).replace(/0+$/, "");
    return dec ? `${i}.${dec}` : i;
  }, [hofdRaw, hofdDec]);

  const refreshHOFD = useCallback(async () => {
    if (!evm?.address) {
      setHofdRaw(null);
      return;
    }
    setLoadingBal(true);
    try {
      const provider = new readProviders.ethers.JsonRpcProvider(RPC);
      const erc20 = new readProviders.ethers.Contract(HOFD, erc20Abi, provider);
      const [bal, dec] = (await Promise.all([
        erc20.balanceOf(evm.address),
        erc20.decimals(),
      ])) as [bigint, number];
      setHofdRaw(bal);
      setHofdDec(dec ?? 18);
    } catch (e) {
      console.error("Failed to load hOFD balance:", e);
      setHofdRaw(null);
    } finally {
      setLoadingBal(false);
    }
  }, [evm?.address]);

  // dashboard + balance on connect / changes
  useEffect(() => {
    (async () => {
      if (!evm?.address) return;
      setData(
        await fetchDashboard({
          evmAddress: evm.address,
          hederaAccountId: hedera?.accountId,
        })
      );
    })();
  }, [evm?.address, hedera?.accountId]);

  useEffect(() => {
    refreshHOFD();
  }, [refreshHOFD]);

  async function associate() {
    try {
      if (!hedera?.accountId) return alert("Connect Hedera wallet first");
      setBusy("assoc");
      await hederaAssociateToken(hedera.accountId);
      alert("Associated vOFD");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  // 🔵 One-click flow: Approve crypto allowance (HTS) → Redeem (EVM)
  async function approveAndRedeem() {
    try {
      if (!hedera?.accountId) return alert("Connect Hedera wallet first");
      if (!evm?.address) return alert("Connect EVM wallet first");

      // Parse & validate input
      const wei = toHOFDWeiMultiple1e10(amt); // throws if not multiple of 1e10

      // Step 1: Hedera native allowance (wallet signs via HWC)
      setBusy("redeem-allow");
      await hederaApproveVOFDAllowance(hedera.accountId, wei);

      // Step 2: EVM redeem()
      setBusy("redeem-send");
      const signer = await evmWrite();
      const voucher = new readProviders.ethers.Contract(
        VOUCHER,
        voucherModuleAbi,
        signer
      );
      const tx = await voucher.redeem(wei, { gasLimit: 3_000_000n });
      await tx.wait();

      // Refresh UI (balance + dashboard)
      await Promise.all([
        refreshHOFD(),
        (async () => {
          setData(
            await fetchDashboard({
              evmAddress: evm.address,
              hederaAccountId: hedera?.accountId,
            })
          );
        })(),
      ]);

      alert("Redeemed");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      {/* Wallet Balance (hOFD) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Wallet Balance (hOFD)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="text-xl font-semibold">
              {evm?.address
                ? formattedHOFD ?? (loadingBal ? "Loading…" : "0")
                : "—"}
            </div>
            <div className="text-xs text-[var(--muted)] break-all">
              {evm?.address ? (
                <AddressPill addr={evm.address} />
              ) : (
                "Connect wallet to view balance"
              )}
            </div>
          </div>
          <Button
            variant="outline"
            onClick={refreshHOFD}
            disabled={!evm?.address || loadingBal}
          >
            <RefreshCw size={14} className={loadingBal ? "animate-spin" : ""} />
            <span className="ml-2">
              {loadingBal ? "Refreshing…" : "Refresh"}
            </span>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandCoins size={16} /> Supplier · Manage vouchers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--muted)]">You</span>
            <AddressPill addr={evm?.address} />
            <span className="text-[var(--muted)]">Hedera</span>
            <Badge tone={hedera?.accountId ? "blue" : "amber"}>
              {hedera?.accountId ?? "Not connected"}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={associate}
              disabled={
                !hedera?.accountId ||
                busy === "assoc" ||
                busy?.startsWith("redeem-")
              }
            >
              {busy === "assoc" ? "Associating…" : "Associate vOFD"}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Amount (OFD)"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              className="w-44"
            />
            <Button
              onClick={approveAndRedeem}
              disabled={
                !evm?.address ||
                !hedera?.accountId ||
                busy === "assoc" ||
                busy === "redeem-allow" ||
                busy === "redeem-send"
              }
            >
              {busy === "redeem-allow"
                ? "Approving…"
                : busy === "redeem-send"
                ? "Redeeming…"
                : "Redeem"}
            </Button>
          </div>

          <div className="text-[11px] text-[var(--muted)]">
            Amount must be a multiple of <b>1e-10</b> OFD (18→8 conversion).
          </div>
        </CardContent>
      </Card>

      {data && <VoucherCards role="supplier" data={data} />}
    </section>
  );
}
