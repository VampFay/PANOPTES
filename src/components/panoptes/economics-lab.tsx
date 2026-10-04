'use client';

import { useState } from 'react';
import { Coins, TrendingDown, TrendingUp, Gauge } from 'lucide-react';
import { LabShell, Section, SliderRow } from './lab-ui';
import { expectedValue } from '@/lib/sims';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;

const PRESETS = {
  judge: { label: 'Judge-only auto-mode', pS: 0.007, pD: 0.05, gainLog: 6, stake: 0, penalty: 10000, prep: 1000 },
  appa: { label: 'APPA algebra', pS: 0.0001, pD: 0.3, gainLog: 6, stake: 0, penalty: 50000, prep: 5000 },
  panoptes: { label: 'PANOPTES full stack', pS: 0.0001, pD: 0.98, gainLog: 6, stake: 100000, penalty: 1000000, prep: 5000 },
};

const ACTIONS = [
  { name: 'read public docs', dL: 0, irr: 0, blast: 1, note: 'routine work' },
  { name: 'fork + sanitized summary', dL: 0, irr: 0, blast: 1, note: 'the cheap remedy path' },
  { name: 'post public issue', dL: 1, irr: 2, blast: 2, note: 'public egress, revertible' },
  { name: 'external email (PII)', dL: 3, irr: 4, blast: 3, note: 'irreversible disclosure' },
  { name: 'bulk export to remote', dL: 5, irr: 5, blast: 5, note: 'the exfiltration path' },
];

const price = (a: (typeof ACTIONS)[number]) => a.dL * 6 + a.irr * 5 + a.blast * 2;

