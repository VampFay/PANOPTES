/**
 * PANOPTES prototype core — label lattice (whitepaper Def 1–2, mirrored to
 * OpenAPPA's policy semantics: trust chain + audience sets).
 *
 * Pure TypeScript, no DOM/React imports — usable from the dashboard, the test
 * suite (bun test), and the benchmark scripts (bun run scripts/...).
 */

// ------------------------------------------------------------------ trust
/** Trust ranks in chain order: suspicious < vendor < internal. */
export const TRUST_CHAIN = ['suspicious', 'vendor', 'internal'] as const;
export type TrustName = (typeof TRUST_CHAIN)[number];
export type Trust = number; // index into TRUST_CHAIN; higher = more trusted

export const TRUST: Record<TrustName, Trust> = {
  suspicious: 0,
  vendor: 1,
  internal: 2,
};

export function trustName(t: Trust): TrustName {
  return TRUST_CHAIN[Math.max(0, Math.min(TRUST_CHAIN.length - 1, t))];
}

// ----------------------------------------------------------------- labels
/**
 * A flow label: which readers may see the data (audience) and how much the
 * trajectory trusts it. Mirrors APPA's boundary {trust, audience} + deltas.
 * The restriction order: label A ⊑ B (A at-least-as-restrictive-as B) iff
 * A.trust ≤ B.trust AND B.audience ⊆ A.audience (A is narrower).
 */
export type Label = {
  readonly trust: Trust;
  readonly audience: ReadonlySet<string>;
};

export const PUBLIC_LABEL: Label = { trust: TRUST.internal, audience: new Set(['public']) };

export function makeLabel(trust: Trust, audience: readonly string[]): Label {
  return { trust, audience: new Set(audience) };
}

export function labelsEqual(a: Label, b: Label): boolean {
  if (a.trust !== b.trust) return false;
  if (a.audience.size !== b.audience.size) return false;
  for (const r of a.audience) if (!b.audience.has(r)) return false;
  return true;
}

/**
 * meet (glb) in the restriction lattice — the label two contributions flow
 * at jointly: weakest trust, narrowest audience. This is APPA's label
 * accumulation ("no authority may widen"), and PANOPTES' ratchet within a
 * session: meet(g, x) ⊑ g for every x — monotone degradation.
 */
export function meet(a: Label, b: Label): Label {
  const trust = Math.min(a.trust, b.trust);
  const audience = new Set<string>();
  for (const r of a.audience) if (b.audience.has(r)) audience.add(r);
  // Empty intersection: nobody may read it — represent as the empty audience.
  return { trust, audience };
}

/** join (lub) — least restrictive label above both. Used by tests to verify
 *  the lattice laws; the engine itself only ever meets. */
export function join(a: Label, b: Label): Label {
  const trust = Math.max(a.trust, b.trust);
  const audience = new Set([...a.audience, ...b.audience]);
  return { trust, audience };
}

/**
 * Gate check (whitepaper Def 2 / APPA `requires`): may a trajectory labeled
 * `flow` use a tool that `requires` a trust floor and that every reader in
 * `requiredAudience` can read the data?
 *
 *   flowsTo(flow, gate) ⇔ flow.trust ≥ gate.trust ∧ requiredAudience ⊆ flow.audience
 *
 * `public` is the top of the built-in audience chain (self ⊆ internal ⊆
 * public), so a public-readable flow satisfies any recipient requirement —
 * this mirrors the real binary (secret-stays-inside: mail to x@other.com is
 * allowed before the HR read narrows the audience).
 */
export function audienceCanRead(flow: Label, reader: string): boolean {
  return flow.audience.has(reader) || flow.audience.has('public');
}

export function flowsTo(flow: Label, gate: { trust: Trust; audience: readonly string[] }): boolean {
  if (flow.trust < gate.trust) return false;
  for (const r of gate.audience) if (!audienceCanRead(flow, r)) return false;
  return true;
}

/** Is `a` at least as restrictive as `b`? (the ⊑ of the restriction lattice) */
export function atLeastAsRestrictive(a: Label, b: Label): boolean {
  return a.trust <= b.trust && containsAll(b.audience, a.audience);
}

export function containsAll(sup: ReadonlySet<string>, sub: ReadonlySet<string>): boolean {
  for (const r of sub) if (!sup.has(r)) return false;
  return true;
}
