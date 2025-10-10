// import { useWallet } from "./WalletProvider";
// import { Button } from "../ui/Button";

// export function MismatchBanner() {
//   const { mismatch, syncEvm } = useWallet();
//   if (!mismatch) return null;
//   return (
//     <div className="card p-3 flex items-center justify-between border-amber-400/40">
//       <div className="text-sm">
//         <b>Heads up:</b> Your connected EVM address doesn’t match the Hedera account’s EVM alias.
//       </div>
//       <Button variant="outline" onClick={syncEvm}>Sync EVM</Button>
//     </div>
//   );
// }
