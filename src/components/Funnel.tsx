import { fmtMoney } from "@/lib/format";

interface Stage {
  id: string;
  label: string;
  count: number;
}

/** Lead → Felhívva → Felmérés → Megnyert, with conversion and cost per stage. */
export function Funnel({ stages, spend, currency }: { stages: Stage[]; spend: number; currency: string }) {
  const first = stages[0]?.count ?? 0;
  return (
    <ol className="space-y-3">
      {stages.map((s, i) => {
        const pct = first ? (s.count / first) * 100 : 0;
        return (
          <li key={s.id}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-medium">{s.label}</span>
              <span className="tabular text-muted">
                <span className="font-semibold text-fg">{s.count}</span>
                {i > 0 && first ? ` · ${pct.toFixed(0)}%` : ""}
                {s.count ? ` · ${fmtMoney(spend / s.count, currency)}/db` : ""}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, s.count ? 2 : 0)}%`, opacity: 1 - i * 0.18 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
