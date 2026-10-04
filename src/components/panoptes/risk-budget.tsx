'use client';

import { useState } from 'react';
import { Sigma } from 'lucide-react';
import { Section, SliderRow } from './lab-ui';
import { cn } from '@/lib/utils';

const TERMS = [
  {
    key: 'C',
    name: 'covert-channel capacity',
    baseline: -2,
    panoptes: -4,
    organ: 'O2 ingress caps bound it · O3 meters traffic against the bound',
    note: 'bits per boundary decision the adversary can still encode',
  },
  {
    key: 'E',
    name: 'label error rate',
    baseline: -2,
    panoptes: -3,
    organ: 'provenance grounding reduces · sanitizer certification bounds · O4 measures',
    note: 'the semantic gap made finite and monitored',
  },
  {
    key: 'T',
    name: 'TCB compromise probability',
    baseline: -3,
    panoptes: -4,
    organ: 'O7 fractures it across hostile n-version monitors · PCA logs audit it',
    note: 'trust relocates; diversity fractures it',
  },
  {
    key: 'H',
    name: 'human error rate',
    baseline: -2,
    panoptes: -3,
    organ: 'O5 prices and bonds it · O8 sunsets every grant — fatigue becomes hygiene',
    note: 'the last authority is a person; the person approves phishing at measurable rates',
  },
] as const;

export function RiskBudget() {
  const [vals, setVals] = useState<Record<string, number>>(Object.fromEntries(TERMS.map((t) => [t.key, t.panoptes])));

  const baselineExp = TERMS.reduce((s, t) => s + t.baseline, 0);
  const panoptesExp = TERMS.reduce((s, t) => s + vals[t.key], 0);
  const improvement = baselineExp - panoptesExp;

  const barFrac = (exp: number) => Math.max(((exp + 20) / 20) * 100, 4);

  return (
    <Section
      id="risk"
      eyebrow="chapter 8 · the closing account"
      title="The residual risk budget: R = C · E · T · H"
      lead="Every system discussed this session — APPA, Fides, auto-modes, PANOPTES at full build-out — leaves a residual. The engineering sin is not the residual; it is leaving it unaccounted. Multiplication is the honest operator: no term is zero, every term has an owner and a metric, and the system's public claim is the product and its trajectory — not a boast of absence."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* sliders */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 md:p-5">
          <p className="font-mono text-xs font-semibold text-zinc-300">tune the PANOPTES terms (log₁₀ exponents)</p>
          <div className="mt-3 divide-y divide-zinc-800/70">
            {TERMS.map((t) => (
              <div key={t.key} className="py-3">
                <SliderRow
                  label={`${t.key} — ${t.name}`}
                  value={-vals[t.key]}
                  display={`10^${vals[t.key]}`}
                  min={1}
                  max={6}
                  step={0.5}
                  onChange={(v) => setVals((s) => ({ ...s, [t.key]: -v }))}
                  hint={`baseline 10^${t.baseline} → ${t.organ}`}
                />
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-600">{t.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            Slider positions are stylized illustrations of the organs&apos; intended effect magnitudes, not measured
            reductions — the point of the budget is that each term becomes a number with an owner, not a hope.
          </p>
        </div>

        {/* product + comparison */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2">
              <Sigma className="h-4 w-4 text-amber-400" />
              <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">residual risk · per agent-year</p>
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold text-amber-300">10^{panoptesExp}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              = C · E · T · H with your sliders. Baseline without the organs:{' '}
              <span className="font-mono text-zinc-300">10^{baselineExp}</span> — the organs buy{' '}
              <span className="font-mono text-emerald-300">{improvement} orders of magnitude</span> of shrinking
              asymptote, at honest cost in tokens, latency, and operations.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">the account, visualized</p>
            <div className="mt-4 space-y-4">
              {[
                { label: 'baseline (no organs)', exp: baselineExp, cls: 'bg-rose-500/70' },
                { label: 'with PANOPTES organs', exp: panoptesExp, cls: 'bg-emerald-500/70' },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-300">{row.label}</span>
                    <span className="font-mono text-xs text-zinc-400">10^{row.exp} / agent-year</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-zinc-800/70">
                    <div className={cn('h-full rounded-full transition-all duration-500', row.cls)} style={{ width: `${barFrac(row.exp)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
              Bars are log-scale (each 10% of width = one order of magnitude). The claim that survives all five
              walls is not &quot;zero leaks&quot; — it is this product and its trajectory.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">the redefinition</p>
            <p className="mt-3 font-mono text-sm leading-relaxed text-emerald-300">
              airtight = a leak rate that is known · attributable · reversible · unprofitable · shrinking
              asymptotically
            </p>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              More demanding than the definition it replaces: &quot;airtight as zero leaks&quot; is marketing that
              Rice, Lampson, and the semantic gap have priced at infinity. This one is an engineering commitment you
              can be held to. The asymptote, not the wall.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
