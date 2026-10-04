'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Hand, Braces, Scale, Dna, Coins, Timer, ScrollText, Gavel, Atom, X, Eye } from 'lucide-react';
import { Section } from './lab-ui';
import { ORGANS, BUILD_LEVELS } from '@/lib/panoptes-data';
import { cn } from '@/lib/utils';

const ORGAN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  o1: Hand,
  o2: Braces,
  o3: Scale,
  o4: Dna,
  o5: Coins,
  o6: Timer,
  o7: ScrollText,
  o8: Gavel,
  o9: Atom,
};

const SHORT: Record<string, string> = {
  o1: 'substrate',
  o2: 'transclusion',
  o3: 'CNI',
  o4: 'immune',
  o5: 'economics',
  o6: 'escrow',
  o7: 'n-version law',
  o8: 'constitution',
  o9: 'convergence',
};

/* ring layout: 3 rings x 3 organs, static angles distribute them around the sky */
const RINGS = [
  { inset: '31%', radius: '19cqw', counterClass: 'orbit-counter', angles: [90, 210, 330] },
  { inset: '18%', radius: '32cqw', counterClass: 'orbit-counter-rev', angles: [30, 150, 270] },
  { inset: '5%', radius: '45cqw', counterClass: 'orbit-counter', angles: [150, 270, 30] },
];

const RING_ORGANS: { ring: number; organ: number }[] = [
  { ring: 0, organ: 0 },
  { ring: 0, organ: 1 },
  { ring: 0, organ: 2 },
  { ring: 1, organ: 3 },
  { ring: 1, organ: 4 },
  { ring: 1, organ: 5 },
  { ring: 2, organ: 6 },
  { ring: 2, organ: 7 },
  { ring: 2, organ: 8 },
];

