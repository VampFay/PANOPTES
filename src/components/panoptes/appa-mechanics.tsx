'use client';

import { useState } from 'react';
import { ShieldCheck, Cpu, Wrench, Quote } from 'lucide-react';
import { APPA_DEFS } from '@/lib/panoptes-data';
import { Section } from './lab-ui';
import { cn } from '@/lib/utils';

export function AppaMechanics() {
  const [active, setActive] = useState(0);

  return (
    <Section
      id="appa"
      eyebrow="chapter 2 · the algebra"
      title="APPA: what it is and what it actually proves"
      lead="OpenAPPA sits between an agent and its tools and answers one question before every action: is this data allowed to go to this destination? The threat model is unusually crisp — the LLM is strictly policy-untrusted (it may be adversarially injected, hallucinating, or miscalibrated) while the TCB comprises the monitor, profiles, tool contracts, authority resolvers, and data transformations. The model influences which recovery options get tried, but cannot manufacture authorization."
    >
      {/* threat model strip */}
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-rose-400" />
            <p className="font-mono text-xs font-semibold text-rose-300">policy-untrusted</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            The LLM may propose arbitrary tool calls; it cannot forge a ruling, expand a mandate, or confer lingering
            authority (Theorem 6 + Corollary 7).
          </p>
        </div>
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400" />
            <p className="font-mono text-xs font-semibold text-emerald-300">deterministic core</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            Label algebra, prospective evaluation, hard gates — sub-millisecond on every call. You cannot
            prompt-inject an algebra.
          </p>
        </div>
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-amber-400" />
            <p className="font-mono text-xs font-semibold text-amber-300">recovery layer</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            Sanitizers, scoped approvals, subagent forks — the genuinely new contribution that keeps a blocked agent
            working.
          </p>
        </div>
      </div>

      {/* definition tabs */}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="flex gap-2 lg:flex-col" role="tablist" aria-label="APPA definitions">
          {APPA_DEFS.map((d, i) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors',
                active === i
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                  : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700',
              )}
            >
              {d.title}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-sm font-semibold text-zinc-100">{APPA_DEFS[active].title}</p>
          <code className="mt-3 block rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 font-mono text-[13px] text-amber-300">
            {APPA_DEFS[active].formula}
          </code>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">{APPA_DEFS[active].body}</p>
          {active === 2 && (
            <div className="mt-4 flex gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <Quote className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
              <p className="text-xs leading-relaxed text-zinc-500">
                The ablation is the empirical argument: removing fork advertisement drops Bench-Corp completion from
                88.0% to 56.5%; removing guided recovery drops it to 35.0% — with zero attacks succeeding in every
                configuration. Recoverable IFC is what makes deterministic enforcement compatible with an agent that
                still finishes its work.
              </p>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
