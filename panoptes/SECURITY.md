# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | yes |

## Reporting a vulnerability

Email the maintainers via the security contact listed in the repository's
`SECURITY_CONTACTS` file or the contact in the README badge area. Please:

1. Describe the attack path concretely (policy snippet + tool-call sequence
   that achieves the violation).
2. Do **not** open a public issue for untested exploit material.
3. Allow 90 days for coordinated disclosure.

We commit to acknowledging reports within 7 days.

## Threat scope

PANOPTES is a mediation layer for LLM agent tool calls. In scope:

- Instruction injection riding tool output (O5/O7)
- Data exfiltration through egress sinks (O4-canary, audience gates)
- Cross-session memory poisoning (O4-ledger)
- Label betrayal / mislabeled content (content-side interdiction)
- Integrity faults in memory (O6 fail-closed)
- Authority bypass / dual-control evasion (O7-authority)

Out of scope (defended elsewhere, not by this engine):

- The LLM's own weights or sampling behavior
- Network-level attacks on the sidecar (TLS, authn — front it with your
  standard infrastructure)
- Side channels in the host runtime (timing, memory access)

## Known limitations (be honest with yourself before deploying)

1. **The injection screen is a frozen pattern set.** Deterministic screening
   is deliberately conservative — mutation attacks (homoglyphs, encodings)
   can evade the patterns. The defense-in-depth position: the label lattice
   and canary interdiction still gate the *effects* of most successful
   injections. The red-team harness (`bun run tools/redteam.ts`) measures
   this gap openly.
2. **Canary scanning is substring-based.** Encoded (base64/hex) exfiltration
   of a canary token is not caught by the scanner today. Rotation after
   suspected exposure limits the window; rate-limit egress at the adapter.
3. **Single implementation.** The whitepaper's n-version argument applies
   here too: independent re-implementations of this engine's semantics
   would harden the ecosystem's trust in the approach.

## Canary rotation policy

Rotate (`POST /v1/sessions/:id/rotate`, `engine.rotateCanaries()`, or the MCP
tool) after any suspected canary exposure, and re-seed world documents with
fresh tokens. Rotation retires auto-enrolled synthetic canaries; numeric
secrets from sensitive stores are real data and never rotate away.