function OrganNode({
  organId,
  angle,
  radius,
  counterClass,
  paused,
  selected,
  dimmed,
  onSelect,
}: {
  organId: string;
  angle: number;
  radius: string;
  counterClass: string;
  paused: boolean;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const organ = ORGANS.find((o) => o.id === organId)!;
  const Icon = ORGAN_ICONS[organId] ?? Atom;
  return (
    <div
      className="absolute top-1/2 left-1/2"
      style={{ transform: `rotate(${angle}deg) translateY(-${radius})` }}
    >
      <div
        className={counterClass}
        style={{ animationPlayState: paused ? 'paused' : 'running' }}
      >
        <div style={{ transform: `rotate(${-angle}deg)` }}>
          <button
            onClick={onSelect}
            aria-expanded={selected}
            title={`${organ.code} — ${organ.name}`}
            className={cn(
              'group flex w-16 flex-col items-center gap-1 transition-opacity duration-300 md:w-20',
              dimmed && !selected ? 'opacity-35' : 'opacity-100',
            )}
          >
            <span
              className={cn(
                'reticle reticle-bone flex h-9 w-9 items-center justify-center border transition-colors md:h-10 md:w-10',
                selected
                  ? 'border-amber-500/70 bg-amber-500/20 text-amber-300'
                  : 'border-zinc-700 bg-zinc-950/85 text-zinc-400 group-hover:border-zinc-500 group-hover:text-zinc-200',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-center leading-tight">
              <span className={cn('block font-mono text-[9px] tracking-[0.12em]', selected ? 'text-amber-400' : 'text-zinc-500')}>
                {organ.code}
              </span>
              <span className={cn('block font-mono text-[9px] md:text-[10px]', selected ? 'text-amber-200' : 'text-zinc-500')}>
                {SHORT[organId]}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Organs() {
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'orrery' | 'plate'>('orrery');
  const organ = ORGANS.find((o) => o.id === selected);
  const paused = selected !== null;

  return (
    <Section
      id="panoptes"
      index="07"
      eyebrow="chapter 5 · panoptes"
      title="Nine organs for survivable agent security"
      lead="PANOPTES is not a better algebra; it is the city built around the cathedral. Its fast path is an APPA-class label engine; its contribution is everything the algebra cannot, even in principle, see — the causal behavior of the decision function, the economics of the adversary, the reversibility of the world, and the distributed trust that keeps any single monitor from becoming the crown jewel."
    >
      {/* view switch */}
      <div className="mb-5 flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">view</span>
        {(
          [
            ['orrery', 'orrery · live'],
            ['plate', 'plate · fig. 1'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={cn(
              'border px-2.5 py-1 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors',
              view === key
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
            )}
            aria-pressed={view === key}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'plate' ? (
        <div className="reticle overflow-hidden border border-zinc-800 bg-zinc-900/40 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] tracking-[0.15em] text-zinc-300 uppercase">Figure 1 · PANOPTES overview</p>
            <p className="font-mono text-[10px] text-zinc-500">deterministic fast path + causal slow path, wrapped by nine survivability organs</p>
          </div>
          <div className="relative mt-4 overflow-hidden border border-zinc-800 bg-white">
            <Image
              src="/paper/panoptes_diagram.png"
              alt="PANOPTES architecture diagram: APPA-class label engine fast path plus CNI slow path, wrapped by nine organs — capability substrate, inert transclusion, immune layer, gas metering, escrowed time, n-version law, external constitution, substrate convergence"
              width={1860}
              height={1552}
              className="h-auto w-full"
              priority
            />
          </div>
        </div>
      ) : (
        <div className="reticle border border-zinc-800 bg-zinc-950/40 p-2 md:p-4">
          {/* orrery stage */}
          <div className="relative mx-auto aspect-square w-full max-w-[540px] [container-type:size]">
            {/* rings */}
            {RINGS.map((ring, i) => (
              <div
                key={i}
                className={cn(
                  'absolute rounded-full border',
                  i === 0 ? 'animate-orbit-slow border-zinc-700/80' : i === 1 ? 'animate-orbit-rev border-zinc-800' : 'animate-orbit-slow border-zinc-800/70',
                )}
                style={{ inset: ring.inset, animationPlayState: paused ? 'paused' : 'running' }}
                aria-hidden
              />
            ))}
            {/* faint crosshair */}
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-zinc-800/40" aria-hidden />
            <div className="absolute top-1/2 right-0 left-0 h-px bg-zinc-800/40" aria-hidden />

            {/* organ nodes */}
            {RING_ORGANS.map(({ ring, organ: oi }) => {
              const r = RINGS[ring];
              const id = ORGANS[oi].id;
              return (
                <OrganNode
                  key={id}
                  organId={id}
                  angle={r.angles[oi % 3]}
                  radius={r.radius}
                  counterClass={r.counterClass}
                  paused={paused}
                  selected={selected === id}
                  dimmed={selected !== null}
                  onSelect={() => setSelected(selected === id ? null : id)}
                />
              );
            })}

            {/* core */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="reticle flex h-16 w-16 flex-col items-center justify-center gap-1 border border-amber-500/50 bg-zinc-950 md:h-20 md:w-20">
                <span className="flex h-7 w-7 items-center justify-center text-amber-400">
                  <Eye className="h-4 w-4" />
                </span>
                <span className="font-mono text-[8px] tracking-[0.18em] text-zinc-500 uppercase">agent core</span>
              </div>
              <p className="mt-2 w-32 text-center font-mono text-[9px] leading-snug text-zinc-500 md:w-36">
                O0 · APPA label engine · fast path
              </p>
            </div>

            <span className="absolute top-1 left-2 font-mono text-[9px] tracking-[0.2em] text-zinc-500 uppercase">
              orrery · click an organ
            </span>
          </div>

          {/* selected organ detail */}
          {organ ? (
            <div className="mt-2 border border-amber-500/30 border-l-2 border-l-amber-500 bg-zinc-900/60 p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] tracking-[0.15em] text-amber-400 uppercase">
                    {organ.code} · build {organ.build} — {BUILD_LEVELS[organ.build]}
                  </p>
                  <h4 className="mt-1 font-display text-xl text-zinc-100">{organ.name}</h4>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="border border-zinc-700 p-1 text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
                  aria-label="Close organ detail"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{organ.body}</p>
            </div>
          ) : (
            <div className="mt-2 hidden items-center justify-between gap-3 border border-zinc-800 bg-zinc-900/30 px-4 py-3 md:flex">
              <p className="font-mono text-[11px] text-zinc-500">
                <span className="text-zinc-400">nine organs</span> · three orbital shells · deterministic core at center
              </p>
              <p className="font-mono text-[11px] text-zinc-500">select any organ for its dossier</p>
            </div>
          )}
        </div>
      )}

      <p className="mt-5 text-xs leading-relaxed text-zinc-500">
        Complexity grades — L1: ships in weeks with existing libraries · L2: quarters · L3: a small team-year · L4:
        research program. The crown jewel, O3 counterfactual noninterference adjudication, gets its own lab below.
      </p>
    </Section>
  );
}
