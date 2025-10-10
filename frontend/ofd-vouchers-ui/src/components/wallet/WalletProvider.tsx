// components/wallet/WalletProvider.tsx
"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitProvider,
  useDisconnect,
} from "@reown/appkit/react";
import {
  universalProvider,
  registerEip155Provider,
  setSessionIdentities,
  disconnectAllSessions,
  nukeAppKitCaches,
  HEDERA_NET,
} from "../../lib/appkit";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { fetchOwner, fetchRoles } from "../../lib/utils"; // keep your existing utils

type Roles = { sponsor: boolean; merchant: boolean; supplier: boolean };
type WalletState = {
  hedera?: { accountId: string; evmAlias?: string };
  evm?: { address: string };
  roles: Roles;
  owner?: string;
  mismatch: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  syncEvm: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletCtx = createContext<WalletState>({
  roles: { sponsor: false, merchant: false, supplier: false },
  mismatch: false,
  connecting: false,
  connect: async () => {},
  syncEvm: async () => {},
  disconnect: async () => {},
});

const NET = HEDERA_NET;

function mirrorBase() {
  switch (NET) {
    case "mainnet":
      return "https://mainnet-public.mirrornode.hedera.com";
    default:
      return "https://testnet.mirrornode.hedera.com";
  }
}
async function resolveHederaIdFromMirror(
  evmAddr: string
): Promise<string | undefined> {
  try {
    const r = await fetch(`${mirrorBase()}/api/v1/accounts/${evmAddr}`);
    if (!r.ok) return undefined;
    const j = await r.json();
    return j?.account as string | undefined;
  } catch {
    return undefined;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { open } = useAppKit();
  const { disconnect: appkitDisconnect } = useDisconnect();

  // EIP-155 account (AppKit)
  const {
    address: evmAddress,
    isConnected: evmConnected,
    status,
  } = useAppKitAccount({
    namespace: "eip155",
  });

  // EIP-1193 provider from AppKit for EVM
  const { walletProvider } = useAppKitProvider("eip155");

  // Hedera account from the *same* WC session
  const [hederaAccountId, setHederaAccountId] = useState<string | undefined>(
    undefined
  );

  // Optional alias
  const [evmAlias, setEvmAlias] = useState<string | undefined>(undefined);

  // Roles/owner
  const [roles, setRoles] = useState<Roles>({
    sponsor: false,
    merchant: false,
    supplier: false,
  });
  const [owner, setOwner] = useState<string | undefined>(undefined);

  // UI state
  const [connecting, setConnecting] = useState(false);

  const mismatch = useMemo(() => {
    if (!evmAddress || !evmAlias) return false;
    return evmAddress.toLowerCase() !== evmAlias.toLowerCase();
  }, [evmAddress, evmAlias]);

  // Register/unregister the EVM provider for the rest of your code
  useEffect(() => {
    if (evmConnected && walletProvider) {
      registerEip155Provider(walletProvider as any);
    } else {
      registerEip155Provider(null);
    }
  }, [evmConnected, walletProvider]);

  // Derive Hedera account from the current AppKit universal provider session
  useEffect(() => {
    const session = (universalProvider as any)?.session;
    const ns = session?.namespaces?.hedera;
    const acct = ns?.accounts?.[0] as string | undefined; // "hedera:testnet:0.0.123"
    if (acct) {
      setHederaAccountId(acct.split(":")[2]);
    } else {
      // fallback: resolve from mirror using EVM alias if needed
      (async () => {
        if (!evmAddress) {
          setHederaAccountId(undefined);
          return;
        }
        const id = await resolveHederaIdFromMirror(evmAddress);
        setHederaAccountId(id);
      })();
    }
  }, [evmConnected, evmAddress]);

  // publish both identities for lib/* modules (hedera.ts/evm)
  useEffect(() => {
    setSessionIdentities({
      hederaAccountId: hederaAccountId ?? null,
      evmAddress: evmAddress ?? null,
    });
  }, [hederaAccountId, evmAddress]);

  // roles/owner on connect or address change
  useEffect(() => {
    (async () => {
      if (!evmConnected || !evmAddress) {
        setRoles({ sponsor: false, merchant: false, supplier: false });
        setOwner(undefined);
        return;
      }
      const [r, o] = await Promise.all([fetchRoles(evmAddress), fetchOwner()]);
      setRoles(r);
      setOwner(o);
    })();
  }, [evmConnected, evmAddress]);

  // Connect: open the modal **focused on Hedera** first so native is present
  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      await open({ view: "Connect", namespace: hederaNamespace });
      // if a wallet only paired eip155, let users explicitly add Hedera:
      const session = (universalProvider as any)?.session;
      const hasHedera = !!session?.namespaces?.hedera?.accounts?.length;
      if (!hasHedera) {
        await open({ view: "Connect", namespace: hederaNamespace });
      }
    } finally {
      setConnecting(false);
    }
  }, [open]);

  // Explicit EVM account switch
  const syncEvm = useCallback(async () => {
    await open({ view: "Connect", namespace: "eip155" });
  }, [open]);

  // Disconnect everything, clean caches
  const disconnect = useCallback(async () => {
    try {
      await appkitDisconnect();
    } catch {}
    await disconnectAllSessions();
    nukeAppKitCaches();
    window.location.reload();
  }, [appkitDisconnect]);

  const evmValue =
    evmConnected && evmAddress ? { address: evmAddress } : undefined;
  const hederaValue = hederaAccountId
    ? { accountId: hederaAccountId, evmAlias }
    : undefined;

  return (
    <WalletCtx.Provider
      value={{
        hedera: hederaValue,
        evm: evmValue,
        roles,
        owner,
        mismatch,
        connecting: connecting || status === "connecting",
        connect,
        syncEvm,
        disconnect,
      }}
    >
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallet() {
  return useContext(WalletCtx);
}
