import { describe, expect, test } from 'bun:test';
import { declarativePolicy, loadPolicy, globToRegExp, parseToolName, type PolicyFile } from '../src/policy-load';
import { Observatory } from '../src/core/v2';

const BASE: PolicyFile = {
  trustChain: ['suspicious', 'vendor', 'internal'],
  boundary: { trust: 'internal', audience: ['hr@corp.example', 'public'] },
  sensitiveStores: ['hr'],
  tools: [
    { name: 'mcp/files/read(path:/hr/*)', delta: { audience: ['hr@corp.example'] } },
    { name: 'mcp/files/read(path:/web/*)', delta: { trust: 'suspicious' } },
    { name: 'mcp/files/read' },
    { name: 'mcp/mail/send', egress: true, requires: { audience: { contains: ['$to'] } } },
  ],
};

describe('policy loading (declarative JSON -> engine)', () => {
  test('name-suffix selectors compile and resolve with first-match specificity', () => {
    const policy = declarativePolicy(BASE);
    const engine = new Observatory(policy, { organs: true });
    // /hr/ read narrows audience to hr
    engine.observe('mcp/files/read', { path: '/hr/payroll.csv' }, 'rows');
    expect([...engine.currentLabel.audience]).toEqual(['hr@corp.example']);
    // fresh session: /web/ read degrades trust
    engine.beginTrace();
    engine.observe('mcp/files/read', { path: '/web/forum.txt' }, 'hello');
    expect(policy.trustChain[engine.currentLabel.trust]).toBe('suspicious');
    // plain read leaves the boundary label alone
    engine.beginTrace();
    engine.observe('mcp/files/read', { path: '/crm/notes.txt' }, 'notes');
    expect(policy.trustChain[engine.currentLabel.trust]).toBe('internal');
  });

  test('explicit match rules AND together; non-matching selectors fall through to plain spec', () => {
    const policy = declarativePolicy({
      ...BASE,
      tools: [
        { name: 'mcp/files/read', match: [{ param: 'path', glob: '/sec/**' }], delta: { trust: 'suspicious' } },
        { name: 'mcp/files/read' },
      ],
    });
    const engine = new Observatory(policy, { organs: true });
    engine.observe('mcp/files/read', { path: '/sec/deep/nested/file.txt' }, 'x'); // ** crosses separators
    expect(policy.trustChain[engine.currentLabel.trust]).toBe('suspicious');
    engine.beginTrace();
    engine.observe('mcp/files/read', { path: '/sec/shallow.txt' }, 'x'); // still inside /sec/**
    expect(policy.trustChain[engine.currentLabel.trust]).toBe('suspicious');
    engine.beginTrace();
    engine.observe('mcp/files/read', { path: '/elsewhere/file.txt' }, 'x'); // outside the selector -> plain spec
    expect(policy.trustChain[engine.currentLabel.trust]).toBe('internal');
  });

  test('$param substitution resolves recipients from call args (public-as-universal)', () => {
    const policy = declarativePolicy(BASE);
    const engine = new Observatory(policy, { organs: true });
    // at the boundary the audience includes `public` — the universal reader —
    // so mail to anyone is allowed BEFORE anything narrows the flow (this
    // mirrors the real binary's secret-stays-inside ordering)
    const beforeNarrowing = engine.check('mcp/mail/send', { to: 'stranger@evil.example', body: 'hi' });
    expect(beforeNarrowing.decision).toBe('allow');
    // an /hr/ read narrows the audience to hr@corp.example...
    engine.observe('mcp/files/read', { path: '/hr/payroll.csv' }, 'rows');
    // ...and now the same mail to a stranger is denied while hr still reads
    const toStranger = engine.check('mcp/mail/send', { to: 'stranger@evil.example', body: 'hi' });
    expect(toStranger.decision).toBe('deny');
    expect(toStranger.reasons[0]!).toContain('audience gate');
    const toHr = engine.check('mcp/mail/send', { to: 'hr@corp.example', body: 'hi' });
    expect(toHr.decision).toBe('allow');
  });

  test('declarative sanitizers compile to redaction functions with fixed-point declassification', () => {
    const policy = declarativePolicy({
      ...BASE,
      sanitizers: [
        {
          name: 'amount-redactor',
          on: ['egress_remedy', 'fork_return'],
          permits: { audience: { from: ['hr@corp.example'], to: ['public'] } },
          redact: [{ pattern: '\\b\\d[\\d,.]{4,}\\d\\b', replacement: '[AMT]' }],
        },
      ],
    });
    const engine = new Observatory(policy, { organs: true });
    engine.observe('mcp/files/read', { path: '/hr/pay.csv' }, 'payroll'); // audience -> hr
    const dirty = engine.check('mcp/mail/send', { to: 'buddy@outside.example', body: 'payroll was 91,204 this quarter' });
    expect(dirty.decision).toBe('deny');
    expect(dirty.remedy).toBeDefined();
    expect(dirty.remedy!.sanitizer).toBe('amount-redactor');
    expect(dirty.remedy!.content).toContain('[AMT]');
    // a payload that is already a fixed point of the redactor is declassified
    const clean = engine.check('mcp/mail/send', { to: 'buddy@outside.example', body: 'payroll was [AMT] this quarter' });
    expect(clean.decision).toBe('allow');
  });

  test('validation rejects malformed policies with concrete errors', () => {
    expect(() => declarativePolicy({ ...BASE, trustChain: [] })).toThrow('trustChain');
    expect(() => declarativePolicy({ ...BASE, trustChain: ['internal'] })).toThrow('two ranks');
    expect(() => declarativePolicy({ ...BASE, trustChain: ['a', 'a'] })).toThrow('duplicate');
    expect(() => declarativePolicy({ ...BASE, boundary: { trust: 'nope', audience: ['x'] } })).toThrow('boundary.trust');
    expect(() => declarativePolicy({ ...BASE, boundary: { trust: 'internal', audience: [] } })).toThrow('audience');
    expect(() => declarativePolicy({ ...BASE, tools: [{ name: 't', delta: { trust: 'ghost' } }] })).toThrow('delta.trust');
    expect(() => declarativePolicy({ ...BASE, tools: [{ name: 't', requires: { trust: 'ghost' } }] })).toThrow('requires.trust');
  });

  test('loadPolicy reads and compiles from disk (example policies are valid)', () => {
    for (const p of ['examples/policies/bench.json', 'examples/policies/minimal.json']) {
      const policy = loadPolicy(p);
      expect(policy.tools.length).toBeGreaterThan(0);
      expect(policy.trustChain.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('glob compiler: * stays in segment, ** crosses, specials escaped', () => {
    expect(globToRegExp('/hr/*').test('/hr/salaries.csv')).toBe(true);
    expect(globToRegExp('/hr/*').test('/hr/deep/file.csv')).toBe(false);
    expect(globToRegExp('/sec/**').test('/sec/a/b/c.txt')).toBe(true);
    expect(globToRegExp('a.b').test('axb')).toBe(false);
    expect(globToRegExp('a.b').test('a.b')).toBe(true);
    expect(parseToolName('mcp/files/read(path:/hr/*)')).toEqual({
      base: 'mcp/files/read',
      rules: [{ param: 'path', glob: '/hr/*' }],
    });
    expect(parseToolName('mcp/files/read')).toEqual({ base: 'mcp/files/read', rules: [] });
  });

  test('unknown tools fail closed through the loaded policy', () => {
    const engine = new Observatory(declarativePolicy(BASE), { organs: true });
    const verdict = engine.check('mcp/ghost/tool', {});
    expect(verdict.decision).toBe('deny');
    expect(verdict.reasons[0]!).toContain('unknown tool');
  });
});
