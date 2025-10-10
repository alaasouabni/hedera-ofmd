// lib/evm.ts
import { BrowserProvider, JsonRpcProvider, ethers } from "ethers";
import { getEip155Provider, HEDERA_EVM_CHAIN_ID } from "./appkit";

const RPC = import.meta.env.VITE_EVM_RPC as string;

// shared read provider (HTTP)
export const evmRead = new JsonRpcProvider(RPC);

// signer (via WalletConnect EIP-1193)
export async function evmWrite() {
  const eip1193 = getEip155Provider();
  const browser = new BrowserProvider(eip1193 as any, HEDERA_EVM_CHAIN_ID);
  return await browser.getSigner();
}

// re-export ethers for convenience in your components
export const readProviders = { ethers };
