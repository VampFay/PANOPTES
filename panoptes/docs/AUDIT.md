# Full-Codebase Audit — panoptes-core v1.1.0 → v1.2.0

Date: 2026-10-04 · Scope: every file under `panoptes/` (engine, product
surface, tools, tests, docs) plus the dashboard's vendored engine mirror
(`src/lib/panoptes-core/`) and bench corpus.

Method: full read of all 20 source modules (~6,300 lines), `tsc --noEmit`
on both projects, complete test suites re-run, empirical reproduction of
every suspected defect (`tools/audit-repro.ts`), and a fresh 20M-decision
soak + 3.5M-probe red-team on the fixed build.

## Verdict

One security-relevant interdiction bypass (confirmed empirically, fixed,
regression-tested), one stale engine mirror, one compile error, one version
drift, and four hardening classes. No failures in the 97 pre-existing
tests were hiding any of it — the corpus simply never exercised decimal
secrets, which is exactly the kind of blind spot an audit exists to find.

## Findings

### F-1 · O4-canary decimal evasion — FIXED (security)

`enrollWorldCanaries` enrolled numeric secrets by stripping `[ , . / ]`
from maximal digit runs (`/\d[\d,.]*\d/` → `91,204.50` became key
`9120450`). `scanSink` matched `/\d[\d,]{2,}\d/` — a regex that cannot
cross a decimal point — so egress carrying `91,204.50` produced candidate
`91204` and **passed the interdiction**. Every decimal-bearing numeric
secret (salary with cents, account balance, invoice total) was scannable
but not interceptable. Reproduced: `tools/audit-repro.ts` cases 1–2
(ALLOW before the fix). Neither the 40-scenario corpus nor the red-team
harness ever enrolls a decimal secret, which is why 97/97 tests stayed
green with the bug present.

Fix: the sink scan now mirrors enrollment exactly (maximal `[0-9,.]` runs,
separators stripped), plus each ≥4-digit separator-delimited sub-run is
checked — closing the comma-juxtaposition variant (separately enrolled
`1234` and `5678` printed as `1234,5678`). The `[redacted]` remedy path
uses the same matcher, so redacted payloads still re-enter the gate clean.
Regression tests: `tests/hardening.test.ts` F-1/F-2 (deny + organ
attribution + remedy round-trip + no new false positives on benign
decimals/version strings).

### F-2 · Dashboard engine mirror desync — FIXED

The dashboard's vendored engine (`src/lib/panoptes-core/v2.ts`) predated
the v1.0 rotation feature (`addCanary`, `rotateCanaries`,
`canaryGeneration`, seed-canary survival) and the v1.1 `mcp/memory/*`
naming fix. The in-browser demos were silently running an older engine
than the one benchmarked and shipped. Both copies are now byte-identical
(v2, screen, index) and will be re-synced on every engine change.

### F-3 · 32-bit FNV cache/dedup keys — HARDENED

`screenCacheKey` (screen verdict cache + quarantine dedup) and the ledger
`digest` used single 32-bit FNV-1a. FNV-1a is not collision-resistant —
targeted collisions are computable offline by arithmetic on the hash's
polynomial structure. Consequences under an attacker who can influence
tool output: alias a benign verdict onto an injected content's cache slot,
or suppress quarantine registration by colliding with an
already-registered source key. Both are now 96-bit composites (three
independent accumulators, one pass, ~2 extra multiply-xors per char);
injectivity property-tested over 200k distinct inputs.

### F-4 · Unbounded screen cache — HARDENED

The per-session verdict cache grew with unique observed outputs; an
adversarial unique-output stream was an in-session memory amplifier.
Bounded at 8,192 entries (oldest evicted). Churn/heap gates re-verified.

### F-5 · Sidecar network posture — HARDENED

`serve` bound all interfaces while the docs said "keep the port inside the
agent host's trust domain". Now binds `127.0.0.1` by default (`--host` /
`PANOPTES_HOST` to override deliberately). Bearer-token comparison is
constant-time (was `===`, leaking match length). The session table is
bounded (`--max-sessions`, default 4,096, oldest evicted) against
session-creation floods.

### F-6 · Version drift — FIXED

`/healthz`, the MCP `initialize` server info, and the OpenAPI spec
hardcoded `1.0.0` while the package shipped `1.1.0`. Single source now:
`src/version.ts`.

### F-7 · Dashboard corpus compile error — FIXED

