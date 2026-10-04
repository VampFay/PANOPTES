'use client';

/**
 * BrandMark — the Argus instrument as an inline, living component.
 *
 * Two fidelities:
 *  - 'compact' (nav, ≤40px): bezel · patina ring · iris · pupil · glint
 *  - 'full'    (footer, boot lockups): + engraved scale · 100 eyes ·
 *    gimbal cage · iris fibers · aperture blade edges
 *
 * Ambient life: the gimbal cage counter-rotates imperceptibly and the
 * emblem breathes an ember glow. IDs are prefixed per-instance so the
 * mark can appear many times on one page without gradient collisions.
 */

import { useId } from 'react';
import { cn } from '@/lib/utils';

export function BrandMark({
  className,
  detail = 'compact',
  animated = true,
}: {
  className?: string;
  detail?: 'compact' | 'full';
  animated?: boolean;
}) {
  const uid = useId().replace(/[:]/g, '');
  const g = (n: string) => `${uid}-${n}`;
  const full = detail === 'full';

  return (
    <svg
      viewBox="0 0 512 512"
      className={cn(animated && 'brand-mark', className)}
      fill="none"
      role="img"
      aria-label="The PANOPTES emblem — the Argus instrument"
    >
      <defs>
        <radialGradient id={g('bg')} cx="50%" cy="38%" r="72%">
          <stop offset="0%" stopColor="#241d13" />
          <stop offset="55%" stopColor="#14100a" />
          <stop offset="100%" stopColor="#0d0b07" />
        </radialGradient>
        <linearGradient id={g('bronze')} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#f2c88e" />
          <stop offset="28%" stopColor="#d19a5b" />
          <stop offset="52%" stopColor="#8a5a30" />
          <stop offset="74%" stopColor="#b07c46" />
          <stop offset="100%" stopColor="#5c3a1e" />
        </linearGradient>
        <linearGradient id={g('patina')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9ec9a8" />
          <stop offset="100%" stopColor="#3c5c4a" />
        </linearGradient>
        <radialGradient id={g('iris')} cx="50%" cy="46%" r="58%">
          <stop offset="0%" stopColor="#ffdf9e" />
          <stop offset="30%" stopColor="#f0a95c" />
          <stop offset="58%" stopColor="#cd6d3a" />
          <stop offset="84%" stopColor="#4a2410" />
          <stop offset="100%" stopColor="#2a1608" />
        </radialGradient>
        <radialGradient id={g('pupil')} cx="40%" cy="36%" r="75%">
          <stop offset="0%" stopColor="#2f2517" />
          <stop offset="100%" stopColor="#0d0b07" />
        </radialGradient>
        <linearGradient id={g('sheen')} x1="0" y1="0" x2="0.6" y2="0.9">
          <stop offset="0%" stopColor="#fff4dd" stopOpacity="0.16" />
          <stop offset="45%" stopColor="#fff4dd" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#fff4dd" stopOpacity="0" />
        </linearGradient>
        <clipPath id={g('eye')}>
          <circle cx="256" cy="256" r="132" />
        </clipPath>
      </defs>

      {/* ember halo */}
      <circle cx="256" cy="262" r="238" fill="#e28e52" opacity="0.1" />

      {/* cardinal brackets */}
      <g stroke="#e8c18c" strokeWidth="14" strokeOpacity="0.85" strokeLinecap="square">
        <path d="M256 16v44M256 452v44M16 256h44M452 256h44" />
      </g>

      {/* obsidian disc + machined bezel */}
      <circle cx="256" cy="256" r="250" fill={`url(#${g('bg')})`} />
      <circle cx="256" cy="256" r="250" stroke="#e8c18c" strokeOpacity="0.28" strokeWidth="1.4" />
      <circle cx="256" cy="256" r="245" stroke={`url(#${g('bronze')})`} strokeWidth="9" />
      <circle cx="256" cy="256" r="238.5" stroke="#0d0b07" strokeOpacity="0.55" strokeWidth="2.4" />

      {full && (
        <>
          {/* engraved instrument scale */}
          <g stroke="#e8c18c" strokeOpacity="0.75" strokeWidth="2.6">
            <path d="M256 18v13M340.8 31.6l-3.4 12.6M406.6 64.3l-7 10.9M458.9 117.2l-10.9 7M481.6 186.2l-12.6 3.4M481.6 325.8l-12.6-3.4M458.9 394.8l-10.9-7M406.6 447.7l-7-10.9M340.8 480.4l-3.4-12.6M256 494v-13M171.2 480.4l3.4-12.6M105.4 447.7l7-10.9M53.1 394.8l10.9-7M30.4 325.8l12.6 3.4M30.4 186.2l12.6-3.4M53.1 117.2l10.9 7M105.4 64.3l7 10.9M171.2 31.6l3.4 12.6" />
          </g>
          <g stroke="#e8c18c" strokeOpacity="0.42" strokeWidth="1.3">
            <path d="M288.4 21.1l-2.3 8.4M319.9 28.9l-4.5 12M372.3 48.5l-6.8 10.5M421.4 82.4l-9.5 6.2M455.3 131.5l-10.5 6.8M474.9 183.9l-12 4.5M474.9 328.1l-12-4.5M455.3 380.5l-10.5-6.8M421.4 429.6l-9.5-6.2M372.3 463.5l-6.8-10.5M319.9 483.1l-4.5-12M288.4 490.9l-2.3-8.4M223.6 490.9l2.3-8.4M192.1 483.1l4.5-12M139.7 463.5l6.8-10.5M90.6 429.6l9.5-6.2M56.7 380.5l10.5-6.8M37.1 328.1l12 4.5M37.1 183.9l12-4.5M56.7 131.5l10.5 6.8M90.6 82.4l9.5 6.2M139.7 48.5l6.8 10.5M192.1 28.9l4.5 12M223.6 21.1l2.3 8.4" />
          </g>

          {/* the 100 eyes of Argus — compact constellation */}
          <g stroke={`url(#${g('patina')})`} strokeWidth="3" strokeOpacity="0.6">
            <circle cx="256" cy="256" r="204" fill="none" />
          </g>
          <g fill="#e8c18c" fillOpacity="0.4">
            {Array.from({ length: 100 }).map((_, i) => {
              if (i % 13 === 0) return null;
              const a = (i / 100) * Math.PI * 2;
              return <circle key={i} cx={256 + Math.cos(a) * 182} cy={256 + Math.sin(a) * 182} r="1.7" />;
            })}
          </g>
          <g fill="#e28e52" fillOpacity="0.9">
            {Array.from({ length: 100 }).map((_, i) => {
              if (i % 13 !== 0) return null;
              const a = (i / 100) * Math.PI * 2;
              return <circle key={i} cx={256 + Math.cos(a) * 182} cy={256 + Math.sin(a) * 182} r="2.6" />;
            })}
          </g>
        </>
      )}

      {!full && <circle cx="256" cy="256" r="204" stroke={`url(#${g('patina')})`} strokeWidth="4" strokeOpacity="0.6" />}

      {/* astrolabe gimbal cage — counter-rotates imperceptibly */}
      <g className={animated ? 'brand-gimbal' : undefined}>
        <g stroke={`url(#${g('bronze')})`} strokeWidth="3.2" strokeOpacity="0.5">
          <ellipse cx="256" cy="256" rx="196" ry="92" transform="rotate(30 256 256)" />
          <ellipse cx="256" cy="256" rx="196" ry="92" transform="rotate(-30 256 256)" />
        </g>
        <g fill={`url(#${g('bronze')})`} stroke="#0d0b07" strokeOpacity="0.4" strokeWidth="1">
          <circle cx="256" cy="75.5" r="6" />
          <circle cx="256" cy="436.5" r="6" />
          <circle cx="75.5" cy="256" r="6" />
          <circle cx="436.5" cy="256" r="6" />
        </g>
      </g>

      {/* inner bezel */}
      <circle cx="256" cy="256" r="150" stroke={`url(#${g('bronze')})`} strokeWidth="6" />
      <circle cx="256" cy="256" r="144.5" stroke="#0d0b07" strokeOpacity="0.5" strokeWidth="2" />

      {/* radiant iris */}
      <g clipPath={`url(#${g('eye')})`}>
        <circle cx="256" cy="256" r="132" fill={`url(#${g('iris')})`} />
        {full && (
          <>
            <g stroke="#5c3014" strokeOpacity="0.65" strokeWidth="2">
              {Array.from({ length: 48 }).map((_, i) => {
                const a = (i / 48) * Math.PI * 2;
                return (
                  <line
                    key={i}
                    x1={256 + Math.cos(a) * 40}
                    y1={256 + Math.sin(a) * 40}
                    x2={256 + Math.cos(a) * 126}
                    y2={256 + Math.sin(a) * 126}
                  />
                );
              })}
            </g>
            <g stroke="#ede6d6" strokeOpacity="0.14">
              <circle cx="256" cy="256" r="82" />
              <circle cx="256" cy="256" r="103" />
              <circle cx="256" cy="256" r="124" />
            </g>
            <path d="M256 174a82 82 0 0 1 78.9 60" stroke="#85be95" strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round" />
          </>
        )}
        <circle cx="256" cy="256" r="44" fill={`url(#${g('pupil')})`} stroke="#e28e52" strokeWidth="2.6" />
        <circle cx="240" cy="240" r="8.5" fill="#fff4dd" fillOpacity="0.85" />
        <circle cx="269" cy="270" r="3.6" fill="#ffdf9e" fillOpacity="0.4" />
      </g>

      {/* aperture blade edges */}
      <g stroke="#e8c18c" strokeOpacity="0.45" strokeWidth="2">
        <path d="M256 124L256 388M124 256L388 256M162.7 162.7L349.3 349.3M349.3 162.7L162.7 349.3" />
      </g>

      {/* crown sheen */}
      <ellipse cx="256" cy="256" rx="250" ry="250" fill={`url(#${g('sheen')})`} opacity="0.55" />
    </svg>
  );
}

/* ------------------------------------------------------------ wordmark lockup */
export function BrandLockup({
  className,
  markClassName,
  subline = true,
  detail = 'compact',
}: {
  className?: string;
  markClassName?: string;
  subline?: boolean;
  detail?: 'compact' | 'full';
}) {
  return (
    <span className={cn('group inline-flex items-center gap-3', className)}>
      <BrandMark detail={detail} className={cn('shrink-0', markClassName)} />
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg tracking-[0.14em] text-zinc-100">PANOPTES</span>
        {subline && (
          <span className="mt-1 font-mono text-[9px] tracking-[0.24em] text-zinc-500 uppercase">
            observatory of argus
          </span>
        )}
      </span>
    </span>
  );
}
