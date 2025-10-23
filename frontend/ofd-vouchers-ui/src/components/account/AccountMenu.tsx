// components/account/AccountMenu.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useWallet } from "../wallet/WalletProvider";
import { useAppKit } from "@reown/appkit/react";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { profileApi, type Profile } from "../../lib/api";
import { ProfileModal } from "../profile/ProfileModal";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import {
  ChevronDown,
  Copy,
  Check,
  Edit3,
  LogOut,
  RefreshCw,
  User2,
  Wallet,
  Link as LinkIcon,
  AlertTriangle,
  Sparkles,
  Store,
  Truck,
} from "lucide-react";

function cx(...a: (string | null | false | undefined)[]) {
  return a.filter(Boolean).join(" ");
}
function shortAddr(a?: string) {
  return !a || a.length <= 10 || !a.startsWith("0x")
    ? a ?? ""
    : `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function avatarLetter(name?: string, addr?: string) {
  const s = (name?.trim() || addr || "").replace(/^0x/, "");
  return s ? s[0].toUpperCase() : "?";
}

function RolePill({
  icon: Icon,
  label,
  gradient,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  gradient: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium",
        "text-white shadow-sm bg-gradient-to-r",
        gradient
      )}
    >
      <Icon size={12} className="opacity-90" /> {label}
    </span>
  );
}

export function AccountMenu() {
  const {
    hedera,
    evm,
    mismatch,
    connecting,
    connect,
    syncEvm,
    disconnect,
    hbar,
    refreshHbar,
    hbarLoading,
    roles,
  } = useWallet();
  const { open } = useAppKit();

  const address = evm?.address?.toLowerCase() || null;
  const hasEvm = !!address;
  const hasHedera = !!hedera?.accountId;

  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [copied, setCopied] = useState<"evm" | "hedera" | null>(null);

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Profile load
  const load = useCallback(async () => {
    if (!address) {
      setProfile(undefined);
      return;
    }
    setLoading(true);
    try {
      setProfile(await profileApi.get(address));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [address]);
  useEffect(() => {
    void load();
  }, [load]);

  const display = useMemo(
    () =>
      profile
        ? profile.displayName?.trim() || profile.username || profile.address
        : undefined,
    [profile]
  );

  // position (fixed → viewport coords, no scroll math)
  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    const root = document.getElementById("portal-root") || document.body;
    if (!el || !root) return;
    const r = el.getBoundingClientRect();
    const width = 360;
    const left = Math.max(
      8,
      Math.min(window.innerWidth - width - 8, r.right - width)
    );
    setPos({ top: r.bottom + 8, left });
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    updatePos();
    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen, updatePos]);

  // close on outside click (portal-safe)
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const menu = document.getElementById("account-menu-popover");
      if (anchorRef.current?.contains(e.target as Node)) return;
      if (!menu || !menu.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const connectHedera = useCallback(async () => {
    await open({ view: "Connect", namespace: hederaNamespace });
  }, [open]);
  const copyWithFlash = useCallback(
    async (what: "evm" | "hedera", value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(what);
        setTimeout(() => setCopied((s) => (s === what ? null : s)), 900);
      } catch {}
    },
    []
  );

  if (!hasEvm) {
    return (
      <Button onClick={connect} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect"}
      </Button>
    );
  }

  const portalRoot = document.getElementById("portal-root") || document.body;

  return (
    <>
      {/* Trigger — uses theme vars (no dark: dependency) */}
      <button
        ref={anchorRef}
        onClick={() => setMenuOpen((v) => !v)}
        className={cx(
          "h-10 pl-1 pr-2 rounded-full border shadow-sm",
          "flex items-center gap-2 transition",
          "bg-[var(--panel)] hover:bg-[var(--panel)]/90" // solid if your --card is solid; otherwise adjust to another var
        )}
        title="Account"
      >
        <div className="relative h-8 w-8 rounded-full overflow-hidden border flex items-center justify-center text-[11px] bg-[var(--card)]">
          {profile?.avatarUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              src={profile.avatarUrl}
              className="h-full w-full object-cover"
              onError={(e) =>
                ((e.currentTarget as HTMLImageElement).style.display = "none")
              }
            />
          ) : (
            <span>{avatarLetter(display, address)}</span>
          )}
        </div>
        <span className="hidden sm:inline">
          <Badge tone="blue">
            {hbar?.formatted ?? (hbarLoading ? "…" : "0")} HBAR
          </Badge>
        </span>
        <ChevronDown
          size={14}
          className={cx("opacity-70", menuOpen && "rotate-180")}
        />
      </button>

      {menuOpen &&
        pos &&
        createPortal(
          <div
            id="account-menu-popover"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: 360,
              zIndex: 1000,
            }}
            className="rounded-2xl border overflow-hidden shadow-2xl"
          >
            {/* Entire sheet uses your theme variables (solid) */}
            <div className="bg-[var(--panel)]">
              {/* Header */}
              <div className="p-4 border-b">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full overflow-hidden border flex items-center justify-center text-[12px] bg-[var(--card)] ring-2 ring-[var(--primary)]/20">
                    {profile?.avatarUrl ? (
                      // eslint-disable-next-line jsx-a11y/alt-text
                      <img
                        src={profile.avatarUrl}
                        className="h-full w-full object-cover"
                        onError={(e) =>
                          ((e.currentTarget as HTMLImageElement).style.display =
                            "none")
                        }
                      />
                    ) : (
                      <span className="text-sm">
                        {avatarLetter(display, address)}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {display || shortAddr(address)}
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {profile?.username
                        ? `@${profile.username}`
                        : "No username"}
                    </div>
                  </div>

                  <div className="ml-auto">
                    {profile ? (
                      <Button
                        variant="outline"
                        onClick={() => setModalMode("edit")}
                      >
                        <Edit3 size={14} />
                        <span className="ml-1">Edit</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setModalMode("create")}
                      >
                        <User2 size={14} />
                        <span className="ml-1">Create</span>
                      </Button>
                    )}
                  </div>
                </div>

                {(roles.sponsor || roles.merchant || roles.supplier) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {roles.sponsor && (
                      <RolePill
                        icon={Sparkles}
                        label="Sponsor"
                        gradient="from-sky-500 to-blue-600"
                      />
                    )}
                    {roles.merchant && (
                      <RolePill
                        icon={Store}
                        label="Merchant"
                        gradient="from-violet-500 to-fuchsia-600"
                      />
                    )}
                    {roles.supplier && (
                      <RolePill
                        icon={Truck}
                        label="Supplier"
                        gradient="from-emerald-500 to-teal-600"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Balance */}
              <div className="px-4 py-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-[var(--muted)]">
                    HBAR balance
                  </div>
                  <button
                    className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border hover:bg-[var(--glass)]/30"
                    onClick={refreshHbar}
                    disabled={hbarLoading}
                    title="Refresh HBAR"
                  >
                    <RefreshCw
                      size={12}
                      className={hbarLoading ? "animate-spin" : ""}
                    />
                    Refresh
                  </button>
                </div>
                <div className="mt-1 text-xl font-semibold tracking-tight">
                  {hbar?.formatted ?? (hbarLoading ? "…" : "0")} HBAR
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {hasHedera ? (
                    <Badge tone="blue">Hedera linked</Badge>
                  ) : (
                    <Badge tone="amber">No Hedera</Badge>
                  )}
                  {mismatch ? (
                    <Badge
                      tone="amber"
                      className="inline-flex items-center gap-1"
                    >
                      <AlertTriangle size={12} /> EVM ≠ Alias
                    </Badge>
                  ) : null}
                </div>
              </div>

              {/* Addresses */}
              <div className="px-4 py-3 border-b space-y-2">
                <div className="text-[11px] text-[var(--muted)]">Addresses</div>

                <div className="rounded-xl border p-2 bg-[var(--card)]">
                  <div className="text-[11px] text-[var(--muted)] flex items-center gap-1">
                    <Wallet size={12} /> EVM
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="text-xs font-mono truncate">{address}</div>
                    <button
                      className="ml-auto p-1 rounded-md hover:bg-[var(--glass)]/30"
                      onClick={() => copyWithFlash("evm", address!)}
                      title="Copy EVM address"
                    >
                      {copied === "evm" ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border p-2 bg-[var(--card)]">
                  <div className="text-[11px] text-[var(--muted)] flex items-center gap-1">
                    <LinkIcon size={12} /> Hedera
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="text-xs font-mono truncate">
                      {hedera?.accountId ?? "—"}
                    </div>
                    {hedera?.accountId ? (
                      <button
                        className="ml-auto p-1 rounded-md hover:bg-[var(--glass)]/30"
                        onClick={() =>
                          copyWithFlash("hedera", hedera.accountId!)
                        }
                        title="Copy Hedera ID"
                      >
                        {copied === "hedera" ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {!hasHedera ? (
                    <Button
                      variant="outline"
                      onClick={connectHedera}
                      title="Link Hedera"
                    >
                      Link Hedera
                    </Button>
                  ) : null}
                  {mismatch ? (
                    <Button
                      variant="outline"
                      onClick={syncEvm}
                      title="Sync EVM alias"
                    >
                      Sync EVM
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={() => disconnect()}
                    title="Disconnect all"
                    className="sm:col-span-2 justify-center"
                  >
                    <LogOut size={16} />
                    <span className="ml-2">Disconnect</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          portalRoot
        )}

      {/* Modals */}
      {modalMode ? (
        <ProfileModal
          address={address!}
          mode={modalMode}
          initial={
            modalMode === "edit" && profile
              ? {
                  username: profile.username,
                  displayName: profile.displayName ?? undefined,
                  bio: profile.bio ?? undefined,
                  avatarUrl: profile.avatarUrl ?? undefined,
                }
              : undefined
          }
          onDone={() => {
            setModalMode(null);
            void load();
          }}
        />
      ) : null}
    </>
  );
}
