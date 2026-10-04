'use client';

import { useState } from 'react';
import { Landmark } from 'lucide-react';
import { motion } from 'framer-motion';
import { Section } from './lab-ui';
import { WALLS } from '@/lib/panoptes-data';
import { cn } from '@/lib/utils';

const KIND_STYLE: Record<string, string> = {
  theorem: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
  principle: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
  empirical: 'border-orange-500/30 bg-orange-500/5 text-orange-300',
};

export function Walls() {
  const [hover, setHover] = useState<number | null>(null);

  return (
    <Section
      id="walls"
      eyebrow="chapter 4 · the five walls"
      title="What forty years of theory actually proves"
      lead="Foolproof agent security is not an engineering goal; it is a category error. Two theorems, two principles, and one empirical constant stand between ambition and airtight. Removing any one of them is a result worthy of a Turing Award — several people have received one for trying."
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        {WALLS.map((w, i) => (
          <motion.div
            key={w.n}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            tabIndex={0}
            onMouseEnter={() => setHover(w.n)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(w.n)}
            onBlur={() => setHover(null)}
            className={cn(
              'flex min-h-[190px] flex-col rounded-xl border p-4 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-amber-500/50',
              hover === w.n ? 'border-zinc-600 bg-zinc-900/70' : 'border-zinc-800 bg-zinc-900/40',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-zinc-700">{w.n}</span>
              <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px]', KIND_STYLE[w.kind])}>{w.kind}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-zinc-100">{w.name}</p>
            <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{w.year}</p>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">{w.body}</p>
          </motion.div>
        ))}
      </div>

      {/* aviation translation */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 md:p-5">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-amber-400" />
            <p className="font-mono text-xs font-semibold text-amber-300">THE AVIATION EXISTENCE PROOF</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Commercial flight is not crash-proof — it is a system in which crashes are{' '}
            <span className="text-zinc-200">rare, survivable, attributed, and engineered out of existence iteratively</span>.
            That outcome was built from redundancy, black boxes, an independent accident investigator, and an
            insurance market that prices risk — not from a taller fence.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              ['redundancy', 'n-version monitors (O7)'],
              ['black boxes', 'tamper-evident action logs (O7)'],
              ['attribution', 'synthesized canaries (O4)'],
              ['survivability', 'escrowed time (O6)'],
              ['risk pricing', 'gas-metered agency (O5)'],
              ['the asymptote', 'residual risk budget (Ch. 8)'],
            ].map(([a, b]) => (
              <div key={a} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                <p className="font-mono text-[10px] text-zinc-500">{a}</p>
                <p className="mt-0.5 text-xs text-zinc-300">{b}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 md:p-5">
          <p className="font-mono text-xs font-semibold text-emerald-300">THE HONEST READING OF &quot;ZERO ATTACKS&quot;</p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Zero observed attacks in 1,320 guarded episodes is a real and impressive result — and the paper itself
            appends the correct epistemic tag: <span className="text-zinc-200">&quot;finite zero-ASR observations do
            not prove attacks impossible.&quot;</span>
          </p>
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5">
            <p className="font-mono text-[11px] text-zinc-500">the claim that survives all five walls:</p>
            <p className="mt-2 font-mono text-sm leading-relaxed text-emerald-300">
              not zero leaks — a leak rate that is known · attributable · reversible · unprofitable · shrinking
              asymptotically
            </p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            <span className="text-zinc-100">Airtight means the asymptote, not the wall.</span> The rest of this
            dashboard is an architecture for exactly that property.
          </p>
        </div>
      </div>
    </Section>
  );
}
