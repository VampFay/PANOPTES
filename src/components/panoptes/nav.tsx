'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { FileDown, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BrandMark } from './brand';

export const NAV_ITEMS = [
  { href: '#overview', n: '01', label: 'Overview' },
  { href: '#landscape', n: '02', label: 'Incident' },
  { href: '#appa', n: '03', label: 'Algebra' },
  { href: '#lattice', n: '04', label: 'Labs' },
  { href: '#flaws', n: '05', label: 'Flaws' },
  { href: '#walls', n: '06', label: 'Walls' },
  { href: '#panoptes', n: '07', label: 'Organs' },
  { href: '#prototype', n: '08', label: 'Prototype' },
  { href: '#external', n: '09', label: 'External' },
  { href: '#scale', n: '10', label: 'Scale' },
  { href: '#guide', n: '11', label: 'Guide' },
  { href: '#roadmap', n: '12', label: 'Roadmap' },
];

const TELEMETRY = [
  'policy.eval :: meet({agent·finance},{agent·finance}) = {agent·finance} · t=1 → ALLOW',
  'ratchet :: trust 0.80 → 0.50 · memory fault 17/50 → fail-closed',
  'cni.adjudicate :: E[I|do(canary)] ≠ E[I|do(∅)] → DIVERT → quarantine',
  'canary :: p_detect 0.993 · n=40 · hypergeom CI 95% → immunized',
  'economics :: EV = C·E·T·H = $2.40 < cost $9.00 → adversary folds',
  'injection.channel :: capacity 0 bits · schema sealed · prose 6.5 bits/sym',
  'escrow :: quorum 3-of-5 · t+2 · settled without rollback',
  'transclusion :: inert projection Δ(capability) = 0 → no tool gain',
  'n-version :: 5 independent laws · 2 dissent → human gavel',
  'watchman :: all eyes open · no single crown jewel',
];

export function Nav() {
  const [active, setActive] = useState('overview');
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const sectionsRef = useRef<Map<string, HTMLElement>>(new Map());

  /* cache section elements once; track active via IntersectionObserver */
  useEffect(() => {
    const map = sectionsRef.current;
    NAV_ITEMS.forEach((item) => {
      const el = document.querySelector(item.href);
      if (el instanceof HTMLElement) map.set(item.href.slice(1), el);
    });

    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).id;
          if (e.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        // pick the first nav item that is visible (document order)
        for (const item of NAV_ITEMS) {
          if (visible.has(item.href.slice(1))) {
            setActive(item.href.slice(1));
            break;
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );
    map.forEach((el) => io.observe(el));

    return () => {
      window.removeEventListener('scroll', onScroll);
      io.disconnect();
      map.clear();
    };
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled ? 'bg-zinc-950/92 backdrop-blur-md' : 'bg-zinc-950/60 backdrop-blur-sm',
      )}
    >
      {/* scroll progress — right ascension rail */}
      <motion.div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px origin-left bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500/40"
        style={{ scaleX: progress }}
      />

      <div className="border-b border-zinc-800/70">
        <div className="mx-auto flex h-13 w-full max-w-6xl items-center gap-3 px-4 py-2 md:px-6">
          <a href="#overview" className="group flex shrink-0 items-center gap-2.5" aria-label="PANOPTES — back to overview">
            <BrandMark className="h-9 w-9 transition-transform duration-500 ease-out group-hover:scale-[1.06]" />
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-display text-[17px] tracking-[0.2em] text-zinc-100">PANOPTES</span>
              <span className="mt-1 font-mono text-[9px] tracking-[0.22em] text-zinc-500 uppercase">observatory of argus</span>
            </span>
          </a>

          <nav
            className="scroll-thin ml-2 hidden flex-1 items-center gap-1 overflow-x-auto lg:flex"
            aria-label="Section navigation"
          >
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-current={active === item.href.slice(1) ? 'true' : undefined}
                className={cn(
                  'group relative whitespace-nowrap border border-transparent px-2.5 py-1.5 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors',
                  active === item.href.slice(1)
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                <span className={cn('mr-1.5', active === item.href.slice(1) ? 'text-amber-500' : 'text-zinc-700')}>
                  {item.n}
                </span>
                {item.label}
              </a>
            ))}
          </nav>

          {/* mobile: section menu button */}
          <div className="ml-2 flex flex-1 items-center justify-end lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close section menu' : 'Open section menu'}
              className={cn(
                'flex h-8 w-8 items-center justify-center border transition-colors',
                menuOpen
                  ? 'border-amber-500/45 bg-amber-500/10 text-amber-300'
                  : 'border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200',
              )}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>

          <Button
            asChild
            size="sm"
            className="h-8 shrink-0 border border-amber-500/50 bg-amber-500/15 font-mono text-[11px] font-semibold tracking-[0.12em] text-amber-300 uppercase shadow-none hover:bg-amber-500/25"
          >
            <a href="#paper">
              <FileDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Paper</span>
            </a>
          </Button>
        </div>

        {/* mobile section sheet — all twelve sections, one tap */}
        {menuOpen && (
          <nav
            className="border-t border-zinc-800/70 bg-zinc-950/97 backdrop-blur-md lg:hidden"
            aria-label="All sections"
          >
            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-zinc-800/60 px-0 py-0 sm:grid-cols-3">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active === item.href.slice(1) ? 'true' : undefined}
                  className={cn(
                    'flex items-center gap-2 bg-zinc-950 px-4 py-3 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors',
                    active === item.href.slice(1) ? 'text-amber-300' : 'text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  <span className={cn(active === item.href.slice(1) ? 'text-amber-500' : 'text-zinc-700')}>{item.n}</span>
                  {item.label}
                </a>
              ))}
            </div>
          </nav>
        )}
      </div>

      {/* simulated telemetry strip — pedagogical flavor only, not measurements */}
      <div className="hidden border-b border-zinc-800/70 bg-zinc-950/80 md:block">
        <div className="ticker-mask relative flex h-7 items-center overflow-hidden">
          <span className="absolute left-0 z-10 flex items-center gap-2 border-r border-zinc-800 bg-zinc-950 px-3 py-1 font-mono text-[9px] tracking-[0.2em] text-zinc-500 uppercase">
            <span className="led led-pulse text-emerald-400" aria-hidden />
            sim telemetry
          </span>
          <div className="animate-ticker flex whitespace-nowrap pl-44 font-mono text-[10px] text-zinc-500">
            {[...TELEMETRY, ...TELEMETRY].map((t, i) => (
              <span key={i} className="mx-6 inline-flex items-center gap-2">
                <span className="text-zinc-700">◆</span>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
