// PANOPTES dashboard — simulation mathematics.
// These are pedagogical Monte-Carlo / closed-form models that IMPLEMENT the
// paper's formal definitions (lattice meet, gates, do-calculus leakage,
// Shannon capacity, canary detection, evolutionary red-teaming, mechanism
// design). They are labeled as simulations, distinct from the paper's data.

// ------------------------------------------------------------------ lattice
export interface Label {
  readers: string[]; // subset of AUDIENCES
  trust: number; // 0 = suspicious, 1 = trusted
}

export const AUDIENCES = ['public', 'customer', 'support', 'finance', 'agent'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const TRUST_NAMES = ['suspicious', 'trusted'] as const;

export const TOP_LABEL: Label = {
  readers: ['public', 'customer', 'support', 'finance', 'agent'],
  trust: 1,
};

/** Definition 1: component-wise meet — (R∩R', min(t,t')). */
export function meet(a: Label, b: Label): Label {
  return {
    readers: a.readers.filter((r) => b.readers.includes(r)),
    trust: Math.min(a.trust, b.trust),
  };
}

export function labelEq(a: Label, b: Label): boolean {
  return a.trust === b.trust && a.readers.length === b.readers.length && a.readers.every((r) => b.readers.includes(r));
}

export function labelLeq(a: Label, b: Label): boolean {
  // a ≤ b (a at least as restrictive)
  return a.readers.every((r) => b.readers.includes(r)) && a.trust <= b.trust;
}

export function trustName(t: number): string {
  return TRUST_NAMES[t] ?? `t=${t}`;
}

// -------------------------------------------------------------------- gates
export interface Gate {
  needReaders?: string[]; // audiences that must still be receivable
  minTrust?: number;
  desc: string;
}

export function gateCheck(l: Label, gate: Gate): { ok: boolean; reason: string } {
  const fails: string[] = [];
  if (gate.minTrust !== undefined && l.trust < gate.minTrust) {
    fails.push(`requires t ≥ ${trustName(gate.minTrust)}; session is ${trustName(l.trust)}`);
  }
  if (gate.needReaders) {
    const missing = gate.needReaders.filter((r) => !l.readers.includes(r));
    if (missing.length > 0) {
      fails.push(`R ∌ {${missing.join(', ')}} — audience${missing.length > 1 ? 's' : ''} ratcheted away`);
    }
  }
  return fails.length > 0 ? { ok: false, reason: fails.join('  ·  ') } : { ok: true, reason: 'prospective label satisfies the release requirement' };
}

// ------------------------------------------------------------ information
export function log2(x: number): number {
  return Math.log(x) / Math.LN2;
}

/** Binary entropy H2(p), bits. */
export function h2(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -p * log2(p) - (1 - p) * log2(1 - p);
}

/** Bits a binary decision channel carries per use: 1 − H2(p). */
export function bitsPerDecision(p: number): number {
  return 1 - h2(p);
}

/** KL divergence between two Bernoulli distributions (bits). */
export function klBinary(p: number, q: number): number {
  const pc = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  const qc = Math.min(Math.max(q, 1e-9), 1 - 1e-9);
  return pc * log2(pc / qc) + (1 - pc) * log2((1 - pc) / (1 - qc));
}

/** Total variation distance between two Bernoulli distributions. */
export function tvBinary(p: number, q: number): number {
  return Math.abs(p - q);
}

/**
 * Deterministic PRNG (mulberry32). Sims take an explicit seed so the SSR
 * pass and the client hydration pass compute IDENTICAL numbers — no
 * hydration mismatch — while "re-roll" buttons bump the seed for a fresh
 * Monte-Carlo draw. Default seed 42 keeps first paint reproducible.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_SIM_SEED = 42;

/** Binomial count of successes from an injected RNG. */
function binomialWith(n: number, p: number, rnd: () => number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rnd() < p) k++;
  return k;
}

/** Laplace-smoothed proportion. */
export function smooth(k: number, n: number): number {
  return (k + 0.5) / (n + 1);
}

// ------------------------------------------------------- CNI adjudication
export interface CniRun {
  pObserved: number; // empirical P(A | do(s))
  pReplay: number; // empirical P(A | do(s'))
  kl: number; // empirical KL, bits
  tv: number;
  klTrue: number;
  verdictLeak: boolean;
  observedA: number;
  observedN: number;
  replayA: number;
  replayN: number;
}

/**
 * Counterfactual noninterference adjudication (Definition 4 / §6.2).
 * The observed arm samples the agent's boundary decision m times under the
 * real secret; the replay arm re-derives the decision k times with the secret
 * swapped for an inert dummy. Leakage iff the divergence exceeds tolerance ε.
 */
export function runCni(pSecret: number, pDummy: number, m: number, k: number, eps: number, seed: number = DEFAULT_SIM_SEED): CniRun {
  const rnd = mulberry32(seed);
  const observedA = binomialWith(m, pSecret, rnd);
  const replayA = binomialWith(k, pDummy, rnd);
  const pObserved = observedA / m;
  const pReplay = replayA / k;
  const kl = klBinary(smooth(observedA, m), smooth(replayA, k));
  return {
    pObserved,
    pReplay,
    kl,
    tv: tvBinary(pObserved, pReplay),
    klTrue: klBinary(pSecret, pDummy),
    verdictLeak: kl > eps,
    observedA,
    observedN: m,
    replayA,
    replayN: k,
  };
}

