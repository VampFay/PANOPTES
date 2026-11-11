# PANOPTES

**Deterministic, survivable security mediation for LLM agents.**

PANOPTES mediates every tool call an agent makes through a **label lattice** (trust × audience) and layered **immune organs** — canary interdiction, injection screening, inert transduction, escrowed authority, and a cross-session taint ledger. Decisions are **deterministic** (same inputs, same verdict, every time), **auditable** (a structured decision record for every mediation), and **fast enough to sit in the agent's hot path** (microseconds per decision, measured — not estimated).

> An improvement over [OpenAPPA](https://github.com/archestra-ai/OpenAPPA): we reproduced both of its structural blind spots on the real v0.30.0 binary, then closed them at zero benign cost.

![version](https://img.shields.io/badge/panoptes--core-v1.3.2-8c5a2b?style=flat-square)
![tests](https://img.shields.io/badge/tests-229%20pass%20%C2%B7%2082%2C813%20assertions-4d7c5f?style=flat-square)
![benchmark](https://img.shields.io/badge/corpus-24%2F24%20attacks%20%C2%B7%2016%2F16%20benign-4d7c5f?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-6b7280?style=flat-square)
![runtime](https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.1%20%7C%20Node%20%E2%89%A5%2020-6b7280?style=flat-square)

## What's in this repo

A monorepo with two halves:

| Path | What it is |
|---|---|
| [`panoptes/`](panoptes/) | **panoptes-core v1.3.2** — the engine. Zero-dependency TypeScript (Bun / Node.js ≥ 20) package: policy engine, immune organs, CLI (`check` / `bench` / `replay` / `serve` / `mcp` / `doctor` / `mcp-proxy`), REST sidecar with OpenAPI & SSE live audit stream (`/v1/sessions/:id/audit/stream`), per-tenant token-bucket rate limiting, MCP stdio & reverse proxy server, Python SDK, 229-test suite (82,813 assertions), 20-scenario policy corpus, formal lattice proofs, full docs. |
| root (`src/`, `public/`, `deploy/`) | **The Observatory of Argus & Enterprise Deploy** — the interactive dashboard, production OCI Dockerfile, Kubernetes Helm chart (`deploy/helm/panoptes-sidecar/`), OpenTelemetry collector config, and verifiable benchmark artifacts. |

## Why

Agent guardrails today are caught in a **blind-or-blunt trap**:

- **Label-only engines** (trust + audience gates, e.g. OpenAPPA) are precise but blind to two structural attacks: *memory carryover* (poison persisted in session 1 re-enters session 2 unscarred) and *label betrayal* (content that lies about its own sensitivity sails through label gates). We reproduced both on the real OpenAPPA v0.30.0 binary — 16/24 attacks on our 40-scenario corpus.
- **Blunt patches** (annotate all memory reads as suspicious) close the blind spot but kill benign privileged memory flows — 4/4 benign breakage in the same corpus.
- **LLM judges** are accurate on informative narratives but non-deterministic, unauditable, and ~1,000,000× slower.

PANOPTES' organs close both blind spots at **zero benign cost** on the corpus — and every decision is a reproducible, auditable fact.

## The organs

| Organ | What it does |
|---|---|
| **O4-ledger** | Memory writes pin the write-time flow label; reads join it back — cross-session taint. |
| **O4-canary** | Egress sinks are scanned for canary tokens and numeric secrets from declared sensitive stores — content-side interdiction for when labels lie. |
| **O5-screen** | Deterministic instruction-injection screen on tool output; instruction regions are quarantined. |
| **O7-confine** | Inert transduction: untrusted sources may inform, but not be *quoted verbatim* into sinks, fork returns, or the final answer. |
| **O7-authority** | Escrowed dual control: authority-gated actions fail closed without a registered ruling. |
| **O6-ratchet** | Memory integrity faults degrade the session fail-closed — monotone, never self-heals. |

Since v1.1.0 every deny family also carries structured **recovery affordances** — policy-introspective hints naming the documented escape patterns (fork-per-recipient, child-confined reads, sanitized sends), plus a `[redacted]` canary payload the agent can dispatch instead — at a measured ~10% throughput cost.

In **v1.3.0**, recovery affordances are upgraded to machine-readable **`remedyPlan`** with auto-rewritten **`remediedArgs`** for immediate 1-step dispatch, fail-closed `sanitizeAnswer()` draft surgery, and `silentNotes` mode. Version 1.3.0 also adds **Organ O3 Counterfactual Noninterference** (`checkCounterfactual`), Dogwood-class stateful trajectory gates (`inputMatchesOutput`, `maxCumulative`, `maxCalls`, `withinMs`), multi-encoding & homoglyph normalization (`decodeCandidateViews`), `panoptes doctor`, and `panoptes mcp-proxy`.

In **v1.3.1 (Adversarial Hardening & Enterprise Readiness)**:
- **SEC-01 (Strict Cumulative Budget Gate)**: `parseStrictBudgetAmount` prevents negative-increment recharges, accounting parens `(5000)`, scientific notation `e/E`, multi-number strings (`"$10 (invoice #0)"`), and missing params from evading `maxCumulative`.
- **SEC-02 (Audience Parameter Hardening)**: `resolveAudienceReaders` splits on `[,;\n]+`, normalizes angle-bracket emails (`"Name <user@domain>"`), prevents dynamic parameter injection of the `'public'` wildcard, and fails closed on missing/empty `$param`.
- **SEC-03 (Multi-Tenant Isolation & Live Audit Streaming)**: Header validation (`/^[a-zA-Z0-9._-]{1,64}$/`), per-tenant bearer authentication (`--tenant-tokens`), per-tenant token-bucket rate limiting (`--rate-limit <rps>`), explicit session deletion (`DELETE /v1/sessions/:id`), and live Server-Sent Events (SSE) audit streaming (`GET /v1/sessions/:id/audit/stream`).
- **SEC-04 (Strict CEF Escaping)**: Standard ArcSight / Splunk CEF format header escaper (`\` -> `\\`, `|` -> `\|`, newlines -> `' '`) and extension value escaper (`\` -> `\\`, `=` -> `\=`, `\n` -> `\n`, `\r` -> `\r`).
- **SEC-05 (MCP Proxy State Preservation)**: Upstream MCP error responses (`isError: true` or `error: {...}`) never mutate budget or label state; raw error content is quarantined via `registerExternalSuspicious`.
- **SEC-06 (Counterfactual View Expansion)**: Expanded view decoding across Base64, hex, ROT13, and numeric sequences ensuring counterfactual noninterference catches encoded leaks.
- **Enterprise Deployment**: Multi-stage non-root OCI Dockerfile, Kubernetes Helm chart (`deploy/helm/panoptes-sidecar/`), and OpenTelemetry Collector configuration (`deploy/otel-collector-config.yaml`).

In **v1.3.2 (A+ Security Hardening & Enterprise Audit Seal)**:
- **VULN-SRV-01 (Fail-Closed Tenant Auth & Strict Identity Binding)**: `verifyTenantAuth` fails closed if `--tenant-tokens` is configured and an unlisted tenant is requested; `POST /v1/sessions` enforces strict parity between `X-Panoptes-Tenant` and `body.tenantId` (400 Bad Request on mismatch).
- **VULN-SRV-02 (Per-Tenant Isolated BoundedLedger & Eviction Quotas)**: Partitioned `BoundedLedger` per tenant prevents cross-tenant ledger starvation; `maxSessionsPerTenant` guarantees a single noisy tenant cannot evict another tenant's clean sessions or ledger state.
- **VULN-SCR-01 (Steganographic Prompt Injection via Plane-14 Tags)**: Unicode Plane-14 ASCII tags (`0xE0020..0xE007E`) are decoded before normalization strips invisible characters, catching steganographic prompt injections.
- **VULN-SCR-02 (Extended TR39 Confusables & 4-Layer BFS Decoder)**: Combining diacritic stripping (`NFD` -> `\p{M}` strip), dotless `ı`, Latin small caps (`ᴀ-ᴢ`), and 4-layer Breadth-First search decoding (`maxDepth=4`, `maxViews=32`) unwrapping stacked Base64, Hex, URL, and HTML entity encodings directly on raw input.
- **VULN-CONF-01 (Multilingual Secret Confinement in O7-Confine)**: Unicode-aware character segmentation for continuous CJK (Chinese/Japanese) and Arabic/Hebrew/Hindi/Cyrillic scripts ensuring foreign language verbatim quotes trip `ECHO_NGRAMS = 8`.
- **VULN-ENG-04 (Full-Argument Sink Scan & Routing Remedy Suppression)**: Scans all string arguments in tool egress regardless of `sinkParams`, and suppresses remedy if secrets/canaries appear in routing parameters (`url`, `to`, `dest`).
- **VULN-ENG-01 (Theorem 2 Noninterference in forkReturn)**: Enforces unconditional label meet on fork returns, preventing taint laundering across subagent execution boundaries.
- **VULN-ENG-02 (Proposition P1 Causal Invariance)**: `checkCounterfactual` verifies causal invariance across all control, routing, and financial parameters (`amount`, `shares`, `price`, etc.).

## Headline results

Five arms, one corpus, one harness, goldens replayed deterministically:

| Arm | Attacks blocked | Benign passed | Deterministic | Latency |
|---|---|---|---|---|
| **PANOPTES (organs on)** | **24/24 (100%)** | **16/16 (100%)** | **yes** | **~0.62 µs/decision** |
| LLM-as-judge | 24/24 (100%) | 16/16 (100%) | no | ~782 ms/call |
| OpenAPPA v0.30.0 binary | 16/24 (66.7%) | 16/16 (100%) | yes | ~2.1 ms/step amortized |
| APPA-baseline mirror | 16/24 (66.7%) | 16/16 (100%) | yes | sub-µs |
| Regex/DLP blocklist | 20/24 (83%) | 12/16 (75%) | yes | sub-µs |

Scale and adversarial evidence (v1.2.1 build, artifacts committed under [`public/bench/`](public/bench/)):

- **20,000,000-decision soak** — 615,270 decisions/s sustained, mean 1.63 µs, p99 3.44 µs, heap slope 1.09 MB/million decisions, byte-identical determinism pre/post, 0 HTTP errors across 164K sidecar requests. Verdict: PASS.
- **3,500,000-probe red-team campaign** — 0/1M label-gated evasions, 0/500K benign false positives. Verdict: PASS.
- **External corpora** — 0/853 golden-path false positives on tau-bench banking; 0/20 attacks leaked on OpenAPPA's corp corpus (matched-arm, the unmediated arm leaks 6/20); ATB autonomy benchmark at 76/78 episodes (LLM-judge quota-gated run completed 2026-10-21; 2 local egress controls pending, resumable).

## Quickstart

**The engine** (zero runtime dependencies, requires [Bun](https://bun.sh) ≥ 1.1 or Node.js ≥ 20):

```bash
cd panoptes
bun install
bun test                                   # 192 tests · 82,670 assertions
bun run src/cli.ts check examples/policies/bench.json
bun run src/cli.ts replay examples/policies/minimal.json examples/traces/three-step.jsonl
bun run src/cli.ts bench                   # 40-scenario corpus + goldens + latency
bun run src/cli.ts serve --policy examples/policies/bench.json --port 8787
bun run src/cli.ts mcp  --policy examples/policies/bench.json
bun run src/cli.ts doctor examples/policies/bench.json
bun run src/cli.ts mcp-proxy --upstream http://localhost:8000
```

**The dashboard:**

```bash
bun install
bun dev        # http://localhost:3000
```

## The dashboard

A single-route Next.js 16 site in the *Observatory of Argus* idiom — warm obsidian and machined bronze, an animated Aperture boot sequence, the Watchman eye that tracks your cursor, and an orbital orrery of the nine organs. Under the skin:

- **6 live simulation labs** — lattice meet, ratchet trajectories, CNI counterfactual replay (Monte-Carlo), injection channel capacity, canary detection power, red-team evolution, adversary economics.
- **Every number traceable** — the data layer carries provenance labels (paper / project page / README / secondary / simulation); the benchmark tables are generated from the committed evidence JSONs, never hand-typed.
- **A full usage guide** — the five-call mediation-loop contract, seven numbered steps from install to proof, recovery-protocol reference, operating posture.
- **Downloads** — the technical white paper (32 pp), the research whitepaper (22 pp), the competitive ranking report (11 pp), the engine tarball, and the raw evidence JSONs.

## Documentation

- [panoptes/README.md](panoptes/README.md) — engine tour, library API, evidence table, status
- [Quickstart](panoptes/docs/QUICKSTART.md) · [Policy guide](panoptes/docs/POLICY_GUIDE.md) · [Threat model](panoptes/docs/THREAT_MODEL.md) · [Audit report](panoptes/docs/AUDIT.md) · [CHANGELOG](panoptes/CHANGELOG.md)
- [Technical white paper](public/paper/PANOPTES_Technical_White_Paper.pdf) — *PANOPTES: Deterministic Security Mediation for LLM Agents* (32 pp): the system document of record — what it is, the mechanism, how it was built, every test, the measured ranking, the stack, and the honest comparison
- [Research whitepaper](public/paper/PANOPTES_Toward_Survivable_Security_for_LLM_Agents.pdf) — *PANOPTES: Toward Survivable Security for LLM Agents* (22 pp)
- [Solutions architecture](SOLUTIONS.md) — the P0–P4 gap analysis with code-level root causes and validation-gated fixes: memory-poison generalization, the utility tax's three mechanisms, third-party reproduction ladder, production packaging

## Evidence & reproducibility

| Artifact | Contents |
|---|---|
| [`public/bench/panoptes_prototype_benchmarks.json`](public/bench/panoptes_prototype_benchmarks.json) | five-arm corpus benchmark, per-scenario verdicts, latency |
| [`public/bench/panoptes_extreme_stress_campaign.json`](public/bench/panoptes_extreme_stress_campaign.json) | 20M-decision soak, churn, HTTP ladder, auth probes |
| [`public/bench/panoptes_redteam_scale.json`](public/bench/panoptes_redteam_scale.json) | 3.5M-probe adversarial campaign |
| [`public/bench/panoptes_external_benchmarks.json`](public/bench/panoptes_external_benchmarks.json) | tau-bench, corp corpus, ATB arms + coverage |
| `panoptes bench` | deterministic replay of the goldens above, from a clean checkout |

## Honest scope

Benchmark numbers are from our harness on our corpus plus OpenAPPA's public corpora; the whitepaper and ranking report state methodology per arm. Not yet: multi-model external evidence, field telemetry, an operator ecosystem, n-version implementation, and the LLM-in-the-loop re-measurement of the corp utility table (quota-blocked; resumable). Read [`panoptes/docs/THREAT_MODEL.md`](panoptes/docs/THREAT_MODEL.md) before deploying.

## License

MIT — see [LICENSE](LICENSE). Third-party material: [panoptes/NOTICE](panoptes/NOTICE).
