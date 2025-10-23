import React, { useEffect, useState } from "react";
import { useWallet } from "../wallet/WalletProvider";
import { profileApi } from "../../lib/api";
import { ProfileModal } from "./ProfileModal";

export function ProfileGate() {
  const { evm } = useWallet();
  const [needProfile, setNeedProfile] = useState(false);
  const [checkedAddr, setCheckedAddr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const addr = evm?.address?.toLowerCase() || null;
      setCheckedAddr(addr);
      if (!addr) {
        setNeedProfile(false);
        return;
      }
      try {
        await profileApi.get(addr); // public fetch
        if (!cancelled) setNeedProfile(false);
      } catch {
        if (!cancelled) setNeedProfile(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evm?.address]);

  if (!needProfile || !checkedAddr) return null;

  return (
    <ProfileModal address={checkedAddr} onDone={() => setNeedProfile(false)} />
  );
}
