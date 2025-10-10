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
import { HandCoins } from "lucide-react";
import { evmWrite } from "../lib/evm";

const VOUCHER = import.meta.env.VITE_VOUCHER_MODULE as string;

export function SupplierView() {
  const { hedera, evm } = useWallet();
  const [amt, setAmt] = useState("0");
  const [busy, setBusy] = useState<null | "assoc" | "approve" | "redeem">(null);

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

  async function approveCryptoAllowance() {
    try {
      if (!hedera?.accountId) return alert("Connect Hedera wallet first");
      setBusy("approve");
      const wei = toHOFDWeiMultiple1e10(amt);
      await hederaApproveVOFDAllowance(hedera.accountId, wei);
      alert("Approved VOFD Crypto Allowance");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  async function redeem() {
    try {
      if (!evm?.address) return;
      setBusy("redeem");
      const signer = await evmWrite();
      const voucher = new readProviders.ethers.Contract(
        VOUCHER,
        voucherModuleAbi,
        signer
      );
      const wei = toHOFDWeiMultiple1e10(amt);
      const tx = await voucher.redeem(wei, { gasLimit: 3_000_000n });
      await tx.wait();
      setData(
        await fetchDashboard({
          evmAddress: evm.address,
          hederaAccountId: hedera?.accountId,
        })
      );
      alert("Redeemed");
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
              disabled={!hedera?.accountId || busy === "assoc"}
            >
              {busy === "assoc" ? "Associating…" : "Associate vOFD"}
            </Button>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Amount (OFD)"
                value={amt}
                onChange={(e) => setAmt(e.target.value)}
                className="w-44"
              />
              <Button
                variant="outline"
                onClick={approveCryptoAllowance}
                disabled={!hedera?.accountId || busy === "approve"}
              >
                {busy === "approve" ? "Approving…" : "Approve Crypto Allowance"}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Amount (OFD)"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              className="w-44"
            />
            <Button
              onClick={redeem}
              disabled={!evm?.address || busy === "redeem"}
            >
              {busy === "redeem" ? "Redeeming…" : "Redeem"}
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