export function EconomicsLab() {
  const [pS, setPS] = useState(PRESETS.judge.pS);
  const [pD, setPD] = useState(PRESETS.judge.pD);
  const [gainLog, setGainLog] = useState(PRESETS.judge.gainLog);
  const [stake, setStake] = useState(PRESETS.judge.stake);
  const [penalty, setPenalty] = useState(PRESETS.judge.penalty);
  const [prep, setPrep] = useState(PRESETS.judge.prep);
  const [budget, setBudget] = useState(12);

  const gain = Math.pow(10, gainLog);
  const ev = expectedValue({ pSuccess: pS, pDetection: pD, gain, stake, penalty, prepCost: prep });
  const maxScale = Math.max(Math.abs(ev), gain);
  const evFrac = (Math.abs(ev) / maxScale) * 50;

  const applyPreset = (p: typeof PRESETS.judge) => {
    setPS(p.pS);
    setPD(p.pD);
    setGainLog(p.gainLog);
    setStake(p.stake);
    setPenalty(p.penalty);
    setPrep(p.prep);
  };

  return (
    <Section
      id="economics"
      eyebrow="simulation lab 06 · organ O5"
      title="Gas-metered agency: make attack a bad business"
      lead="Binary allow/deny at the margin optimizes the wrong thing: a fenced agent slams into walls until it stalls or a human relents. Instead, price every action path by label delta × irreversibility × blast radius — dangerous-but-legal becomes expensive, remedies become cheap — and layer slashing on top: bonds burn on verified misbehavior. Mechanism design closes what enforcement cannot: you cannot make attack impossible, you can make it unprofitable."
    >
      <LabShell
        code="LAB 06"
        title="Adversary ledger · expected value of one attack campaign"
        subtitle="EV = p(success)·gain − p(detection)·(stake + penalty) − preparation"
        footer={
          <>
            The adversary&apos;s ledger with the full stack: p(success) → 0 under the algebra, × p(detection) → 1
            under the canaries, − stake, − penalties. The actually achievable victory condition is not
            &quot;impossible&quot; — it is &quot;unprofitable.&quot; Presets are stylized: the judge-only miss rate
            uses the vendor-reported 99.3% catch (secondary source), and the algebra arm&apos;s 0.01% success
            extrapolates the paper&apos;s zero-attacks-in-1,320 under its own caveat that finite zero-ASR
            observations do not prove attacks impossible.
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="flex flex-wrap gap-1.5 pb-2">
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((key) => (
                <button
                  key={key}
                  onClick={() => applyPreset(PRESETS[key])}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-300 transition-colors hover:border-amber-500/50 hover:text-amber-300"
                >
                  {PRESETS[key].label}
                </button>
              ))}
            </div>
            <SliderRow label="p(success) — the algebra" value={Math.log10(pS)} display={`${(pS * 100).toFixed(pS < 0.001 ? 2 : 1)}%`} min={-6} max={-1} step={0.1} onChange={(v) => setPS(Math.pow(10, v))} hint="log scale — 10⁻⁶ to 10%" />
            <SliderRow label="p(detection) — canaries + logs" value={pD} display={`${(pD * 100).toFixed(0)}%`} min={0} max={1} step={0.01} onChange={setPD} />
            <SliderRow label="attacker gain" value={gainLog} display={fmt(gain)} min={3} max={7} step={0.05} onChange={setGainLog} hint="log scale — $1K to $10M" />
            <SliderRow label="stake (posted bond)" value={Math.log10(Math.max(stake, 1))} display={fmt(stake)} min={0} max={6} step={0.05} onChange={(v) => setStake(Math.pow(10, v))} hint="burned on verified misbehavior (slashing)" />
            <SliderRow label="penalty / restitution" value={Math.log10(Math.max(penalty, 1))} display={fmt(penalty)} min={2} max={7} step={0.05} onChange={(v) => setPenalty(Math.pow(10, v))} />
            <SliderRow label="preparation cost" value={Math.log10(Math.max(prep, 1))} display={fmt(prep)} min={2} max={5} step={0.05} onChange={(v) => setPrep(Math.pow(10, v))} />
          </div>

          <div className="flex flex-col gap-4">
            <div className={cn('rounded-lg border p-4', ev < 0 ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-rose-500/40 bg-rose-500/10')}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {ev < 0 ? <TrendingDown className="h-4 w-4 text-emerald-400" /> : <TrendingUp className="h-4 w-4 text-rose-400" />}
                  <p className={cn('font-mono text-xs font-semibold', ev < 0 ? 'text-emerald-300' : 'text-rose-300')}>
                    {ev < 0 ? 'ATTACK UNPROFITABLE — the rational adversary walks away' : 'ATTACK PROFITABLE — the breach pipeline is open'}
                  </p>
                </div>
                <p className={cn('font-mono text-lg font-semibold', ev < 0 ? 'text-emerald-300' : 'text-rose-300')}>{fmt(Math.abs(ev))}</p>
              </div>
              <div className="relative mt-4 h-3 rounded-full bg-zinc-800/70">
                <div className="absolute left-1/2 top-[-4px] h-5 w-0.5 bg-zinc-500" />
                <div
                  className={cn('absolute h-full rounded-full transition-all duration-500', ev < 0 ? 'bg-emerald-500' : 'bg-rose-500')}
                  style={ev < 0 ? { right: '50%', width: `${evFrac}%` } : { left: '50%', width: `${evFrac}%` }}
                />
              </div>
              <p className="mt-2 text-center font-mono text-[10px] text-zinc-500">−{fmt(maxScale)} · EV = {ev < 0 ? '−' : '+'}{fmt(Math.abs(ev))} · +{fmt(maxScale)}</p>
            </div>

            {/* gas metering */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-amber-400" />
                <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">gas meter · price = 6·Δlabel + 5·irreversibility + 2·blast</p>
              </div>
              <div className="mt-3 space-y-2">
                {ACTIONS.map((a) => {
                  const p = price(a);
                  const afford = p <= budget;
                  return (
                    <div key={a.name} className="grid grid-cols-[1fr_90px_70px] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                      <div className="min-w-0">
                        <p className={cn('truncate text-xs font-medium', afford ? 'text-zinc-200' : 'text-zinc-500')}>{a.name}</p>
                        <p className="truncate font-mono text-[10px] text-zinc-500">{a.note} · ΔL {a.dL} / irr {a.irr} / blast {a.blast}</p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-800/70">
                        <div className={cn('h-full rounded-full', afford ? 'bg-emerald-500/70' : 'bg-rose-500/70')} style={{ width: `${Math.min((p / 50) * 100, 100)}%` }} />
                      </div>
                      <p className={cn('text-right font-mono text-[11px]', afford ? 'text-emerald-300' : 'text-rose-300 line-through')}>{p} gas</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Coins className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                <Slider value={[budget]} min={1} max={50} step={0.5} onValueChange={([v]) => setBudget(v)} className="flex-1 [&_[data-slot=slider-range]]:bg-amber-500" aria-label="session risk budget" />
                <span className="shrink-0 font-mono text-[11px] text-amber-400">budget {budget.toFixed(1)}</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                The agent plans around prices the way it already plans around token costs: the sanitized-fork remedy
                stays affordable while the bulk export prices itself out of any sane budget. Slashing sits on top —
                operate at elevated capability by posting bond.
              </p>
            </div>
          </div>
        </div>
      </LabShell>
    </Section>
  );
}
