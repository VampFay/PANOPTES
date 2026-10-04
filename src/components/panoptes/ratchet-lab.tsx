'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, SkipForward, Ban, Stamp, GitBranch, Eraser, CheckCircle2, XCircle } from 'lucide-react';
import { LabShell, LabelChips, Section } from './lab-ui';
import { meet, gateCheck, TOP_LABEL, type Label, type Gate } from '@/lib/sims';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------- scenarios
interface Remedy {
  id: 'sanitize' | 'authority' | 'fork' | 'fail';
  name: string;
  icon: 'eraser' | 'stamp' | 'branch' | 'ban';
  desc: string;
  log: string;
}

interface Step {
  tool: string;
  desc: string;
  delta?: Label;
  gate?: Gate;
  allowedLog: string;
}

interface Scenario {
  id: string;
  name: string;
  blurb: string;
  paperTie: string;
  steps: Step[];
  remedies: Remedy[];
}

const REMEDY_ICONS = { eraser: Eraser, stamp: Stamp, branch: GitBranch, ban: Ban };

const SCENARIOS: Scenario[] = [
  {
    id: 'memory',
    name: 'Memory task fails closed',
    blurb: 'An untrusted bug report poisons the trust level; the memory write hard-gate fails closed. This is the exact mechanism behind Table 3\u2019s 17/50 Memory cell — the 64.2% utility floor.',
    paperTie: 'ATB · DeepSeek Standard · Memory 17/50',
    steps: [
      {
        tool: 'read_issue',
        desc: 'read public bug report #4471 (unvetted web content)',
        delta: { readers: [...TOP_LABEL.readers], trust: 0 },
        allowedLog: 'ingested untrusted content · t \u2192 suspicious (ratchet, Prop. 2)',
      },
      {
        tool: 'search_docs',
        desc: 'search internal docs for the crash signature',
        delta: { readers: [...TOP_LABEL.readers], trust: 1 },
        allowedLog: 'read trusted docs · label unchanged (meet with top)',
      },
      {
        tool: 'write_memory',
        desc: 'persist triage findings to long-term memory',
        gate: { minTrust: 1, desc: 'hard gate: t \u2265 trusted' },
        allowedLog: 'memory write admitted',
      },
    ],
    remedies: [
      {
        id: 'fail',
        name: 'No remedy elected',
        icon: 'ban',
        desc: 'The guarded policy admits no memory writes at this trust level, and no authority is configured for memory in the paper\u2019s setup. Fail closed.',
        log: 'no remedy available \u00b7 task fails closed \u2014 the trajectory ratchets past the point of usefulness (F4)',
      },
      {
        id: 'authority',
        name: 'Request authority approval',
        icon: 'stamp',
        desc: 'An authority licenses exactly one rendered call against a pre-declared mandate — the session label itself never relaxes (Theorem 6).',
        log: 'authority ruling: one exact memory write approved under mandate \u00b7 session label unchanged \u00b7 task completes',
      },
    ],
  },
  {
    id: 'leak',
    name: 'The canonical leak, guarded',
    blurb: 'The landscape incident replayed through the monitor: untrusted report + CRM PII, then a public filing. Watch the deny, then recover with the sanitizer so the agent still finishes its work.',
    paperTie: 'Landscape ch.1 \u00b7 sanitizer recovery (paper \u00a73.3)',
    steps: [
      {
        tool: 'read_issue',
        desc: 'read public bug report #4471 (unvetted web content)',
        delta: { readers: [...TOP_LABEL.readers], trust: 0 },
        allowedLog: 'ingested untrusted content \u00b7 t \u2192 suspicious',
      },
      {
        tool: 'read_crm',
        desc: 'read the customer CRM record (plan tier check)',
        delta: { readers: ['support', 'agent'], trust: 1 },
        allowedLog: 'ingested customer PII \u00b7 R \u2192 {support, agent}',
      },
      {
        tool: 'post_issue',
        desc: 'file the public GitHub issue (repro steps + customer email)',
        gate: { needReaders: ['public'], minTrust: 1, desc: 'release: R \u220b public \u2227 t = trusted' },
        allowedLog: 'public release admitted',
      },
    ],
    remedies: [
      {
        id: 'sanitize',
        name: 'Sanitize, then file',
        icon: 'eraser',
        desc: 'A sanitizer masks the PII in the payload — the transformed data may flow to a wider audience; the session label itself stays ratcheted.',
        log: 'sanitizer masked maya@\u2026 \u2192 \u201cmaya@[redacted]\u201d \u00b7 issue filed publicly \u00b7 zero PII leaked \u00b7 task complete',
      },
    ],
  },
  {
    id: 'packet',
    name: 'Confidential packet, fork recovery',
    blurb: 'A task must email a customer a summary that depends on a finance-only ledger. The direct path is denied; the subagent fork confines taint to a disposable branch that exits through a schema-attested channel (Theorem 8).',
    paperTie: 'Prop. 4 \u00b7 share_legal_packet \u00b7 Theorem 8',
    steps: [
      {
        tool: 'read_ledger',
        desc: 'read the confidential finance ledger',
        delta: { readers: ['finance', 'agent'], trust: 1 },
        allowedLog: 'ingested finance-only data \u00b7 R \u2192 {finance, agent}',
      },
      {
        tool: 'send_email',
        desc: 'email the customer a transaction summary',
        gate: { needReaders: ['customer'], minTrust: 1, desc: 'release: R \u220b customer \u2227 t = trusted' },
        allowedLog: 'email admitted',
      },
    ],
    remedies: [
      {
        id: 'fork',
        name: 'Subagent fork',
        icon: 'branch',
        desc: 'Fork a child seeded with the parent label; it reads the ledger, exits only through a schema-attested summary channel — raw ledger bytes never re-enter the parent.',
        log: 'fork: child L0c := Lp \u00b7 schema-attested summary returned \u00b7 email sent \u00b7 taint confined to branch \u00b7 task complete',
      },
      {
        id: 'authority',
        name: 'Authority approval',
        icon: 'stamp',
        desc: 'Out-of-band authority approves the one exact rendered email against a pre-declared mandate.',
        log: 'authority ruling: one exact email approved \u00b7 task complete',
      },
    ],
  },
];

