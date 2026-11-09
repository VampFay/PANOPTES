# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versioning is semantic.

## [1.3.0] — 2026-10-22

Deep external audit & P0 hardening release: closes all six manual-audit findings
(B-1..B-6), ships the P0 memory-poison & utility-tax fixes (FIX-A, FIX-B, FIX-C,
M1, M2), adds Dogwood-class stateful trajectory gates (`inputMatchesOutput`,
`maxCumulative`, `maxCalls`, `withinMs`), and fixes the four benchmark harnesses.

### Fixed (Security & Correctness — External Audit B-1..B-6)
- **B-1 · `piiRedactor` & fixed-point declassification hardening**: added the
  missing `/g` global flag to `DIGIT_TOKEN` and inline PII clause matching in
  `src/bench/corp-policy.ts`; hardened `Observatory.check()` so a sanitizer
  fixed point (`san.apply(payload) === payload`) never bypasses the audience
  gate if `O4-canary` or `O7-confine` detects a secret or quarantined echo.
- **B-2 · `O4-ledger` dual value/output digest pinning**: `observe('memory_write')`
  now pins both `screenCacheKey(args.value)` and `screenCacheKey(output)`, so
  real MCP memory servers returning status strings on write and stored values
  on read verify cleanly without false-positive `O6-ratchet` locks.
- **B-3 · Prospective post-call label (`Definition 2`) on egress `delta.trust`**:
  `check()` now computes `effFlow = meet(this.flow, delta)` across both
  `delta.trust` and `delta.audience` on egress tools.
- **B-4 · `O4-canary` hyphen/slash numeric secret matching & whitespace-tolerant
  remedy**: extended numeric secret harvesting and scanning to cross `/` and `-`
  separators (whitelisting contextual calendar years on multi-number lines) and
  updated `redactAll()` to match whitespace-split canaries so `remedy.content`
  always re-checks clean.
- **B-5 · Parent-to-child quarantine inheritance on `forkSession()`**: child
  trajectories now inherit a snapshot of the parent's `suspiciousSources`,
  `suppressedTokens`, and `echoTokens` at fork time.
- **B-6 · Contiguous command-block quarantine in `instructionRegions()`**:
  extended sentence quarantine across short filler sentences (`<= 4` words) and
  directive continuations so 1-word dummy sentences (`"Understood."`) cannot
  push injected payloads outside the quarantine window.

### Added (P0 Roadmap & Competitive Capabilities)
- **FIX-A · Token-echo directive grammar**: added corpus-free unconditional and
  compliance/stylized-gated token-echo patterns and bracketed pseudo-system tag
  detection to `src/core/screen.ts`.
- **FIX-B · Stylized-token echo floor**: quarantined instruction regions now
  enroll distinctive stylized tokens (`echoTokens`: emails, URLs, ALL-CAPS >= 5,
  hyphen/underscore IDs >= 6) blocked on both `checkAnswer()` and `echoInSink()`.
- **FIX-C · Fail-closed `sanitizeAnswer(draft)`**: deterministic string surgery
  stripping commanded tokens, `echoTokens`, and verbatim 8-gram spans on retry
  exhaustion.
- **M1 & M2 · Structured `remedyPlan` & `silentNotes`**: every deny verdict now
  includes a structured `remedyPlan` object, and `V2Options.silentNotes`
  suppresses non-decision observation noise.
- **Dogwood-class stateful trajectory gates**: `Requires` now supports
  `inputMatchesOutput`, `maxCumulative`, `maxCalls`, and `withinMs`.
- **Transformed-secret & encoded canary interdiction (Limits #4 & #8)**: fast `<200ns`
  allocation-bounded `decodeCandidateViews()` decoding inline Base64, Hex, URL,
  reversed, and ROT13 candidate views across screen and egress scans.
- **Homoglyph & split-token normalization (Limit #5)**: expanded confusable lookalike
  table covering Cyrillic, Greek, and Latin small-caps, and regex collapsing of
  dot-, hyphen-, underscore-, and space-separated single-letter obfuscation.
- **Organ O3 Counterfactual Noninterference (Limit #6)**: added `checkCounterfactual()`
  and structured `(Entity, SecretAttribute)` tracking via `enrollSensitiveFacts()`.
- **Answer-channel hardening (Limit #7)**: `checkAnswerCanaries` runs candidate views
  and secret interdiction on final answer channel with sanitized draft surgery.
- **Dual Bun / Node.js runtime compatibility (Limit #9)**: zero-dependency Node.js
  (`>= 20`) HTTP shim in `src/server.ts` and `process.stdin` fallback in `src/mcp.ts`;
  Python SDK auto-detects `bun` or `node`.
- **Multi-tenancy & resource caps (Limits #10 & #11)**: isolated `sharedLedger` and
  session registry per tenant via `X-Panoptes-Tenant`, bounded ledger cap with clean-first
  eviction and overflow fail-closed ratchet, idle session TTL eviction, and 1 MB payload limit.
- **OTLP & CEF audit streaming (Limit #10)**: added `OtlpHttpAuditSink` and `CefAuditSink`
  with parent span linkage across session forks.
- **Executable formal lattice proofs (Limit #10)**: exhaustively verified finite lattice
  invariants (commutativity, associativity, idempotence across 19,683 triples, monotonicity,
  and delegation noninterference).
- **`panoptes doctor` (B-7 / BUG-08)**: comprehensive policy linting for selectors, regexes,
  unanchored sinks, unreachable trust ranks, and missing effects.
- **`panoptes mcp-proxy` (B-8 / BUG-09)**: transparent reverse proxy for stdio MCP servers
  with asynchronous tool dispatch eliminating closure races.
- **Policy hot-reload (BUG-10)**: `--watch` flag for sidecar policy hot-reloading via `fs.watch`.

## [1.2.1] — 2026-10-04

Post-audit hardening point release: key-string ambiguity closed, the
delegation-laundering sink gap unified, and the MCP session-flood guard
brought to parity with the sidecar. No golden verdicts change; all 109
tests stay green (108 pre-existing + the re-split regression); campaigns
re-run on this build.

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
- Tests: 109 pass / 0 fail / 54,640 assertions (goldens unchanged;
  re-verified on the tagged build — 11 files, ~1 s).
- Fresh extreme stress + red-team-at-scale campaigns re-run on 1.2.1;
  artifacts regenerated (`public/bench/*.json`).

## [1.2.0] — 2026-10-04

Full-codebase audit release: one interdiction bypass fixed, three classes
of hardening applied, version reporting unified. Every fix is
regression-tested in `tests/hardening.test.ts` (11 cases); the 40-scenario
golden benchmark and all prior suites stay green (108 tests / 0 fail),
and a fresh 20M-decision soak re-proves the performance floor
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
