'use client';

import { FileDown, BookOpen, FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, ProvBadge } from './lab-ui';
import { KEY_REFERENCES } from '@/lib/panoptes-data';
import { BrandMark } from './brand';

const PAPER_URL = '/paper/PANOPTES_Toward_Survivable_Security_for_LLM_Agents.pdf';

export function DownloadSection() {
  return (
    <Section
      id="paper"
      eyebrow="deliverable · the whitepaper"
      title="Take the research with you"
      lead="This dashboard is the interactive companion; the whitepaper is the full argument — every definition, proposition, table, and citation from this session, written for engineering leads who need to act on it."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* download card */}
        <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-zinc-900/60 p-6 md:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(500px 220px at 20% 0%, rgba(245,158,11,0.12), transparent 70%)' }}
          />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <p className="font-mono text-[11px] text-zinc-500">whitepaper · PDF</p>
                <h3 className="text-lg font-semibold text-zinc-50">PANOPTES: Toward Survivable Security for LLM Agents</h3>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[
                ['22', 'pages'],
                ['8', 'chapters'],
                ['6', 'benchmark tables'],
                ['16', 'references'],
              ].map(([v, l]) => (
                <div key={l} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-center">
                  <p className="font-mono text-lg font-semibold text-amber-400">{v}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{l}</p>
                </div>
              ))}
            </div>

            <ul className="mt-5 space-y-1.5 text-xs leading-relaxed text-zinc-400">
              <li>· full APPA formalization — Definitions 1–2, Propositions, the ablation record</li>
              <li>· the five-flaw taxonomy with the paper&apos;s own §8 concessions as evidence</li>
              <li>· the five walls, and why airtight must be redefined as the asymptote</li>
              <li>· PANOPTES&apos; nine organs with build-complexity grades (L1–L4)</li>
              <li>· CNI: causal leakage, the residue-class construction, the paired-episode protocol</li>
              <li>· the phased roadmap with success criteria — and honest attribution on every number</li>
            </ul>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="bg-amber-500 text-zinc-950 hover:bg-amber-400">
                <a href={PAPER_URL} download="PANOPTES_Toward_Survivable_Security_for_LLM_Agents.pdf">
                  <FileDown className="h-4 w-4" />
                  Download PDF · 559 KB
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800">
                <a href="https://arxiv.org/abs/2607.24625" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  arXiv:2607.24625 (APPA)
                </a>
              </Button>
            </div>
            <p className="mt-3 font-mono text-[10px] text-zinc-500">
              sources also in download/panoptes_sources/ · cover + architecture diagram HTML
            </p>
          </div>
        </div>

        {/* evidence pack */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 md:p-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <FileDown className="h-4 w-4" />
            </span>
            <p className="font-mono text-xs font-semibold text-zinc-300">evidence pack · the raw runs</p>
            <ProvBadge source="paper" className="ml-auto" />
          </div>
          <ul className="mt-4 space-y-2">
            {[
              { href: '/bench/panoptes-core-1.2.1.tgz', label: 'panoptes-core v1.2.1 — the audit-hardened engine', note: 'MIT · engine + CLI + sidecar + MCP + Python SDK + red-team harness + full test suite + docs/AUDIT.md · 145 KB tarball' },
              { href: '/bench/panoptes_extreme_stress_campaign.json', label: 'extreme stress campaign — 20M decisions, v1.2.1', note: 'six organ hot paths · audit-hardened build · determinism pre/post · 100K-session churn · HTTP ladder · verdict PASS' },
              { href: '/bench/panoptes_redteam_scale.json', label: 'red-team at scale — 3.5M probes, v1.2.1', note: 'randomized composite mutations · label-gated 0/1M evaded · benign 0/500K FPs · seeded, reproducible' },
              { href: '/bench/panoptes_prototype_benchmarks.json', label: 'five-arm corpus benchmark (fresh re-run)', note: '40 scenarios · PANOPTES 100%/100% · deterministic goldens confirmed' },
              { href: '/paper/PANOPTES_Technical_White_Paper.pdf', label: 'technical white paper — the system document of record', note: '32 pages · 4 charts · 12 tables · mechanism, build history, tests, measured ranking, stack, honest comparison · claim-to-artifact register' },
              { href: '/bench/PANOPTES_Competitive_Ranking_Report.pdf', label: 'competitive ranking report', note: '11 pages · 6 charts · balanced-accuracy ranking with sensitivity analysis · every number from committed run artifacts' },
              { href: '/paper/PANOPTES_Competitive_Report.docx', label: 'competitive analysis report — strengths and losses, no spin', note: 'Word document · 8 sections · 3 charts · 5 tables · risk register + claim-to-evidence appendix · every figure traces to a committed run artifact' },
            ].map((f) => (
              <li key={f.href}>
                <a
                  href={f.href}
                  download
                  className="group flex items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2.5 transition-colors hover:border-amber-500/40"
                >
                  <FileDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500 transition-colors group-hover:text-amber-400" />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium leading-snug text-zinc-200 group-hover:text-amber-200">{f.label}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-zinc-500">{f.note}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-zinc-600">
            every number on this dashboard traces to a JSON artifact in this pack — re-run the tools in the repo and
            compare
          </p>
        </div>

        {/* references */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-zinc-400" />
            <p className="font-mono text-xs font-semibold text-zinc-300">key references</p>
            <ProvBadge source="paper" className="ml-auto" />
          </div>
          <ol className="mt-4 space-y-2.5">
            {KEY_REFERENCES.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-[11px] leading-relaxed text-zinc-500">
                <span className="font-mono text-zinc-700">{String(i + 1).padStart(2, '0')}</span>
                {r}
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
            Attribution discipline throughout the dashboard: <span className="text-emerald-300">arXiv paper</span>{' '}
            for controlled arms; <span className="text-amber-300">project page / README</span> for openappa.com
            claims (Claude-auto, Tau overhead); <span className="text-orange-300">secondary</span> for
            vendor-reported Codex figures; <span className="text-fuchsia-300">pedagogical model</span> for every
            simulation on this page.
          </p>
        </div>
      </div>
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950">
      {/* faint ember horizon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(to right, transparent, rgba(226,142,82,0.35), transparent)' }}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          {/* brand lockup — the instrument at rest */}
          <div className="flex items-center gap-4">
            <BrandMark detail="full" className="h-14 w-14 md:h-16 md:w-16" />
            <div>
              <p className="font-display text-xl tracking-[0.18em] text-zinc-100">PANOPTES</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.24em] text-zinc-600 uppercase">
                observatory of argus
              </p>
              <p className="mt-2.5 max-w-xs text-[11px] leading-relaxed text-zinc-500">
                An interactive companion to the session whitepaper — every mechanism explained by a
                live model, every number carrying its provenance.
              </p>
            </div>
          </div>

          {/* colophon columns */}
          <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-3 md:justify-self-end">
            <div>
              <p className="font-mono text-[10px] tracking-[0.22em] text-zinc-600 uppercase">instrument</p>
              <ul className="mt-3 space-y-2 font-mono text-[11px] text-zinc-400">
                <li>engine v1.2.1</li>
                <li>149 tests · 54,792 assertions</li>
                <li>615,270 decisions/s soak</li>
                <li>determinism byte-identical</li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[10px] tracking-[0.22em] text-zinc-600 uppercase">companion</p>
              <ul className="mt-3 space-y-2 font-mono text-[11px] text-zinc-400">
                <li>
                  <a href={PAPER_URL} className="transition-colors hover:text-amber-300">
                    whitepaper · 22 pp
                  </a>
                </li>
                <li>
                  <a href="#guide" className="transition-colors hover:text-amber-300">
                    how to use this page
                  </a>
                </li>
                <li>
                  <a href="#scale" className="transition-colors hover:text-amber-300">
                    scale campaign
                  </a>
                </li>
                <li>
                  <a href="#roadmap" className="transition-colors hover:text-amber-300">
                    release roadmap
                  </a>
                </li>
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="font-mono text-[10px] tracking-[0.22em] text-zinc-600 uppercase">sources</p>
              <ul className="mt-3 space-y-2 font-mono text-[11px] text-zinc-400">
                <li>arXiv:2607.24625v2</li>
                <li>openappa.com · MIT</li>
                <li>archestra-ai/OpenAPPA</li>
              </ul>
            </div>
          </div>
        </div>

        {/* closing hairline */}
        <div className="mt-9 flex flex-col gap-3 border-t border-zinc-800/70 pt-5 font-mono text-[10px] tracking-[0.14em] text-zinc-600 md:flex-row md:items-center md:justify-between">
          <p>
            simulations are pedagogical models of the whitepaper&apos;s formal definitions, not the
            paper&apos;s measured data · all measured figures carry provenance inline
          </p>
          <p className="shrink-0 uppercase">
            panoptes research session · 2026
          </p>
        </div>
      </div>
    </footer>
  );
}
