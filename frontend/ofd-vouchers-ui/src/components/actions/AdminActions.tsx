import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "../wallet/WalletProvider";
import { readProviders, toHOFDWeiMultiple1e10 } from "../../lib/utils";
import { voucherModuleAbi, erc20Abi } from "../../lib/contracts";

import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Badge } from "../ui/Badge";
import { Shield, KeySquare, Building2, RefreshCw } from "lucide-react";
import { evmWrite } from "../../lib/evm";

const VOUCHER = import.meta.env.VITE_VOUCHER_MODULE as string;
const HOFD = import.meta.env.VITE_HOFD as string;
const HAPI_ADMIN = import.meta.env.VITE_HAPI_ADMIN as string;
const RPC = import.meta.env.VITE_EVM_RPC as string; // used for a read-only provider

export function AdminActions() {
  const { evm, hedera, owner } = useWallet();

  // Admin if connected Hedera wallet is HAPI admin, or EVM wallet is contract owner
  const isAdmin =
    hedera?.accountId === HAPI_ADMIN ||
    (!!evm?.address &&
      !!owner &&
      evm.address.toLowerCase() === owner.toLowerCase());

  const [addr, setAddr] = useState("");
  const [role, setRole] = useState<"sponsor" | "merchant" | "supplier">(
    "merchant"
  );
  const [on, setOn] = useState(true);

  const [kycAddr, setKycAddr] = useState("");

  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("0");

  const [busy, setBusy] = useState<null | "role" | "kyc" | "xfer">(null);

  // ---------- hOFD balance state ----------
  const [hofdRaw, setHofdRaw] = useState<bigint | null>(null);
  const [hofdDec, setHofdDec] = useState<number>(18);
  const [loadingBal, setLoadingBal] = useState(false);

  const formattedHOFD = useMemo(() => {
    if (hofdRaw == null) return null;
    const s = readProviders.ethers.formatUnits(hofdRaw, hofdDec);
    // Trim to something readable
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
      // read-only JSON-RPC provider
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
    refreshHOFD();
  }, [refreshHOFD]);

  // also refresh after each admin action completes
  useEffect(() => {
    if (busy === null) {
      refreshHOFD();
    }
  }, [busy, refreshHOFD]);

  async function grantRole() {
    try {
      if (!evm?.address) return;
      setBusy("role");
      const signer = await evmWrite();
      const voucher = new readProviders.ethers.Contract(
        VOUCHER,
        voucherModuleAbi,
        signer
      );
      const tx = await voucher.setRole(addr, role, on);
      await tx.wait();
      alert("Role updated");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  async function grantKyc() {
    try {
      if (!evm?.address) return;
      setBusy("kyc");
      const signer = await evmWrite();
      const voucher = new readProviders.ethers.Contract(
        VOUCHER,
        voucherModuleAbi,
        signer
      );
      const tx = await voucher.grantKycAndUnfreeze(kycAddr);
      await tx.wait();
      alert("KYC+Unfreeze done");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  async function transferHOFD() {
    try {
      if (!evm?.address) return;
      setBusy("xfer");
      const signer = await evmWrite();
      const erc20 = new readProviders.ethers.Contract(HOFD, erc20Abi, signer);
      const wei = toHOFDWeiMultiple1e10(amt);
      const tx = await erc20.transfer(to, wei);
      await tx.wait();
      alert("hOFD transferred");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!isAdmin) {
    return (
      <Card className="p-4 text-sm text-[var(--muted)]">
        Admin actions are available only to the contract owner or HAPI admin (
        {HAPI_ADMIN}).
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <div className="text-sm text-[var(--muted)]">
        <span className="mr-2">Admin Console</span>
        <Badge tone="blue">{hedera?.accountId ?? "—"}</Badge>
      </div>

      {/* -------- Wallet Balance card -------- */}
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
              {evm?.address ?? "Connect wallet to view balance"}
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield size={16} /> Allowlist Roles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="EVM address 0x…"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
              >
                <option value="sponsor">Sponsor</option>
                <option value="merchant">Merchant</option>
                <option value="supplier">Supplier</option>
              </Select>
              <button
                className="h-10 px-3 rounded-xl border border-[var(--border)] text-sm"
                onClick={() => setOn(!on)}
                type="button"
              >
                {on ? (
                  <Badge tone="green">Enable</Badge>
                ) : (
                  <Badge tone="rose">Disable</Badge>
                )}
              </button>
            </div>
            <Button
              onClick={grantRole}
              disabled={!evm?.address || busy === "role"}
            >
              {busy === "role" ? "Setting…" : "Set Role"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeySquare size={16} /> Grant KYC + Unfreeze
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="EVM address 0x…"
              value={kycAddr}
              onChange={(e) => setKycAddr(e.target.value)}
            />
            <Button
              onClick={grantKyc}
              disabled={!evm?.address || busy === "kyc"}
            >
              {busy === "kyc" ? "Granting…" : "Grant"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 size={16} /> Transfer hOFD
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Recipient 0x…"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <Input
              placeholder="Amount (OFD, 18d) multiple of 1e-10"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
            />
            <Button
              onClick={transferHOFD}
              disabled={!evm?.address || busy === "xfer"}
            >
              {busy === "xfer" ? "Transferring…" : "Send"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
