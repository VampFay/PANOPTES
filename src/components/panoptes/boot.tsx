'use client';

/**
 * PanoptesBoot — the loading sequence. Always plays.
 *
 * A camera-iris aperture dilates open over the Argus instrument while the
 * observatory calibrates: three short stages, a light-sweep rail, rising
 * embers, a HUD frame, then the eye dilates INTO the page (scale + blur +
 * fade) and hands off to the hero entrance. Reduced-motion skips straight
 * to the page. Body scroll is locked only while the overlay exists and is
 * released the moment the sequence completes.
 *
 * Hydration-safe: SSR renders nothing; the overlay only exists after mount.
 * Total budget: ~2.3s, every load — the opening beat of the instrument.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const STAGES = ['calibrating optics', 'aligning gimbals', 'opening the eye'] as const;

const FULL_MS = 1500; // aperture opens over this
const HOLD_MS = 320; // fully open beat
const EXIT_MS = 540; // dilation into the page

/* deterministic rising embers — no Math.random, no hydration risk */
const MOTES = [
  { left: '18%', dur: 7.5, delay: 0.0, op: 0.5, sz: 3 },
  { left: '31%', dur: 9.5, delay: 2.8, op: 0.35, sz: 2 },
  { left: '44%', dur: 8.0, delay: 1.4, op: 0.55, sz: 3 },
  { left: '57%', dur: 10.0, delay: 4.6, op: 0.3, sz: 2 },
  { left: '68%', dur: 7.8, delay: 0.9, op: 0.5, sz: 3 },
  { left: '79%', dur: 9.2, delay: 3.7, op: 0.4, sz: 2 },
  { left: '12%', dur: 11.0, delay: 5.5, op: 0.3, sz: 2 },
] as const;

