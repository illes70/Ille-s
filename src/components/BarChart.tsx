"use client";

import { useState } from "react";

interface Point {
  key: string;
  label: string;
  value: number | null;
}

/** Single-series bar chart: one hue, recessive grid, hover tooltip, sparse x labels. */
export function BarChart({ points, format, height = 220 }: { points: Point[]; format: (n: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.value ?? 0), 0);
  const top = niceCeil(max);
  const ticks = [0, top / 2, top];
  const labelEvery = Math.ceil(points.length / 7);

  return (
    <div className="relative" style={{ height }}>
      <div className="absolute inset-0 grid grid-cols-[auto_1fr] gap-2">
        <div className="tabular flex flex-col-reverse justify-between pb-6 text-right text-[11px] text-muted">
          {ticks.map((t) => (
            <span key={t} className="leading-none">
              {top ? format(t) : ""}
            </span>
          ))}
        </div>
        <div className="relative flex flex-col">
          <div className="relative flex-1">
            {ticks.map((t) => (
              <div
                key={t}
                className={`absolute inset-x-0 border-t ${t === 0 ? "border-line" : "border-dashed border-line/70"}`}
                style={{ bottom: `${top ? (t / top) * 100 : 0}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {points.map((p, i) => {
                const h = top && p.value ? (p.value / top) * 100 : 0;
                return (
                  <div
                    key={p.key}
                    className="flex h-full flex-1 items-end"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div
                      className={`w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-accent" : "bg-accent/75"}`}
                      style={{ height: `${h}%`, minHeight: p.value ? 2 : 0 }}
                    />
                  </div>
                );
              })}
            </div>
            {hover !== null && (
              <div
                className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
                style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}
              >
                <p className="text-muted">{points[hover].label}</p>
                <p className="tabular font-semibold">{points[hover].value === null ? "–" : format(points[hover].value!)}</p>
              </div>
            )}
          </div>
          <div className="relative h-6 text-[11px] text-muted">
            {points.map((p, i) =>
              i % labelEvery === 0 ? (
                <span
                  key={p.key}
                  className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${((i + 0.5) / points.length) * 100}%` }}
                >
                  {p.label}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function niceCeil(n: number) {
  if (n <= 0) return 0;
  const pow = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= n)!;
  return step * pow;
}
