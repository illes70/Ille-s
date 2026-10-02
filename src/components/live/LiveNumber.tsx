"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that glides to its new value when live data changes, with a short
 * highlight on increase – the change is visible without being jarring.
 */
export function LiveNumber({ value, format, className = "" }: { value: number; format: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState(false);
  const from = useRef(value);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (value > start) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1400);
      return animate(start, value, () => clearTimeout(t));
    }
    return animate(start, value);

    function animate(a: number, b: number, done?: () => void) {
      const t0 = performance.now();
      const dur = 700;
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(a + (b - a) * eased);
        if (p < 1) raf.current = requestAnimationFrame(step);
        else from.current = b;
      };
      raf.current = requestAnimationFrame(step);
      return () => {
        if (raf.current) cancelAnimationFrame(raf.current);
        from.current = b;
        done?.();
      };
    }
  }, [value]);

  return (
    <span className={`tabular rounded-md transition-colors duration-700 ${flash ? "bg-good-soft text-good" : ""} ${className}`}>
      {format(shown)}
    </span>
  );
}
