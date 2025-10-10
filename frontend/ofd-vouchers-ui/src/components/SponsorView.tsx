import React, { useEffect, useState } from "react";
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
import { Factory } from "lucide-react";
import { evmWrite } from "../lib/evm";

const VOUCHER = import.meta.env.VITE_VOUCHER_MODULE as string;
const HOFD = import.meta.env.VITE_HOFD as string;

export function SponsorView() {
  const { evm } = useWallet();
  const [merchant, setMerchant] = useState("");
  const [amt, setAmt] = useState("0");
  const [busy, setBusy] = useState(false);

  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchDashboard>
  > | null>(null);

  useEffect(() => {
    (async () => {
      if (!evm?.address) return;
      setData(await fetchDashboard({ evmAddress: evm.address }));
    })();
  }, [evm?.address]);

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

      const current: bigint = await erc20.allowance(evm.address, VOUCHER);
      if (current < wei) {
        const txApprove = await erc20.approve(VOUCHER, wei);
        await txApprove.wait();
      }
      const tx = await voucher.issueVoucher(merchant, wei, {
        gasLimit: 3_000_000n
      });
      await tx.wait();
      setData(await fetchDashboard({ evmAddress: evm.address }));
      alert("Issued");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
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

      {data && <VoucherCards role="sponsor" data={data} />}
    </section>
  );
}
