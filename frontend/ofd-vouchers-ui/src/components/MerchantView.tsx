import React, { useEffect, useState } from "react";
import { useWallet } from "./wallet/WalletProvider";
import {
  fetchDashboard,
  hederaAssociateToken,
  hederaApproveVOFDAllowance,
  toHOFDWeiMultiple1e10,
  readProviders,
} from "../lib/utils";
import { voucherModuleAbi } from "../lib/contracts";
import { VoucherCards } from "./VoucherCards";

import { Card, CardHeader, CardTitle, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { AddressPill } from "./ui/AddressPill";
import { Badge } from "./ui/Badge";
import { Building2 } from "lucide-react";
import { evmWrite } from "../lib/evm";

const VOUCHER = import.meta.env.VITE_VOUCHER_MODULE as string;

export function MerchantView() {
  const { hedera, evm } = useWallet();
  const [supplier, setSupplier] = useState("");
  const [amt, setAmt] = useState("0");
  const [busy, setBusy] = useState<
    null | "assoc" | "spend-allow" | "spend-send"
  >(null);

  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchDashboard>
  > | null>(null);

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

  // ✅ One-click flow: approve VOFD crypto allowance (Hedera) → spendVoucher (EVM)
  async function approveAndSpend() {
    try {
      if (!hedera?.accountId) return alert("Connect Hedera wallet first");
      if (!evm?.address) return alert("Connect EVM wallet first");
      if (!supplier) return alert("Enter supplier address");

      const wei = toHOFDWeiMultiple1e10(amt); // throws if not multiple of 1e10

      // 1) Hedera allowance
      setBusy("spend-allow");
      await hederaApproveVOFDAllowance(hedera.accountId, wei);

      // 2) EVM spend
      setBusy("spend-send");
      const signer = await evmWrite();
      const voucher = new readProviders.ethers.Contract(
        VOUCHER,
        voucherModuleAbi,
        signer
      );
      const tx = await voucher.spendVoucher(supplier, wei, {
        gasLimit: 2_000_000n,
      });
      await tx.wait();

      // Refresh dashboard
      setData(
        await fetchDashboard({
          evmAddress: evm.address,
          hederaAccountId: hedera?.accountId,
        })
      );

      alert("Spent");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 size={16} /> Merchant · Spend vouchers
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

          {/* One-time association remains separate */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={associate}
              disabled={
                !hedera?.accountId ||
                busy === "assoc" ||
                busy === "spend-allow" ||
                busy === "spend-send"
              }
            >
              {busy === "assoc" ? "Associating…" : "Associate vOFD"}
            </Button>
          </div>

          {/* One-click Approve & Spend */}
          <div className="grid gap-2 md:grid-cols-[1fr_160px_140px]">
            <Input
              placeholder="Supplier 0x…"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
            <Input
              placeholder="Amount (OFD)"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
            />
            <Button
              onClick={approveAndSpend}
              disabled={
                !evm?.address ||
                !hedera?.accountId ||
                busy === "assoc" ||
                busy === "spend-allow" ||
                busy === "spend-send"
              }
            >
              {busy === "spend-allow"
                ? "Approving…"
                : busy === "spend-send"
                ? "Spending…"
                : "Spend"}
            </Button>
          </div>

          <div className="text-[11px] text-[var(--muted)]">
            Amount must be a multiple of <b>1e-10</b> OFD (18→8 conversion).
          </div>
        </CardContent>
      </Card>

      {data && <VoucherCards role="merchant" data={data} />}
    </section>
  );
}
