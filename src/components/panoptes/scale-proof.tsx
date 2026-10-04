'use client';

import { useState } from 'react';
import { Activity, Fingerprint, Gauge, Server, ShieldAlert, Waves } from 'lucide-react';
import { Section, LabShell, Verdict } from './lab-ui';
import { CountUp } from './count-up';
import { STRESS_META, STRESS_SUSTAINED, STRESS_CHECKPOINTS, STRESS_DETERMINISM, STRESS_CHURN, STRESS_HTTP, REDTEAM_SCALE_META, REDTEAM_SCALE } from '@/lib/stress-results';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('en-US');

function Stat({
  label,
  value,
  unit,
  tone = 'amber',
  count,
  decimals = 0,
}: {
  label: string;
  value?: string;
  unit?: string;
  tone?: 'amber' | 'emerald' | 'rose' | 'zinc';
  count?: number;
  decimals?: number;
}) {
  const toneCls = {
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    zinc: 'text-zinc-100',
  }[tone];
  return (
    <div className="reticle border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">{label}</p>
      <p className={cn('mt-1 font-mono text-xl tabular-nums leading-none md:text-2xl', toneCls)}>
        {count !== undefined ? <CountUp to={count} decimals={decimals} /> : value}
        {unit && <span className="ml-1 text-[11px] text-zinc-500">{unit}</span>}
      </p>
    </div>
  );
}

