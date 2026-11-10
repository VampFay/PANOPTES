/**
 * Tests for Server Multi-Tenancy, Bounded Ledger, and Resource Caps (Limits #10, #11).
 */

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { BoundedLedger } from '../src/server';
import { makeLabel } from '../src/core/label';

const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;
let proc: Bun.Subprocess | null = null;

async function waitReady(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('sidecar did not become ready');
}

beforeAll(async () => {
  proc = Bun.spawn(
    ['bun', 'run', 'src/cli.ts', 'serve', '--policy', 'examples/policies/bench.json', '--port', String(PORT), '--silent-notes'],
    { stdout: 'pipe', stderr: 'pipe', cwd: import.meta.dir + '/..' },
  );
  try {
    await waitReady();
  } catch (err) {
    proc.kill();
    throw err;
  }
}, 30_000);

afterAll(() => {
  proc?.kill();
});

describe('BoundedLedger unit test', () => {
  test('evicts oldest clean entry before tainted entries, ratchets fail-closed on overflow', () => {
    let faulted = false;
    const ledger = new BoundedLedger(3, () => {
      faulted = true;
    });

    const cleanLabel = makeLabel(2, ['public']);
    const taintedLabel = makeLabel(2, ['hr@corp.example']);

    // Insert 1 clean, 2 tainted
    ledger.set('clean1', { label: cleanLabel, digest: 'd1' });
    ledger.set('tainted1', { label: taintedLabel, digest: 'd2' });
    ledger.set('tainted2', { label: taintedLabel, digest: 'd3' });
    expect(ledger.size).toBe(3);

    // Insert a 4th entry (tainted): clean1 should be evicted first!
    ledger.set('tainted3', { label: taintedLabel, digest: 'd4' });
    expect(ledger.size).toBe(3);
    expect(ledger.has('clean1')).toBe(false);
    expect(ledger.has('tainted1')).toBe(true);
    expect(ledger.has('tainted2')).toBe(true);
    expect(ledger.has('tainted3')).toBe(true);
    expect(faulted).toBe(false);

    // Insert a 5th entry when all remaining 3 are tainted: triggers overflow callback
    ledger.set('tainted4', { label: taintedLabel, digest: 'd5' });
    expect(ledger.size).toBe(3);
    expect(faulted).toBe(true);
  });
});

describe('Sidecar Multi-Tenancy & Resource Hardening', () => {
  test('payload exceeding 1 MB returns 413 Payload Too Large', async () => {
    const hugeBody = JSON.stringify({ junk: 'a'.repeat(1_050_000) });
    const res = await fetch(`${BASE}/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: hugeBody,
    });
    expect(res.status).toBe(413);
  });

  test('multi-tenancy isolates sharedLedger between tenant-A and tenant-B', async () => {
    // Tenant A session: narrow audience and write to shared ledger
    const resA1 = await fetch(`${BASE}/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panoptes-tenant': 'tenant-alpha' },
      body: JSON.stringify({}),
    });
    expect(resA1.status).toBe(201);
    const { sessionId: sA1 } = (await resA1.json()) as { sessionId: string };

    await fetch(`${BASE}/v1/sessions/${sA1}/observe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panoptes-tenant': 'tenant-alpha' },
      body: JSON.stringify({
        tool: 'mcp/files/read',
        args: { path: '/hr/alpha.txt' },
        output: 'payroll confidential',
      }),
    });

    await fetch(`${BASE}/v1/sessions/${sA1}/observe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panoptes-tenant': 'tenant-alpha' },
      body: JSON.stringify({
        tool: 'mcp/memory/write',
        args: { key: 'secret_slot', value: 'payroll summary' },
        output: 'ok',
      }),
    });

    // Tenant B fresh session reads secret_slot: tenant-alpha taint does NOT carry over to tenant-beta!
    const resB = await fetch(`${BASE}/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panoptes-tenant': 'tenant-beta' },
      body: JSON.stringify({}),
    });
    const { sessionId: sB } = (await resB.json()) as { sessionId: string };

    const checkB = await fetch(`${BASE}/v1/sessions/${sB}/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panoptes-tenant': 'tenant-beta' },
      body: JSON.stringify({
        tool: 'mcp/memory/read',
        args: { key: 'secret_slot' },
      }),
    });
    // For tenant-beta, secret_slot does not exist in their ledger, so no O4-ledger narrowing!
    const checkBData = (await checkB.json()) as { decision: string };
    expect(checkBData.decision).toBe('allow');

    // Tenant A second session reads secret_slot: taint carries over within tenant-alpha!
    const resA2 = await fetch(`${BASE}/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panoptes-tenant': 'tenant-alpha' },
      body: JSON.stringify({}),
    });
    const { sessionId: sA2 } = (await resA2.json()) as { sessionId: string };

    const checkA2 = await fetch(`${BASE}/v1/sessions/${sA2}/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panoptes-tenant': 'tenant-alpha' },
      body: JSON.stringify({
        tool: 'mcp/memory/read',
        args: { key: 'secret_slot' },
      }),
    });
    expect(checkA2.status).toBe(200);

    // Mismatched tenant header access returns 404
    const mismatch = await fetch(`${BASE}/v1/sessions/${sA1}`, {
      headers: { 'x-panoptes-tenant': 'tenant-beta' },
    });
    expect(mismatch.status).toBe(404);
  });
});
