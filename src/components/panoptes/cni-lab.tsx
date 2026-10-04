'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, ShieldCheck, Radar, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LabShell, Section, SliderRow, Verdict, Formula } from './lab-ui';
import { runCni, bitsPerDecision, klBinary, h2 } from '@/lib/sims';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------- modes
type ModeId = 'covert' | 'semantic' | 'legit';

const MODES: {
  id: ModeId;
  name: string;
  tag: string;
  secret: string;
  actionA: string;
  actionB: string;
  pSecret: (s: number) => number;
  pDummy: (s: number) => number;
  story: string;
  caught: string;
}[] = [
  {
    id: 'covert',
    name: 'Covert tool-choice channel',
    tag: 'Proposition P1',
    secret: 'high-label record: the acquisition target is Umbra Corp',
    actionA: 'file the public issue titled "A"',
    actionB: 'file the public issue titled "B"',
    pSecret: (s) => 0.5 + 0.48 * s,
    pDummy: () => 0.5,
    story:
      'The agent has read a high-label record, then faces two policy-identical public actions. The label algebra sees no flow — both actions are public, no field carries secret bytes. But the agent, conditioned on the secret, chooses deterministically between them: one bit per decision, transmitted through tool choice alone.',
    caught: 'counterfactual replay does',
  },
  {
    id: 'semantic',
    name: 'Redaction-passing semantic leak',
    tag: 'the F1/F2 residue',
    secret: 'high-label record: the acquisition target is Umbra Corp — redacted from every output',
    actionA: 'link docs/integration-guide-umbra.pdf',
    actionB: 'link docs/integration-guide-acme.pdf',
    pSecret: (s) => 0.5 + 0.48 * s,
    pDummy: () => 0.5,
    story:
      'The sanitizer strips the secret from every payload — no forbidden bytes ever leave. But the model has seen enough to act on what it cannot quote: the public document it chooses to link encodes the target\u2019s name without ever containing it. Byte-level labels and redaction are blind here.',
    caught: 'the adjudicator is not',
  },
  {
    id: 'legit',
    name: 'Legitimate dependence',
    tag: 'false-positive control',
    secret: 'private ticket body — the customer is authorized to receive its summary',
    actionA: 'draft the email quoting the ticket',
    actionB: 'draft the email requesting details',
    pSecret: (s) => 0.5 + 0.48 * s,
    pDummy: (s) => 0.5 + 0.44 * s,
    story:
      'The whole point of many workflows is that the output depends on the private input — a draft email summarizing the ticket SHOULD vary with the ticket. The adjudicator therefore tests dependence at the public boundary only, comparing against dummies that carry the destination-authorized projection: both arms move together, divergence stays inside tolerance, the action dispatches.',
    caught: 'nothing — correctly',
  },
];

