import React, { useCallback, useEffect, useState } from "react";
import { profileApi } from "../../lib/api";
import { evmWrite } from "../../lib/evm";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { X } from "lucide-react"; // close button icon

type Initial = {
  username?: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
};

export function ProfileModal({
  address,
  onDone,
  initial,
  mode = "create",
}: {
  address: string;
  onDone: () => void;
  initial?: Initial;
  mode?: "create" | "edit";
}) {
  const [username, setUsername] = useState(initial?.username ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatarUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // update when initial changes (e.g. editing after fetch)
  useEffect(() => {
    setUsername(initial?.username ?? "");
    setDisplayName(initial?.displayName ?? "");
    setBio(initial?.bio ?? "");
    setAvatarUrl(initial?.avatarUrl ?? "");
  }, [
    initial?.username,
    initial?.displayName,
    initial?.bio,
    initial?.avatarUrl,
  ]);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      // Always refresh/ensure session with a signed message (idempotent)
      const { message } = await profileApi.nonce(address);
      const signer = await evmWrite();
      const sig = await signer.signMessage(message);
      await profileApi.verify(address, sig);

      // Create or update
      await profileApi.upsert({
        username,
        displayName: displayName || undefined,
        bio: bio || undefined,
        avatarUrl: avatarUrl || undefined,
      });

      onDone();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [address, username, displayName, bio, avatarUrl, onDone]);

  const title = mode === "edit" ? "Edit your profile" : "Create your profile";

  const labelCls = "text-[11px] font-medium text-[color:var(--muted)]";
  const fieldCls = "grid gap-1.5";
  const overlayCls = "fixed inset-0 z-50 grid place-items-center bg-black/55"; // solid overlay (no glass)
  const panelCls =
    "w-[min(680px,95vw)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-lg)]";

  return (
    <div className={overlayCls} role="dialog" aria-modal="true">
      <div className={panelCls}>
        {/* Accent hairline */}
        <div className="h-0.5 w-full bg-[color:var(--accent)]/40" />

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="space-y-1 pr-8">
            <h2 className="text-sm font-semibold text-[color:var(--ink)]">
              {title}
            </h2>
            <p className="text-[11px] leading-relaxed text-[color:var(--muted)]">
              We’ll store this off-chain. You’ll sign a message to prove
              ownership of{" "}
              <span className="font-mono text-[12px] opacity-80 break-all">
                {address}
              </span>
              .
            </p>
          </div>

          {/* Close */}
          <button
            onClick={onDone}
            aria-label="Close"
            className="shrink-0 grid h-8 w-8 place-items-center rounded-full border border-[var(--border)] text-[color:var(--muted)] hover:text-[color:var(--ink)] hover:bg-[color:var(--surface-2)] transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <div className="grid grid-cols-[96px_1fr] gap-5">
            {/* Avatar preview */}
            <div className="pt-1">
              <div className="relative h-20 w-20 overflow-hidden rounded-full border border-[var(--border)] bg-[color:var(--surface-2)]">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Avatar preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-[11px] text-[color:var(--muted)]">
                    No avatar
                  </div>
                )}
              </div>
            </div>

            {/* Form fields */}
            <div className="grid gap-3">
              <div className={fieldCls}>
                <label className={labelCls}>Username</label>
                <Input
                  placeholder="Username (3–32 chars, a–z, 0–9, _)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className={fieldCls}>
                <label className={labelCls}>Display name</label>
                <Input
                  placeholder="Display name (optional)"
                  value={displayName ?? ""}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div className={fieldCls}>
                <label className={labelCls}>Avatar URL</label>
                <Input
                  placeholder="https://… (optional)"
                  value={avatarUrl ?? ""}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
              </div>

              <div className={fieldCls}>
                <label className={labelCls}>Bio</label>
                <textarea
                  className="h-28 rounded-xl border border-[var(--border)] bg-transparent p-2 text-sm focus:outline-none"
                  placeholder="Tell people a little about you (optional)"
                  value={bio ?? ""}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
            </div>
          </div>

          {err ? (
            <div className="mt-3 text-xs text-rose-600 break-all">{err}</div>
          ) : null}

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
            {mode === "create" ? (
              <Button variant="ghost" onClick={onDone} disabled={busy}>
                Skip
              </Button>
            ) : null}
            <Button onClick={submit} disabled={busy || username.length < 3}>
              {busy
                ? "Saving…"
                : mode === "edit"
                ? "Save changes"
                : "Save profile"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
