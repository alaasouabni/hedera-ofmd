// components/wallet/WalletBadge.tsx
import { AddressPill } from "../ui/AddressPill";
import { Button } from "../ui/Button";
import { useWallet } from "./WalletProvider";
import { Badge } from "../ui/Badge";
import { useAppKit } from "@reown/appkit/react";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";

export function WalletBadge() {
  const { hedera, evm, mismatch, connecting, connect, syncEvm, disconnect } =
    useWallet();
  const { open } = useAppKit();

  const hasEvm = !!evm?.address;
  const hasHedera = !!hedera?.accountId;

  return (
    <div className="flex items-center gap-2">
      {hasEvm && <AddressPill addr={evm!.address} />}
      {hasHedera && (
        <>
          <span className="hidden md:inline text-xs text-[var(--muted)]">
            ·
          </span>
          <span className="hidden md:inline text-xs">{hedera!.accountId}</span>
        </>
      )}

      {mismatch && (
        <Badge tone="amber" className="ml-1">
          EVM ≠ Alias
        </Badge>
      )}

      {!hasEvm && (
        <Button onClick={connect} disabled={connecting}>
          {connecting ? "Connecting…" : "Connect"}
        </Button>
      )}

      {hasEvm && !hasHedera && (
        <Button
          variant="outline"
          onClick={() => open({ view: "Connect", namespace: hederaNamespace })}
        >
          Connect Hedera
        </Button>
      )}

      {hasEvm && mismatch && (
        <Button variant="outline" onClick={syncEvm}>
          Sync EVM
        </Button>
      )}

      {hasEvm && (
        <Button variant="ghost" onClick={disconnect} title="Disconnect all">
          Disconnect
        </Button>
      )}
    </div>
  );
}
