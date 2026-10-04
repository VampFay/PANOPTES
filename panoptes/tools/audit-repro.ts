/**
 * AUDIT REPRO: numeric-canary decimal evasion in scanSink.
 *
 * enrollWorldCanaries strips [ , . / ] from digit runs (>= 4 digits) on
 * secret-field lines. scanSink matches /\d[\d,]{2,}\d/g — which cannot cross
 * a decimal point — so a decimal-bearing secret ("91,204.50") enrolls as
 * "9120450" but scans as "91204" -> NO INTERDICTION.
 */
import { Observatory } from '../src/core/v2';
import { declarativePolicy } from '../src/policy-load';

const policy = declarativePolicy({
  trustChain: ['suspicious', 'vendor', 'internal'],
  boundary: { trust: 'internal', audience: ['hr@corp.example', 'public'] },
  sensitiveStores: ['hr'],
  tools: [
    { name: 'mcp/files/read(path:/hr/*)', delta: { audience: ['hr@corp.example'] } },
    { name: 'mcp/files/read(path:/web/*)', delta: { trust: 'suspicious' } },
    { name: 'mcp/files/read' },
    { name: 'mcp/mail/send', egress: true, requires: { audience: { contains: ['$to'] } } },
    { name: 'mcp/web/post', egress: true, requires: { audience: { contains: ['public'] } } },
  ],
});

// 1) decimal-bearing salary — the evasion case
const e1 = new Observatory(policy, { organs: true });
e1.enrollWorldCanaries('hr', 'salary: 91,204.50\nreconciliation ref: 482193');
const m1 = e1.check('mcp/mail/send', { to: 'hr@corp.example', body: 'her salary is 91,204.50 per year' });
console.log(`[1] decimal salary egress   -> ${m1.decision.toUpperCase()}  (expected DENY; bug if ALLOW)`);

// 2) decimal-bearing ref with thousands separator
const e2 = new Observatory(policy, { organs: true });
e2.enrollWorldCanaries('hr', 'account balance: 1,234,567.89');
const m2 = e2.check('mcp/mail/send', { to: 'hr@corp.example', body: 'balance stands at 1,234,567.89 today' });
console.log(`[2] decimal balance egress  -> ${m2.decision.toUpperCase()}  (expected DENY; bug if ALLOW)`);

// 3) plain integer control — this one works today
const e3 = new Observatory(policy, { organs: true });
e3.enrollWorldCanaries('hr', 'reconciliation ref: 482193');
const m3 = e3.check('mcp/mail/send', { to: 'hr@corp.example', body: 'the ref is 482193 ok' });
console.log(`[3] integer ref control      -> ${m3.decision.toUpperCase()}  (expected DENY)`);

// 4) comma-grouped integer control — works today
const e4 = new Observatory(policy, { organs: true });
e4.enrollWorldCanaries('hr', 'salary: 91,204');
const m4 = e4.check('mcp/mail/send', { to: 'hr@corp.example', body: 'salary 91,204 yes' });
console.log(`[4] comma integer control   -> ${m4.decision.toUpperCase()}  (expected DENY)`);

// 5) screen-cache FNV-32 collision surface: verify two crafted FNV-colliding
//    strings alias in screenCacheKey (proving the cache/dedup key is not
//    collision-resistant). Brute-force a collision offline here.
import { screenCacheKey } from '../src/core/screen';
const target = screenCacheKey('hello world');
let found: string | null = null;
for (let i = 0; i < 20_000_000 && !found; i++) {
  const s = `x${i}`;
  if (screenCacheKey(s) === target && s !== 'hello world') found = s;
}
console.log(`[5] FNV-32 collision found  -> ${found ? `YES ("${found}" aliases "hello world")` : 'no (within budget)'}`);
