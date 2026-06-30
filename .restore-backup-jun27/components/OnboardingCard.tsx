"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getOnboardingSteps, isOnboardingComplete, type OnboardingStep } from "@/lib/onboarding-status";

export default function OnboardingCard({ className = "" }: { className?: string }) {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setSteps(getOnboardingSteps());
      setReady(true);
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("bt:sessions-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("bt:sessions-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!ready || isOnboardingComplete(steps)) return null;

  const nextStep = steps.find((step) => !step.done) ?? steps[0];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <section className={`app-card--accent-violet ${className}`.trim()}>
      <p className="section-eyebrow">Erste Schritte</p>
      <h2 className="section-title mt-1">App einrichten ({doneCount}/{steps.length})</h2>
      <p className="mt-1 text-sm text-muted">
        In drei Schritten bist du startklar — danach funktionieren Weekly-Plan und Auto-Vorschläge am besten.
      </p>
      <ol className="mt-4 space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="list-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`font-semibold ${step.done ? "text-faint line-through" : "text-strong"}`}>{step.title}</p>
                <p className="mt-0.5 text-xs text-muted">{step.description}</p>
              </div>
              {step.done ? (
                <span className="chip chip-active">Erledigt</span>
              ) : (
                <Link href={step.href} className="btn btn-violet btn-xs shrink-0">
                  {step.id === nextStep.id ? "Als Nächstes" : "Öffnen"}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
