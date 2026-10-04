'use client';

import { useState } from 'react';
import { ArrowDownToLine, Bug, FlaskConical, Globe2, Zap } from 'lucide-react';
import { Section, LabShell, Verdict } from './lab-ui';
import { CORP_ARMS, CORP_REPLAY, ATB_ARMS, ATB_COVERAGE, TAU_SLICE, ENGINE_V2, EXTERNAL_FINDINGS, CORP_THEIR_PUBLISHED, ATB_THEIR_PUBLISHED } from '@/lib/external-results';
import { cn } from '@/lib/utils';

const ARM_LABEL: Record<string, string> = {
  open: 'undefended',
  appa: 'APPA mirror (organs off)',
  panoptes: 'PANOPTES (organs on)',
  'panoptes-prefix': 'PANOPTES (pre-fix run — laundering evidence)',
  stock: 'stock (upstream)',
};

function p1(x: number) {
  return x.toFixed(2);
}

/** utility/security cell with instrument color semantics */
function UCell({ v, n }: { v: number; n: number }) {
  if (n === 0) return <td className="px-2 py-1.5 text-center font-mono text-[11px] text-zinc-500">—</td>;
  const cls = v >= 0.9 ? 'text-emerald-300' : v >= 0.6 ? 'text-amber-300' : 'text-rose-300';
  return (
    <td className={cn('px-2 py-1.5 text-center font-mono text-[11px] tabular-nums', cls)}>
      {p1(v)}
      <span className="ml-1 text-[9px] text-zinc-500">{n}</span>
    </td>
  );
}

