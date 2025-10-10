// src/lib/contracts.ts
export const voucherModuleAbi = [
  // views
  "function owner() view returns (address)",
  "function hOFD() view returns (address)",
  "function vOFD() view returns (address)",
  "function created() view returns (bool)",
  "function mdrBps() view returns (uint16)",
  "function isSponsor(address) view returns (bool)",
  "function isMerchant(address) view returns (bool)",
  "function isSupplier(address) view returns (bool)",

  // admin
  "function createVoucherToken() payable",
  "function setRole(address who, string role, bool on)",
  "function grantKycAndUnfreeze(address account)",
  "function setMDR(uint16 bps)",

  // flows
  "function issueVoucher(address merchant, uint256 amount)",
  "function spendVoucher(address supplier, uint256 amountHOFD)",
  "function redeem(uint256 amount)",

  // events
  "event HTSCreated(address token)",
  "event RoleSet(address indexed who, string role, bool on)",
  "event Issue(address indexed sponsor, address indexed merchant, uint256 amount)",
  "event Spend(address indexed merchant, address indexed supplier, uint256 amount)",
  "event Redeem(address indexed supplier, uint256 gross, uint256 fee, uint256 net)",
];

export const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];
