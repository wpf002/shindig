"use client";

import { useEffect, useRef, useState } from "react";
import { api, type Plan } from "@/lib/api";
import { toFormData } from "@/lib/resize";

interface Board {
  id: string;
  name: string;
  pinCount: number;
  coverUrl: string | null;
}

export function Inspiration({ plan, onRead, notice }: { plan: Plan; onRead: (p: Plan) => void; notice?: string | null }) {
  const [status, setStatus] = useState<{ enabled: boolean; connected: boolean } | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ enabled: boolean; connected: boolean }>("/pinterest/status")
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, connected: false }));
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    api<{ boards: Board[] }>("/pinterest/boards")
      .then((r) => setBoards(r.boards))
      .catch((e: Error) => setError(e.message));
  }, [status?.connected]);

  async function readBoard(b: Board) {
    setBusy(`Reading “${b.name}”…`);
    setError(null);
    try {
      const r = await api<{ plan: Plan }>(`/plans/${plan.id}/inspiration/pinterest`, {
        method: "POST",
        json: { boardId: b.id, boardName: b.name },
      });
      onRead(r.plan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function upload(list: FileList | File[]) {
    const files = [...list].filter((f) => f.type.startsWith("image/")).slice(0, 30);
    if (files.length < 3) {
      setError("Add at least 3 images");
      return;
    }
    setBusy(`Reading ${files.length} images…`);
    setError(null);
    try {
      const r = await api<{ plan: Plan }>(`/plans/${plan.id}/inspiration/upload`, {
        method: "POST",
        body: await toFormData(files, 1024),
      });
      onRead(r.plan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    await api("/pinterest", { method: "DELETE" });
    setBoards(null);
    setStatus((s) => (s ? { ...s, connected: false } : s));
  }

  if (busy) {
    return (
      <div className="card row" style={{ gap: 14 }}>
        <span className="spinner" />
        <div>
          <p>{busy}</p>
          <p className="small muted">Pulling the palette and reading the style. Takes about 20 seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      {notice && <p className={notice.startsWith("Pinterest is connected") ? "ok" : "error"}>{notice}</p>}
      {error && <p className="error">{error}</p>}

      <section className="card">
        <div className="panel-title">
          <h3>From Pinterest</h3>
          {status?.connected && (
            <button className="linkish small" onClick={disconnect}>
              Disconnect
            </button>
          )}
        </div>
        {!status ? (
          <p className="muted">Checking…</p>
        ) : !status.enabled ? (
          <p className="muted small">Pinterest isn&apos;t set up on this server yet. Upload images below instead.</p>
        ) : !status.connected ? (
          <div className="stack">
            <p className="muted">Pick a board and Shindig reads it live. We keep the read, not your pins.</p>
            <a className="btn thread" href={`/api/pinterest/connect?planId=${plan.id}`}>
              Connect Pinterest
            </a>
          </div>
        ) : boards === null ? (
          <p className="muted">Loading your boards…</p>
        ) : boards.length === 0 ? (
          <p className="muted">No boards on that account yet.</p>
        ) : (
          <div className="boards">
            {boards.map((b) => (
              <button key={b.id} className="board" onClick={() => readBoard(b)} disabled={b.pinCount === 0}>
                {b.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="cover" src={b.coverUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <div className="cover" />
                )}
                <div className="meta">
                  <strong>{b.name}</strong>
                  <div className="muted">{b.pinCount} pins</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3 style={{ marginBottom: 12 }}>Or Upload Images</h3>
        <div
          className={`dropzone ${over ? "over" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            upload(e.dataTransfer.files);
          }}
        >
          <p>
            <strong>Drop 3–30 images</strong>
          </p>
          <p className="small muted">Screenshots, saved pins, magazine photos. We read them and throw them away.</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </section>
    </div>
  );
}