`src/lib/bench/corpus.ts:282` — a union-of-object-literals not assignable
to `Record<string, string>` (strict TS). Annotated explicitly.

### F-8 · CLI argv fragility — FIXED

`collectArgPairs` re-parsed `process.argv` instead of the command's own
argument slice; programmatic invocation could collect wrong args. Now
parses `rest` directly.

## Non-blocking observations (documented, not changed)

- `confine.ts findEchoes` span rendering can mis-align when a token
  normalizes to empty (cosmetic: the deny reason quotes a slightly offset
  span; the deny itself is unaffected).
- `policy-load.loadPolicy` fallback masks the original read error with the
  fallback path's error (error-message quality only).
- `JsonlAuditSink` writes synchronously per event (durability choice; a
  buffered writer is a future optimization for high-volume audit streams).
- The frozen O5 screen's homoglyph/zero-width evasion (76.9% of mutated
  markers at scale) and the encoding-transform content gap (49.9% of
  content-only trials) remain the documented honest gaps — compensated by
  the label lattice, quantified by `tools/redteam-scale.ts`.
- Residual numeric-canary limitation: an attacker who *changes the value*
  (not the formatting) of a secret evades exact-match interdiction by
  construction; that is inherent to substring canaries and is what the
  label lattice and rate limits are for.

## Enhancement / optimization / feature scope (post-audit backlog)

Prioritized, sized, and honest about what each buys:

1. **Buffered audit sink** (S) — batch JSONL writes with periodic flush;
   removes the last per-decision syscall from the audited hot path.
2. **`panoptes doctor`** (S) — policy lint beyond validation: warn on
   tools with no egress coverage, sinks without `sinkParams`, trust ranks
   used in `requires` but never produced by any delta, audience sets that
   can never read any declared store.
3. **MCP session GC + heartbeat** (M) — expire idle MCP sessions; the
   stdio host currently keeps every session alive for process lifetime.
4. **Policy hot-reload for the sidecar** (M) — watch the policy file and
   swap atomically per-session, so policy edits don't require a restart.
5. **`observe` latency in audit events** (S) — `decision` events carry
   `latencyUs`; adding it to `observation` events completes the forensic
   latency picture.
6. **Echo-gram cache invalidation on rotation** (S) — `echoGrams` is
   per-instance lazy; a long-lived parent with many forks recomputes once
   per child. Share the combined gram set across forks like `screenCache`.
7. **Numeric-canary normalization options** (M) — policy-declared numeric
   formats (e.g. IBAN spaces, last-4 matching) as an alternative to exact
   digit-run matching; trades FP surface for recall.
8. **OpenTelemetry span parentage** (S) — link fork sessions' spans to the
   parent trace for delegation forensics.

## Verification record (v1.2.0 build)

- `tsc --noEmit`: clean in the package and in the dashboard's `src/`.
- Tests: **108 pass / 0 fail** (97 pre-existing + 11
  hardening); dashboard suite **155 pass / 0 fail / 8,990 assertions**.
- Golden bench: all three arms match locked numbers (24/24 + 16/16,
  16/24 + 16/16, 20/24 + 12/16).
- Fresh 20M-decision soak: 594,169 dec/s (sibling run 615,128 — 2-CPU
  run-to-run band), mean 1.68 µs, p99 3.62 µs, soak degradation −9.3%,
  determinism byte-identical pre/post, 100K-session churn 0 mismatches,
  164K HTTP requests 0 errors, auth 1,000/1,000 rejected. Verdict PASS.
- Red-team at scale re-run: 3.5M probes, label-gated evasions 0/1,000,000,
  benign false positives 0/500,000. Verdict PASS.

Artifacts: `scripts/results-stress5.json`, `scripts/results-redteam-scale2.json`,
`tools/audit-repro.ts`, `tests/hardening.test.ts`.

## Post-audit follow-up (v1.2.1, same day)

Three residual findings from a second review pass were closed immediately:

1. **Key-string ambiguity** (M): the three hex segments of the 96-bit
   composite keys were concatenated unpadded — variable-length segments
   could re-split into the same key string. Fixed with `padStart(8,'0')`
   per segment in both `screenCacheKey` and the ledger digest; an
   adversarial 50k-case re-split search is now regression-tested.
2. **Sink-param drift** (M-L): the audience-gate declassifier defaulted
   to four sink params while canary/echo scans scanned five — fork-task
   text skipped the sanitizer fixed-point check. Defaults unified.
