'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Section, ProvBadge } from './lab-ui';
import { ABLATION, ATB_ROWS, BENCH_CORP_ROWS, TAU_STATS } from '@/lib/panoptes-data';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const AXIS = { stroke: '#524b3b', fontSize: 11, fontFamily: 'var(--font-plex-mono)' };
const TOOLTIP_STYLE = {
  backgroundColor: '#17140e',
  border: '1px solid #3e392e',
  borderRadius: 8,
  fontSize: 12,
  fontFamily: 'var(--font-plex-mono)',
  color: '#e4ddc9',
};

export function Benchmarks() {
  const models = useMemo(() => [...new Set(BENCH_CORP_ROWS.map((r) => r.model))], []);
  const [model, setModel] = useState(models[0]);

  const benchData = useMemo(
    () =>
      BENCH_CORP_ROWS.filter((r) => r.model === model).map((r) => ({
        name: r.profile,
        APPA: parseInt(r.appa.split(' / ')[0], 10),
        'APPA-open': parseInt(r.appaOpen.split(' / ')[0], 10),
        'Fides-middleware': parseInt(r.fm.split(' / ')[0], 10),
        'Fides-native': parseInt(r.fn.split(' / ')[0], 10),
        'Fides-open': parseInt(r.fopen.split(' / ')[0], 10),
        asrAppa: parseInt(r.appa.split(' / ')[1], 10),
        asrOpen: parseInt(r.appaOpen.split(' / ')[1], 10),
      })),
    [model],
  );

  const atbModels = useMemo(() => [...new Set(ATB_ROWS.map((r) => `${r.model} · ${r.profile}`))], []);
  const [atbSel, setAtbSel] = useState(atbModels[0]);
  const atbModel = atbSel.split(' · ')[0];
  const atbProfile = atbSel.split(' · ')[1];
  const atbData = ATB_ROWS.filter((r) => r.model === atbModel && r.profile === atbProfile).flatMap((r) => [
    { category: 'Memory', completed: r.memory, total: 50 },
    { category: 'Autonomy', completed: r.autonomy, total: 30 },
    { category: 'Exfiltration', completed: r.exfiltration, total: 40 },
  ]);
  const atbCompleted = atbData.reduce((s, d) => s + d.completed, 0);

  return (
    <Section
      id="benchmarks"
      eyebrow="chapter 2.4 · what the benchmarks say"
      title="The measured record — with provenance"
      lead="Three readings fall out of the paper's tables: the zero column is uniform (no scored attack succeeded in any of the 1,320 guarded episodes); the 64.2% utility floor is not an abstraction but DeepSeek's memory tasks failing closed at 17/50; and the overhead is modest. What is proven is a conditional — given accurate contracts, casts, sanitizers, a trusted monitor, and the attack classes these suites score."
    >
      {/* ablation */}
      <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Table 2 · Recovery ablation (GPT-5.6 Luna, pooled 200)</p>
            <p className="mt-0.5 text-xs text-zinc-500">utility / attack-success out of 100 episodes per profile</p>
          </div>
          <ProvBadge source="paper" />
        </div>
        <div className="mt-4 h-[240px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ABLATION} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#221d15" vertical={false} />
              <XAxis dataKey="config" tick={AXIS} tickFormatter={(v: string) => (v.includes('(') ? 'full recovery' : v.replace('appa-', ''))} interval={0} />
              <YAxis tick={AXIS} domain={[0, 100]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(113,113,122,0.08)' }} formatter={(v: number, key: string) => (key === 'utility' ? [`${v.toFixed(1)}%`, 'task completion'] : [v, 'attacks succeeded'])} />
              <ReferenceLine y={0} stroke="#a63e2b" strokeDasharray="3 3" label={{ value: 'ASR = 0 in every arm', fill: '#c56a52', fontSize: 11, position: 'insideTopLeft' }} />
              <Bar dataKey="utility" radius={[4, 4, 0, 0]} maxBarSize={72}>
                {ABLATION.map((_, i) => (
                  <Cell key={i} fill={['#cd6d3a', '#a79c82', '#6b6350'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          Removing fork advertisement drops completion 88.0 → 56.5; removing guided recovery drops it to 35.0 — with
          zero attacks succeeding in every configuration. The two arms interact (not an additive decomposition, per
          the paper). The delta is the point: recoverable IFC is what makes deterministic enforcement compatible
          with an agent that still finishes its work.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Bench-Corp */}
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Table 1 · Bench-Corp aggregates</p>
              <p className="mt-0.5 text-xs text-zinc-500">utility / ASR per 100 episodes · Standard & Chaos</p>
            </div>
            <ProvBadge source="paper" />
          </div>
          <div className="mt-4 h-[230px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={benchData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#221d15" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} interval={0} />
                <YAxis tick={AXIS} domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(113,113,122,0.08)' }} formatter={(v: number, key: string) => [`${v}`, key]} />
                <Bar dataKey="APPA" fill="#61a078" radius={[3, 3, 0, 0]} />
                <Bar dataKey="APPA-open" fill="#cd6d3a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Fides-middleware" fill="#6b6350" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Fides-native" fill="#524b3b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="tablist" aria-label="Bench-Corp model selector">
            {models.map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={model === m}
                onClick={() => setModel(m)}
                className={cn(
                  'rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors',
                  model === m ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  {['Profile', 'APPA', 'APPA-open', 'F-M', 'F-N', 'F-open'].map((h) => (
                    <TableHead key={h} scope="col" className="h-8 bg-zinc-900/70 px-2.5 font-mono text-[10px] text-zinc-400">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {BENCH_CORP_ROWS.filter((r) => r.model === model).map((r) => (
                  <TableRow key={r.profile} className="border-zinc-800">
                    <TableCell className="px-2.5 py-2 font-mono text-[11px] text-zinc-400">{r.profile}</TableCell>
                    <TableCell className="px-2.5 py-2 font-mono text-[11px] font-semibold text-emerald-400">{r.appa}</TableCell>
                    <TableCell className="px-2.5 py-2 font-mono text-[11px] text-amber-400">{r.appaOpen}</TableCell>
                    <TableCell className="px-2.5 py-2 font-mono text-[11px] text-zinc-400">{r.fm}</TableCell>
                    <TableCell className="px-2.5 py-2 font-mono text-[11px] text-zinc-400">{r.fn}</TableCell>
                    <TableCell className="px-2.5 py-2 font-mono text-[11px] text-zinc-400">{r.fopen}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            The permissive arm (APPA-open) is the control that proves the threats are real — strip enforcement and
            26–45% of chaos episodes leak. Reading discipline: under one team&apos;s policy grammar, deterministic
            flow control with recovery dominates judge-based control on both axes (F5).
          </p>
        </div>

        {/* ATB */}
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Table 3 · AgentThreatBench by OWASP category</p>
              <p className="mt-0.5 text-xs text-zinc-500">completed episodes · attacks zero in every cell</p>
            </div>
            <ProvBadge source="paper" />
          </div>
          <div className="mt-4 h-[230px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={atbData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#221d15" vertical={false} />
                <XAxis dataKey="category" tick={AXIS} interval={0} />
                <YAxis tick={AXIS} domain={[0, 50]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(113,113,122,0.08)' }} formatter={(v: number) => [`${v} completed`, '']} />
                <Bar dataKey="completed" radius={[3, 3, 0, 0]} maxBarSize={64}>
                  {atbData.map((d, i) => (
                    <Cell key={i} fill={d.category === 'Memory' && d.completed <= 20 ? '#a63e2b' : d.category === 'Memory' ? '#cd6d3a' : '#61a078'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="AgentThreatBench model selector">
            {atbModels.map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={atbSel === m}
                onClick={() => setAtbSel(m)}
                className={cn(
                  'rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors',
                  atbSel === m ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-500">
            {atbCompleted}/120 episodes completed. The utility floor of the abstract — 64.2% — is exactly this view on
            DeepSeek · Standard: 77/120, driven by Memory at <span className="text-rose-300">17/50</span>. The guarded
            policy admits no memory writes at the required trust level, so tasks that require writing to memory fail
            closed. The paper is candid: &quot;APPA&apos;s Memory Poisoning utility trails F-M&apos;s with every
            model.&quot;
          </p>
        </div>
      </div>

      {/* Tau */}
      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Tau banking benchmark · overhead</p>
            <p className="mt-0.5 text-xs text-zinc-500">97 tasks · four runs · GPT-5.6 Luna at maximum reasoning effort</p>
          </div>
          <ProvBadge source="project page" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {TAU_STATS.map((s) => (
            <div key={s.value} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="font-mono text-sm font-semibold text-amber-400">{s.value}</p>
              <p className="mt-1 text-[11px] leading-snug text-zinc-500">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          Guarded APPA completed 151 of 388 simulations at a mean reward of 38.92% (stock: 156/388, 40.21%) while
          consuming 1,307,763 mean agent tokens per simulation. Precision flag: these figures come from the
          evaluation page, not the NeurIPS paper&apos;s controlled arms — the same discipline this dashboard applies
          to the Claude-auto (90% utility / 10% attack success) and Codex 99.3% claims, which are project-page and
          secondary-source statements respectively.
        </p>
      </div>
    </Section>
  );
}
