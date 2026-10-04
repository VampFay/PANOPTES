# Policy guide

A PANOPTES policy is a JSON document describing: the trust chain, the
session boundary, tool specs (gates, deltas, effects), sanitizers, and the
declared sensitive stores. The engine compiles it into an `Observatory`
with the organ stack enabled.

```ts
import { loadPolicy, Observatory } from 'panoptes-core';
const engine = new Observatory(loadPolicy('policy.json'), { organs: true });
```

## Top-level fields

| Field | Required | Meaning |
|---|---|---|
| `trustChain` | yes | Ordered ranks, weakest first: `["suspicious", "vendor", "internal"]` |
| `boundary` | yes | The label every fresh session starts at |
| `sensitiveStores` | no | Store names whose content enrolls canaries (see O4-canary) |
| `tools` | yes | Tool specs (below) |
| `sanitizers` | no | Registered declassifiers (see below) |

`boundary` = `{ "trust": "<rank>", "audience": ["<reader>", ...] }`. The
`public` reader is the universal set: a flow readable by `public` can go to
any recipient; `meet(public, X) = X` when labels combine.

## Tool specs

```json
{
  "name": "mcp/mail/send",
  "match": [{ "param": "to", "glob": "*@corp.example" }],
  "delta": { "trust": "vendor", "audience": ["hr@corp.example"] },
  "requires": {
    "trust": "vendor",
    "audience": { "contains": ["$to"] },
    "effects": { "contains": ["approved"], "excludes": ["already-sent"] },
    "attention": ["compliance-bot"]
  },
  "effects": ["mail-sent"],
  "egress": true,
  "sinkParams": ["body", "subject"],
  "annotator": "acl-resolver",
  "authority": "compliance-bot"
}
```

- **`name`** — the tool identity your agent calls. It may carry
  OpenAPPA-style selectors directly in the name:
  `"mcp/files/read(path:/hr/*)"` is equivalent to `match:
  [{"param":"path","glob":"/hr/*"}]`. Specs with selectors are consulted
  before plain specs (first match wins).
- **`match`** — additional declarative selectors, AND-ed together. Globs:
  `*` matches within a path segment, `**` crosses separators.
- **`delta`** — how a *completed* call transforms the session's flow:
  `trust` can only degrade (never raise); `audience` narrows to exactly
  the listed readers. Deltas are how trajectories accumulate restriction.
- **`requires`** — the gate the *current* flow must pass before dispatch:
  - `trust`: minimum rank (floor);
  - `audience.contains`: every reader must be able to read the flow —
    `$param` references substitute from the call's args (e.g. `$to`);
  - `effects.contains`: episode effects that must already be established;
  - `effects.excludes`: effects that make this action spent;
  - `attention`: authorities that must rule before dispatch (fail closed
    without a ruling).
- **`egress`** — marks a sink: sink params are canary-scanned and
  echo-confined. Defaults sink params: `body`, `content`, `summary`,
  `text`, `task` (override with `sinkParams`).
- **`effects`** — recorded on the episode log when the call completes
  (shared across parent and forked children).
- **`annotator`/`authority`** — names resolved at runtime by the host
  (passed in `V2Options.annotators` / `V2Options.authorities`).

Unknown tools are denied fail-closed. Invalid policies throw with a
concrete message (`loadPolicy`).

## Sanitizers

Sanitizers are registered declassifiers — the only sanctioned way
restricted content becomes releasable:

```json
{
  "name": "pii-redactor",
  "on": ["egress_remedy", "fork_return"],
  "permits": { "audience": { "from": ["hr@corp.example"], "to": ["public"] } },
  "redact": [
    { "pattern": "\\b\\d{3}-\\d{2}-\\d{4}\\b", "replacement": "[SSN]" },
    { "pattern": "\\b\\d[\\d,.]{5,}\\d\\b", "replacement": "[AMOUNT]" }
  ]
}
```

- A payload that is a **fixed point** of an applicable sanitizer
  (`apply(payload) === payload`) is already clean — it egresses freely.
- An audience-denied egress gets a **remedy** offered: the sanitized
  version, producible via the CLI/SDK response.
- `on: ["fork_return"]` sanitizers also clean child-trajectory returns.

## Sensitive stores and canaries

`enrollWorldCanaries(store, content)` on a store named in
`sensitiveStores` enrolls:

- tokens ≥ 6 chars containing `CANARY` (the naming convention for planted
  decoys);
- digit runs ≥ 4 on lines with secret-field labels (`ssn`, `salary`,
  `account`, `reconciliation ref`, …).

Any enrolled value found in an egress sink interdicts the call — the
content-side detector for when labels lie (label betrayal). Rotate after
suspected exposure: `engine.rotateCanaries()` retires synthetic canaries,
keeping operator seeds (`opts.canaries`, `addCanary`); numeric secrets are
real data and never rotate away.

## Mediation flow (per call)

```
check(tool, args)
  1. resolve spec           unknown -> deny (fail closed)
  2. O6 ratchet             faulted session -> reads only
  3. requires               trust floor / audience / effects / authority
  4. O4-canary              egress sink scan (canaries + numeric + suppressed)
  5. O7-confine             egress echo scan (bounded verbatim quotes)
  -> allow | deny (+ reasons, organs, remedy, authority consult)

recordEffects(...)           after an allowed call dispatches
observe(tool, args, output)  apply delta, ledger memory, screen output
checkAnswer(draft)           the final answer is also a sink
```

## Tips

1. **Order selectors first.** Put `(param:glob)` specs before the plain
   spec of the same tool name.
2. **Deltas accumulate; gates check.** A read that degrades trust changes
   every later decision — that monotone ratchet is the core defense.
3. **Declare your egress surfaces** (`egress: true` + `sinkParams`) —
   organs only engage on declared sinks.
4. **Test with `panoptes replay`** — traces are cheap, deterministic, and
   double as regression fixtures.
