import React from "react";
import { useWallet } from "./wallet/WalletProvider";

export function ConnectBar() {
  const { hedera, evm, roles, owner, mismatch, connecting, connect} =
    useWallet();

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl shadow bg-white">
      <div className="flex items-center gap-4 justify-between">
        <div>
          <div className="text-xs text-gray-500">Hedera</div>
          <div className="font-mono">{hedera?.accountId || "—"}</div>
          {!!hedera?.evmAlias && (
            <div className="text-[11px] text-gray-500">
              alias: <span className="font-mono">{hedera.evmAlias}</span>
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-gray-500">EVM</div>
          <div className="font-mono">{evm?.address || "—"}</div>
          {mismatch && (
            <div className="text-[11px] text-amber-600">
              EVM signer ≠ Hedera alias
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded-xl bg-black text-white"
            onClick={connect}
            disabled={connecting}
          >
            {connecting ? "Connecting…" : hedera ? "Reconnect" : "Connect"}
          </button>
        </div>
      </div>
      <div className="text-xs text-gray-600">
        Roles: {roles.sponsor ? "Sponsor " : ""}
        {roles.merchant ? "Merchant " : ""}
        {roles.supplier ? "Supplier " : ""} | Owner:{" "}
        <span className="font-mono">{owner || "—"}</span>
      </div>
    </div>
  );
}
