"use client";

import { useState } from "react";
import { api, type Plan } from "@/lib/api";

export function ShareButton({ plan, onChange }: { plan: Plan; onChange: (token: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = plan.shareToken ? `${window.location.origin}/share/${plan.shareToken}` : "";

  async function start() {
    setOpen(true);
    setCopied(false);
    if (plan.shareToken) return;
    setBusy(true);
    try {
      const r = await api<{ shareToken: string }>(`/plans/${plan.id}/share`, { method: "POST" });
      onChange(r.shareToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  async function stop() {
    setBusy(true);
    try {
      await api(`/plans/${plan.id}/share`, { method: "DELETE" });
      onChange(null);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn ghost sm" onClick={start}>
        Share
      </button>
      {open && (
        <div className="dialog-backdrop" onClick={() => setOpen(false)}>
          <div className="card pad-lg dialog stack" role="dialog" aria-modal aria-label="Share Results" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="eyebrow">Read-Only Link</p>
              <h2 style={{ marginTop: 4 }}>Share Results</h2>
            </div>
            {busy && !link ? (
              <span className="spinner" />
            ) : (
              <div className="share-box">
                <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Share link" />
                <button className="btn accent" onClick={copy} disabled={!link}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
            <p className="small muted">Shows your look and top matches. Hides budget and messages.</p>
            {error && <p className="error">{error}</p>}
            <div className="row between">
              <button className="linkish small" onClick={stop} disabled={busy || !link}>
                Stop Sharing
              </button>
              <button className="btn ghost" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