3. **MCP session cap** (M): the stdio server's session map was unbounded
   (the sidecar was capped in v1.2.0). Now mirrors `--max-sessions`
   semantics via `PANOPTES_MAX_SESSIONS`, oldest evicted.

Verification on the 1.2.1 build: `tsc` clean; **109 pass / 0 fail /
54,640 assertions**; goldens unchanged; fresh 20M-decision soak
615,270 dec/s, p99 3.44 µs, determinism byte-identical, 0 HTTP errors;
red-team at scale re-run 3.5M probes, 0/1M label evasions, 0/500K benign
false positives — verdict PASS.

## Deep External Audit & Hardening Release (v1.3.0)

A comprehensive external code audit and solutions architecture pass closed all six manual audit items (B-1..B-6), resolved the 11 Whitepaper Table 11 limitations, and implemented the P0–P4 roadmap:

### 1. External Audit Findings Closed (B-1 through B-6)
- **B-1 (piiRedactor & fixed-point declassification hardening)**: Added `/g` global flag to `DIGIT_TOKEN` in `corp-policy.ts` and hardened `check()` declassification so sanitizer fixed-point (`san.apply(payload) === payload`) requires explicit declassification provenance and never bypasses the audience gate when `O4-canary` or `O7-confine` triggers.
- **B-2 (O4-ledger MCP memory_write/read dual digest pinning)**: `observe('memory_write')` pins both `args.value` and `output` digests so MCP memory servers returning status on write and values on read verify without false `O6-ratchet` locks.
- **B-3 (Definition 2 prospective post-call label on egress delta.trust)**: `check()` computes prospective effective flow across both `delta.trust` and `delta.audience` on egress tools.
- **B-4 (O4-canary hyphen/slash numeric secret matching & whitespace-tolerant remedy)**: Extended numeric secret scanning across `/` and `-` separators and updated `redactAll()` for whitespace-split canaries.
- **B-5 (Parent-to-child quarantine inheritance on forkSession())**: Child trajectories inherit parent `suspiciousSources`, `suppressedTokens`, and `echoTokens`.
- **B-6 (Contiguous command-block quarantine in instructionRegions())**: Multi-sentence quarantine extends across short filler sentences (`<= 4` words) and directive continuations.

### 2. P0–P4 Capabilities Shipped
- **FIX-A**: Token-echo directive grammar & bracketed pseudo-system tags (20 patterns total: 16 base + 4 FIX-A).
- **FIX-B**: Stylized `echoTokens` floor (ALL-CAPS >= 5, emails, URLs, hyphen/underscore IDs >= 6) quarantined and blocked in `checkAnswer()` and sinks.
- **FIX-C**: Fail-closed `sanitizeAnswer(draft)` deterministic surgery on retry exhaustion.
- **M1/M2**: Structured `remedyPlan` (`remediedArgs`) auto-populated across non-routing parameters; `silentNotes` mode.
- **Dogwood-Class Gates**: Stateful contract gates (`inputMatchesOutput`, `maxCumulative`, `maxCalls`, `withinMs`).
- **Organ O3 Counterfactual Noninterference**: `checkCounterfactual` & `enrollSensitiveFacts`.
- **Evasion Hardening**: Fast `< 200 ns` `decodeCandidateViews()` (Base64, Hex, URL, reversed, ROT13) and confusable homoglyph/split-token normalization.
- **Enterprise Features**: `panoptes doctor` policy linter, `panoptes mcp-proxy` Streamable HTTP reverse proxy, multi-tenancy (`X-Panoptes-Tenant`), 65,536 bounded ledger cap, OTLP/CEF sinks, and dual Bun/Node.js runtime support.

### Verification Record (v1.3.0)
- `bun run typecheck`: clean across package and tests.
- Tests: **192 pass / 0 fail / 82,670 assertions** across 16 files in `panoptes/`; **87 pass / 0 fail / 4,502 assertions** in dashboard mirror suite.
- Formal lattice proofs: **9 pass / 0 fail / 27,551 assertions** (19,683 triples verified for commutativity, associativity, idempotence, monotonicity, and delegation noninterference).
- Python SDK: 7/7 tests passing with automatic `bun`/`node` runtime detection.
- Golden benchmarks preserved: 24/24 + 16/16, 16/24 + 16/16, 20/24 + 12/16.
- Hot-path decision latency: 1.46 µs mean per decision (p99 < 10 µs).
