export const RPC_URL = "https://testnet.hashio.io/api";
export const EXPLORER_TX = (hash: string) => `https://hashscan.io/testnet/transaction/${hash}`;
export const EXPLORER_ADDR = (addr: string) => `https://hashscan.io/testnet/address/${addr}`;

// ====== PASTE YOUR ADDRESSES HERE ======
export const ADDRS = {
  H_OFD: "0xa79bD079986b7D8C9D98021817dCf7085741D991",   // hOFD (18-dec ERC20 on EVM)
  VOUCHER_MODULE: "0xDA2aE91e74cefA856F9b2Cea3ff068BcFa10da7C",  // VoucherModuleHTS
  V_OFD: "0x00000000000000000000000000000000006a54b7",          // vOFD HTS EVM address
  HTS_HELPER: "0x6369dd895Ce061eEbE6679ff77bfaA9E223a44ad",        // HTSAssocHelper
};
// =======================================

// Hint for log fetching window; set to the block the module was deployed (or a safe earlier block)
export const DEPLOY_BLOCK = 0; // put your known deploy block if you have it

export const DECIMALS = {
  H_OFD: 18, // hOFD
  V_OFD: 8,  // vOFD
};

export const UI = {
  TITLE: "OFD Voucher Pilot",
  FEE_BPS_LABEL: "MDR (bps)",
};
