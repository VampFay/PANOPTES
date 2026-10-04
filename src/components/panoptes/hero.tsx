'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { FileDown, ShieldAlert, GitFork } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HERO_STATS } from '@/lib/panoptes-data';
import { ProvBadge } from './lab-ui';
import { cn } from '@/lib/utils';

const PAPER_URL = '/paper/PANOPTES_Toward_Survivable_Security_for_LLM_Agents.pdf';

const BONE = (a: number) => `rgba(237,230,214,${a})`;
const TERRA = (a: number) => `rgba(226,142,82,${a})`;
const VERD = (a: number) => `rgba(133,190,149,${a})`;
const BRONZE = (a: number) => `rgba(232,193,140,${a})`;

type Mode = 'tracking' | 'wander' | 'hold';

/* ---------------------------------------------------------------- intro sync
   The hero entrance waits for the boot sequence (custom event), modeled as
   an external store so no setState fires inside an effect. A module-level
   safety timeout guarantees the hero never stalls. */
let introFired = false;
const introListeners = new Set<() => void>();

function fireIntro() {
  if (introFired) return;
  introFired = true;
  introListeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('panoptes:ready', fireIntro, { once: true });
  window.setTimeout(fireIntro, 2600);
}

function subscribeIntro(cb: () => void) {
  introListeners.add(cb);
  return () => introListeners.delete(cb);
}

function useIntroReady(): boolean {
  return useSyncExternalStore(
    subscribeIntro,
    () => introFired,
    () => false,
  );
}

