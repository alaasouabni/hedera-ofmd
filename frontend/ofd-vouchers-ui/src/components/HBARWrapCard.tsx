// components/HBARWrapCard.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { PackageOpen, RefreshCw, WrapText } from "lucide-react";
import { useWallet } from "./wallet/WalletProvider";
import { evmWrite } from "../lib/evm";
import { readProviders } from "../lib/utils";

const WHBAR = import.meta.env.VITE_WHBAR as string; // ← set this in your .env (wHBAR contract address)
const RPC = import.meta.env.VITE_EVM_RPC as string;

// Minimal WETH9-like ABI (wHBAR generally exposes the same interface)
const wHBARAbi = [
  "function deposit() payable",
  "function withdraw(uint256 wad)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// We’ll also read native HBAR balance from provider.getBalance(address)
export function HBARWrapCard() {
  const { evm } = useWallet();

  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState<null | "wrap" | "unwrap" | "refresh">(null);
  const [err, setErr] = useState<string | null>(null);

  const [hbarRaw, setHbarRaw] = useState<bigint | null>(null);
  const [whbarRaw, setWhbarRaw] = useState<bigint | null>(null);
  const [whbarDec, setWhbarDec] = useState<number>(18);
  const [symbol, setSymbol] = useState<string>("wHBAR");

  const provider = useMemo(
    () => new readProviders.ethers.JsonRpcProvider(RPC),
    []
  );

  const whbar = useMemo(
    () => new readProviders.ethers.Contract(WHBAR, wHBARAbi, provider),
    [provider]
  );

  const formattedHBAR = useMemo(() => {
    if (hbarRaw == null) return "—";
    // Hedera’s JSON-RPC maps native value to 18 decimals like ETH
    return readProviders.ethers.formatEther(hbarRaw);
  }, [hbarRaw]);

  const formattedWHBAR = useMemo(() => {
    if (whbarRaw == null) return "—";
    const s = readProviders.ethers.formatUnits(whbarRaw, whbarDec);
    const [i, d = ""] = s.split(".");
    const dec = d.slice(0, 6).replace(/0+$/, "");
    return dec ? `${i}.${dec}` : i;
  }, [whbarRaw, whbarDec]);

  const refresh = useCallback(async () => {
    if (!evm?.address) {
      setHbarRaw(null);
      setWhbarRaw(null);
      return;
    }
    setBusy("refresh");
    setErr(null);
    try {
      const [nativeBal, decimals, ercBal, sym] = await Promise.all([
        provider.getBalance(evm.address),
        whbar.decimals(),
        whbar.balanceOf(evm.address),
        whbar.symbol().catch(() => "wHBAR"),
      ]);
      setHbarRaw(nativeBal);
      setWhbarDec(Number(decimals ?? 18));
      setWhbarRaw(ercBal);
      setSymbol(sym || "wHBAR");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }, [evm?.address, provider, whbar]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onWrap = useCallback(async () => {
    if (!evm?.address) return;
    setErr(null);
    try {
      setBusy("wrap");
      const signer = await evmWrite();
      const contract = new readProviders.ethers.Contract(
        WHBAR,
        wHBARAbi,
        signer
      );
      // JSON-RPC expects 18 decimals for the native value
      const value = readProviders.ethers.parseEther(amount || "0");
      if (value <= 0n) throw new Error("Amount must be greater than 0");
      const bal = await signer.provider!.getBalance(evm.address);
      if (bal < value) throw new Error("Insufficient HBAR balance");
      const tx = await contract.deposit({ value });
      await tx.wait();
      await refresh();
      setAmount("0");
    } catch (e: any) {
      setErr(e?.reason ?? e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }, [amount, evm?.address, refresh]);

  const onUnwrap = useCallback(async () => {
    if (!evm?.address) return;
    setErr(null);
    try {
      setBusy("unwrap");
      const signer = await evmWrite();
      const contract = new readProviders.ethers.Contract(
        WHBAR,
        wHBARAbi,
        signer
      );
      const wad = readProviders.ethers.parseUnits(amount || "0", whbarDec);
      if (wad <= 0n) throw new Error("Amount must be greater than 0");
      const bal: bigint = await contract.balanceOf(evm.address);
      if (bal < wad) throw new Error(`Insufficient ${symbol} balance`);
      const tx = await contract.withdraw(wad);
      await tx.wait();
      await refresh();
      setAmount("0");
    } catch (e: any) {
      setErr(e?.reason ?? e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }, [amount, evm?.address, whbarDec, symbol, refresh]);

  const setMaxFrom = (source: "HBAR" | "WHBAR") => {
    if (source === "HBAR" && hbarRaw != null) {
      // leave a tiny dust for gas when wrapping
      const safe =
        hbarRaw > 2_000_000_000_000_000n
          ? hbarRaw - 2_000_000_000_000_000n
          : hbarRaw;
      setAmount(readProviders.ethers.formatEther(safe < 0n ? 0n : safe));
    } else if (source === "WHBAR" && whbarRaw != null) {
      setAmount(readProviders.ethers.formatUnits(whbarRaw, whbarDec));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Convert HBAR ⇄ {symbol}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="p-3 rounded-xl border border-[var(--border)]">
            <div className="text-xs text-[var(--muted)] mb-1">HBAR balance</div>
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                {evm?.address ? formattedHBAR : "—"}
              </div>
              <Button
                variant="outline"
                onClick={() => setMaxFrom("HBAR")}
                disabled={!evm?.address}
              >
                Max
              </Button>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-[var(--border)]">
            <div className="text-xs text-[var(--muted)] mb-1">
              {symbol} balance
            </div>
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                {evm?.address ? formattedWHBAR : "—"}
              </div>
              <Button
                variant="outline"
                onClick={() => setMaxFrom("WHBAR")}
                disabled={!evm?.address}
              >
                Max
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-48"
          />
          <Button onClick={onWrap} disabled={!evm?.address || busy !== null}>
            <WrapText size={14} />
            <span className="ml-2">
              {busy === "wrap" ? "Wrapping…" : `Wrap to ${symbol}`}
            </span>
          </Button>
          <Button
            variant="outline"
            onClick={onUnwrap}
            disabled={!evm?.address || busy !== null}
          >
            <PackageOpen size={14} />
            <span className="ml-2">
              {busy === "unwrap" ? "Unwrapping…" : `Unwrap to HBAR`}
            </span>
          </Button>
          <Button
            variant="ghost"
            onClick={refresh}
            disabled={!evm?.address || busy === "refresh"}
            title="Refresh balances"
          >
            <RefreshCw
              size={16}
              className={busy === "refresh" ? "animate-spin" : ""}
            />
          </Button>
        </div>

        {!evm?.address && (
          <div className="text-sm text-[var(--muted)]">
            Connect your wallet to convert HBAR ⇄ {symbol}.
          </div>
        )}
        {err && (
          <div className="text-sm text-rose-600">
            <Badge tone="rose">Error</Badge>{" "}
            <span className="break-all">{err}</span>
          </div>
        )}
        <div className="text-[11px] text-[var(--muted)]">
          • Wrapping calls <code>deposit()</code> with native HBAR as value;
          unwrapping calls <code>withdraw()</code>.<br />• Amounts for HBAR use
          18 decimals via JSON-RPC; {symbol} decimals are read from the
          contract.
        </div>
      </CardContent>
    </Card>
  );
}
