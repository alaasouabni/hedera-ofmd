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
import { fetchOwner, fetchRoles } from "../../lib/utils";

type Roles = { sponsor: boolean; merchant: boolean; supplier: boolean; undefined?: boolean };

type WalletState = {
  hedera?: { accountId: string; evmAlias?: string };
  evm?: { address: string };
  /** HBAR balance in tinybars + a human string */
  hbar?: { tinybars: bigint; formatted: string };
  /** reload HBAR balance */
  refreshHbar: () => Promise<void>;
  /** loading state for HBAR balance */
  hbarLoading: boolean;

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
  refreshHbar: async () => {},
  hbarLoading: false,
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

/** Pretty format tinybars → HBAR string (trim trailing zeros, keep up to 8 dp) */
function formatHbar(tiny: bigint): string {
  const ONE_HBAR = 100_000_000n;
  const whole = tiny / ONE_HBAR;
  const frac = tiny % ONE_HBAR;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

/** Fetch tinybar balance from Mirror Node for an account ID ("0.0.x"). */
async function fetchHbarTinybars(accountId: string): Promise<bigint | null> {
  try {
    const r = await fetch(`${mirrorBase()}/api/v1/accounts/${accountId}`);
    if (!r.ok) return null;
    const j = await r.json();
    const raw = j?.balance?.balance; // can be number or string
    if (raw == null) return null;
    return typeof raw === "string" ? BigInt(raw) : BigInt(raw);
  } catch {
    return null;
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

  // HBAR balance
  const [hbarTiny, setHbarTiny] = useState<bigint | null>(null);
  const [hbarLoading, setHbarLoading] = useState(false);

  const mismatch = useMemo(() => {
    if (!evmAddress || !evmAlias) return false;
    return evmAddress.toLowerCase() !== evmAlias.toLowerCase();
  }, [evmAddress, evmAlias]);

  // Register/unregister EVM provider globally
  useEffect(() => {
    if (evmConnected && walletProvider) {
      registerEip155Provider(walletProvider as any);
    } else {
      registerEip155Provider(null);
    }
  }, [evmConnected, walletProvider]);

  // Derive Hedera account from current session or mirror fallback
  useEffect(() => {
    const session = (universalProvider as any)?.session;
    const ns = session?.namespaces?.hedera;
    const acct = ns?.accounts?.[0] as string | undefined; // "hedera:testnet:0.0.123"
    if (acct) {
      setHederaAccountId(acct.split(":")[2]);
    } else {
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

  // Publish identities for lib/*
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

  // HBAR balance loader
  const refreshHbar = useCallback(async () => {
    if (!hederaAccountId) {
      setHbarTiny(null);
      return;
    }
    setHbarLoading(true);
    try {
      const tiny = await fetchHbarTinybars(hederaAccountId);
      setHbarTiny(tiny);
    } finally {
      setHbarLoading(false);
    }
  }, [hederaAccountId]);

  // auto-load HBAR when Hedera account changes
  useEffect(() => {
    // fire and forget; don't block UI
    refreshHbar();
  }, [refreshHbar]);

  // Connect: open the modal **focused on Hedera** so native is present
  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      await open({ view: "Connect", namespace: hederaNamespace });
      const session = (universalProvider as any)?.session;
      const hasHedera = !!session?.namespaces?.hedera?.accounts?.length;
      if (!hasHedera) {
        await open({ view: "Connect", namespace: hederaNamespace });
      }
    } finally {
      setConnecting(false);
    }
  }, [open]);

  // Explicit EVM switch
  const syncEvm = useCallback(async () => {
    await open({ view: "Connect", namespace: "eip155" });
  }, [open]);

  // Full disconnect + cache clear
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

  const hbar =
    hbarTiny != null
      ? { tinybars: hbarTiny, formatted: formatHbar(hbarTiny) }
      : undefined;

  return (
    <WalletCtx.Provider
      value={{
        hedera: hederaValue,
        evm: evmValue,
        hbar,
        refreshHbar,
        hbarLoading,

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
