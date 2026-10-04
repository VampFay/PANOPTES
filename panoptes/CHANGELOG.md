# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versioning is semantic.

## [1.2.1] — 2026-10-04

Post-audit hardening point release: key-string ambiguity closed, the
delegation-laundering sink gap unified, and the MCP session-flood guard
brought to parity with the sidecar. No golden verdicts change; all 108
tests stay green; campaigns re-run on this build.

### Fixed
- **96-bit key string ambiguity** (hardening follow-up): the three hex
  segments of `screenCacheKey` / ledger `digest` were concatenated
  unpadded, so variable-length segments could re-split into the same
  key string (e.g. `("abcdef","1234",…) == ("abcdef12","34",…)`).
  Segments are now zero-padded to full 8-char words — the composite is
  injective in string form, not just over the tested input space.
- **Audience-gate sink-param drift**: the declassifier check defaulted
  to `['body','content','summary','text']` while canary/echo scans
  included `'task'` — fork-task text (the delegation-laundering channel)
  skipped the sanitizer fixed-point release check. The default sink
  lists are now unified (all five params, everywhere).

### Hardened
- **MCP stdio session cap**: the sidecar's `--max-sessions` guard
  (default 4,096, oldest evicted) is now mirrored in the MCP server via
  `PANOPTES_MAX_SESSIONS` — session-creation floods can no longer grow
  the stdio session table without limit.

### Verification
- Tests: 108 pass / 0 fail / 4,640 assertions (goldens unchanged).
- Fresh extreme stress + red-team-at-scale campaigns re-run on 1.2.1;
  artifacts regenerated (`public/bench/*.json`).

## [1.2.0] — 2026-10-04

Full-codebase audit release: one interdiction bypass fixed, three classes
of hardening applied, version reporting unified. Every fix is
regression-tested in `tests/hardening.test.ts` (11 cases); the 40-scenario
golden benchmark and all prior suites stay green (108 tests / 4,640
assertions), and a fresh 20M-decision soak re-proves the performance floor
on the hardened build.

### Fixed
- **O4-canary decimal evasion** (security): enrollment stripped `[ , . / ]`
  from digit runs on secret-field lines, but the egress scan regex could
  not cross a decimal point — a secret enrolled as `91,204.50` (key
  `9120450`) scanned as `91204` and passed. Any decimal-bearing numeric
  secret (salaries with cents, account balances, invoice totals) evaded
  interdiction entirely. The scan now mirrors enrollment exactly (maximal
  `[0-9,.]` runs stripped of separators), and additionally checks each
  ≥4-digit separator-delimited sub-run, closing the comma-juxtaposition
  variant (`1234,5678` printed adjacent). The redaction remedy path was
  aligned with the same matching.
- **Dashboard engine mirror desync**: the in-browser engine copy lacked the
  canary-rotation APIs and the `mcp/memory/*` naming fix shipped in
  v1.0/1.1 — the demo engine and the released engine are now byte-identical.

### Hardened
- **96-bit composite cache/dedup keys**: `screenCacheKey` and the ledger
  digest used single 32-bit FNV-1a — algebraically invertible, so targeted
  collisions were cheap to craft offline (screen-verdict aliasing, quarantine
  registration suppression). Both are now three-accumulator composites
  computed in one pass; injectivity is property-tested over 200k distinct
  inputs.
- **Bounded screen verdict cache** (8,192 entries, oldest evicted): an
  adversarial stream of unique tool outputs can no longer grow engine
  memory without limit within a session.
