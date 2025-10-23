// pages/Positions.tsx
import React from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { AddressPill } from "../components/ui/AddressPill";

// reuse the components you already built
import { OpenPositionCard } from "../components/positions/SponsorOpenPositionCard";
import { PositionsListCard } from "../components/positions/PositionsListCard.backend";
import { HBARWrapCard } from "../components/HBARWrapCard";

export default function Positions() {
  const { evm } = useWallet();

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Manage Positions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[var(--muted)] flex flex-wrap items-center gap-2">
          <span>Wallet</span>
          <AddressPill addr={evm?.address} />
          <Badge tone={evm?.address ? "blue" : "amber"}>
            {evm?.address ? "Connected" : "Connect wallet"}
          </Badge>
        </CardContent>
      </Card>

      <HBARWrapCard />

      {/* Open a new position */}
      <OpenPositionCard />

      {/* My positions (owner-filtered) */}
      <PositionsListCard
        title="My Positions"
        filterOwner={evm?.address ?? null}
      />

      {/* All positions (recent window) */}
      <PositionsListCard
        title="All Positions (recent window)"
        filterOwner={null}
      />
    </section>
  );
}
