"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type Plan } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { PlanForm } from "@/components/PlanForm";

export default function EditPlan() {
  useMe("planner");
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ plan: Plan }>(`/plans/${id}`)
      .then((r) => setPlan(r.plan))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <main className="wrap page">
        <p className="error">{error}</p>
      </main>
    );
  if (!plan)
    return (
      <main className="loading">
        <span className="spinner" />
      </main>
    );
  return <PlanForm plan={plan} />;
}