export function CniLab() {
  const [modeId, setModeId] = useState<ModeId>('covert');
  const [strength, setStrength] = useState(0.9);
  const [eps, setEps] = useState(0.1);
  const [m, setM] = useState(12);
  const [k, setK] = useState(3);
  const [runId, setRunId] = useState(0);

  const mode = MODES.find((x) => x.id === modeId)!;
  const pSecret = mode.pSecret(strength);
  const pDummy = mode.pDummy(strength);

  const run = useMemo(() => runCni(pSecret, pDummy, m, k, eps, 42 + runId), [pSecret, pDummy, m, k, eps, runId]);
  const bpd = bitsPerDecision(pSecret);
  const trueKl = klBinary(pSecret, pDummy);

  // distribution bars
  const maxN = Math.max(m, k);
  const bar = (count: number, n: number) => `${(count / n) * 100}%`;

  const klDisplay = run.kl >= 10 ? run.kl.toFixed(1) : run.kl.toFixed(3);
  const meterFrac = Math.min(run.kl / 1.5, 1) * 100;
  const epsFrac = Math.min(eps / 1.5, 1) * 100;

  return (
    <Section
      id="cni"
      eyebrow="chapter 6 · the crown jewel"
      title="CNI: catch the attack the algebra cannot see"
      lead="Counterfactual noninterference adjudication defines leakage causally — as a property of the model's decision function, not of the data — and tests it at runtime by replaying boundary actions with secrets swapped for inert dummies. This lab runs the actual Monte-Carlo protocol of §6.2: an observed arm (the agent's real decisions under the secret) versus a replay arm (re-derivations under the dummy), scored by KL divergence against tolerance ε."
    >
      <LabShell
        code="LAB 03"
        title="Counterfactual replay · two-tier monitor"
        subtitle="P(A = a | do(s)) vs P(A = a | do(s′)) · Pearl's do-calculus pointed at a model"
        footer={
          <>
            Every number on the right is computed live from Bernoulli sampling — re-roll to see estimator variance;
            shrink k to 1 and watch the verdict flip between runs (that variance is why §6.2 spends replays on
            boundary actions only). The paired-episode protocol of §6.3 turns this into the Phase-2 experiment:
            residue-rate = fraction of episodes where the algebra passes and the adjudicator diverges. If it
            measures zero, CNI is dead and APPA is more airtight than the whitepaper fears; if non-zero, the field
            has been measuring the shadow instead of the threat.
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* ------------------------------------------------ controls */}
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">attack scenario</p>
              <div className="mt-2.5 space-y-2">
                {MODES.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => setModeId(x.id)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                      modeId === x.id ? 'border-amber-500/40 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-xs font-semibold', modeId === x.id ? 'text-amber-200' : 'text-zinc-300')}>{x.name}</span>
                      <span className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">{x.tag}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">decision function under test</p>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                <span className="text-rose-300">secret:</span> {mode.secret}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
                <span className="text-emerald-300">public actions:</span> {mode.actionA} / {mode.actionB}
              </p>
              <p className="mt-2 font-mono text-[10px] text-zinc-500">
                bit 1 → action A · bit 0 → action B · one bit per boundary decision
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
              <SliderRow
                label="attack determinism"
                value={strength}
                display={`${(strength * 100).toFixed(0)}%`}
                min={0}
                max={1}
                step={0.05}
                onChange={setStrength}
                hint={`encoding strength: P(A | do(s)) = ${pSecret.toFixed(2)} vs P(A | do(s′)) = ${pDummy.toFixed(2)}`}
              />
              <SliderRow
                label="tolerance ε (bits)"
                value={eps}
                display={eps.toFixed(2)}
                min={0.01}
                max={0.5}
                step={0.01}
                onChange={setEps}
                hint="divergences beyond ε are treated as dependence on the secret"
              />
              <SliderRow
                label="observed derivations m"
                value={m}
                display={`${m}`}
                min={4}
                max={32}
                step={1}
                onChange={setM}
              />
              <SliderRow
                label="counterfactual replays k"
                value={k}
                display={`${k}`}
                min={1}
                max={24}
                step={1}
                onChange={setK}
                hint="k=3 & 5% of calls flagged ≈ 15% decision-token overhead (§6.2 envelope)"
              />
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-8 w-full border-zinc-700 text-zinc-300"
                onClick={() => setRunId((v) => v + 1)}
              >
                <RefreshCw className="h-3.5 w-3.5" /> re-roll the Monte-Carlo run
              </Button>
            </div>
          </div>

          {/* ------------------------------------------------ results */}
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* algebra verdict */}
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <p className="font-mono text-[11px] font-semibold text-emerald-300">FAST PATH · APPA ALGEBRA</p>
                </div>
                <p className="mt-2 font-mono text-sm font-semibold text-emerald-300">ALLOW</p>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  Both actions are public; no field carries secret bytes; labels clean at every step. The prospective
                  label satisfies every release requirement — dispatch would proceed in &lt; 1 ms.
                </p>
                <p className="mt-2 font-mono text-[10px] text-zinc-500">
                  verdict unchanged by every slider: the algebra is not wrong, it is blind here
                </p>
              </div>

              {/* CNI verdict */}
              <motion.div
                key={`${runId}-${run.verdictLeak}-${modeId}`}
                initial={{ opacity: 0.6, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  'rounded-lg border p-3.5',
                  run.verdictLeak ? 'border-rose-500/40 bg-rose-500/10' : 'border-amber-500/30 bg-amber-500/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <Radar className={cn('h-4 w-4', run.verdictLeak ? 'text-rose-400' : 'text-amber-400')} />
                  <p className={cn('font-mono text-[11px] font-semibold', run.verdictLeak ? 'text-rose-300' : 'text-amber-300')}>
                    SLOW PATH · CNI ADJUDICATOR
                  </p>
                </div>
                <p className={cn('mt-2 font-mono text-sm font-semibold', run.verdictLeak ? 'text-rose-300' : 'text-amber-300')}>
                  {run.verdictLeak ? 'LEAK — BLOCK + REMEDY PLAN' : 'NONINTERFERENT — DISPATCH'}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  {run.verdictLeak
                    ? `Empirical divergence ${klDisplay} bits > ε = ${eps.toFixed(2)}. The action depends on the secret in a way its label path never showed — sanitize, ask an authority, or fork, exactly as APPA already does.`
                    : `Empirical divergence ${klDisplay} bits ≤ ε = ${eps.toFixed(2)}. The agent does the same thing whether or not the secret was there — observed noninterferent at the point of decision.`}
                </p>
                <p className="mt-2 font-mono text-[10px] text-zinc-500">
                  {mode.id === 'legit' ? mode.caught : `the content filter cannot see this — ${mode.caught}`}
                </p>
              </motion.div>
            </div>

            {/* divergence meter */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">
                  D<sub>KL</sub>(P(A|do(s)) ‖ P(A|do(s′)))
                </p>
                <p className="font-mono text-xs text-zinc-300">
                  empirical <span className={run.verdictLeak ? 'text-rose-300' : 'text-emerald-300'}>{klDisplay}</span>
                  <span className="text-zinc-500"> bit</span>
                  <span className="mx-1.5 text-zinc-700">·</span>
                  true <span className="text-zinc-400">{trueKl < 10 ? trueKl.toFixed(3) : trueKl.toFixed(1)}</span>
                  <span className="text-zinc-500"> bit</span>
                </p>
              </div>
              <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-zinc-800/70">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', run.verdictLeak ? 'bg-rose-500' : 'bg-emerald-500')}
                  style={{ width: `${meterFrac}%` }}
                />
                <div className="absolute inset-y-0 w-0.5 bg-amber-400" style={{ left: `${epsFrac}%` }} title={`ε = ${eps}`} />
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[10px] text-zinc-500">
                <span>0</span>
                <span className="text-amber-400/80">ε marker</span>
                <span>1.5 bit (scale clamp)</span>
              </div>

              {/* distributions */}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="font-mono text-[10px] text-zinc-500">
                    observed arm · P(A|do(s)) = {(run.pObserved * 100).toFixed(0)}% · {run.observedA}/{run.observedN} chose A
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {(['A', 'B'] as const).map((a) => (
                      <div key={a} className="flex items-center gap-2">
                        <span className="w-4 font-mono text-[10px] text-zinc-500">{a}</span>
                        <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800/60">
                          <div
                            className="h-full rounded bg-emerald-500/70 transition-all duration-500"
                            style={{ width: bar(a === 'A' ? run.observedA : run.observedN - run.observedA, run.observedN) }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-zinc-500">
                    replay arm · P(A|do(s′)) = {(run.pReplay * 100).toFixed(0)}% · {run.replayA}/{run.replayN} chose A
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {(['A', 'B'] as const).map((a) => (
                      <div key={a} className="flex items-center gap-2">
                        <span className="w-4 font-mono text-[10px] text-zinc-500">{a}</span>
                        <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800/60">
                          <div
                            className="h-full rounded bg-amber-500/70 transition-all duration-500"
                            style={{ width: bar(a === 'A' ? run.replayA : run.replayN - run.replayA, run.replayN) }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* channel capacity + story */}
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5">
                <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">covert capacity</p>
                <p className="mt-2 font-mono text-lg font-semibold text-rose-300">{bpd.toFixed(3)}</p>
                <p className="font-mono text-[10px] text-zinc-500">bits per boundary decision</p>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  1 − H₂(p) with p = {pSecret.toFixed(2)} · H₂ = {h2(pSecret).toFixed(3)}. A 60-bit secret
                  (&quot;target is Umbra Corp&quot;) needs ~{Math.ceil(60 / Math.max(bpd, 0.001))} decisions — sessions
                  run hundreds of turns.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5">
                <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">what is happening</p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">{mode.story}</p>
                <div className="mt-3">
                  <Formula>
                    leak(s, a) ⟺ P(A = a | do(s)) ≠ P(A = a | do(s′))
                  </Formula>
                </div>
              </div>
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <ArrowRight className="h-3 w-3" />
              Lampson 1973 supplies the general impossibility; CNI supplies detection and a bound. Try mode 3 to see
              why the design&apos;s main risk is false positives — and how destination-authorized dummies control
              it.
            </p>
          </div>
        </div>
      </LabShell>

      {/* runtime shape explainer */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          {
            t: 'fast path · every call',
            b: 'The APPA-class algebra, sub-millisecond, verdicts unchanged. It is sound: no tracked flow violates noninterference.',
            c: 'text-emerald-300 border-emerald-500/25 bg-emerald-500/5',
          },
          {
            t: 'slow path · boundary actions only',
            b: 'Public-bound proposals that follow sensitive reads — single-digit percentages of calls in production traffic (deployment-specific; measure, don\u2019t assume).',
            c: 'text-amber-300 border-amber-500/25 bg-amber-500/5',
          },
          {
            t: 'cost · the honest dial',
            b: 'k re-derivations multiply inference for that call by (k+1)/1. k=3 with 5% flagged ≈ 15% decision-token overhead — compare APPA\u2019s measured +4.22% total. Tunable, not constant.',
            c: 'text-zinc-300 border-zinc-700 bg-zinc-900/40',
          },
        ].map((x) => (
          <div key={x.t} className={cn('rounded-xl border p-4', x.c)}>
            <p className="font-mono text-xs font-semibold">{x.t}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">{x.b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
