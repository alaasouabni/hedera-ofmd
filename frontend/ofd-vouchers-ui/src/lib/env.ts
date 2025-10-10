export const ENV = {
  NET:
    (import.meta.env.VITE_NETWORK as "mainnet" | "testnet" | "previewnet") ||
    "testnet",
  EVM_RPC: import.meta.env.VITE_EVM_RPC as string,
  VOUCHER_MODULE: import.meta.env.VITE_VOUCHER_MODULE as `0x${string}`,
  HOFD: import.meta.env.VITE_HOFD as `0x${string}`,
  VOFD: (import.meta.env.VITE_VOFD as `0x${string}`) || undefined,
  MIRROR: (import.meta.env.VITE_MIRROR as string) || undefined,
};

export function mirrorBase() {
  if (ENV.MIRROR) return ENV.MIRROR;
  if (ENV.NET === "mainnet")
    return "https://mainnet-public.mirrornode.hedera.com/api/v1";
  if (ENV.NET === "previewnet")
    return "https://previewnet.mirrornode.hedera.com/api/v1";
  return "https://testnet.mirrornode.hedera.com/api/v1";
}
