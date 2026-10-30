"use client";

import { useEffect, useRef, useState } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function todayIso() {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
}

function pretty(v: string) {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** Themed date field. Submits YYYY-MM-DD under `name`, or nothing when empty. */
export function DatePicker({ name, defaultValue = "", id }: { name: string; defaultValue?: string; id?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const start = value || todayIso();
  const [view, setView] = useState(() => {
    const [y, m] = start.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const root = useRef<HTMLDivElement>(null);
  const today = todayIso();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      const [y, m] = (value || today).split("-").map(Number);
      setView({ y, m: m - 1 });
    }
    setOpen((o) => !o);
  }

  function shift(delta: number) {
    setView(({ y, m }) => {
      const n = m + delta;
      return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
    });
  }

  function pick(v: string) {
    setValue(v);
    setOpen(false);
  }

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <div className="datepick" ref={root}>
      <input type="hidden" name={name} value={value} />
      <button type="button" id={id} className={`datepick-trigger ${value ? "" : "empty"}`} onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <span>{value ? pretty(value) : "Pick a Date"}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="datepick-pop" role="dialog" aria-label="Choose Date">
          <div className="datepick-head">
            <button type="button" className="datepick-nav" onClick={() => shift(-1)} aria-label="Previous Month">‹</button>
            <strong>{MONTHS[view.m]} {view.y}</strong>
            <button type="button" className="datepick-nav" onClick={() => shift(1)} aria-label="Next Month">›</button>
          </div>
          <div className="datepick-grid">
            {DOW.map((d) => (
              <span key={d} className="dow">{d}</span>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <span key={`b${i}`} />;
              const v = iso(view.y, view.m, d);
              return (
                <button
                  type="button"
                  key={v}
                  className={`day ${v === value ? "sel" : ""} ${v === today ? "today" : ""} ${v < today ? "past" : ""}`}
                  onClick={() => pick(v)}
                  aria-pressed={v === value}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="datepick-foot">
            <button type="button" className="linkish small" onClick={() => pick("")}>Clear</button>
            <button type="button" className="linkish small" onClick={() => pick(today)}>Today</button>
          </div>
        </div>
      )}
    </div>
  );
}
