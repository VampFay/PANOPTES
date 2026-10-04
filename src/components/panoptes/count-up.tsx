'use client';

/**
 * CountUp — a number that counts up when it enters the viewport.
 * Eased (cubic-out), tabular, reduced-motion safe.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useInView } from 'framer-motion';

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function CountUp({
  to,
  decimals = 0,
  duration = 1.3,
  separator = true,
  className,
}: {
  to: number;
  decimals?: number;
  duration?: number;
  separator?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-30px' });
  const [val, setVal] = useState(0);
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );

  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, to, duration]);

  const final = reduced ? to : val;
  const text = separator
    ? final.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : final.toFixed(decimals);

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
