// lib/appkit.ts
import type UniversalProvider from "@walletconnect/universal-provider";
import { createAppKit } from "@reown/appkit/react";
import {
  HederaProvider,
  HederaAdapter,
  HederaChainDefinition,
  hederaNamespace,
  HederaJsonRpcMethod,
} from "@hashgraph/hedera-wallet-connect";

// ---------- ENV ----------
const PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID as string;
const NET =
  (import.meta.env.VITE_NETWORK as "mainnet" | "testnet") || "testnet";
const RPC = import.meta.env.VITE_EVM_RPC as string; // your EVM RPC (Hashio/hgraph/etc.)

// ---------- APP METADATA ----------
export const metadata = {
  name: "OFD Vouchers dApp",
  description: "Voucher issuance & redemption",
  url: window.location.origin,
  icons: ["https://walletconnect.com/walletconnect-logo.png"],
};

// ---------- NETWORK DEFS ----------
const hederaEvmTestnet = HederaChainDefinition.EVM.Testnet;
const hederaEvmMainnet = HederaChainDefinition.EVM.Mainnet;
const hederaNativeTest = HederaChainDefinition.Native.Testnet;
const hederaNativeMain = HederaChainDefinition.Native.Mainnet;

// Put *your* active network first in each list (HashPack reads the first one).
const hederaChainsOrdered =
  NET === "mainnet"
    ? ["hedera:mainnet", "hedera:testnet"]
    : ["hedera:testnet", "hedera:mainnet"];
const eip155ChainsOrdered =
  NET === "mainnet"
    ? ["eip155:295", "eip155:296"]
    : ["eip155:296", "eip155:295"];

// CAIP helpers
export const HEDERA_EVM_CHAIN_ID = NET === "mainnet" ? 295 : 296;
const EVM_CAIP = `eip155:${HEDERA_EVM_CHAIN_ID}`;

// ---------- PROVIDER (v2 / universal) ----------
const providerOpts = {
  projectId: PROJECT_ID,
  metadata,
  logger: "error" as const,
  // Critical: optional namespaces tell wallets BOTH what we support AND which chain to prefer
  optionalNamespaces: {
    // HashPack looks at the first chain in 'hedera' to pick the network (and mirrors that choice for eip155)
    hedera: {
      methods: [
        HederaJsonRpcMethod.GetNodeAddresses,
        HederaJsonRpcMethod.ExecuteTransaction,
        HederaJsonRpcMethod.SignMessage,
        HederaJsonRpcMethod.SignAndExecuteQuery,
        HederaJsonRpcMethod.SignAndExecuteTransaction,
        HederaJsonRpcMethod.SignTransaction,
      ],
      chains: hederaChainsOrdered,
      events: ["chainChanged", "accountsChanged"],
    },
    eip155: {
      methods: [
        "eth_sendTransaction",
        "eth_signTransaction",
        "eth_sign",
        "personal_sign",
        "eth_signTypedData",
        "eth_signTypedData_v4",
        "eth_accounts",
        "eth_chainId",
      ],
      chains: eip155ChainsOrdered,
      events: ["chainChanged", "accountsChanged"],
      rpcMap: {
        "eip155:296": RPC || "https://testnet.hashio.io/api",
        "eip155:295": "https://mainnet.hashio.io/api",
      },
    },
  },
};

export const universalProvider = (await HederaProvider.init(
  providerOpts
)) as unknown as UniversalProvider;

// ---------- ADAPTERS ----------
const hederaNativeAdapter = new HederaAdapter({
  projectId: PROJECT_ID,
  networks: [hederaNativeTest, hederaNativeMain],
  namespace: hederaNamespace, // 'hedera'
});

const hederaEvmAdapter = new HederaAdapter({
  projectId: PROJECT_ID,
  networks: [hederaEvmTestnet, hederaEvmMainnet],
  namespace: "eip155",
});

// ---------- APPKIT (ONE MODAL / ONE SESSION / TWO NAMESPACES) ----------
export const appKit = createAppKit({
  adapters: [hederaNativeAdapter, hederaEvmAdapter],
  logger: "error",
  // @ts-expect-error HederaProvider is UniversalProvider-compatible
  universalProvider,
  projectId: PROJECT_ID,
  metadata,
  networks: [
    hederaNativeTest,
    hederaNativeMain,
    hederaEvmTestnet,
    hederaEvmMainnet,
  ],
  enableReconnect: true,
  rpc: { [EVM_CAIP]: RPC },
  features: {
    analytics: true,
    socials: false,
    swaps: false,
    onramp: false,
    email: false,
  },
  chainImages: {
    "hedera:testnet": "/hedera.svg",
    "hedera:mainnet": "/hedera.svg",
    "eip155:296": "/hedera.svg",
    "eip155:295": "/hedera.svg",
  },
});

// -------- tiny registry so non-React files can reuse the same session/provider ------
type Eip1193 = {
  request: (args: { method: string; params?: any }) => Promise<any>;
};
let _eip155Provider: Eip1193 | null = null;
let _hederaAccountId: string | null = null;
let _evmAddress: string | null = null;

export function registerEip155Provider(p: Eip1193 | null) {
  _eip155Provider = p;
}
export function getEip155Provider(): Eip1193 {
  if (!_eip155Provider) throw new Error("Wallet not connected");
  return _eip155Provider;
}
export function setSessionIdentities(opts: {
  hederaAccountId?: string | null;
  evmAddress?: string | null;
}) {
  if (typeof opts.hederaAccountId !== "undefined")
    _hederaAccountId = opts.hederaAccountId;
  if (typeof opts.evmAddress !== "undefined")
    _evmAddress = opts.evmAddress?.toLowerCase() ?? null;
}
export function getHederaAccountId(): string {
  if (!_hederaAccountId) throw new Error("Hedera account not connected");
  return _hederaAccountId;
}
export function getEvmAddress(): string | null {
  return _evmAddress;
}
export function resetSessionIdentities() {
  _hederaAccountId = null;
  _evmAddress = null;
  _eip155Provider = null;
}

// WalletConnect: disconnect all topics (safety)
export async function disconnectAllSessions() {
  try {
    const anyUP: any = universalProvider;
    const sc = anyUP?.client ?? anyUP?.signClient;
    const sessions = sc?.session?.getAll?.() ?? [];
    for (const s of sessions) {
      try {
        await sc.disconnect({
          topic: s.topic,
          reason: { code: 6000, message: "User disconnected" },
        });
      } catch {}
    }
  } catch {}
  try {
    localStorage.removeItem("WALLETCONNECT_DEEPLINK_CHOICE");
  } catch {}
  resetSessionIdentities();
}

// quick nuke (prod-safe)
export function nukeAppKitCaches() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)!;
      if (k.startsWith("@appkit")) sessionStorage.removeItem(k);
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)!;
      if (
        k.startsWith("wc@2") ||
        k.startsWith("@walletconnect") ||
        k.includes("walletconnect") ||
        k.startsWith("@appkit")
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

export { HederaJsonRpcMethod };
export const HEDERA_NET = NET;