export function ExternalBench() {
  const [showMethod, setShowMethod] = useState(false);

  return (
    <Section
      id="external"
      index="09"
      eyebrow="external corpora · their benchmarks"
      title="On their home ground"
      lead="The prototype was carried back to OpenAPPA's own benchmarks — their scenarios, their policies, their scorer — and run head-to-head with matched arms: one model, one loop, only the guard differs."
    >
      <div className="space-y-8">
        <Verdict
          kind="detect"
          title="the question changed from 'does it work' to 'does it hold on their ground'"
          detail="Bench-Corp: 20 scenarios with their end-state checks and a real LLM agent in the loop. AgentThreatBench: the pinned upstream suite with their scorer. Taubench: their banking contract over all 853 golden actions, cross-checked against the real binary."
        />

        {/* ------------------------------------------------ corp LLM run */}
        <div>
          <LabShell
            code="CORP"
            title="bench-corp · real LLM agents · 20 scenarios × 3 arms"
            subtitle="their scenario data + policies + checks, re-implemented 1:1 · guard arms share one policy — the organ stack is the only difference"
          >
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-zinc-400/15 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                  <th className="px-2 py-1.5 text-left">arm</th>
                  <th className="px-2 py-1.5">utility (all checks)</th>
                  <th className="px-2 py-1.5">attacks landed</th>
                  <th className="px-2 py-1.5">guard denials</th>
                  <th className="px-2 py-1.5">llm calls</th>
                </tr>
              </thead>
              <tbody>
                {CORP_ARMS.map((r) => (
                  <tr key={r.arm} className="border-b border-zinc-400/10 last:border-0">
                    <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-100">
                      {ARM_LABEL[r.arm] ?? r.arm}
                      {r.arm === 'panoptes' && <span className="ml-1 text-[9px] text-amber-400">◆</span>}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-100">{r.utility}</td>
                    <td
                      className={cn(
                        'px-2 py-1.5 text-center font-mono text-[11px] tabular-nums',
                        r.attacks.startsWith('0/') ? 'text-emerald-300' : 'text-rose-300',
                      )}
                    >
                      {r.attacks}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-400">{r.denied}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-400">{r.llm}</td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-400/20 border-dashed">
                  <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-500">their published run (GPT-5.6-terra)</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">{CORP_THEIR_PUBLISHED.appa.utility}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">{CORP_THEIR_PUBLISHED.appa.attacks}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">—</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">—</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
              cross-model association only — their row is a different model and scaffold; our arms share one model, so
              arm deltas are the causal-ish comparison (their own matched-arms discipline).
            </p>
            <div className="mt-2 border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-400">
              <span className="text-amber-400">v1.2.0 note —</span> this table is the pre-recovery-ergonomics run. The
              released engine now answers every deny with structured recovery guidance (re-order / fork-per-recipient /
              effect-sequencing) and offers a <span className="text-amber-300">[redacted]</span> canary payload the agent
              can send instead — the affordances the six utility regressions needed. Engine-level tests
              (panoptes/tests/recovery.test.ts) prove each documented recovery pattern completes; the LLM-in-the-loop
              re-measurement of this table is queued behind API quota (the runner is resumable). v1.2.0 additionally
              fixes the audit-found decimal-canary bypass and hardens cache keys, sidecar posture, and the session
              table — goldens unchanged (108/108 tests).
            </div>
          </LabShell>
        </div>

        {/* --------------------------------------------- laundering finding */}
        <div className="border border-rose-500/40 bg-rose-500/[0.05] p-4">
          <h3 className="mb-2 flex items-center gap-2 font-mono text-[11px] tracking-widest text-rose-300 uppercase">
            <Bug className="h-3.5 w-3.5" /> attack class found by the run — delegation laundering
          </h3>
          <div className="space-y-2 text-[12.5px] leading-relaxed text-zinc-200/90">
            <p>
              The label-only arm leaked twice — and not by label error. The agent read restricted briefs, had its
              direct send to the wrong reader denied, then <em>embedded the restricted codes in the fork task text</em>{' '}
              and let the fresh child trajectory send them: the child starts at the clean boundary, so the audience
              gate sees a public flow. The same move smuggled a privileged vendor file past the trust floor.
            </p>
            <p>
              PANOPTES closes it with <span className="font-mono text-amber-400">delegation noninterference</span>:
              a child&rsquo;s boundary is the <em>meet</em> of its parent&rsquo;s current flow and the policy boundary —
              the task text is a channel, and restrictions ride it. Legitimate delegation (a clean parent forking
              restricted reads) is unaffected; the laundering fork inherits the narrowed label and fails closed.
            </p>
          </div>
        </div>

        {/* --------------------------------------------------- policy replay */}
        {CORP_REPLAY && (
          <div>
            <LabShell
              code="REPLAY"
              title="bench-corp · deterministic policy replay"
              subtitle="scripted golden + attack-compliant trajectories · no LLM in the loop · their preflight methodology"
            >
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-zinc-400/15 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                    <th className="px-2 py-1.5 text-left">arm</th>
                    <th className="px-2 py-1.5">golden paths completed</th>
                    <th className="px-2 py-1.5">scripted attacks blocked</th>
                  </tr>
                </thead>
                <tbody>
                  {(['open', 'appa', 'panoptes'] as const).map((arm) => {
                    const s = (CORP_REPLAY as Record<string, { benignComplete: number; benignTotal: number; attacksBlocked: number; attackTotal: number }>)[arm];
                    if (!s) return null;
                    return (
                      <tr key={arm} className="border-b border-zinc-400/10 last:border-0">
                        <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-100">{ARM_LABEL[arm] ?? arm}</td>
                        <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-100">
                          {s.benignComplete}/{s.benignTotal}
                        </td>
                        <td
                          className={cn(
                            'px-2 py-1.5 text-center font-mono text-[11px] tabular-nums',
                            s.attacksBlocked === s.attackTotal ? 'text-emerald-300' : 'text-rose-300',
                          )}
                        >
                          {s.attacksBlocked}/{s.attackTotal}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </LabShell>
          </div>
        )}

        {/* ----------------------------------------------------------- ATB */}
        {ATB_ARMS.length > 0 && ATB_COVERAGE < 0.6 && (
          <div className="border border-amber-500/40 bg-amber-500/[0.04] p-4">
            <h3 className="mb-2 font-mono text-[11px] tracking-widest text-amber-400 uppercase">
              agentthreatbench · run in flight (quota window)
            </h3>
            <p className="text-[12.5px] leading-relaxed text-zinc-200/90">
              The upstream suite is wired and the scorer matches theirs, but the model API&rsquo;s rate quota closed
              mid-run — the harness is resumable and every completed episode is scored below. Partial evidence so
              far: the stock arm fell for 2 of 5 memory-poison payloads (security 0.40 — matching their published
              stock 0.40 on a different model); the organ arm&rsquo;s first episode screened the injection and passed
              clean. The full 78-episode matrix lands when the window reopens.
            </p>
            {ATB_ARMS.length > 0 && (
              <table className="mt-3 w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-zinc-400/15 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                    <th className="px-2 py-1.5 text-left">arm</th>
                    <th className="px-2 py-1.5">memory poison — utility / security (n)</th>
                  </tr>
                </thead>
                <tbody>
                  {ATB_ARMS.filter((r) => r.memoryPoison.n > 0).map((r) => (
                    <tr key={r.arm} className="border-b border-zinc-400/10 last:border-0">
                      <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-100">{ARM_LABEL[r.arm] ?? r.arm}</td>
                      <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums">
                        <span className="text-zinc-300">{p1(r.memoryPoison.utility)}</span>
                        <span className="mx-1 text-zinc-600">/</span>
                        <span className={r.memoryPoison.security >= 0.9 ? 'text-emerald-300' : r.memoryPoison.security >= 0.6 ? 'text-amber-300' : 'text-rose-300'}>
                          {p1(r.memoryPoison.security)}
                        </span>
                        <span className="ml-1 text-[9px] text-zinc-500">{r.memoryPoison.n}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {ATB_ARMS.length > 0 && ATB_COVERAGE >= 0.6 && (
          <div>
            <LabShell
              code="ATB"
              title="agentthreatbench · pinned upstream suite · 24 samples + 2 controls"
              subtitle="their upstream system prompts, tool semantics, and scorer · utility / security, higher is better · scored on dispatched calls and completions only"
            >
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-zinc-400/15 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                    <th className="px-2 py-1.5 text-left">arm</th>
                    <th className="px-2 py-1.5 text-center" colSpan={2}>
                      memory poison (n={ATB_ARMS[0]?.memoryPoison.n ?? 0})
                    </th>
                    <th className="px-2 py-1.5 text-center" colSpan={2}>
                      autonomy hijack (n={ATB_ARMS[0]?.autonomy.n ?? 0})
                    </th>
                    <th className="px-2 py-1.5 text-center" colSpan={2}>
                      data exfil (n={ATB_ARMS[0]?.dataExfil.n ?? 0})
                    </th>
                    <th className="px-2 py-1.5 text-center" colSpan={2}>
                      egress controls (n={ATB_ARMS[0]?.controls.n ?? 0})
                    </th>
                  </tr>
                  <tr className="border-b border-zinc-400/10 font-mono text-[9px] tracking-widest text-zinc-600 uppercase">
                    <th className="px-2 py-1 text-left" />
                    <th className="px-2 py-1">util</th>
                    <th className="px-2 py-1">sec</th>
                    <th className="px-2 py-1">util</th>
                    <th className="px-2 py-1">sec</th>
                    <th className="px-2 py-1">util</th>
                    <th className="px-2 py-1">sec</th>
                    <th className="px-2 py-1">util</th>
                    <th className="px-2 py-1">sec</th>
                  </tr>
                </thead>
                <tbody>
                  {ATB_ARMS.map((r) => (
                    <tr key={r.arm} className="border-b border-zinc-400/10 last:border-0">
                      <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-100">{ARM_LABEL[r.arm] ?? r.arm}</td>
                      <UCell v={r.memoryPoison.utility} n={r.memoryPoison.n} />
                      <UCell v={r.memoryPoison.security} n={r.memoryPoison.n} />
                      <UCell v={r.autonomy.utility} n={r.autonomy.n} />
                      <UCell v={r.autonomy.security} n={r.autonomy.n} />
                      <UCell v={r.dataExfil.utility} n={r.dataExfil.n} />
                      <UCell v={r.dataExfil.security} n={r.dataExfil.n} />
                      <UCell v={r.controls.utility} n={r.controls.n} />
                      <UCell v={r.controls.security} n={r.controls.n} />
                    </tr>
                  ))}
                  <tr className="border-t border-zinc-400/20 border-dashed">
                    <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-500">their guarded run (Sonnet 5)</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">{p1(ATB_THEIR_PUBLISHED.guarded.memoryPoison.utility)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">{p1(ATB_THEIR_PUBLISHED.guarded.memoryPoison.security)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">{p1(ATB_THEIR_PUBLISHED.guarded.autonomy.utility)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">{p1(ATB_THEIR_PUBLISHED.guarded.autonomy.security)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">{p1(ATB_THEIR_PUBLISHED.guarded.dataExfil.utility)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">{p1(ATB_THEIR_PUBLISHED.guarded.dataExfil.security)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">—</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[10px] text-zinc-500">—</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
                their guarded arm buys memory-poison security at 0.50 utility (closed-schema children); the organ
                stack attacks that trade-off with content-side screening and answer-channel confinement — same
                model, same scorer, our loop.
              </p>
            </LabShell>
          </div>
        )}

        {/* ----------------------------------------------------------- tau */}
        {TAU_SLICE && (
          <div>
            <LabShell
              code="TAU"
              title="taubench · their banking contract · 97 tasks / 853 golden actions"
              subtitle="their committed banking_knowledge contract replayed over every expected assistant action (their preflight scope) + the chaos screen (pre-verification mutation)"
            >
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { k: 'golden blocks', v: `${TAU_SLICE.panoptes.goldenBlocked}/${TAU_SLICE.panoptes.goldenTotal}`, note: '0% FP — their preflight guarantee held' },
                  { k: 'chaos blocks', v: `${TAU_SLICE.panoptes.chaosBlocked}/${TAU_SLICE.panoptes.chaosTotal}`, note: 'pre-verification mutations fail closed' },
                  {
                    k: 'real binary agreement',
                    v: `${TAU_SLICE.openappaBinary?.goldenBlocked ?? '—'}/${TAU_SLICE.panoptes.goldenTotal}`,
                    note: 'v0.30.0 agrees on every golden action and all chaos tasks',
                  },
                  { k: 'decision latency', v: `${TAU_SLICE.panoptes.latency.meanUs.toFixed(1)} µs`, note: `p99 ${TAU_SLICE.panoptes.latency.p99Us.toFixed(1)} µs, in-process` },
                ].map((s) => (
                  <div key={s.k} className="border border-zinc-700 bg-zinc-800/40 p-3">
                    <div className="font-mono text-[9px] tracking-widest text-zinc-500 uppercase">{s.k}</div>
                    <div className="mt-1 font-mono text-lg tabular-nums text-zinc-100">{s.v}</div>
                    <div className="mt-1 font-mono text-[9px] leading-snug text-zinc-500">{s.note}</div>
                  </div>
                ))}
              </div>
            </LabShell>
          </div>
        )}

        {/* -------------------------------------------------------- engine */}
        {ENGINE_V2 && (
          <div>
            <h3 className="mb-2 flex items-center gap-2 font-mono text-[11px] tracking-widest text-amber-400/90 uppercase">
              <Zap className="h-3 w-3" /> v2 engine hot path (post-optimization)
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {[
                { k: 'label algebra', v: `${(ENGINE_V2.hotPathNsPerDecision.tauNs / 1000).toFixed(1)} µs`, note: 'banking contract mix (61 tools)' },
                { k: 'full organ stack', v: `${(ENGINE_V2.hotPathNsPerDecision.corpNs / 1000).toFixed(1)} µs`, note: 'screen + canary + echo + policy' },
                { k: 'egress echo worst case', v: `${(ENGINE_V2.hotPathNsPerDecision.echoNs / 1000).toFixed(1)} µs`, note: '5 quarantined sources' },
              ].map((s) => (
                <div key={s.k} className="border border-zinc-700 bg-zinc-800/40 p-3">
                  <div className="font-mono text-[9px] tracking-widest text-zinc-500 uppercase">{s.k}</div>
                  <div className="mt-1 font-mono text-lg tabular-nums text-zinc-100">{s.v}</div>
                  <div className="mt-1 font-mono text-[9px] text-zinc-500">{s.note}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10px] text-zinc-500">
              vs the real binary&rsquo;s ~2.1 ms amortized per replay step — ~three orders of magnitude, and the v2
              organ stack stays in microseconds.
            </p>
          </div>
        )}

        {/* ------------------------------------------------------- findings */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 font-mono text-[11px] tracking-widest text-amber-400/90 uppercase">
            <FlaskConical className="h-3 w-3" /> measured findings
          </h3>
          <ol className="space-y-2">
            {EXTERNAL_FINDINGS.map((f, i) => (
              <li key={i} className="flex gap-3 text-[12.5px] leading-relaxed text-zinc-200/85">
                <span className="mt-0.5 shrink-0 font-mono text-[10px] text-amber-400/70">F{i + 1}</span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* ---------------------------------------------------- methodology */}
        <div>
          <button
            onClick={() => setShowMethod((v) => !v)}
            className="border border-zinc-600 px-3 py-1.5 font-mono text-[10px] tracking-widest text-zinc-400 uppercase transition-colors hover:border-amber-500/50 hover:text-amber-400"
          >
            {showMethod ? 'hide methodology' : 'methodology & caveats'}
          </button>
          {showMethod && (
            <div className="mt-3 space-y-2 border-l-2 border-amber-500/40 pl-4 font-mono text-[11px] leading-relaxed text-zinc-400">
              <p>
                <span className="text-amber-400">matched arms.</span> Every LLM run uses one model, one ReAct-JSON
                loop, one prompt set; arms differ only in the guard between model and world — their own
                matched-arms discipline, applied to our loop.
              </p>
              <p>
                <span className="text-amber-400">their corpora, not ours.</span> Corp scenarios, policies, and
                check semantics are transcribed from their repo (validated by the deterministic policy replay);
                ATB samples are the pinned upstream Inspect dataset; the tau contract and golden actions are theirs
                verbatim.
              </p>
              <p>
                <span className="text-amber-400">no answer-key leakage.</span> Guards never see scorer internals —
                no forbidden actions, no attack indices, no expected answers. Canaries are auto-enrolled from
                declared sensitive stores (CANARY naming convention + secret-field-labeled digit runs); the
                injection screen&rsquo;s pattern set was frozen before any run.
              </p>
              <p>
                <span className="text-amber-400">single run, stochastic.</span> One episode per (arm, scenario),
                like their published corp runs; matched prompts do not make stochastic trajectories causal — arm
                differences are associations.
              </p>
              <p>
                <span className="text-amber-400">cross-model rows are reference only.</span> Their published runs
                used GPT-5.6-terra (corp) and Claude Sonnet 5 (ATB) on their own scaffolds; the dashed rows are
                context, not comparison.
              </p>
              <p>
                <span className="text-amber-400">tau scope.</span> The golden replay is the deterministic slice of
                their harness (their preflight mode); the full 97-task × user-simulator benchmark needs their paid
                OpenRouter stack — future work.
              </p>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------ downloads */}
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/bench/panoptes_external_benchmarks.json"
            download="panoptes_external_benchmarks.json"
            className="inline-flex items-center gap-2 border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 font-mono text-[10px] tracking-widest text-amber-400 uppercase transition-colors hover:bg-amber-500/20"
          >
            <ArrowDownToLine className="h-3 w-3" /> raw results (json)
          </a>
          <span className="inline-flex items-center gap-2 px-2 font-mono text-[10px] text-zinc-500">
            <Globe2 className="h-3 w-3" /> every number on this page is a measurement — ours, on their benchmarks
          </span>
        </div>
      </div>
    </Section>
  );
}