// ------------------------------------------------------------- canaries
export interface CanaryParams {
  planted: number; // N canaries seeded in the corpus
  corpus: number; // M sensitive items total
  batch: number; // B items the attacker exfiltrates
  coverage: number; // c: prob a crossing canary trips the boundary
}

export interface CanaryResult {
  detectionRate: number;
  expectedCanaries: number;
  trials: number;
}

/** Monte-Carlo: P(detect) for a single exfil event drawing B items from M. */
export function canaryDetection(params: CanaryParams, trials = 4000, seed: number = DEFAULT_SIM_SEED): CanaryResult {
  const { planted, corpus, batch, coverage } = params;
  if (planted <= 0 || batch <= 0 || corpus <= 0) return { detectionRate: 0, expectedCanaries: 0, trials };
  const rnd = mulberry32(seed);
  let detected = 0;
  let canaryTotal = 0;
  for (let t = 0; t < trials; t++) {
    // hypergeometric draw of B items, count canaries
    let canaries = 0;
    let remaining = corpus;
    let remainingCanaries = planted;
    for (let i = 0; i < batch; i++) {
      if (rnd() < remainingCanaries / remaining) {
        canaries++;
        remainingCanaries--;
      }
      remaining--;
      if (remaining <= 0) break;
    }
    canaryTotal += canaries;
    if (canaries > 0 && rnd() < 1 - Math.pow(1 - coverage, canaries)) detected++;
  }
  return { detectionRate: detected / trials, expectedCanaries: canaryTotal / trials, trials };
}

// --------------------------------------------------- red-team evolution
export interface EvoParams {
  generations: number;
  population: number;
  mutation: number; // sd of mutant fitness noise
  patchStrength: number; // fraction of top variants neutralized each gen
}

export interface EvoResult {
  best: number[];
  mean: number[];
}

/**
 * Affinity maturation for policy (O4): a red-team population probes the
 * deployed policy; the most successful variants are patched out; survivors
 * mutate. Returns bypass-rate trajectories.
 */
export function evolutionSim(params: EvoParams, seed: number = DEFAULT_SIM_SEED): EvoResult {
  const { generations, population, mutation, patchStrength } = params;
  const rnd = mulberry32(seed);
  let pop: number[] = Array.from({ length: population }, () => rnd());
  const best: number[] = [];
  const mean: number[] = [];
  for (let g = 0; g < generations; g++) {
    pop.sort((a, b) => b - a);
    best.push(pop[0]);
    mean.push(pop.reduce((s, x) => s + x, 0) / pop.length);
    // patch gauntlet: neutralize the top slice (regression suite + rollback)
    const nPatch = Math.max(1, Math.round(population * patchStrength));
    for (let i = 0; i < nPatch && i < pop.length; i++) pop[i] = rnd() * 0.08; // neutralized survivors keep trace fitness
    // mutation: each agent spawns a mutant probing for a new gap
    pop = pop.map((f) => Math.min(1, Math.max(0, f + (rnd() * 2 - 1) * mutation)));
    // occasional fresh pathogen (novel attack class)
    if (rnd() < 0.25) pop[Math.floor(rnd() * pop.length)] = rnd();
  }
  return { best, mean };
}

// ------------------------------------------------------------- economics
export interface EconParams {
  pSuccess: number; // algebra + residue → attack succeeds
  pDetection: number; // canaries + CT logs → detected
  gain: number; // attacker's gross gain, $
  stake: number; // posted bond burned on verified misbehavior, $
  penalty: number; // penalties / restitution, $
  prepCost: number; // cost to prepare the attack, $
}

export function expectedValue(p: EconParams): number {
  return p.pSuccess * p.gain - p.pDetection * (p.stake + p.penalty) - p.prepCost;
}

// --------------------------------------------------------- channel capacity
export interface Field {
  id: string;
  name: string;
  vocab: number; // |Σ|
  cap: number; // n
}

/** Definition 3: C ≤ Σ nᵢ·log₂|Σᵢ| bits. */
export function channelCapacity(fields: Field[]): number {
  return fields.reduce((s, f) => s + (f.vocab > 1 ? f.cap * log2(f.vocab) : 0), 0);
}

export function formatBits(bits: number): string {
  if (bits >= 1e6) return `${(bits / 1e6).toFixed(2)} Mbit`;
  if (bits >= 1e3) return `${(bits / 1e3).toFixed(1)} kbit`;
  if (bits >= 100) return `${bits.toFixed(0)} bit`;
  return `${bits.toFixed(1)} bit`;
}

export function formatCount(n: number): string {
  if (n >= 1e12) return `2^${log2(n).toFixed(0)} (≈10^${(Math.log10(n)).toFixed(0)})`;
  if (n >= 1e6) return `≈${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `≈${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

// ------------------------------------------------------------------- misc
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
