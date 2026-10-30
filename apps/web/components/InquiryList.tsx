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
    <div className="card" style={{ marginTop: 16 }}>
      <p className="eyebrow" style={{ marginBottom: 10 }}>Messages</p>
      <div className="stack" style={{ ["--gap" as string]: "14px" }}>
        {rows.map((r) => (
          <div key={r.id}>
            <div className="row between">
              <strong className="small">{r.vendor.name}</strong>
              <span className={`badge ${r.status === "replied" ? "moss" : r.status === "declined" ? "thread" : ""}`}>
                {r.status === "sent" ? "Waiting" : r.status === "replied" ? "Replied" : "Declined"}
              </span>
            </div>
            {r.vendorReply && <p className="small" style={{ marginTop: 4 }}>{r.vendorReply}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