export function ScaleProof() {
  const [showMethod, setShowMethod] = useState(false);
  const s = STRESS_SUSTAINED;

  return (
    <Section
      id="scale"
      index="10"
      eyebrow="extreme stress · adversarial scale"
      title="Twenty million decisions, three and a half million probes"
      lead="The released engine under a million-fold soak — re-run fresh on the v1.2.1 post-audit build: sustained mixed load through all six organ hot paths (recovery ergonomics retained, decimal-safe numeric canaries, 96-bit cache keys), determinism sampled before and after, a hundred thousand fresh sessions, the sidecar under a concurrency ladder — and a randomized composite-mutation adversary firing millions of probes at the lattice."
    >
      <div className="space-y-8">
        <Verdict
          kind="detect"
          title="both campaigns PASS — the numbers below are single-run measurements, not simulations"
          detail={`Stress verdict ${STRESS_META.verdict} · red-team verdict ${REDTEAM_SCALE_META.verdict}. Every organ demonstrably live at scale: ${fmt(s.activity.canaryInterdictions)} canary interdictions, ${fmt(s.activity.audienceDenies)} audience denies, ${fmt(s.activity.ledgerPins)} ledger pins, ${fmt(s.activity.answerDenies)} answer-channel suppressions across the soak. Throughput lineage, measured honestly at each step: 679,619 dec/s (v1.0 pre-feature, 10M) → 612,329 (v1.1 recovery ergonomics, 20M) → ${fmt(s.decisionsPerSecond)} dec/s here (v1.2.1 post-audit, 20M; run-to-run band on this 2-vCPU box: ±4%). The deny path still builds a redacted remedy on every interdiction; the audit hardening costs single-digit percent, paid and reported.`}
        />

        {/* ---------------------------------------------- v1.2.x audit card */}
        <div className="reticle border border-amber-500/30 bg-amber-500/[0.04] p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-amber-300 uppercase">
              <ShieldAlert className="h-3.5 w-3.5" /> v1.2.x — full-codebase audit, fixed &amp; re-proven
            </h4>
            <span className="ml-auto font-mono text-[10px] text-zinc-500">docs/AUDIT.md · tests/hardening.test.ts</span>
          </div>
          <div className="mt-3 grid gap-2 text-[12.5px] leading-relaxed text-zinc-300/90 md:grid-cols-2">
            <p>
              <b className="text-zinc-100">Fixed — decimal canary bypass.</b> Enrollment and egress scanning disagreed on decimal
              points: <code className="font-mono text-[11px] text-amber-400">91,204.50</code> enrolled as key 9120450 but scanned as
              91204 — every decimal-bearing numeric secret (salaries with cents, balances, invoice totals) passed interdiction.
              Reproduced, fixed, regression-tested; the scan now mirrors enrollment exactly and also catches comma-juxtaposed
              secrets.
            </p>
            <p>
              <b className="text-zinc-100">Hardened.</b> 32-bit FNV cache/dedup keys (offline-collision-craftable) replaced with
              96-bit composites, injectivity-tested over 200k inputs; the screen cache is bounded (8,192 entries); the sidecar
              now binds 127.0.0.1 by default with constant-time bearer auth and a capped session table. Dashboard engine mirror
              re-synced byte-identical to the shipped engine. 109/109 tests, goldens unchanged, this soak re-run on the fixed
              build.
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------ the soak */}
        <LabShell
          code="SOAK"
          title={`extreme campaign · ${fmt(s.decisions)} decisions through the full mediation path`}
          subtitle="six hot paths interleaved — label algebra, full organ stack, egress echo worst case, cross-session memory ledger, answer-channel confinement, benign mixed traffic · block-timed, checkpointed every two million · v1.2.1 audit-hardened build (deny-time recovery hints + canary-redaction remedies + decimal-safe interdiction)"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="decisions" count={s.decisions} tone="amber" />
            <Stat label="throughput" count={s.decisionsPerSecond} unit="dec/s" tone="amber" />
            <Stat label="p99 latency" count={s.p99Us} decimals={2} unit="µs" tone="emerald" />
            <Stat label="p99.9 / max" value={`${s.p999Us} / ${s.maxUs}`} unit="µs" tone="emerald" />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">percentile ladder (µs/decision)</p>
              <table className="w-full border-collapse text-[12px]">
                <tbody>
                  {([
                    ['mean', s.meanUs],
                    ['p50', s.p50Us],
                    ['p90', s.p90Us],
                    ['p99', s.p99Us],
                    ['p99.9', s.p999Us],
                    ['max (GC pause)', s.maxUs],
                  ] as const).map(([k, v]) => (
                    <tr key={k} className="border-b border-zinc-400/10 last:border-0">
                      <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-400">{k}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-[11px] tabular-nums text-zinc-100">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">organ activity across the soak</p>
              <table className="w-full border-collapse text-[12px]">
                <tbody>
                  {([
                    ['O4 canary interdictions', s.activity.canaryInterdictions],
                    ['audience-gate denies', s.activity.audienceDenies],
                    ['O4 ledger pins (writes)', s.activity.ledgerPins],
                    ['O4 ledger joins (reads)', s.activity.ledgerJoins],
                    ['O7 answer suppressions', s.activity.answerDenies],
                  ] as const).map(([k, v]) => (
                    <tr key={k} className="border-b border-zinc-400/10 last:border-0">
                      <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-400">{k}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-[11px] tabular-nums text-emerald-300">{fmt(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* checkpoints */}
          <div className="mt-5">
            <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
              per-million checkpoints — throughput must not sag, heap must stay flat
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-zinc-400/15 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                    <th className="px-2 py-1.5 text-left">decisions</th>
                    <th className="px-2 py-1.5">dec/s</th>
                    <th className="px-2 py-1.5">rss heap (MB)</th>
                  </tr>
                </thead>
                <tbody>
                  {STRESS_CHECKPOINTS.map((c) => (
                    <tr key={c.decisions} className="border-b border-zinc-400/10 last:border-0">
                      <td className="px-2 py-1.5 font-mono text-[11px] tabular-nums text-zinc-300">{fmt(c.decisions)}</td>
                      <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-100">{fmt(c.decPerSec)}</td>
                      <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-100">{c.heapMb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
              soak degradation <span className={s.soakDegradationPct < 0 ? 'text-emerald-300' : 'text-rose-300'}>{s.soakDegradationPct}%</span>{' '}
              (it sped up — JIT fully warm) · leak slope{' '}
              <span className="text-emerald-300">{s.heapLeakSlopeMbPerMillion} MB / million decisions</span> — engine state is
              O(distinct content), and the soak&rsquo;s content mix is bounded, so this is the steady-state footprint, not a leak.
            </p>
          </div>
        </LabShell>

        {/* -------------------------------------------- determinism + churn */}
        <div className="grid gap-6 md:grid-cols-2">
          <LabShell
            code="DRIFT"
            title="determinism before vs after the soak"
            subtitle="the same 512-decision probe sequence runs cold, then after twenty million decisions of state growth"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <Fingerprint className="h-3.5 w-3.5 text-emerald-400" />
                <span className={STRESS_DETERMINISM.byteIdentical ? 'text-emerald-300' : 'text-rose-300'}>
                  {STRESS_DETERMINISM.byteIdentical ? 'byte-identical' : 'DRIFT DETECTED'}
                </span>
              </div>
              <div className="reticle border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-[10px] leading-relaxed break-all text-zinc-500">
                before&nbsp; {STRESS_DETERMINISM.beforeSoakHead}…
                <br />
                after&nbsp;&nbsp; {STRESS_DETERMINISM.afterSoakHead}…
              </div>
              <p className="text-[12.5px] leading-relaxed text-zinc-400">
                No drift with accumulated screen cache, ledger entries, or quarantined grams — the verdict is a function of
                (policy, trace), not of run history. This is the property an auditor replays.
              </p>
            </div>
          </LabShell>

          <LabShell
            code="CHURN"
            title={`${fmt(STRESS_CHURN.sessions)} fresh sessions`}
            subtitle="construct → canary enrollment → poisoned read → 4 decisions — every session must produce the identical verdict pattern"
          >
            <div className="grid grid-cols-2 gap-3">
              <Stat label="sessions" count={STRESS_CHURN.sessions} tone="amber" />
              <Stat label="session rate" count={STRESS_CHURN.sessionsPerSecond} unit="sessions/s" tone="amber" />
              <Stat label="per session" value={String(STRESS_CHURN.msPerSession)} unit="ms" tone="zinc" />
              <Stat label="pattern mismatches" value={String(STRESS_CHURN.mismatches)} tone={STRESS_CHURN.mismatches === 0 ? 'emerald' : 'rose'} />
            </div>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-zinc-500">
              verdict pattern <span className="text-amber-300">{STRESS_CHURN.verdictPattern}</span> (restricted read → deny, web read →
              allow, canary leak → deny, clean status → allow) identical in every one of {fmt(STRESS_CHURN.sessions)} sessions ·
              rss delta {STRESS_CHURN.heapRssDeltaMb} MB across {fmt(STRESS_CHURN.totalDecisions)} churn decisions.
            </p>
          </LabShell>
        </div>

        {/* ------------------------------------------------------- sidecar */}
        <LabShell
          code="HTTP"
          title={`sidecar under load · ${fmt(STRESS_HTTP.totalRequests)} requests, ${STRESS_HTTP.errors} errors`}
          subtitle="the shipped REST sidecar (bun serve) driven through a concurrency ladder — mixed verbs: health, session create, gated read, canary-denied egress, poisoned observe"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-zinc-400/15 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                  <th className="px-2 py-1.5 text-left">concurrency</th>
                  <th className="px-2 py-1.5">requests</th>
                  <th className="px-2 py-1.5">rps</th>
                  <th className="px-2 py-1.5">p50</th>
                  <th className="px-2 py-1.5">p99</th>
                  <th className="px-2 py-1.5">errors</th>
                </tr>
              </thead>
              <tbody>
                {STRESS_HTTP.ladder.map((l) => (
                  <tr key={l.concurrency} className="border-b border-zinc-400/10 last:border-0">
                    <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-100">{l.concurrency}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-300">{fmt(l.requests)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-amber-300">{fmt(l.rps)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-100">{l.p50Ms} ms</td>
                    <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-100">{l.p99Ms} ms</td>
                    <td className={cn('px-2 py-1.5 text-center font-mono text-[11px] tabular-nums', l.errors === 0 ? 'text-emerald-300' : 'text-rose-300')}>{l.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
            single-threaded sidecar on 2 vCPU · auth gate: {STRESS_HTTP.authRejects} unauthenticated probes rejected 401 ·
            latency includes HTTP parse + JSON + audit ring + full mediation — the µs engine sits under ms-class wire costs.
          </p>
        </LabShell>

        {/* -------------------------------------------------- redteam scale */}
        <LabShell
          code="RED×"
          title={`red-team at scale · ${fmt(REDTEAM_SCALE_META.budget.totalProbes)} randomized probes`}
          subtitle="1–4 mutation layers stacked from 13 types, random order and jitter — seeded PRNG, fully reproducible · labels vs content vs screen vs benign, four channels measured"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-zinc-400/15 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                  <th className="px-2 py-1.5 text-left">channel</th>
                  <th className="px-2 py-1.5">probes</th>
                  <th className="px-2 py-1.5">evaded / FP</th>
                  <th className="px-2 py-1.5">rate</th>
                  <th className="px-2 py-1.5 text-left">reading</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-400/10">
                  <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-100">label-gated egress</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-300">{fmt(REDTEAM_SCALE.labelGated.trials)}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-emerald-300">{fmt(REDTEAM_SCALE.labelGated.evaded)}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-emerald-300">{REDTEAM_SCALE.labelGated.evasionRate.toFixed(6)}</td>
                  <td className="px-2 py-1.5 text-[11.5px] text-zinc-400">mutations are content; labels are unreachable from content</td>
                </tr>
                <tr className="border-b border-zinc-400/10">
                  <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-100">content-only · literal payloads</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-300">{fmt(REDTEAM_SCALE.contentOnly.trials)}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-emerald-300">{fmt(REDTEAM_SCALE.contentOnly.literalEvaded)}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-emerald-300">{REDTEAM_SCALE.contentOnly.literalEvasionRate.toFixed(6)}</td>
                  <td className="px-2 py-1.5 text-[11.5px] text-zinc-400">substring canary scan catches every literal-secret variant</td>
                </tr>
                <tr className="border-b border-zinc-400/10">
                  <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-100">content-only · transformed payloads</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-300">{fmt(REDTEAM_SCALE.contentOnly.trials)}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-amber-300">{fmt(REDTEAM_SCALE.contentOnly.transformEvaded)}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-amber-300">{REDTEAM_SCALE.contentOnly.transformEvasionRate.toFixed(4)}</td>
                  <td className="px-2 py-1.5 text-[11.5px] text-zinc-400">base64 / hex / rot13 / reverse — the documented gap family (SECURITY.md)</td>
                </tr>
                <tr className="border-b border-zinc-400/10">
                  <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-100">O5 screen (markers)</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-300">{fmt(REDTEAM_SCALE.screen.trials)}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-amber-300">{fmt(REDTEAM_SCALE.screen.evaded)}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-amber-300">{REDTEAM_SCALE.screen.evasionRate.toFixed(4)}</td>
                  <td className="px-2 py-1.5 text-[11.5px] text-zinc-400">a frozen pattern set is beatable by design — the lattice compensates</td>
                </tr>
                <tr className="border-b border-zinc-400/10 last:border-0">
                  <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-100">benign traffic (FPs)</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-300">{fmt(REDTEAM_SCALE.benign.trials)}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-emerald-300">{fmt(REDTEAM_SCALE.benign.falsePositives)}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-emerald-300">{REDTEAM_SCALE.benign.falsePositiveRate.toFixed(6)}</td>
                  <td className="px-2 py-1.5 text-[11.5px] text-zinc-400">randomized mutation of benign payloads flips zero denials</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 border border-amber-500/30 bg-amber-500/[0.05] p-4">
            <h4 className="mb-2 flex items-center gap-2 font-mono text-[11px] tracking-widest text-amber-300 uppercase">
              <ShieldAlert className="h-3.5 w-3.5" /> the honest reading
            </h4>
            <p className="text-[12.5px] leading-relaxed text-zinc-300/90">
              A million randomized composite mutations produce <em>zero</em> label-gated evasions and <em>zero</em> benign false
              positives — the two channels where the architecture claims protection. The content-only transformation gap
              (base64 / hex / rot13 / reversal of the payload) and the frozen screen&rsquo;s marker evasions are measured, not
              hidden: they are the documented reason the canary scan is a tripwire, never the wall — the label lattice is the
              wall, and it did not move in a million tries.
            </p>
          </div>
        </LabShell>

        {/* ---------------------------------------------------- methodology */}
        <div className="reticle border border-zinc-800 bg-zinc-900/30">
          <button
            type="button"
            onClick={() => setShowMethod((v) => !v)}
            className="flex w-full items-center gap-2 border-b border-zinc-800 px-4 py-3 text-left font-mono text-[11px] tracking-widest text-zinc-400 uppercase transition-colors hover:text-zinc-200"
          >
            <Waves className="h-3.5 w-3.5" /> methodology {showMethod ? '—' : '+'}
          </button>
          {showMethod && (
            <div className="space-y-2 px-4 py-4 text-[12.5px] leading-relaxed text-zinc-400">
              <p className="flex gap-2">
                <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                <span>
                  <b className="text-zinc-200">Timing.</b> Per-decision clocks quantize to zero in this Bun build, so decisions run in
                  256-decision blocks with one clock pair per block; percentiles are over block means (a conservative
                  underestimate of tail sharpness). Wall-clock throughput is measured over the whole {s.wallSeconds}s soak.
                </span>
              </p>
              <p className="flex gap-2">
                <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                <span>
                  <b className="text-zinc-200">Soak shape.</b> Six engines, one per hot-path family, interleaved k mod 12 — the
                  same Observatory instance accumulates state across millions of decisions, so screen cache, ledger, and
                  quarantine-gram growth are all exercised. Checkpoints sample RSS each million.
                </span>
              </p>
              <p className="flex gap-2">
                <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                <span>
                  <b className="text-zinc-200">Sidecar.</b> The shipped CLI&rsquo;s <code className="font-mono text-[11px] text-amber-400">serve</code>{' '}
                  mode as a subprocess with bearer auth; ladder concurrency 1→128 via cooperative async workers; every
                  response body drained; status codes counted (all 200, plus a dedicated 401 probe set).
                </span>
              </p>
              <p className="flex gap-2">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                <span>
                  <b className="text-zinc-200">Adversary.</b> mulberry32 PRNG seeded {REDTEAM_SCALE_META.seed} — identical probe
                  stream on every run. Composite mutations stack 1–4 layers from 13 types (homoglyph, case-fold, zero-width,
                  split-dots, split-spaces, alt-template, xml-wrapper, padding, fluff-prefix, reverse, base64, hex, rot13) in
                  random order with random jitter. Tools: <code className="font-mono text-[11px] text-amber-400">panoptes/tools/stress2.ts</code>,{' '}
                  <code className="font-mono text-[11px] text-amber-400">panoptes/tools/redteam-scale.ts</code>.
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
