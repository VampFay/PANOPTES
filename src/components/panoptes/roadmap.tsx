'use client';

import { motion } from 'framer-motion';
import { Milestone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Section } from './lab-ui';
import { ROADMAP } from '@/lib/panoptes-data';
import { cn } from '@/lib/utils';

export function Roadmap() {
  return (
    <Section
      id="roadmap"
      eyebrow="chapter 7 · strategy"
      title="Contribute to APPA or build PANOPTES?"
      lead="Build a better system is the losing move: a rival policy algebra competes against a NeurIPS-accepted paper, an RFC community, and Archestra's distribution — head-on, with none of the leverage. The market is not policy algebras; it is trust infrastructure for agentic action. The sequencing is the answer: APPA as fast path and RFC collaborator first, adjudicator second, stack third."
    >
      <div className="relative space-y-6 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-zinc-800 md:before:left-1/2">
        {ROADMAP.map((p, i) => (
          <motion.div
            key={p.phase}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: i * 0.08 }}
            className={cn('relative pl-11 md:w-1/2 md:pl-0', i % 2 === 0 ? 'md:pr-10' : 'md:ml-auto md:pl-10')}
          >
            <span
              className={cn(
                'absolute top-4 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 md:left-auto',
                i % 2 === 0 ? 'left-0 md:-right-4 md:translate-x-1/2' : 'left-0 md:-left-4 md:-translate-x-1/2',
              )}
            >
              <Milestone className="h-3.5 w-3.5 text-amber-400" />
            </span>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-xs font-semibold text-amber-400">{p.phase}</p>
                <span className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{p.window}</span>
              </div>
              <h4 className="mt-2 text-base font-semibold text-zinc-100">{p.title}</h4>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">{p.body}</p>
              <ul className="mt-3 space-y-2">
                {p.deliverables.map((d, j) => (
                  <li key={j} className="flex gap-2 text-xs leading-relaxed text-zinc-400">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500/70" />
                    {d}
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="flex gap-2 rounded-lg border border-rose-500/25 bg-rose-500/5 p-2.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                  <div>
                    <p className="font-mono text-[10px] text-rose-300">primary risk</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{p.risk}</p>
                  </div>
                </div>
                <div className="flex gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <div>
                    <p className="font-mono text-[10px] text-emerald-300">success criterion</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{p.success}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <p className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-500">
        Negative results in Phase 2 are deliverables, not failures: a measured residue-rate of zero closes the
        question the whitepaper opens — and would make APPA more airtight than it fears. Either sign is publishable;
        only one of them is comfortable.
      </p>
    </Section>
  );
}
