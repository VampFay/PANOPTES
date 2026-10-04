'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Dna, Play } from 'lucide-react';
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LabShell, Section, SliderRow } from './lab-ui';
import { canaryDetection, evolutionSim } from '@/lib/sims';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

const AXIS = { stroke: '#524b3b', fontSize: 11, fontFamily: 'var(--font-plex-mono)' };
const TOOLTIP_STYLE = {
  backgroundColor: '#17140e',
  border: '1px solid #3e392e',
  borderRadius: 8,
  fontSize: 12,
  fontFamily: 'var(--font-plex-mono)',
  color: '#e4ddc9',
};

export function ImmuneLab() {
  // ---------------------------------------------------------- canary params
  const [planted, setPlanted] = useState(50);
  const [corpus, setCorpus] = useState(2000);
  const [batch, setBatch] = useState(40);
  const [coverage, setCoverage] = useState(0.8);

  // Deferring the params keeps slider drags responsive: the ~19k Monte-Carlo
  // trials recompute at deferred priority instead of blocking each tick
  // (audit B-7). Seeded (mulberry32) so SSR and hydration agree (audit B-1).
  const canaryParams = useDeferredValue({ planted, corpus, batch, coverage });
  const { planted: dPlanted, corpus: dCorpus, batch: dBatch, coverage: dCoverage } = canaryParams;

  const result = useMemo(
    () => canaryDetection({ planted: dPlanted, corpus: dCorpus, batch: dBatch, coverage: dCoverage }, 4000, 42),
    [dPlanted, dCorpus, dBatch, dCoverage],
  );
  const curve = useMemo(() => {
    const xs = [0, 5, 10, 20, 35, 50, 75, 100, 150, 200];
    return xs.map((n) => ({
      planted: n,
      detection: canaryDetection({ planted: n, corpus: dCorpus, batch: dBatch, coverage: dCoverage }, 1500, 42 + n).detectionRate * 100,
    }));
  }, [dCorpus, dBatch, dCoverage]);

  // ---------------------------------------------------------- evolution params
  const [gens, setGens] = useState(24);
  const [mutation, setMutation] = useState(0.12);
  const [patch, setPatch] = useState(0.25);
  const [evoRun, setEvoRun] = useState(0);
  const evo = useMemo(
    () => evolutionSim({ generations: gens, population: 24, mutation, patchStrength: patch }, 42 + evoRun),
    [gens, mutation, patch, evoRun],
  );
  const evoData = evo.best.map((b, i) => ({ gen: i + 1, best: b * 100, mean: evo.mean[i] * 100 }));
  const lastBest = evo.best[evo.best.length - 1] ?? 0;

  return (
    <Section
      id="immune"
      eyebrow="simulation lab 05 · organ O4"
      title="The immune layer: manufacture attacks, metabolize survivors"
      lead="Static defenses decay; immune systems do not, because they generate attacks faster than adversaries do. Continuously synthesize canary secrets — fake API keys, fake customer records, uniquely numbered and registered — and seed them through live traffic. Any canary surfacing where it should not is a detected breach with a forensic trail. Then let a red-team agent mutate payloads against the deployed policy; every successful variant becomes a candidate patch after a gauntlet. This lab runs both engines."
    >
      <Tabs defaultValue="canary" className="w-full">
        <TabsList className="bg-zinc-900/70 text-zinc-400">
          <TabsTrigger value="canary" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-amber-300">Canary detection</TabsTrigger>
          <TabsTrigger value="evo" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-amber-300">Red-team evolution</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------ canaries */}
        <TabsContent value="canary" className="mt-4">
          <LabShell
            code="LAB 05a"
            title="Synthesized canaries · Monte-Carlo exfiltration trials"
            subtitle="detection = P(at least one seeded canary trips at the boundary)"
            footer={
              <>
                Each trial draws the attacker&apos;s exfiltration batch (hypergeometric) from the corpus, counts
                canaries caught in it, and trips each crossing canary with probability c — 4,000 trials per point.
                The curve generalizes the paper&apos;s broader-impact advice (&quot;audit rulings&quot;) into an
                automated, continuously running audit: detection is a function of seeding density and boundary
                coverage, both of which you control.
              </>
            }
          >
            <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <SliderRow label="canaries planted (N)" value={planted} display={`${planted}`} min={0} max={200} step={5} onChange={setPlanted} />
                <SliderRow label="sensitive corpus (M)" value={corpus} display={`${corpus.toLocaleString("en-US")}`} min={200} max={10000} step={100} onChange={setCorpus} hint="items the org actually holds" />
                <SliderRow label="exfil batch (B)" value={batch} display={`${batch}`} min={1} max={200} step={1} onChange={setBatch} hint="items the attacker pulls in one event" />
                <SliderRow label="boundary coverage (c)" value={coverage} display={`${(coverage * 100).toFixed(0)}%`} min={0.1} max={1} step={0.05} onChange={setCoverage} hint="P a crossing canary trips monitoring (egress, CT logs, destinations)" />
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">detection rate</p>
                    <p className={`mt-2 font-mono text-3xl font-semibold ${result.detectionRate >= 0.95 ? 'text-emerald-300' : result.detectionRate >= 0.6 ? 'text-amber-300' : 'text-rose-300'}`}>
                      {(result.detectionRate * 100).toFixed(1)}%
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {result.detectionRate >= 0.95
                        ? 'near-certain attribution — the breach arrives with its own forensic trail'
                        : result.detectionRate >= 0.6
                          ? 'partial coverage — plant more, or widen boundary monitoring'
                          : 'the leak sails through — this is F5\u2019s unmeasured residue'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">expected canaries in batch</p>
                    <p className="mt-2 font-mono text-3xl font-semibold text-zinc-300">{result.expectedCanaries.toFixed(2)}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      E[hypergeometric draw] ≈ B·N/M = {((batch * planted) / Math.max(corpus, 1)).toFixed(2)} ·
                      detection = 1 − (1−c)^X averaged over trials
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">detection vs seeding density</p>
                  <div className="mt-3 h-[210px] min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={curve} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke="#221d15" vertical={false} />
                        <XAxis dataKey="planted" tick={AXIS} label={{ value: 'canaries planted', fill: '#6b6350', fontSize: 10, position: 'insideBottom', offset: -2 }} />
                        <YAxis tick={AXIS} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, 'detection']} labelFormatter={(l) => `planted: ${l}`} />
                        <Line type="monotone" dataKey="detection" stroke="#61a078" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    The immune layer converts &quot;we blocked 100% of the attacks we thought of&quot; into
                    &quot;we manufacture attacks continuously and metabolize the survivors&quot; — canaries first
                    (detection), mutation second (patching).
                  </p>
                </div>
              </div>
            </div>
          </LabShell>
        </TabsContent>

        {/* ------------------------------------------------------ evolution */}
        <TabsContent value="evo" className="mt-4">
          <LabShell
            code="LAB 05b"
            title="Affinity maturation for policy · red-team generations"
            subtitle="population probes the deployed policy · top variants patched out · survivors mutate"
            footer={
              <>
                A stochastic replicator model: 24 attack variants with bypass fitness; each generation the top slice
                is neutralized by the patch gauntlet (formal dead-end check, canary replay, regression suite,
                staged rollback), survivors mutate with rate σ, and novel pathogens appear stochastically. Mutation
                keeps pressure on; the gauntlet keeps ratcheting fitness down. The equilibrium you can hold is the
                operational definition of a defense that does not decay.
              </>
            }
          >
            <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <SliderRow label="generations" value={gens} display={`${gens}`} min={6} max={48} step={1} onChange={setGens} />
                <SliderRow label="mutation rate σ" value={mutation} display={mutation.toFixed(2)} min={0.02} max={0.4} step={0.01} onChange={setMutation} hint="how fast attackers probe new gaps" />
                <SliderRow label="patch strength" value={patch} display={`${(patch * 100).toFixed(0)}%`} min={0.05} max={0.5} step={0.05} onChange={setPatch} hint="fraction of top variants neutralized per generation" />
                <Button size="sm" className="mt-3 h-8 w-full bg-amber-500 text-zinc-950 hover:bg-amber-400" onClick={() => setEvoRun((v) => v + 1)}>
                  <Play className="h-3.5 w-3.5" /> re-seed and re-run the red team
                </Button>
                <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">final best bypass</p>
                  <p className={`mt-1.5 font-mono text-2xl font-semibold ${lastBest <= 0.15 ? 'text-emerald-300' : lastBest <= 0.4 ? 'text-amber-300' : 'text-rose-300'}`}>
                    {(lastBest * 100).toFixed(1)}%
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                    equilibrium after the gauntlet — push patch strength up or mutation down and watch it move.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">bypass rate over generations</p>
                <div className="mt-3 h-[280px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={evoData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="#221d15" vertical={false} />
                      <XAxis dataKey="gen" tick={AXIS} label={{ value: 'generation', fill: '#6b6350', fontSize: 10, position: 'insideBottom', offset: -2 }} />
                      <YAxis tick={AXIS} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, key: string) => [`${v.toFixed(1)}%`, key === 'best' ? 'best variant' : 'population mean']} labelFormatter={(l) => `generation ${l}`} />
                      <Line type="monotone" dataKey="best" stroke="#a63e2b" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="mean" stroke="#cd6d3a" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 font-mono text-[10px] text-zinc-500">
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-rose-500" /> best variant bypass</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-amber-500" /> population mean</span>
                </div>
                <p className="mt-3 flex gap-2 text-[11px] leading-relaxed text-zinc-500">
                  <Dna className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  Each re-run is a fresh stochastic ecosystem — sometimes a novel pathogen spikes late (the 25%
                  fresh-variant events). That spike is the honest cost of a live adversary; the gauntlet&apos;s job
                  is to metabolize it before deployment, with automatic rollback as the safety net.
                </p>
              </div>
            </div>
          </LabShell>
        </TabsContent>
      </Tabs>
    </Section>
  );
}
