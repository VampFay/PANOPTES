import { describe, expect, test } from 'bun:test';
import { Observatory, type PolicyDoc } from '../src/core/v2';
import { declarativePolicy } from '../src/policy-load';

const POLICY: PolicyDoc = declarativePolicy({
  trustChain: ['suspicious', 'internal'],
  boundary: { trust: 'internal', audience: ['ops@example.com', 'public'] },
  sensitiveStores: ['hr'],
  tools: [
    { name: 'mcp/files/read' },
    { name: 'mcp/http/post', egress: true, requires: { audience: { contains: ['public'] } } },
  ],
});

describe('canary rotation (O4 lifecycle)', () => {
  test('rotation retires auto-enrolled synthetic canaries — old tokens stop matching', () => {
    const engine = new Observatory(POLICY, { organs: true });
    engine.enrollWorldCanaries('hr', 'decoy token: CANARY-old-token-42');
    // before rotation: the auto-enrolled canary interdicts
    const before = engine.check('mcp/http/post', { url: 'https://e.example', body: 'steal CANARY-old-token-42' });
    expect(before.decision).toBe('deny');
    expect(before.organs).toContain('O4-canary');

    const report = engine.rotateCanaries();
    expect(report.retired).toBe(1);
    expect(report.generation).toBe(1);

    const after = engine.check('mcp/http/post', { url: 'https://e.example', body: 'steal CANARY-old-token-42' });
    expect(after.decision).toBe('allow'); // retired token no longer matches

    // a fresh generation re-enrolls and interdicts again
    engine.enrollWorldCanaries('hr', 'decoy token: CANARY-new-token-99');
    const fresh = engine.check('mcp/http/post', { url: 'https://e.example', body: 'steal CANARY-new-token-99' });
    expect(fresh.decision).toBe('deny');
  });

  test('operator-seeded canaries survive rotation', () => {
    const engine = new Observatory(POLICY, { organs: true, canaries: ['CNRY-seed-0011'] });
    engine.enrollWorldCanaries('hr', 'decoy: CANARY-auto-777');
    const report = engine.rotateCanaries();
    expect(report.retired).toBe(1); // only the auto-enrolled one

    const seedStillArmed = engine.check('mcp/http/post', { url: 'https://e.example', body: 'exfil CNRY-seed-0011' });
    expect(seedStillArmed.decision).toBe('deny');
    const autoRetired = engine.check('mcp/http/post', { url: 'https://e.example', body: 'exfil CANARY-auto-777' });
    expect(autoRetired.decision).toBe('allow');
  });

  test('addCanary registers operator tokens that survive rotation', () => {
    const engine = new Observatory(POLICY, { organs: true });
    engine.addCanary('CNRY-op-4242');
    const first = engine.check('mcp/http/post', { url: 'https://e.example', body: 'x CNRY-op-4242' });
    expect(first.decision).toBe('deny');
    engine.rotateCanaries();
    const second = engine.check('mcp/http/post', { url: 'https://e.example', body: 'x CNRY-op-4242' });
    expect(second.decision).toBe('deny'); // seed persists
  });

  test('numeric secrets from sensitive stores NEVER rotate away', () => {
    const engine = new Observatory(POLICY, { organs: true });
    engine.enrollWorldCanaries('hr', 'reconciliation ref: 482193');
    engine.rotateCanaries();
    engine.rotateCanaries();
    const verdict = engine.check('mcp/http/post', { url: 'https://e.example', body: 'ref: 482193' });
    expect(verdict.decision).toBe('deny');
    expect(verdict.reasons[0]!).toContain('numeric secret');
  });

  test('rotation bumps the generation counter; forked children snapshot at fork (fail-safe)', () => {
    const engine = new Observatory(POLICY, { organs: true });
    engine.enrollWorldCanaries('hr', 'x: CANARY-gen-1');
    const child = engine.forkSession();
    expect(child.canaryGeneration).toBe(0);
    engine.rotateCanaries();
    expect(engine.canaryGeneration).toBe(1);
    // the forked child snapshotted the registry at fork time: its generation
    // stays at 0 and its snapshot still interdicts the pre-rotation token
    // (fail-safe — a fork never loses protection it was forked with)
    expect(child.canaryGeneration).toBe(0);
    const childVerdict = child.check('mcp/http/post', { url: 'https://e.example', body: 'x CANARY-gen-1' });
    expect(childVerdict.decision).toBe('deny');
    const parentVerdict = engine.check('mcp/http/post', { url: 'https://e.example', body: 'x CANARY-gen-1' });
    expect(parentVerdict.decision).toBe('allow'); // parent rotated it away
  });

  test('rotation is a no-op on the organs-off baseline arm', () => {
    const engine = new Observatory(POLICY, { organs: false });
    engine.enrollWorldCanaries('hr', 'CANARY-x'); // no-op when organs off
    const report = engine.rotateCanaries();
    expect(report.retired).toBe(0);
    expect(report.generation).toBe(0);
  });
});
