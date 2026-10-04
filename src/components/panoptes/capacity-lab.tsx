'use client';

import { useMemo, useState } from 'react';
import { Plus, Minus, Zap } from 'lucide-react';
import { LabShell, Section, Formula } from './lab-ui';
import { channelCapacity, log2, formatBits, formatCount } from '@/lib/sims';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface Field {
  id: string;
  name: string;
  vocabExp: number; // log2 |Σ|
  cap: number;
}

const PRESETS: Record<string, Field[]> = {
  closed: [
    { id: 'f1', name: 'severity', vocabExp: 2, cap: 1 },
    { id: 'f2', name: 'component', vocabExp: 6, cap: 1 },
    { id: 'f3', name: 'stack_hash', vocabExp: 4, cap: 8 },
    { id: 'f4', name: 'summary_phrase', vocabExp: 8, cap: 3 },
  ],
  loose: [
    { id: 'f1', name: 'title', vocabExp: 14, cap: 8 },
    { id: 'f2', name: 'body_text', vocabExp: 17, cap: 64 },
    { id: 'f3', name: 'labels', vocabExp: 5, cap: 4 },
  ],
};

export function CapacityLab() {
  const [preset, setPreset] = useState<'closed' | 'loose' | 'custom'>('closed');
  const [fields, setFields] = useState<Field[]>(PRESETS.closed);
  const [proseCap, setProseCap] = useState(4000);

  const vocabOf = (f: Field) => Math.pow(2, f.vocabExp);
  const bitsOf = (f: Field) => (vocabOf(f) > 1 ? f.cap * f.vocabExp : 0);
  const total = useMemo(() => channelCapacity(fields.map((f) => ({ id: f.id, name: f.name, vocab: vocabOf(f), cap: f.cap }))), [fields]);
  const proseBits = Math.round(proseCap * log2(95)); // printable ASCII
  const ratio = proseBits / Math.max(total, 1e-9);

  const applyPreset = (p: 'closed' | 'loose') => {
    setPreset(p);
    setFields(PRESETS[p].map((f) => ({ ...f })));
  };

  const update = (id: string, patch: Partial<Field>) => {
    setPreset('custom');
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  // what-fits examples for current total
  const fits = [
    { bits: 1, text: 'one binary decision — which of two public tools to call' },
    { bits: 10, text: 'select one of 1,024 records to act on next' },
    { bits: 20, text: 'select one in a million — enough to steer a merge order' },
    { bits: 40, text: 'pick any of ~10¹² outcomes — smuggle a short secret' },
    { bits: 60, text: 'an 8-character secret rides out, field by field' },
    { bits: total, text: 'your current schema\u2019s entire ingress budget', now: true },
  ].sort((a, b) => a.bits - b.bits);

  return (
    <Section
      id="capacity"
      eyebrow="simulation lab 04 · organ O2"
      title="Price the injection channel"
      lead="The root cause of prompt injection is architectural: the context window is one undifferentiated namespace where instructions and data share an address space. PANOPTES generalizes APPA's bounded projections into an ingress law — untrusted text may enter primary context only as typed, bounded, closed-vocabulary projections with no imperative fields and no interpolation into prompts. You cannot stop injection; you can put a computable upper bound on its bandwidth."
    >
      <LabShell
        code="LAB 04"
        title="Injection channel capacity · Definition 3"
        subtitle="C ≤ Σᵢ nᵢ · log₂ |Σᵢ| bits — finite, computable, tunable by vocabulary design"
        footer={
          <>
            Capacity is the Shannon worst case for a closed schema: every field a bounded vocabulary, every length
            capped, nothing permitted to interpolate into instructions. Nobody in the agent-security literature
            publishes injection-channel capacity numbers yet — the whitepaper&apos;s claim is that this measurement
            alone is a paper. Alarming when traffic approaches the bound is the operational complement.
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* schema builder */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">ingress schema</span>
              <span className="ml-auto flex gap-1.5">
                <Button size="sm" variant={preset === 'closed' ? 'default' : 'outline'} className={cn('h-7 text-[11px]', preset === 'closed' ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400' : 'border-zinc-700')} onClick={() => applyPreset('closed')}>
                  closed bug schema
                </Button>
                <Button size="sm" variant={preset === 'loose' ? 'default' : 'outline'} className={cn('h-7 text-[11px]', preset === 'loose' ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400' : 'border-zinc-700')} onClick={() => applyPreset('loose')}>
                  loose projection
                </Button>
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {fields.map((f) => (
                <div key={f.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="font-mono text-xs text-emerald-300">{f.name}</code>
                    <span className="font-mono text-[11px] text-amber-400">{bitsOf(f).toFixed(0)} bit</span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-zinc-500">|Σ| = {formatCount(vocabOf(f))}</span>
                      <Slider
                        value={[f.vocabExp]}
                        min={1}
                        max={20}
                        step={1}
                        onValueChange={([v]) => update(f.id, { vocabExp: v })}
                        className="flex-1 [&_[data-slot=slider-range]]:bg-amber-500"
                        aria-label={`vocabulary size for ${f.name}`}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-zinc-500">n =</span>
                      <Button size="icon" variant="outline" className="h-6 w-6 border-zinc-700" onClick={() => update(f.id, { cap: Math.max(1, f.cap - 1) })} aria-label={`decrease length cap for ${f.name}`}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-5 text-center font-mono text-[11px] text-zinc-300">{f.cap}</span>
                      <Button size="icon" variant="outline" className="h-6 w-6 border-zinc-700" onClick={() => update(f.id, { cap: Math.min(128, f.cap + 1) })} aria-label={`increase length cap for ${f.name}`}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] text-zinc-500">
                    {f.cap} × log₂({formatCount(vocabOf(f))}) = {f.cap} × {f.vocabExp} = {bitsOf(f).toFixed(0)} bits
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <Formula>
                C ≤ {'{'}{fields.map((f, i) => <span key={f.id}>{i > 0 && ' + '}{f.cap}·log₂|Σ<sub>{f.name}</sub>|</span>)}{'}'} = <span className="text-amber-300">{formatBits(total)}</span>
              </Formula>
            </div>
          </div>

          {/* comparison + what fits */}
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">your schema vs free prose</p>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-300">closed schema ingress</span>
                    <span className="font-mono text-xs text-emerald-300">{formatBits(total)}</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-zinc-800/70">
                    <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.max((Math.log10(Math.max(total, 1)) / Math.log10(Math.max(proseBits, 10))) * 100, 2)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-300">free prose ({proseCap.toLocaleString("en-US")} chars, ASCII)</span>
                    <span className="font-mono text-xs text-rose-300">{formatBits(proseBits)}</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-zinc-800/70">
                    <div className="h-full rounded-full bg-rose-500/80" style={{ width: '100%' }} />
                  </div>
                  <Slider
                    value={[Math.log10(proseCap)]}
                    min={2}
                    max={4.2}
                    step={0.05}
                    onValueChange={([v]) => setProseCap(Math.round(Math.pow(10, v)))}
                    className="mt-2 [&_[data-slot=slider-range]]:bg-rose-500"
                    aria-label="free prose length"
                  />
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                    log-scale bars · free prose carries ~{ratio >= 100 ? ratio.toFixed(0) : ratio.toFixed(1)}× the attacker budget
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">what {formatBits(total)} buys an attacker</p>
              </div>
              <ul className="mt-3 space-y-2">
                {fits.map((f, i) => (
                  <li key={`${f.bits}-${i}`} className={cn('flex gap-2 rounded px-2 py-1.5 text-[11px] leading-snug', f.now ? 'border border-amber-500/40 bg-amber-500/10 text-amber-200' : 'text-zinc-500')}>
                    <span className="w-14 shrink-0 font-mono">{f.bits >= 1000 ? `${(f.bits / 1000).toFixed(1)}k bit` : `${f.bits} bit`}</span>
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">the ingress law</p>
              <ul className="mt-2.5 space-y-1.5 text-[11px] leading-relaxed text-zinc-400">
                <li>· typed, bounded, closed-vocabulary projections only</li>
                <li>· no imperative fields — nothing an instruction parser would consume</li>
                <li>· no string interpolation of untrusted text into prompts</li>
                <li>· free prose gets a subagent fork and a schema-attested exit (Theorem 8)</li>
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                APPA already moves this direction — its Autonomy projection categorizes records so untrusted content
                cannot promote itself to important. O2 is the same move, made an ingress-wide law with a number
                attached.
              </p>
            </div>
          </div>
        </div>
      </LabShell>
    </Section>
  );
}
