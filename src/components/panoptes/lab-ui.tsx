'use client';

import { motion } from 'framer-motion';
import { FlaskConical } from 'lucide-react';
import { PROVENANCE_LABEL, type Provenance } from '@/lib/panoptes-data';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import type { Label } from '@/lib/sims';
import { trustName } from '@/lib/sims';

// ---------------------------------------------------------------- Section
const EASE_OUT = [0.21, 0.76, 0.24, 1] as const;

export function Section({
  id,
  index,
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  id: string;
  index?: string;
  eyebrow: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('relative scroll-mt-24 border-t border-zinc-800/70 py-16 md:py-24', className)}>
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55, ease: EASE_OUT }}
        >
          <div className="flex flex-wrap items-center gap-3">
            {index && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: 0.08, ease: EASE_OUT }}
                className="reticle inline-flex items-center border border-amber-500/30 bg-zinc-900/60 px-2 py-1 font-mono text-[11px] tracking-[0.2em] text-amber-400"
              >
                § {index}
              </motion.span>
            )}
            <motion.p
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: 0.05, ease: EASE_OUT }}
              className="font-mono text-[11px] tracking-[0.3em] text-amber-500/90 uppercase"
            >
              {eyebrow}
            </motion.p>
            <motion.span
              aria-hidden
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.8, delay: 0.15, ease: EASE_OUT }}
              className="hidden h-px flex-1 origin-left bg-gradient-to-r from-zinc-700/60 to-transparent md:block"
            />
          </div>
          <h2 className="mt-4 max-w-4xl font-display text-3xl leading-[1.05] tracking-tight text-zinc-100 md:text-[2.6rem] md:leading-[1.04]">
            {title}
          </h2>
          {lead && <p className="mt-5 max-w-3xl text-sm leading-relaxed text-zinc-400 md:text-[15px]">{lead}</p>}
        </motion.div>
        <motion.div
          className="mt-10"
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.65, delay: 0.12, ease: EASE_OUT }}
        >
          {children}
        </motion.div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ Provenance
const PROV_STYLES: Record<Provenance, string> = {
  paper: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
  'project page': 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  README: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  secondary: 'border-orange-500/35 bg-orange-500/10 text-orange-300',
  simulation: 'border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-300',
};

export function ProvBadge({ source, className }: { source: Provenance; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center border px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-wide uppercase',
        PROV_STYLES[source],
        className,
      )}
      title={PROVENANCE_LABEL[source]}
    >
      {PROVENANCE_LABEL[source]}
    </span>
  );
}

// ------------------------------------------------------------------ LabUI
export function LabShell({
  code,
  title,
  subtitle,
  children,
  footer,
}: {
  code: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="reticle panel-lift overflow-hidden border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3 md:px-5">
        <span className="border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.15em] text-amber-400">
          {code}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-100 md:text-[15px]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        <span className="inline-flex items-center gap-2 border border-fuchsia-500/35 bg-fuchsia-500/10 px-2 py-1 font-mono text-[10px] tracking-wide text-fuchsia-300 uppercase">
          <span className="led led-pulse" aria-hidden />
          live model
        </span>
      </div>
      <div className="p-4 md:p-5">{children}</div>
      {footer && (
        <div className="border-t border-zinc-800 bg-zinc-950/50 px-4 py-3 font-mono text-[11px] leading-relaxed text-zinc-500 md:px-5">
          {footer}
        </div>
      )}
    </div>
  );
}

export function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] tracking-wide text-zinc-300 uppercase">{label}</span>
        <span className="font-mono text-xs font-semibold text-amber-400">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(vals[0])}
        className="mt-2 [&_[data-slot=slider-range]]:bg-amber-500"
        aria-label={label}
      />
      {hint && <p className="mt-1 text-[11px] leading-snug text-zinc-500">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- verdicts
export function Verdict({
  kind,
  title,
  detail,
}: {
  kind: 'allow' | 'deny' | 'detect' | 'clean' | 'neutral';
  title: string;
  detail?: string;
}) {
  const styles = {
    allow: 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
    deny: 'border-rose-500/45 bg-rose-500/10 text-rose-300',
    detect: 'border-amber-500/45 bg-amber-500/10 text-amber-300',
    clean: 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
    neutral: 'border-zinc-700 bg-zinc-800/50 text-zinc-300',
  } as const;
  return (
    <div className={cn('border-l-2 border-y border-r px-3 py-2.5', styles[kind])}>
      <p className="font-mono text-[11px] font-semibold tracking-[0.15em] uppercase">{title}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed opacity-90">{detail}</p>}
    </div>
  );
}

// ------------------------------------------------------------- label view
export function LabelChips({ label, prev }: { label: Label; prev?: Label }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(['public', 'customer', 'support', 'finance', 'agent'] as const).map((a) => {
        const on = label.readers.includes(a);
        const wasOn = prev ? prev.readers.includes(a) : true;
        return (
          <span
            key={a}
            className={cn(
              'border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
              on
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : wasOn
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-400 line-through'
                  : 'border-zinc-700 bg-zinc-800/60 text-zinc-500 line-through',
            )}
          >
            {a}
          </span>
        );
      })}
      <span
        className={cn(
          'ml-1 border px-1.5 py-0.5 font-mono text-[10px]',
          label.trust === 1
            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
            : 'border-rose-500/40 bg-rose-500/15 text-rose-300',
        )}
      >
        t = {trustName(label.trust)}
      </span>
    </div>
  );
}

export function Formula({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        'block border border-zinc-800 border-l-2 border-l-amber-500/60 bg-zinc-950/70 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-300',
        className,
      )}
    >
      {children}
    </code>
  );
}
