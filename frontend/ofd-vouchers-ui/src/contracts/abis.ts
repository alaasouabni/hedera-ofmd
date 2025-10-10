import { Interface } from "ethers";

export const VOUCHER_MODULE_ABI = [
  "function issueVoucher(address merchant, uint256 amount) external",
  "function spendVoucher(address supplier, uint256 amount) external",
  "function redeem(uint256 amount) external",
  "function vOFD() view returns (address)",

  "event Issue(address indexed sponsor, address indexed merchant, uint256 amount)",
  "event Spend(address indexed merchant, address indexed supplier, uint256 amount)",
  "event Redeem(address indexed supplier, uint256 gross, uint256 fee, uint256 net)"
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

export const voucherIface = new Interface(VOUCHER_MODULE_ABI);
export const erc20Iface = new Interface(ERC20_ABI);

export const ISSUE_TOPIC = voucherIface.getEvent("Issue")!.topicHash;
export const SPEND_TOPIC = voucherIface.getEvent("Spend")!.topicHash;
export const REDEEM_TOPIC = voucherIface.getEvent("Redeem")!.topicHash;