/* ------------------------------------------------------------- the watchman */
function ArgusWatchman() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  const modeRef = useRef<Mode>('tracking');
  const [mode, setMode] = useState<Mode>('tracking');

  const pointer = useRef({ x: 0.3, y: -0.35, has: false, lastAt: 0 });
  const rectCache = useRef<DOMRect | null>(null);
  const blink = useRef(0);
  const visible = useRef(true);

  /* seeded starfield — deterministic across SSR/client */
  const stars = useRef(
    Array.from({ length: 84 }, (_, i) => {
      const a = (i * 2654435761) % 1000 / 1000 * Math.PI * 2;
      const rr = 0.12 + ((i * 40503) % 1000) / 1000 * 0.46;
      return { a, rr, ph: ((i * 12289) % 1000) / 1000 * Math.PI * 2 };
    }),
  );

  /* cache rect on layout-affecting events only */
  const refreshRect = () => {
    if (canvasRef.current) rectCache.current = canvasRef.current.getBoundingClientRect();
  };

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const gaze = { x: 0.3, y: -0.35, vx: 0, vy: 0 };
    let dilation = 0.5;
    let dilationTarget = 0.5;
    let nextSaccade = 2.2;
    let saccadeTarget = { x: 0.3, y: -0.35 };
    let readoutAt = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rectCache.current = rect;
    };

    const onMove = (e: PointerEvent) => {
      pointer.current.x = e.clientX;
      pointer.current.y = e.clientY;
      pointer.current.has = true;
      pointer.current.lastAt = performance.now();
    };

    const draw = (time: number) => {
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2 - 12;
      if (R <= 0) return;
      ctx.clearRect(0, 0, w, h);

      const m = modeRef.current;

      /* ---- starfield backdrop ---- */
      for (const s of stars.current) {
        const sx = cx + Math.cos(s.a) * R * s.rr * 2.0;
        const sy = cy + Math.sin(s.a) * R * s.rr * 1.9;
        if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
        const tw = 0.25 + 0.55 * Math.abs(Math.sin(time * 0.35 + s.ph));
        ctx.fillStyle = BONE(0.16 * tw);
        ctx.fillRect(sx, sy, 1, 1);
      }

      /* ---- crosshair ---- */
      ctx.strokeStyle = BONE(0.05);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();

      /* ---- outer gimbal ring (bronze, with inner highlight) ---- */
      ctx.strokeStyle = 'rgba(138,90,48,0.85)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = BRONZE(0.32);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R - 3.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = BRONZE(0.14);
      ctx.beginPath();
      ctx.arc(cx, cy, R + 3.4, 0, Math.PI * 2);
      ctx.stroke();

      /* ---- 100 eyes of Argus on the ring ---- */
      for (let i = 0; i < 100; i++) {
        const a = (i / 100) * Math.PI * 2 + time * 0.018;
        const r = R * 0.955;
        const blinky = i % 13 === 0 ? 0.25 + 0.75 * Math.abs(Math.sin(time * 1.3 + i)) : 0.8;
        ctx.fillStyle = i % 13 === 0 ? TERRA(0.72 * blinky) : BRONZE(0.42 * blinky);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, i % 13 === 0 ? 1.7 : 1.15, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ---- tick ring (rotating CW) ---- */
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2 + time * 0.04;
        const len = i % 6 === 0 ? 9 : 4;
        const r1 = R * 0.9;
        const r2 = r1 - len;
        ctx.strokeStyle = i % 6 === 0 ? BRONZE(0.4) : BONE(0.17);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.stroke();
      }

      /* ---- middle dashed ring (CCW) ---- */
      ctx.save();
      ctx.strokeStyle = TERRA(0.34);
      ctx.setLineDash([2, 7]);
      ctx.lineDashOffset = -time * 12;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      /* ---- radar sweep wedge (speed depends on mode) ---- */
      const sweepSpeed = m === 'hold' ? 0.35 : 0.85;
      const sweep = time * sweepSpeed;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.9);
      grad.addColorStop(0, TERRA(0.11));
      grad.addColorStop(1, TERRA(0));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R * 0.9, sweep, sweep + 0.5);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      /* ---- gaze offset ---- */
      const gx = gaze.x * R * 0.17;
      const gy = gaze.y * R * 0.17;

      /* ---- bearing marker on the outer ring ---- */
      const bearing = Math.atan2(gaze.y, gaze.x);
      ctx.fillStyle = TERRA(0.95);
      ctx.beginPath();
      const bx = cx + Math.cos(bearing) * R;
      const by = cy + Math.sin(bearing) * R;
      ctx.moveTo(bx + Math.cos(bearing) * 6, by + Math.sin(bearing) * 6);
      ctx.lineTo(bx + Math.cos(bearing + 2.5) * 5, by + Math.sin(bearing + 2.5) * 5);
      ctx.lineTo(bx + Math.cos(bearing - 2.5) * 5, by + Math.sin(bearing - 2.5) * 5);
      ctx.closePath();
      ctx.fill();
      // fine bearing arc from center
      ctx.strokeStyle = TERRA(0.22);
      ctx.setLineDash([1, 5]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(bx - Math.cos(bearing) * 26, by - Math.sin(bearing) * 26);
      ctx.stroke();
      ctx.setLineDash([]);

      /* ---- iris ---- */
      const breathe = 1 + 0.012 * Math.sin(time * 1.7);
      const irisR = R * 0.52 * (0.9 + dilation * 0.14) * breathe;
      const irisGrad = ctx.createRadialGradient(cx + gx, cy + gy, irisR * 0.1, cx + gx, cy + gy, irisR);
      irisGrad.addColorStop(0, 'rgba(255,223,158,0.9)');
      irisGrad.addColorStop(0.45, 'rgba(240,169,92,0.55)');
      irisGrad.addColorStop(0.8, 'rgba(205,109,58,0.32)');
      irisGrad.addColorStop(1, 'rgba(74,36,16,0.05)');
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(cx + gx, cy + gy, irisR, 0, Math.PI * 2);
      ctx.fill();

      // iris spokes
      for (let i = 0; i < 56; i++) {
        const a = (i / 56) * Math.PI * 2 + time * 0.05;
        const r1 = R * 0.2;
        ctx.strokeStyle = i % 4 === 0 ? TERRA(0.4) : 'rgba(255,223,158,0.22)';
        ctx.beginPath();
        ctx.moveTo(cx + gx + Math.cos(a) * r1, cy + gy + Math.sin(a) * r1);
        ctx.lineTo(cx + gx + Math.cos(a) * irisR, cy + gy + Math.sin(a) * irisR);
        ctx.stroke();
      }
      // iris rings
      ctx.strokeStyle = BONE(0.09);
      [0.62, 0.78, 0.94].forEach((f) => {
        ctx.beginPath();
        ctx.arc(cx + gx, cy + gy, irisR * f, 0, Math.PI * 2);
        ctx.stroke();
      });
      // verdigris accent arc
      ctx.strokeStyle = VERD(0.45);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx + gx, cy + gy, irisR * 0.7, time * 0.4, time * 0.4 + 1.15);
      ctx.stroke();
      ctx.lineWidth = 1;

      /* ---- pupil ---- */
      const pr = R * 0.155 * (0.8 + dilation * 0.45);
      ctx.fillStyle = '#0d0b07';
      ctx.beginPath();
      ctx.arc(cx + gx, cy + gy, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = TERRA(0.9);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx + gx, cy + gy, pr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      // glint
      ctx.fillStyle = BONE(0.75);
      ctx.beginPath();
      ctx.arc(cx + gx - pr * 0.35, cy + gy - pr * 0.35, pr * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,223,158,0.35)';
      ctx.beginPath();
      ctx.arc(cx + gx + pr * 0.3, cy + gy + pr * 0.32, pr * 0.07, 0, Math.PI * 2);
      ctx.fill();

      /* ---- eyelids (blink) — two aperture lids slide closed ---- */
      if (blink.current > 0.01) {
        const cov = blink.current; // 0..1
        const lidR = R * 1.1;
        ctx.fillStyle = '#0d0b07';
        // upper lid slides down
        const uy = cy - lidR * 2 * (1 - cov);
        ctx.beginPath();
        ctx.arc(cx, uy, lidR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = TERRA(0.35 * cov);
        ctx.stroke();
        // lower lid slides up
        const ly = cy + lidR * 2 * (1 - cov);
        ctx.beginPath();
        ctx.arc(cx, ly, lidR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = TERRA(0.35 * cov);
        ctx.stroke();
      }

      /* ---- readout ---- */
      if (time - readoutAt > 0.12 && readoutRef.current) {
        readoutAt = time;
        const theta = (gaze.x * 45).toFixed(1);
        const phi = (-gaze.y * 45).toFixed(1);
        const pupils = (0.8 + dilation * 0.45).toFixed(2);
        const modeLabel = m === 'tracking' ? 'track' : m === 'wander' ? 'wander' : 'hold';
        readoutRef.current.textContent = `θ ${theta}° · φ ${phi}° · pupil ${pupils} · ${modeLabel}`;
      }
    };

    const loop = (t: number) => {
      const time = t / 1000;
      const now = performance.now();

      /* gaze target by mode */
      const idleTakeover = now - pointer.current.lastAt > 6000;
      let target = { x: 0.3, y: -0.35 };
      if (modeRef.current === 'tracking' && pointer.current.has && !idleTakeover) {
        const rect = rectCache.current;
        if (rect) {
          const ccx = rect.left + rect.width / 2;
          const ccy = rect.top + rect.height / 2;
          const dx = (pointer.current.x - ccx) / Math.max(rect.width, 240);
          const dy = (pointer.current.y - ccy) / Math.max(rect.height, 240);
          target = { x: Math.max(-1, Math.min(1, dx * 1.6)), y: Math.max(-1, Math.min(1, dy * 1.6)) };
        }
      } else if (modeRef.current === 'wander' || (modeRef.current === 'tracking' && idleTakeover)) {
        target = saccadeTarget;
      } else {
        target = { x: gaze.x, y: gaze.y }; // hold
      }

      /* wander saccade scheduling */
      if (modeRef.current === 'wander' || (modeRef.current === 'tracking' && idleTakeover)) {
        nextSaccade -= 1 / 60;
        if (nextSaccade <= 0) {
          const ang = Math.random() * Math.PI * 2;
          const rad = 0.15 + Math.random() * 0.5;
          saccadeTarget = { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.8 };
          nextSaccade = 1.8 + Math.random() * 2.6;
        }
      }

      /* critically-damped gaze spring */
      const stiff = modeRef.current === 'hold' ? 0.02 : 0.085;
      const damp = 0.82;
      gaze.vx = (gaze.vx + (target.x - gaze.x) * stiff) * damp;
      gaze.vy = (gaze.vy + (target.y - gaze.y) * stiff) * damp;
      gaze.x += gaze.vx;
      gaze.y += gaze.vy;

      /* pupil dilation by mode + proximity */
      if (modeRef.current === 'tracking' && pointer.current.has && rectCache.current) {
        const rect = rectCache.current;
        const d = Math.hypot(pointer.current.x - (rect.left + rect.width / 2), pointer.current.y - (rect.top + rect.height / 2));
        dilationTarget = d < rect.width * 0.65 ? 1 : 0.45;
      } else if (modeRef.current === 'wander') {
        dilationTarget = 0.55 + 0.12 * Math.sin(time * 0.9);
      } else {
        dilationTarget = 0.85 + 0.08 * Math.sin(time * 2.2);
      }
      dilation += (dilationTarget - dilation) * 0.045;

      /* blink decay */
      blink.current = Math.max(0, blink.current - 0.055);

      draw(time);
      raf = requestAnimationFrame(loop);
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resize();

    /* visibility-gated loop — the canvas sleeps off-screen */
    const io = new IntersectionObserver(
      (entries) => {
        visible.current = entries[0]?.isIntersecting ?? true;
        cancelAnimationFrame(raf);
        if (visible.current && !reduced) raf = requestAnimationFrame(loop);
        else if (visible.current) draw(0.7); // static frame for reduced motion
      },
      { threshold: 0.05 },
    );
    io.observe(canvas);

    const ro = new ResizeObserver(() => {
      resize();
      if (!visible.current || reduced) draw(0.7);
    });
    ro.observe(canvas);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', refreshRect, { passive: true });
    window.addEventListener('resize', refreshRect, { passive: true });

    if (reduced) {
      draw(0.7);
    }

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', refreshRect);
      window.removeEventListener('resize', refreshRect);
    };
  }, []);

  const blinkNow = () => {
    blink.current = 1;
  };

  const setWatchMode = (m: Mode) => {
    setMode(m);
    modeRef.current = m;
  };

  const caption =
    mode === 'tracking'
      ? 'the watchman follows your cursor — it wanders when you rest'
      : mode === 'wander'
        ? 'the watchman sweeps on its own — take over any time'
        : 'gaze locked — release to resume tracking';

  return (
    <div className="relative mx-auto w-full max-w-[480px]">
      <div className="reticle relative aspect-square border border-zinc-800 bg-zinc-950/50">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair"
          aria-label="The eye of Argus Panoptes — an animated observatory instrument. Use the mode buttons below to control tracking."
          role="img"
          tabIndex={0}
          onClick={blinkNow}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              blinkNow();
            }
          }}
        />
        <span className="absolute left-3 top-3 font-mono text-[10px] tracking-[0.2em] text-zinc-600 uppercase">
          argus · 100 eyes
        </span>
        <span className="absolute right-3 top-3 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">
          <span
            className={cn('led', mode === 'hold' ? 'text-amber-400' : mode === 'wander' ? 'text-fuchsia-400' : 'text-emerald-400')}
            aria-hidden
          />
          {mode}
        </span>
        <span className="absolute bottom-3 right-3 font-mono text-[10px] tracking-[0.12em] text-zinc-500">
          <span ref={readoutRef}>θ 13.5° · φ 15.8° · pupil 1.25 · track</span>
        </span>
        <span className="absolute bottom-3 left-3 font-mono text-[10px] tracking-[0.15em] text-zinc-700 uppercase">
          click · blink
        </span>
      </div>

      {/* mode controls — the instrument is operable, not decorative */}
      <div className="mt-3 flex items-center justify-center gap-1.5" role="group" aria-label="Watchman mode">
        {(
          [
            ['tracking', 'Track'],
            ['wander', 'Wander'],
            ['hold', 'Hold'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setWatchMode(m)}
            aria-pressed={mode === m}
            className={cn(
              'border px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors',
              mode === m
                ? 'border-amber-500/45 bg-amber-500/10 text-amber-300'
                : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={blinkNow}
          className="border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-zinc-500 uppercase transition-colors hover:border-amber-500/40 hover:text-amber-300"
        >
          Blink
        </button>
      </div>

      <p className="mt-3 text-center font-mono text-[10.5px] leading-relaxed tracking-[0.08em] text-zinc-600 uppercase">
        {caption}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- hero */
export function Hero() {
  const ready = useIntroReady();
  const heroRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  /* gentle parallax — the instrument recedes as you descend into the page */
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const rawY = useTransform(scrollYProgress, [0, 1], [0, -56]);
  const parallaxY = useSpring(rawY, { stiffness: 90, damping: 26, mass: 0.5 });

  const line = (children: React.ReactNode, i: number) => (
    <span className="block overflow-hidden pb-[0.08em]">
      <motion.span
        className="block"
        initial={{ y: '112%' }}
        animate={ready ? { y: '0%' } : {}}
        transition={{ duration: 0.85, delay: 0.06 * i, ease: [0.21, 0.76, 0.24, 1] }}
      >
        {children}
      </motion.span>
    </span>
  );

  return (
    <div id="overview" ref={heroRef} className="relative overflow-hidden">
      {/* ember aurora — two drifting light fields behind the whole hero */}
      {!reduce && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="aurora-field">
            <div className="aurora-a" />
            <div className="aurora-b" />
          </div>
        </div>
      )}

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-32 md:px-6 md:pb-20 md:pt-40">
        <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_0.88fr]">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={ready ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.55 }}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="inline-flex items-center gap-1.5 border border-amber-500/35 bg-amber-500/10 px-3 py-1 font-mono text-[10px] tracking-[0.15em] text-amber-300 uppercase">
                session digest · research → critique → architecture
              </span>
              <span className="inline-flex items-center gap-1.5 border border-zinc-700 bg-zinc-900/70 px-3 py-1 font-mono text-[10px] tracking-[0.15em] text-zinc-500 uppercase">
                source · arXiv:2607.24625v2 + whitepaper
              </span>
            </motion.div>

            <h1 className="mt-7 font-display text-[2.7rem] leading-[1.02] tracking-tight text-zinc-100 md:text-6xl md:leading-[1.0]">
              {line(<>Survivable security</>, 0)}
              {line(<>for LLM agents.</>, 1)}
              {line(
                <span className="mt-3 block text-zinc-500 italic">The asymptote, not the wall.</span>,
                2,
              )}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={ready ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.34 }}
              className="mt-6 max-w-2xl text-sm leading-relaxed text-zinc-400 md:text-[15px]"
            >
              An interactive companion to our session and whitepaper: what{' '}
              <span className="text-zinc-200">OpenAPPA</span> — Archestra&apos;s deterministic guardrail — actually
              proves, where its guarantees structurally leak, and{' '}
              <span className="text-amber-300">PANOPTES</span>, the nine-organ architecture built around the gap.
              Every mechanism is explained by a live model you can run, and every number carries its provenance.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={ready ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.44 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Button
                asChild
                size="lg"
                className="btn-sheen group border border-amber-500/60 bg-amber-500/90 font-mono text-xs font-semibold tracking-[0.1em] text-zinc-950 uppercase shadow-none hover:bg-amber-400"
              >
                <a href={PAPER_URL} download="PANOPTES_Toward_Survivable_Security_for_LLM_Agents.pdf">
                  <FileDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                  Download whitepaper · PDF 22 pp
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-zinc-700 bg-zinc-900/60 font-mono text-xs tracking-[0.1em] text-zinc-300 uppercase shadow-none hover:border-amber-500/40 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <a href="#cni">
                  <ShieldAlert className="h-4 w-4" />
                  Run the CNI killer demo
                </a>
              </Button>
              <Button asChild size="lg" variant="ghost" className="font-mono text-xs tracking-[0.1em] text-zinc-500 uppercase hover:text-zinc-200">
                <a href="#appa">
                  <GitFork className="h-4 w-4" />
                  Start with the algebra
                </a>
              </Button>
            </motion.div>
          </div>

          <motion.div
            className="relative"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={ready ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.9, delay: 0.18, ease: [0.21, 0.76, 0.24, 1] }}
            style={reduce ? undefined : { y: parallaxY }}
          >
            {/* sounder rings — the instrument pings quietly at rest */}
            <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {!reduce &&
                [0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="ripple-ring absolute rounded-full border border-amber-500/25"
                    style={{ animationDelay: `${i * 1.15}s`, inset: `${-6 - i * 5}%` }}
                  />
                ))}
            </div>
            <ArgusWatchman />
          </motion.div>
        </div>

        {/* stat band — instrument readouts */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={ready ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-16 grid grid-cols-1 gap-px border border-zinc-800 bg-zinc-800/60 sm:grid-cols-2 lg:grid-cols-4"
        >
          {HERO_STATS.map((s) => (
            <div key={s.value} className="group relative bg-zinc-950/60 p-4 transition-colors hover:bg-zinc-900/50">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-3xl leading-none text-amber-400">{s.value}</p>
                <ProvBadge source={s.source} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">{s.label}</p>
            </div>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={ready ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.65 }}
          className="mt-6 max-w-3xl font-mono text-[11px] leading-relaxed text-zinc-600"
        >
          attribution discipline — results marked <span className="text-emerald-400">arXiv paper</span> come from
          the NeurIPS 2026 workshop paper&apos;s controlled arms; results marked{' '}
          <span className="text-amber-400">project page</span> (Claude-auto 10%, Codex 99.3%, Tau overhead) are
          openappa.com / README claims not in the paper; models marked{' '}
          <span className="text-fuchsia-400">pedagogical</span> are live simulations, not measurements.
        </motion.p>
      </div>
    </div>
  );
}
