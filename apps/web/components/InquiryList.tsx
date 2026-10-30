"use client";

import { useEffect, useState } from "react";
import { api, type PublicVendor } from "@/lib/api";

interface Row {
  id: string;
  message: string;
  status: "sent" | "replied" | "declined";
  vendorReply: string | null;
  vendor: PublicVendor;
}

export function InquiryList({ planId, version }: { planId: string; version: unknown }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    api<{ inquiries: Row[] }>(`/plans/${planId}/inquiries`).then((r) => setRows(r.inquiries)).catch(() => {});
  }, [planId, version]);
  if (rows.length === 0) return null;
  return (
    <div className="card">
      <div className="panel-title" style={{ marginBottom: 4 }}>
        <p className="eyebrow">Messages</p>
        <span className="small muted">{rows.length}</span>
      </div>
      <div>
        {rows.map((r) => (
          <div key={r.id} className="inbox-item">
            <div className="row between">
              <strong className="small">{r.vendor.name}</strong>
              <span className={`badge ${r.status === "replied" ? "moss" : r.status === "declined" ? "accent" : "amber"}`}>
                {r.status === "sent" ? "Waiting" : r.status === "replied" ? "Replied" : "Declined"}
              </span>
            </div>
            {r.vendorReply && <p className="small" style={{ marginTop: 6, color: "var(--ink-2)" }}>{r.vendorReply}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