/* polygon points for the N-blade iris */
function irisPoly(r: number, n: number, rot: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2 + rot;
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export function PanoptesBoot() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<'idle' | 'run' | 'gone'>('idle');
  const [p, setP] = useState(0); // 0..1 aperture open
  const raf = useRef(0);
  const locked = useRef(false);

  useEffect(() => {
    let alive = true;
    const timers: number[] = [];

    const unlock = () => {
      if (locked.current) {
        document.body.style.overflow = '';
        locked.current = false;
      }
    };

    const finish = () => {
      if (!alive) return;
      unlock();
      setPhase('gone');
    };

    /* decide + drive the sequence from an async tick so no setState fires
       synchronously inside the effect body */
    const begin = window.setTimeout(() => {
      if (!alive) return;

      if (reduce) {
        window.dispatchEvent(new CustomEvent('panoptes:ready', { detail: { soft: true } }));
        setPhase('gone');
        return;
      }

      setPhase('run');
      document.body.style.overflow = 'hidden';
      locked.current = true;

      const t0 = performance.now();
      const loop = (t: number) => {
        if (!alive) return;
        const k = Math.min(1, (t - t0) / FULL_MS);
        // ease: fast open, gentle settle
        setP(k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        if (k < 1) {
          raf.current = requestAnimationFrame(loop);
        } else {
          window.dispatchEvent(new CustomEvent('panoptes:ready', { detail: { soft: false } }));
          timers.push(window.setTimeout(finish, HOLD_MS + EXIT_MS));
        }
      };
      raf.current = requestAnimationFrame(loop);
    }, 0);
    timers.push(begin);

    return () => {
      alive = false;
      cancelAnimationFrame(raf.current);
      timers.forEach(clearTimeout);
      unlock();
    };
  }, [reduce]);

  if (phase === 'idle' || phase === 'gone') return null;

  /* ---------------- inline Argus instrument with animated aperture ---------------- */
  const open = 0.06 + 0.94 * p;
  const R = 132;
  const r = R * (0.1 + 0.9 * open);
  const rot = (1 - p) * 0.5; // blades untwist as they open

  const Emblem = (
    <svg viewBox="0 0 512 512" className="h-40 w-40 md:h-48 md:w-48" fill="none" aria-hidden>
      <defs>
        <radialGradient id="bt-bg" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="#1a1610" />
          <stop offset="100%" stopColor="#0d0b07" />
        </radialGradient>
        <linearGradient id="bt-brz" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8b57e" />
          <stop offset="55%" stopColor="#8a5a30" />
          <stop offset="100%" stopColor="#93683a" />
        </linearGradient>
        <linearGradient id="bt-pat" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9ec9a8" />
          <stop offset="100%" stopColor="#3c5c4a" />
        </linearGradient>
        <radialGradient id="bt-iris" cx="50%" cy="46%" r="60%">
          <stop offset="0%" stopColor="#ffdf9e" />
          <stop offset="34%" stopColor="#f0a95c" />
          <stop offset="62%" stopColor="#cd6d3a" />
          <stop offset="100%" stopColor="#4a2410" />
        </radialGradient>
        <radialGradient id="bt-pup" cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#3a2f1e" />
          <stop offset="100%" stopColor="#0d0b07" />
        </radialGradient>
        <clipPath id="bt-aperture">
          <polygon points={irisPoly(r, 8, rot)} />
        </clipPath>
      </defs>

      <circle cx="256" cy="256" r="250" fill="url(#bt-bg)" />
      {/* ambient bloom scales with open */}
      <circle cx="256" cy="256" r={140 + 60 * p} fill="#e28e52" opacity={0.1 + 0.16 * p} style={{ filter: 'blur(26px)' }} />

      {/* machined bezel + hairline */}
      <circle cx="256" cy="256" r="246" stroke="url(#bt-brz)" strokeWidth="9" />
      <circle cx="256" cy="256" r="250" stroke="#e8c18c" strokeOpacity="0.25" strokeWidth="1" />

      {/* engraved instrument scale */}
      <g stroke="#e8c18c" strokeOpacity="0.7">
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2 + p * 0.22;
          const long = i % 5 === 0;
          return (
            <line
              key={i}
              x1={256 + Math.cos(a) * 238}
              y1={256 + Math.sin(a) * 238}
              x2={256 + Math.cos(a) * (long ? 225 : 232)}
              y2={256 + Math.sin(a) * (long ? 225 : 232)}
              strokeWidth={long ? 2.6 : 1.2}
            />
          );
        })}
      </g>

      {/* verdigris patina ring */}
      <circle cx="256" cy="256" r="204" stroke="url(#bt-pat)" strokeWidth="4" opacity="0.55" />
      {/* gimbal cage */}
      <ellipse cx="256" cy="256" rx="196" ry="90" stroke="url(#bt-brz)" strokeWidth="3" opacity="0.5" transform={`rotate(30 256 256)`} />
      <ellipse cx="256" cy="256" rx="196" ry="90" stroke="url(#bt-brz)" strokeWidth="3" opacity="0.5" transform={`rotate(-30 256 256)`} />

      {/* 100 eyes of Argus */}
      <g>
        {Array.from({ length: 100 }).map((_, i) => {
          const a = (i / 100) * Math.PI * 2 + p * 0.3;
          const awake = i % 13 === 0;
          const blinky = awake ? 0.35 + 0.65 * Math.abs(Math.sin(p * Math.PI * 3 + i)) : 0.75;
          return (
            <circle
              key={i}
              cx={256 + Math.cos(a) * 182}
              cy={256 + Math.sin(a) * 182}
              r={awake ? 2.4 : 1.6}
              fill={awake ? '#e28e52' : '#e8c18c'}
              opacity={awake ? 0.85 * blinky : 0.4 * blinky}
            />
          );
        })}
      </g>

      {/* inner bezel */}
      <circle cx="256" cy="256" r="150" stroke="url(#bt-brz)" strokeWidth="6" />

      {/* the iris, revealed by the aperture polygon */}
      <g clipPath="url(#bt-aperture)">
        <circle cx="256" cy="256" r={R} fill="url(#bt-iris)" />
        <g stroke="#5c3014" strokeOpacity="0.7">
          {Array.from({ length: 48 }).map((_, i) => {
            const a = (i / 48) * Math.PI * 2 + rot * 2;
            return (
              <line
                key={i}
                x1={256 + Math.cos(a) * 40}
                y1={256 + Math.sin(a) * 40}
                x2={256 + Math.cos(a) * 126}
                y2={256 + Math.sin(a) * 126}
                strokeWidth="2"
              />
            );
          })}
        </g>
        {[0.62, 0.78, 0.94].map((f) => (
          <circle key={f} cx="256" cy="256" r={R * f} stroke="#ede6d6" strokeOpacity="0.12" />
        ))}
        <path
          d={`M ${256 + Math.cos(rot * 2) * R * 0.7} ${256 + Math.sin(rot * 2) * R * 0.7} A ${R * 0.7} ${R * 0.7} 0 0 1 ${256 + Math.cos(rot * 2 + 1.15) * R * 0.7} ${256 + Math.sin(rot * 2 + 1.15) * R * 0.7}`}
          stroke="#85be95"
          strokeOpacity="0.5"
          strokeWidth="2"
        />
        <circle cx="256" cy="256" r="44" fill="url(#bt-pup)" stroke="#e28e52" strokeWidth="2.5" />
        <circle cx="243" cy="242" r="8" fill="#fff4dd" opacity={0.75 + 0.25 * p} />
      </g>

      {/* aperture blade edges */}
      <g stroke="#e8c18c" strokeOpacity={0.5 + 0.3 * p} strokeWidth="2">
        <polygon points={irisPoly(r, 8, rot)} />
      </g>

      {/* cardinal brackets */}
      <g stroke="#e8c18c" strokeWidth="3" strokeOpacity="0.9">
        <path d="M256 34v18M256 460v18M34 256h18M460 256h18" />
      </g>
    </svg>
  );

  return (
    <motion.div
      key="panoptes-boot"
      role="status"
      aria-label="PANOPTES observatory calibrating"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#0d0b07]"
      initial={{ opacity: 1 }}
      animate={p >= 1 ? { opacity: 0, scale: 1.05, filter: 'blur(8px)' } : { opacity: 1, scale: 1 }}
      transition={{ duration: EXIT_MS / 1000, ease: [0.32, 0.6, 0.35, 1] }}
      style={{ pointerEvents: 'none' }}
    >
      {/* ambient vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 42%, rgba(226,142,82,0.07), transparent 65%), radial-gradient(ellipse 120% 90% at 50% 120%, rgba(13,11,7,0.95), transparent 60%)',
        }}
      />

      {/* rising embers */}
      {MOTES.map((m, i) => (
        <span
          key={i}
          aria-hidden
          className="boot-mote"
          style={
            {
              left: m.left,
              width: m.sz,
              height: m.sz,
              '--mo': m.op,
              animationDuration: `${m.dur}s`,
              animationDelay: `${m.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}

      {/* HUD corner brackets */}
      <div aria-hidden className="pointer-events-none absolute inset-4 md:inset-6">
        {[
          'left-0 top-0 border-l border-t',
          'right-0 top-0 border-r border-t',
          'bottom-0 left-0 border-b border-l',
          'bottom-0 right-0 border-b border-r',
        ].map((pos) => (
          <span key={pos} className={`absolute h-7 w-7 border-amber-500/40 ${pos}`} />
        ))}
        <span className="absolute left-1/2 top-1/2 h-px w-16 -translate-x-1/2 -translate-y-1/2 bg-amber-500/10" />
        <span className="absolute left-1/2 top-1/2 h-16 w-px -translate-x-1/2 -translate-y-1/2 bg-amber-500/10" />
      </div>

      {Emblem}

      {/* wordmark — letterspaced, settles as the eye opens */}
      <motion.p
        initial={{ opacity: 0, y: 8, letterSpacing: '0.42em' }}
        animate={{ opacity: Math.min(1, p * 1.6), y: 0, letterSpacing: `${0.08 + 0.34 * (1 - p)}em` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="mt-7 font-display text-2xl text-zinc-100 md:text-3xl"
      >
        PANOPTES
      </motion.p>
      <p className="mt-1.5 font-mono text-[10px] tracking-[0.4em] text-amber-500/80 uppercase">
        Observatory of Argus
      </p>
      <p className="mt-1 font-mono text-[9px] tracking-[0.28em] text-zinc-600 uppercase">
        instrument v1.3.0 · 192 tests green
      </p>

      {/* light-sweep progress rail */}
      <div className="mt-9 w-[min(80vw,300px)]">
        <div className="relative h-px w-full overflow-visible bg-zinc-800/80">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300"
            style={{ width: `${(p * 100).toFixed(1)}%`, transition: 'width 90ms linear' }}
          />
          <div
            className="absolute top-1/2 h-[3px] w-10 -translate-y-1/2"
            style={{
              left: `calc(${(p * 100).toFixed(1)}% - 40px)`,
              background: 'linear-gradient(to right, transparent, rgba(255,223,158,0.5), transparent)',
            }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-[10px] tracking-[0.22em] text-zinc-500 uppercase">
          <span>{STAGES[Math.min(STAGES.length - 1, Math.floor(p * STAGES.length))]}</span>
          <span className="tabular-nums text-zinc-300">{String(Math.round(p * 100)).padStart(3, '0')}%</span>
        </div>
      </div>
    </motion.div>
  );
}
