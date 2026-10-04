'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Play, RotateCcw, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { INCIDENT_TURNS, LANDSCAPE_ANSWERS } from '@/lib/panoptes-data';
import { Section } from './lab-ui';
import { cn } from '@/lib/utils';

export function Landscape() {
  const [turn, setTurn] = useState(0);
  const [unguarded, setUnguarded] = useState(false);
  const t = INCIDENT_TURNS[turn];
  const last = turn === INCIDENT_TURNS.length - 1;

  return (
    <Section
      id="landscape"
      eyebrow="chapter 1 · the landscape"
      title="Why agent security broke in 2026"
      lead="A coding agent reads bug reports, browses the web, queries CRMs, writes to memory, opens pull requests, and sends email — often in one trajectory. Every surface is simultaneously a work input and an attack surface. Step through the canonical incident: no single call looks wrong, because the leak is a property of the composition of calls."
    >
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* ------------------------------------------------------------ stepper */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs tracking-widest text-zinc-500 uppercase">the canonical leak · trajectory</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[11px] text-zinc-400"
              onClick={() => {
                setTurn(0);
                setUnguarded(false);
              }}
            >
              <RotateCcw className="h-3 w-3" /> replay
            </Button>
          </div>

          {/* turn rail */}
          <div className="mt-4 flex items-center gap-1.5">
            {INCIDENT_TURNS.map((_, i) => (
              <button
                key={i}
                onClick={() => setTurn(i)}
                aria-label={`Go to turn ${i + 1}`}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i < turn ? 'bg-amber-500/70' : i === turn ? 'bg-amber-400' : 'bg-zinc-800',
                )}
              />
            ))}
          </div>

          <motion.div
            key={turn}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-5"
          >
            <div className="flex items-center gap-2">
              <code className="rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-emerald-300">{t.tool}</code>
              <span className="font-mono text-[10px] text-zinc-600">turn {turn + 1}/{INCIDENT_TURNS.length}</span>
            </div>
            <h4 className="mt-3 text-base font-semibold text-zinc-100">{t.title}</h4>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.detail}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-[11px] text-zinc-500">
              <span className={turn === 0 || turn === 2 ? 'text-rose-400' : 'text-zinc-600'}>label effect:</span>{' '}
              {t.label}
            </p>
          </motion.div>

          {/* outcome panel */}
          <div
            className={cn(
              'mt-5 rounded-lg border p-3.5 transition-colors',
              last ? (unguarded ? 'border-rose-500/40 bg-rose-500/10' : 'border-emerald-500/40 bg-emerald-500/10') : 'border-zinc-800 bg-zinc-950/40',
            )}
          >
            {last ? (
              unguarded ? (
                <div className="flex gap-3">
                  <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <div>
                    <p className="font-mono text-xs font-semibold text-rose-300">UNGUARDED OUTCOME · PII DISCLOSURE</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                      The customer&apos;s email is now on the public internet. Every individual call passed every
                      per-call check — the leak exists only in the composition, which is exactly what per-call
                      judgment was never able to see.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Eye className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <div>
                    <p className="font-mono text-xs font-semibold text-emerald-300">APPA OUTCOME · BLOCKED + REMEDY</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                      The trajectory label no longer permits public release: turn 1 dropped trust to suspicious, turn
                      3 narrowed readers to {'{support, agent}'}. The monitor denies the call before dispatch and
                      returns a remedy plan — mask the email with a sanitizer, then file.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <p className="font-mono text-[11px] text-zinc-600">
                advance to turn 4 to see the outcome · toggle the guardrail below
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-zinc-700"
              onClick={() => setTurn((v) => Math.max(0, v - 1))}
              disabled={turn === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> back
            </Button>
            <Button
              size="sm"
              className="h-8 bg-amber-500 text-zinc-950 hover:bg-amber-400"
              onClick={() => setTurn((v) => Math.min(INCIDENT_TURNS.length - 1, v + 1))}
              disabled={last}
            >
              next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-[11px] text-zinc-400"
              onClick={() => {
                setUnguarded((v) => !v);
                setTurn(INCIDENT_TURNS.length - 1);
              }}
            >
              <Play className="h-3 w-3" />
              {unguarded ? 'view guarded outcome' : 'view unguarded outcome'}
            </Button>
          </div>
        </div>

        {/* ------------------------------------------------------ two axes + answers */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="font-mono text-xs tracking-widest text-zinc-500 uppercase">the two axes</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                <p className="font-mono text-xs font-semibold text-rose-300">unsafe</p>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">permits unauthorized flows</p>
              </div>
              <div className="rounded-lg border border-zinc-600/40 bg-zinc-800/30 p-3">
                <p className="font-mono text-xs font-semibold text-zinc-300">useless</p>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">refuses valid work</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              Classical IFC promised the first axis for forty years and repeatedly failed the second — over-blocking
              benign work, stranding execution after any contact with untrusted data. What changed in 2026: APPA
              made a credible attempt at having both.
            </p>
            <p className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-2.5 text-[11px] leading-relaxed text-zinc-500">
              The attacks that matter are no longer the crude ones — the authors excluded AgentDojo because frontier
              models natively resist its templates (GPT-5.6 Luna: 0% undefended compliance across 160 probed
              episodes vs 31% on GPT-4o). Attacks now ride legitimate data flows. That is the terrain APPA chose.
            </p>
          </div>

          {LANDSCAPE_ANSWERS.map((a) => (
            <div key={a.name} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-100">{a.name}</p>
                <span
                  className={cn(
                    'rounded px-2 py-0.5 font-mono text-[10px]',
                    a.verdict === 'the serious contender'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : a.verdict === 'unsafe at scale'
                        ? 'bg-rose-500/15 text-rose-300'
                        : 'bg-zinc-800 text-zinc-400',
                  )}
                >
                  {a.verdict}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {a.points.map((p, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-zinc-400">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
