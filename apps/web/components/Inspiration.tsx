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
  const [link, setLink] = useState("");
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

  async function readLink(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setBusy("Reading Board…");
    setError(null);
    try {
      const r = await api<{ plan: Plan }>(`/plans/${plan.id}/inspiration/board-link`, {
        method: "POST",
        json: { url: link.trim() },
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
      <div className="card reading" title="About 20 seconds">
        <div className="loader" aria-hidden>
          {["#8f3a46", "#c98b84", "#e8c4bc", "#a3ae8d", "#c9a77c"].map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </div>
        <h3>{busy}</h3>
        <p className="small muted">Palette, Style, Formality</p>
      </div>
    );
  }


  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" }}>
      {notice && <p className={notice.startsWith("Pinterest is connected") ? "ok" : "error"}>{notice}</p>}
      {error && <p className="error">{error}</p>}

      <div className="intake">
      <section className="card pad-lg">
        <div className="panel-title">
          <h3 className="row" style={{ gap: 10 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#e60023", display: "inline-block" }} aria-hidden />
            Pinterest
          </h3>
          {status?.connected && (
            <button className="linkish small" onClick={disconnect}>
              Disconnect
            </button>
          )}
        </div>
        <form className="board-link" onSubmit={readLink}>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="pinterest.com/you/wedding-ideas"
            aria-label="Board Link"
            title="Any public board. Copy the link from Share → Copy Link."
          />
          <button className="btn accent" disabled={!link.trim()}>
            Read Board
          </button>
        </form>
        {status?.enabled && !status.connected && (
          <a
            className="linkish small"
            href={`/api/pinterest/connect?planId=${plan.id}`}
            title="Sign in to pick from your boards, including private ones."
          >
            Or Connect Your Account
          </a>
        )}
        {status?.connected &&
          (boards === null ? (
            <span className="spinner" />
          ) : boards.length === 0 ? (
            <p className="muted">No Boards</p>
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
                  <div className="meta-b">
                    <strong>{b.name}</strong>
                    <div className="muted">{b.pinCount} Pins</div>
                  </div>
                </button>
              ))}
            </div>
          ))}
      </section>

      <section className="card pad-lg">
        <div className="panel-title">
          <h3>Upload</h3>
          <span className="small muted">3–30 Images</span>
        </div>
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
          <div title="Screenshots, saved pins, photos. Images are read, then discarded.">
            <span className="plus" aria-hidden>
              +
            </span>
            <strong>Drop Images</strong>
            <p className="small muted">Or Click to Browse</p>
          </div>
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
    </div>
  );
}