interface LogEntry {
  tool: string;
  text: string;
  kind: 'read' | 'allow' | 'deny' | 'remedy' | 'fail';
}

export function RatchetLab() {
  const [scenarioId, setScenarioId] = useState('memory');
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;

  const [label, setLabel] = useState<Label>({ ...TOP_LABEL });
  const [cursor, setCursor] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pendingStep, setPendingStep] = useState<Step | null>(null);
  const [outcome, setOutcome] = useState<null | { kind: 'done' | 'failed'; text: string }>(null);
  const [auto, setAuto] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reset = (id = scenarioId) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setAuto(false);
    setLabel({ ...TOP_LABEL });
    setCursor(0);
    setLog([]);
    setPendingStep(null);
    setOutcome(null);
    setScenarioId(id);
  };

  const stepFn = () => {
    if (outcome || pendingStep || cursor >= scenario.steps.length) {
      setAuto(false);
      return;
    }
    const step = scenario.steps[cursor];
    const isLast = cursor === scenario.steps.length - 1;
    if (step.delta) {
      setLabel((l) => meet(l, step.delta!));
      setLog((lg) => [...lg, { tool: step.tool, text: step.allowedLog, kind: 'read' }]);
      setCursor((c) => c + 1);
      if (isLast) {
        setOutcome({ kind: 'done', text: 'trajectory complete · all calls admitted · no policy violation' });
        setAuto(false);
      }
    } else if (step.gate) {
      const v = gateCheck(label, step.gate);
      if (v.ok) {
        setLog((lg) => [...lg, { tool: step.tool, text: `${step.allowedLog} \u00b7 ${v.reason}`, kind: 'allow' }]);
        setCursor((c) => c + 1);
        if (isLast) {
          setOutcome({ kind: 'done', text: 'task completed · all calls admitted · zero policy violations' });
          setAuto(false);
        }
      } else {
        setLog((lg) => [...lg, { tool: step.tool, text: `DENY \u00b7 ${v.reason}`, kind: 'deny' }]);
        setPendingStep(step);
        setAuto(false);
      }
    }
  };

  // auto-run driver
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => stepFn(), 650);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [auto, cursor, pendingStep, outcome, scenarioId]);

  const applyRemedy = (r: Remedy) => {
    if (!pendingStep) return;
    setLog((lg) => [...lg, { tool: pendingStep.tool, text: `REMEDY \u00b7 ${r.log}`, kind: r.id === 'fail' ? 'fail' : 'remedy' }]);
    if (r.id === 'fail') {
      setOutcome({
        kind: 'failed',
        text: 'task failed closed \u00b7 the monotone ratchet has no declassification lifecycle \u2014 the session can no longer do useful work (F4)',
      });
    } else {
      setCursor((c) => c + 1);
      if (cursor + 1 >= scenario.steps.length) {
        setOutcome({ kind: 'done', text: 'task completed through recovery \u00b7 zero policy violations \u00b7 zero leaks' });
      }
    }
    setPendingStep(null);
  };

  const lastGateStep = scenario.steps[scenario.steps.length - 1];
  const effectiveCursor = Math.min(cursor, scenario.steps.length);

  return (
    <Section
      id="ratchet"
      eyebrow="simulation lab 02 · the monotone ratchet"
      title="Run a trajectory through the monitor"
      lead="Labels only ever restrict — elegant in theory, harsh in operations. Pick a scenario and run it step by step: watch the ratchet tighten, the hard gate fire, and the recovery layer (or its absence) decide whether the agent finishes its work or fails closed."
    >
      <LabShell
        code="LAB 02"
        title="Trajectory runner · fold(a₁···aₙ)(L₀)"
        subtitle="prospective label per call · gates at dispatch · remedies on deny"
        footer={
          <>
            Scenario 1 reproduces the mechanism the paper reports for its utility floor: Memory Poisoning completion
            17/50 (DeepSeek, Standard) because the guarded policy admits no memory writes at the required trust level
            — tasks fail closed. Scenario 3 mirrors the paper&apos;s Proposition 4 composite-tool example
            (share_legal_packet) and Theorem 8 (taint confined to the branch boundary).
          </>
        }
      >
        {/* scenario selector */}
        <div className="grid gap-2 md:grid-cols-3">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => reset(s.id)}
              className={cn(
                'rounded-lg border px-3.5 py-3 text-left transition-colors',
                scenarioId === s.id ? 'border-amber-500/40 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
              )}
            >
              <p className={cn('text-sm font-semibold', scenarioId === s.id ? 'text-amber-200' : 'text-zinc-200')}>{s.name}</p>
              <p className="mt-1 font-mono text-[10px] text-zinc-500">{s.paperTie}</p>
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-zinc-400">{scenario.blurb}</p>

        <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
          {/* left: label + plan + controls */}
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5">
              <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">session label</p>
              <div className="mt-2.5">
                <LabelChips label={label} prev={TOP_LABEL} />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                readers ratchet by ∩, trust floors by min — never the reverse.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5">
              <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">planned calls</p>
              <ol className="mt-2.5 space-y-2">
                {scenario.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[9px]',
                        i < effectiveCursor ? 'bg-emerald-500/20 text-emerald-300' : i === effectiveCursor ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-500',
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <code className={cn('font-mono text-[11px]', i === effectiveCursor ? 'text-amber-300' : 'text-zinc-400')}>{s.tool}</code>
                      <p className="text-[11px] leading-snug text-zinc-500">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 bg-amber-500 text-zinc-950 hover:bg-amber-400" onClick={() => { reset(); setAuto(true); }} disabled={!!outcome}>
                <Play className="h-3.5 w-3.5" /> run
              </Button>
              <Button size="sm" variant="outline" className="h-8 border-zinc-700" onClick={stepFn} disabled={!!outcome || !!pendingStep || auto}>
                <SkipForward className="h-3.5 w-3.5" /> step
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-zinc-400" onClick={() => reset()}>
                <RotateCcw className="h-3.5 w-3.5" /> reset
              </Button>
            </div>
          </div>

          {/* right: monitor log */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">reference monitor log</p>
            <div className="mt-3 min-h-[220px] space-y-2 font-mono text-xs">
              {log.length === 0 && <p className="text-zinc-600">awaiting dispatch · press run or step…</p>}
              {log.map((e, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  {e.kind === 'deny' ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" /> : e.kind === 'fail' ? <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" /> : e.kind === 'remedy' ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                  <span className={cn('min-w-0 break-words', e.kind === 'deny' ? 'text-rose-300' : e.kind === 'fail' ? 'text-rose-300' : e.kind === 'remedy' ? 'text-amber-200' : 'text-zinc-300')}>
                    <span className="text-zinc-500">{e.tool}</span> — {e.text}
                  </span>
                </div>
              ))}
            </div>

            {/* remedy choice */}
            {pendingStep && !outcome && (
              <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5">
                <p className="font-mono text-[11px] font-semibold text-amber-300">REMEDY PLAN · the policy permits:</p>
                <div className="mt-2.5 space-y-2">
                  {scenario.remedies.map((r) => {
                    const Icon = REMEDY_ICONS[r.icon];
                    return (
                      <button
                        key={r.id}
                        onClick={() => applyRemedy(r)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2.5 text-left transition-colors hover:border-amber-500/50 hover:bg-amber-500/10"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-amber-400" />
                          <span className="text-xs font-semibold text-zinc-100">{r.name}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-zinc-500">{r.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* outcome */}
            {outcome && (
              <div
                className={cn(
                  'mt-4 rounded-lg border p-3.5',
                  outcome.kind === 'done' ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-rose-500/40 bg-rose-500/10',
                )}
              >
                <p className={cn('font-mono text-xs font-semibold', outcome.kind === 'done' ? 'text-emerald-300' : 'text-rose-300')}>
                  {outcome.kind === 'done' ? 'OUTCOME · TASK COMPLETE' : 'OUTCOME · FAILED CLOSED'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{outcome.text}</p>
                {outcome.kind === 'failed' && lastGateStep.gate && (
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    Operators confronting a ratcheted-dead session have one sanctioned move — restart, discarding
                    context — and one unsanctioned one: loosen the policy. That is the F4 death spiral, and the
                    paper&apos;s own §8 concedes the utility trail.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </LabShell>
    </Section>
  );
}
