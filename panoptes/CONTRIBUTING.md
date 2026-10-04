# Contributing

## Ground rules

1. **Determinism is the product.** Every code change must preserve: same
   inputs → same verdict. No `Math.random`, no time-of-day logic, no
   unseeded nondeterminism inside `src/core/`.
2. **Tests gate every merge.** `bun test` must pass with zero failures, and
   `bun run src/cli.ts bench` must report `all arms match golden numbers`.
   If your change legitimately alters a golden number, update it in BOTH
   `src/cli.ts` (bench) and `tests/regression.test.ts`, and justify it in
   the PR.
3. **No new runtime dependencies** without discussion. The engine is
   dependency-free by design; keep it that way.
4. **Honesty in comments and docs.** Benchmark numbers must carry their
   methodology. Do not overclaim.

## Development setup

```bash
bun install
bun test                    # 47+ tests
bun run typecheck           # tsc --noEmit
bun run src/cli.ts bench    # golden-number regression + latency
```

## Adding an organ or policy feature

1. Write the semantics down first (a doc comment with the invariant).
2. Implement in `src/core/v2.ts` behind the `organs: boolean` flag if it is
   a mediation behavior, or as a pure function if it is math.
3. Add tests: unit tests for the invariant, corpus scenarios if the threat
   model grew, a regression-test row if a golden number moves.
4. Run the red-team harness and report the delta in your PR description.

## Adding corpus scenarios

Scenarios live in `src/corpus.ts`. Each scenario is deterministic
(fixed tool calls and outputs). Attack scenarios state the taxon (T1–T6 or
new); benign scenarios state their family. The corpus must stay balanced —
if you add an attack, consider whether a benign twin is needed to catch
blunt regressions.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do not open public issues with untested
exploit material.
