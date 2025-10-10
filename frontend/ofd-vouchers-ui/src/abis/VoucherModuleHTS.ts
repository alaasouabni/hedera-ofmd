export const VoucherModuleABI = [
  // read
  "function owner() view returns (address)",
  "function hOFD() view returns (address)",
  "function vOFD() view returns (address)",
  "function treasury() view returns (address)",
  "function mdrBps() view returns (uint16)",
  "function isSponsor(address) view returns (bool)",
  "function isMerchant(address) view returns (bool)",
  "function isSupplier(address) view returns (bool)",

  // admin
  "function setRole(address who, string role, bool on) external",
  "function grantKycAndUnfreeze(address account) external",
  "function setMDR(uint16 bps) external",

  // flows
  "function issueVoucher(address merchant, uint256 amount) external",
  "function spendVoucher(address supplier, uint256 amountHOFD) external",
  "function redeem(uint256 amount) external",

  // events
  "event Issue(address indexed sponsor, address indexed merchant, uint256 amount)",
  "event Spend(address indexed merchant, address indexed supplier, uint256 amount)",
  "event Redeem(address indexed supplier, uint256 gross, uint256 fee, uint256 net)",
  "event HTSCreated(address token)",
  "event MDRSet(uint16 bps)",
  "event RoleSet(address indexed who, string role, bool on)",
];
