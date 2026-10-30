"use client";

import { PlanForm } from "@/components/PlanForm";
import { useMe } from "@/lib/useMe";

export default function NewPlan() {
  useMe("planner");
  return <PlanForm />;
}
