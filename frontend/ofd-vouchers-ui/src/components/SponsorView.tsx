import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import {
  fetchDashboard,
  readProviders,
  toHOFDWeiMultiple1e10,
} from "../lib/utils";
import { erc20Abi, voucherModuleAbi } from "../lib/contracts";
import { VoucherCards } from "./VoucherCards";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { AddressPill } from "../components/ui/AddressPill";
import { Badge } from "../components/ui/Badge";
import { Factory, RefreshCw } from "lucide-react";
import { evmWrite } from "../lib/evm";

const VOUCHER = import.meta.env.VITE_VOUCHER_MODULE as string;
const HOFD = import.meta.env.VITE_HOFD as string;
const RPC = import.meta.env.VITE_EVM_RPC as string;

export function SponsorView() {
  const { evm } = useWallet();
  const [merchant, setMerchant] = useState("");
  const [amt, setAmt] = useState("0");
  const [busy, setBusy] = useState(false);

  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchDashboard>
  > | null>(null);

  // ---- hOFD balance state
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

  useEffect(() => {
    (async () => {
      if (!evm?.address) return;
      setData(await fetchDashboard({ evmAddress: evm.address }));
    })();
  }, [evm?.address]);

  useEffect(() => {
    refreshHOFD();
  }, [refreshHOFD]);

  async function issue() {
    try {
      if (!evm?.address) return;
      setBusy(true);
      const signer = await evmWrite();
      const voucher = new readProviders.ethers.Contract(
        VOUCHER,
        voucherModuleAbi,
        signer
      );
      const erc20 = new readProviders.ethers.Contract(HOFD, erc20Abi, signer);

      const wei = toHOFDWeiMultiple1e10(amt);

      // Ensure allowance first
      const current: bigint = await erc20.allowance(evm.address, VOUCHER);
      if (current < wei) {
        const txApprove = await erc20.approve(VOUCHER, wei);
        await txApprove.wait();
      }

      // Issue vouchers
      const tx = await voucher.issueVoucher(merchant, wei, {
        gasLimit: 3_000_000n,
      });
      await tx.wait();

      // Refresh UI pieces
      await Promise.all([
        refreshHOFD(),
        (async () => {
          setData(await fetchDashboard({ evmAddress: evm.address }));
        })(),
      ]);

      alert("Issued");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      {/* Balance card */}
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

      {/* Issue vouchers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory size={16} /> Sponsor · Issue vouchers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--muted)]">You</span>
            <AddressPill addr={evm?.address} />
            {evm?.address ? (
              <Badge tone="blue">Connected</Badge>
            ) : (
              <Badge tone="amber">Connect wallet</Badge>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_160px_120px]">
            <Input
              placeholder="Merchant 0x…"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />
            <Input
              placeholder="Amount (OFD)"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
            />
            <Button onClick={issue} disabled={!evm?.address || busy}>
              {busy ? "Issuing…" : "Issue"}
            </Button>
          </div>
          <div className="text-[11px] text-[var(--muted)]">
            Amount must be a multiple of <b>1e-10</b> OFD (18→8 conversion).
          </div>
        </CardContent>
      </Card>

      {/* <HBARWrapCard />
      <SponsorOpenPositionCard />
      <SponsorPositionsCard /> */}

      {data && <VoucherCards role="sponsor" data={data} />}
    </section>
  );
}
