'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, ArrowRight } from 'lucide-react';
import { LabShell, LabelChips, Verdict, Formula, Section } from './lab-ui';
import { meet, gateCheck, TOP_LABEL, type Label, type Gate } from '@/lib/sims';
import { cn } from '@/lib/utils';

const SOURCES: {
  id: string;
  name: string;
  desc: string;
  delta: Label;
}[] = [
  {
    id: 'docs',
    name: 'Public docs',
    desc: 'internal knowledge base, no sensitive data',
    delta: { readers: [...TOP_LABEL.readers], trust: 1 },
  },
  {
    id: 'ticket',
    name: 'Support ticket',
    desc: 'customer conversation, PII present',
    delta: { readers: ['customer', 'support', 'agent'], trust: 1 },
  },
  {
    id: 'crm',
    name: 'CRM record',
    desc: 'customer PII — narrow audience',
    delta: { readers: ['support', 'agent'], trust: 1 },
  },
  {
    id: 'ledger',
    name: 'Confidential ledger',
    desc: 'finance-only material',
    delta: { readers: ['finance', 'agent'], trust: 1 },
  },
  {
    id: 'web',
    name: 'Unvetted web page',
    desc: 'bug report from the public internet — untrusted',
    delta: { readers: [...TOP_LABEL.readers], trust: 0 },
  },
];

const DESTINATIONS: { id: string; name: string; desc: string; gate: Gate }[] = [
  {
    id: 'issue',
    name: 'Public GitHub issue',
    desc: 'release to the open internet',
    gate: { needReaders: ['public'], minTrust: 1, desc: 'release: R ∋ public ∧ t = trusted' },
  },
  {
    id: 'email',
    name: 'Email the customer',
    desc: 'external email to the ticket author',
    gate: { needReaders: ['customer'], minTrust: 1, desc: 'release: R ∋ customer ∧ t = trusted' },
  },
  {
    id: 'memory',
    name: 'Write to memory',
    desc: 'persistent store, trusted infrastructure',
    gate: { minTrust: 1, desc: 'hard gate: t = trusted' },
  },
  {
    id: 'wiki',
    name: 'Internal staff wiki',
    desc: 'internal staff-only surface',
    gate: { needReaders: ['support'], minTrust: 1, desc: 'release: R ∋ support ∧ t = trusted' },
  },
];

export function LatticeLab() {
  const [active, setActive] = useState<string[]>(['docs', 'crm']);
  const [dest, setDest] = useState('issue');

  const activeSources = SOURCES.filter((s) => active.includes(s.id));
  const composite = useMemo(() => {
    const sources = SOURCES.filter((s) => active.includes(s.id));
    return sources.reduce((acc, s) => meet(acc, s.delta), { ...TOP_LABEL });
  }, [active]);
  const destination = DESTINATIONS.find((d) => d.id === dest)!;
  const verdict = gateCheck(composite, destination.gate);

  return (
    <Section
      id="lattice"
      eyebrow="simulation lab 01 · definition 1"
      title="The label lattice, live"
      lead="Toggle the data sources an agent has ingested; watch the session label ratchet by the component-wise meet. Then choose a destination and read the monitor's verdict — computed by the exact algebra of Definition 1, not a canned animation."
    >
      <LabShell
        code="LAB 01"
        title="Meet composition monitor"
        subtitle="L = (R, t) ∈ P(U) × T · (R, t) ∧ (R′, t′) = (R ∩ R′, min(t, t′))"
        footer={
          <>
            Model implements Definition 1 and Propositions 1–2 of arXiv:2607.24625v2 with five illustrative sources
            and four destination gates. Audience vocabulary and trust chain (suspicious &lt; trusted) follow the
            paper&apos;s schema; the specific tools here are pedagogical stand-ins, not the paper&apos;s Bench-Corp
            suite.
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* sources */}
          <div>
            <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">ingested sources</p>
            <div className="mt-3 space-y-2">
              {SOURCES.map((s) => {
                const on = active.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setActive((v) => (v.includes(s.id) ? v.filter((x) => x !== s.id) : [...v, s.id]))
                    }
                    className={cn(
                      'w-full rounded-lg border px-3.5 py-3 text-left transition-colors',
                      on ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
                    )}
                    aria-pressed={on}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-sm font-medium', on ? 'text-emerald-200' : 'text-zinc-300')}>{s.name}</span>
                      <span className={cn('font-mono text-[10px]', on ? 'text-emerald-400' : 'text-zinc-500')}>
                        {on ? 'ingested' : 'not read'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">{s.desc}</p>
                    <div className="mt-2">
                      <LabelChips label={s.delta} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* composite + destination */}
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-amber-400" />
                <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">session label · fold of meets</p>
              </div>
              <div className="mt-3">
                <Formula>
                  L₀ = (U, trusted){activeSources.length > 0 && activeSources.map((s) => <span key={s.id}> ∧ d<sub>{s.id}</sub></span>)}
                </Formula>
              </div>
              <motion.div key={active.join()} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="mt-3">
                <LabelChips label={composite} prev={TOP_LABEL} />
              </motion.div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                {activeSources.length === 0
                  ? 'No sources ingested — the session holds its top label.'
                  : `${activeSources.length} source${activeSources.length > 1 ? 's' : ''} composed by meet: readers intersected, trust floored. The label only ever restricts — Proposition 2, monotone descent.`}
              </p>
            </div>

            <div>
              <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">proposed destination</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {DESTINATIONS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDest(d.id)}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left transition-colors',
                      dest === d.id ? 'border-amber-500/40 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
                    )}
                  >
                    <p className={cn('text-xs font-semibold', dest === d.id ? 'text-amber-200' : 'text-zinc-300')}>{d.name}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{d.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center gap-2 text-zinc-400">
                <code className="font-mono text-[11px]">{destination.gate.desc}</code>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Verdict
                  kind={verdict.ok ? 'allow' : 'deny'}
                  title={verdict.ok ? 'allow · dispatch' : 'deny · remedy plan returned'}
                  detail={verdict.reason}
                />
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <ArrowRight className="h-3 w-3" /> verdict recomputed on every interaction — meet, then gate, exactly
                as the reference monitor does at dispatch time.
              </p>
            </div>
          </div>
        </div>
      </LabShell>
    </Section>
  );
}
