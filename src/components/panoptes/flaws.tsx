'use client';

import { useState } from 'react';
import { Quote, ChevronDown } from 'lucide-react';
import { Section, ProvBadge } from './lab-ui';
import { FLAWS } from '@/lib/panoptes-data';
import { cn } from '@/lib/utils';

export function Flaws() {
  const [open, setOpen] = useState<string | null>('F1');

  return (
    <Section
      id="flaws"
      eyebrow="chapter 3 · the flaw taxonomy"
      title="Where airtight leaks"
      lead="Five structural flaws — each follows from a design decision that is also a strength, and each is visible in APPA's own artifacts once the marketing layer is peeled back. The paper's limitations section is unusually honest for the genre; it reads, almost verbatim, like a todo list. None of these are refutations — they are the inherited shape of forty years of information-flow control research, with genuinely novel recovery machinery bolted on."
    >
      <div className="space-y-3">
        {FLAWS.map((f) => {
          const isOpen = open === f.id;
          return (
            <div
              key={f.id}
              className={cn(
                'overflow-hidden rounded-xl border transition-colors',
                isOpen ? 'border-rose-500/30 bg-zinc-900/60' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
              )}
            >
              <button
                onClick={() => setOpen(isOpen ? null : f.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left md:px-5"
                aria-expanded={isOpen}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold',
                    isOpen ? 'bg-rose-500/15 text-rose-300' : 'bg-zinc-800 text-zinc-400',
                  )}
                >
                  {f.id}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-semibold', isOpen ? 'text-zinc-100' : 'text-zinc-300')}>{f.name}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">{f.short}</span>
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-zinc-500 transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="border-t border-zinc-800/80 px-4 py-4 md:px-5">
                  <p className="text-sm leading-relaxed text-zinc-400">{f.body}</p>
                  <div className="mt-4 flex gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5">
                    <Quote className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
                    <div className="min-w-0">
                      <p className="text-xs leading-relaxed text-zinc-400 italic">{f.evidence.text}</p>
                      <div className="mt-2">
                        <ProvBadge source={f.evidence.source} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 md:p-5">
        <p className="font-mono text-xs font-semibold text-amber-300">THE PAPER&apos;S OWN CLOSING CAVEAT — §8</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          &quot;Misconfigured contracts, authorities, or sanitizers can create false assurance. Deployments should
          audit rulings, minimize authority mandates, and use APPA as one defense-in-depth layer.&quot; Our position
          in the whitepaper is simply that the caveat <span className="text-zinc-200">is</span> the architecture:
          build the other layers explicitly.
        </p>
      </div>
    </Section>
  );
}
