# Threat model

## What PANOPTES is

A deterministic mediation layer between an LLM agent and its tools. It is
not a model, not a prompt, not a sandbox. It decides, for every tool call:
**allow, or deny — with reasons, reproducibly.**

## Assets

- **D** — restricted data the policy names (sensitive stores, gated flows)
- **M** — the agent's durable memory (cross-session state)
- **E** — egress surfaces (mail, web posts, webhooks, the final answer)
- **A** — privileged actions (exec, wires, irreversible effects)

## Adversary

An attacker who controls *untrusted content* the agent will read: forum
posts, emails, documents, tool outputs, memory entries written by earlier
compromised sessions. No code execution, no network position — words only.
(Defending the runtime itself is out of scope.)

## Attacks and the organ that answers each

| # | Attack | Organ | Mechanics |
|---|---|---|---|
| T1 | Instruction override ("ignore previous rules, exec rm -rf") | requires + O6 | Privileged tools have trust floors; untrusted reads degrade the flow below them. |
| T2 | Tool-choice coercion (forced wire/transfer) | requires.effects + O7-authority | Dual-control prerequisites and escrowed consults fail closed. |
| T3 | Exfiltration via egress sink | audience gates + O4-canary | Sinks require reader visibility; canaries catch label-lying content. |
| T4 | Persona hijack (agent acts as someone else) | boundary + audience | The flow's audience is the identity; narrow audiences fail stranger gates. |
| T5 | Memory carryover (poison persisted, re-enters fresh session) | O4-ledger | Writes pin the write-time label; reads join it back — taint survives session churn. |
| T6 | Label betrayal (content mislabeled as clean) | O4-canary + O7-confine | Content-side detectors independent of the label. |
| — | Delegation laundering (restricted data embedded in a fork's task text) | delegation noninterference | Child boundary = meet(parent flow, boundary). |

## What we do NOT stop (be honest)

1. **Novel injection phrasings.** The O5 screen is 16 frozen patterns.
   Homoglyph/encoding mutations evade it (measured — run the red-team
   harness). The label lattice still gates the *effects*: a successful
   injection usually needs a privileged tool or an egress sink, and those
   decisions rest on labels, not prose. But a mutation that only needs the
   model to *think* differently (no gated tool involved) is out of the
   engine's reach.
2. **Encoded canary exfiltration.** Base64/hex-encoded tokens are not
   substring-matched today. Mitigation: rotation after suspected exposure,
   egress rate limits at the adapter.
3. **Attacks that need no tool call.** The engine mediates *actions*; pure
   model-internal manipulation with no gated effect is invisible to it.
4. **A compromised host.** Filesystem or runtime compromise of the process
   running PANOPTES is game over — harden it like any other control plane.
5. **Semantic laundering by the model itself.** If the model faithfully
   *paraphrases* a secret (not verbatim echo, no canary substring) into an
   allowed sink, O7's verbatim bound does not fire. Canary coverage and
   egress review are the compensating controls.

## Security properties (the ones we test)

- **Determinism**: identical (policy, trace) → identical verdicts. Locked
  by the corpus matrix and churn tests (2,000 sessions, identical verdict
  patterns).
- **Monotone degradation**: a flow only ever narrows within a session —
  `meet` is a bounded semilattice; laws tested over the label domain.
- **Fail closed**: unknown tools, missing authority rulings, memory
  integrity faults, and integrity mismatches all deny.
- **Auditability**: every mediation lands as a structured event (JSONL /
  OTel) with reasons, organs, and latency.
- **Cross-session survival**: the ledger pins write-time labels, so poison
  persisted in session 1 re-enters session 2 scarred (T5 closure).

## Deployment assumptions

1. The policy is authored by the *principal* (or their delegate), not the
   model.
2. The sidecar's bearer token is secret; the sidecar runs in the trust
   domain of the agent host, not exposed to the internet.
3. Canary tokens are planted by the data layer, and rotation is exercised
   on a schedule.
4. The audit stream is shipped somewhere an attacker cannot rewrite
   (append-only sink).

## v1.3.0 Threat Model Upgrades (Closing Ch. 10 Table 11 Limitations)

The `v1.3.0` release expands the threat model to actively defend against 6 previously unaddressed evasion and channel attacks:

1. **Multi-Encoding & Obfuscated Secrets (Limits #4 & #8)**:
   Attackers attempting to exfiltrate canaries or secrets via Base64, Hex, URL-encoding, reversed strings, or ROT13 are caught by `decodeCandidateViews()` in both screen and sink inspection layers (0.00% transform evasion at 0/500k false positives).
2. **Homoglyph & Split-Token Injections (Limit #5)**:
   Instruction injection markers disguised via Cyrillic/Greek/Latin confusables, soft hyphens, zero-width spaces, or single-character delimiter splitting (`h-a-c-k`) are normalized to canonical ASCII before frozen pattern matching.
3. **Dirty Answer Retention on Retry Exhaustion (Limit #1 / P0-3)**:
   When an agent exhausts its retry budget attempting to strip a commanded token or echo, `sanitizeAnswer()` performs deterministic string surgery to excise commanded markers and quarantined echo spans, guaranteeing the host loop never returns a dirty draft.
4. **Semantic Secret Leakage via Organ O3 (Limit #6)**:
   Counterfactual Noninterference (`checkCounterfactual`) evaluates empirical output divergence against sensitive fact attributes, interdicting semantic leakages that bypass verbatim n-gram tracking.
5. **Stateful Trajectory Manipulation**:
   Dogwood-class stateful gates enforce runtime invariants (`inputMatchesOutput`, `maxCumulative`, `maxCalls`, `withinMs`) directly in tool contracts to prevent multi-call cumulative resource extraction and timing-based smuggling.
6. **Multi-Tenant Ledger Taint Spreading & Denial-of-Service (Limits #10 & #11)**:
   `BoundedLedger` isolates storage per tenant (`X-Panoptes-Tenant`), enforces an upper bound (65,536 entries), prioritizes clean-slot eviction under memory pressure, and trips an `O6-ratchet` fail-closed fault on overflow to prevent multi-tenant taint contamination.