- **Sidecar network posture**: `serve` binds `127.0.0.1` by default
  (matching the documented "keep the port inside the agent host's trust
  domain" guidance); `--host` / `PANOPTES_HOST` opts back in. Bearer-token
  comparison is constant-time. The session table is bounded
  (`--max-sessions`, default 4,096, oldest evicted) against
  session-creation floods.
- **Version single-source**: `src/version.ts` is now the one place the
  version lives; `/healthz`, the MCP `initialize` handshake, and the
  OpenAPI spec all report it (they previously hardcoded `1.0.0` while the
  package shipped `1.1.0`).

### Verification
- Fresh 20M-decision soak on the hardened build: 594,169 dec/s sustained
  (615,128 in the sibling run — 2-CPU box, run-to-run band), mean 1.68 µs,
  p99 3.62 µs, byte-identical determinism pre/post, 100K-session churn with
  0 mismatches, 164K HTTP requests with 0 errors, auth gate 1,000/1,000.
  The audit hardening costs single-digit-percent throughput, paid inside
  the same order of magnitude. Red-team at scale re-run: 3.5M probes,
  label-gated evasions 0/1M, benign false positives 0/500K.
- CLI `--arg` collection now parses the command's own argument slice
  (programmatic invocation no longer depends on `process.argv` shape).

## [1.1.0] — 2026-10-04

Recovery ergonomics: denials are no longer dead ends. Every deny now
carries structured, policy-introspective recovery guidance, and canary
interdictions offer a redacted payload the agent can send instead.

### Engine (`src/core/v2.ts`)
- `Mediation.recovery`: generic, scenario-agnostic recovery hints on every
  deny family — audience gates (re-order / fork-per-recipient), trust floors
  (delegate the untrusted reads to a child), effect prerequisites (names the
  tools that statically establish the missing effect), effect exclusions
  (one-shot semantics), authority fail-closed (dual-control guidance),
  echo confinement (paraphrase), ratchet (fresh session).
- `Mediation.remedy` on canary interdiction: the sink payload with every
  enrolled canary token, numeric secret, and commanded token replaced with
  `[redacted]` — offered for immediate re-dispatch; the redacted payload
  itself re-enters the gate clean.
- Hot-path discipline: shared hint-array instances (no per-deny allocation)
  and redaction only on the deny path. Measured cost on the 20M-decision
  soak: 612,329 dec/s vs 679,619 pre-feature (-9.9%); p99 3.34 us; all
  campaign gates still PASS (byte-identical determinism, 0 churn
  mismatches, 0 HTTP errors).

### Tests
- `tests/recovery.test.ts` (12 cases): every deny family carries hints; the
  redacted remedy passes re-check; and the two documented recovery patterns
  (fork-per-recipient, child-confined tainting read) complete end-to-end at
  engine level.

## [1.0.0] — 2026-10-04

First public release: the reference implementation of the PANOPTES
architecture, extracted from the research prototype and productized.

### Engine (`src/core/`)
- Label-lattice mediation engine (`Observatory`): trust chains, audience
  sets with `public` as the universal reader, parameter selectors, deltas,
  `requires` with `$param` substitution, effect prerequisites,
  annotator-consulted dynamic contracts, registered sanitizers with
  fixed-point declassification, escrowed authority consults.
- Immune organs: O4-ledger (cross-session memory taint), O4-canary
  (egress interdiction: synthetic canaries + numeric secrets from declared
  sensitive stores + commanded-token suppression), O5-screen (frozen
  16-pattern injection screen with instruction-region quarantine),
  O7-confine (bounded verbatim-echo denial on sinks, fork returns, and the
  answer channel), O7-authority, O6-ratchet (fail-closed integrity).
- Delegation noninterference: fork boundaries are the meet of parent flow
  and policy boundary (closes the empirically-discovered delegation
  laundering channel).
- **New in 1.0.0**: canary rotation — `addCanary()` and `rotateCanaries()`
  retire auto-enrolled synthetic canaries while operator seeds persist;
  generation counter exposed.

### Product surface
- Declarative JSON policies (`src/policy-load.ts`): OpenAPPA-style
  `tool(param:glob)` name selectors, explicit match rules, declarative
  redaction sanitizers, full validation errors.
- CLI (`panoptes`): `check` (policy validation + one-shot decisions),
  `describe`, `replay` (JSONL session traces), `bench` (40-scenario corpus
  vs golden numbers + latency micro-bench), `serve`, `mcp`, `version`.
- Audit stream (`src/audit.ts`): `AuditedSession` wrapper, JSONL sink,
  OpenTelemetry-compatible span envelopes, composite fan-out.
- Sidecar HTTP service (`src/server.ts`): session lifecycle, check /
  observe / answer / rotate endpoints, bearer auth, healthz/readyz,
  OpenAPI 3.1 spec at `/openapi.json`.
- MCP server (`src/mcp.ts`): stdio JSON-RPC 2.0 with session and mediation
  tools for any MCP client.
- Python SDK (`python/panoptes`): zero-dependency client (stdlib
  `urllib`) mirroring the REST API.
- Red-team harness (`tools/redteam.ts`): budgeted mutation adversary
  (homoglyph, encoding, casing, splitting, spacing mutations) measuring
  per-organ and full-stack evasion honestly.

### Evidence & tests
- 47 ported tests (lattice laws, gate semantics, organ mechanisms,
  40-scenario matrix, corp invariants, tau replay, laundering regression)
  plus new suites: audit, rotation, policy loading, server, MCP, red-team,
  and benchmark regression — **0 failures**.
- Golden benchmark numbers locked: 24/24 attacks + 16/16 benign
  (organs on), 16/24 + 16/16 (organs off — matches the real OpenAPPA
  v0.30.0 binary), 20/24 + 12/16 (blunt patch).
- Latency floor locked: full organ stack < 50 µs/decision regression bound
  (measured 0.64 µs mean hot-loop, 2.0 µs sustained under 2M-decision
  stress).

### Third-party material
- OpenAPPA's MIT-licensed bench/corp scenarios vendored under
  `corpus/corp/` for external-validation regression tests (see NOTICE).
