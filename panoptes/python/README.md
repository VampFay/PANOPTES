# panoptes (Python client)

Zero-dependency Python client (stdlib `urllib` only) for the PANOPTES
sidecar. Mediate every tool call your agent makes — deterministically.

```bash
cd <repo root>
bun run src/cli.ts serve --policy examples/policies/bench.json --port 8787 --token secret
```

```python
from panoptes import PanoptesClient

pan = PanoptesClient("http://localhost:8787", token="secret")
session = pan.new_session(canaries=["CNRY-decoy-42"])
pan.world(session, "hr", "salary: 91,204\nreconciliation ref: 482193")

verdict = pan.check(session, "mcp/mail/send",
                    {"to": "recruiter@other.com", "body": "ref: 482193"})
verdict.allowed      # False — deterministic denial
verdict.reasons      # ('numeric secret 482193 from a sensitive store ...',)
verdict.organs       # ('O4-canary',)
```

After every allowed call dispatches, feed the output back:

```python
pan.observe(session, "mcp/files/read", output, args={"path": path})
```

And before your agent's final answer ships:

```python
verdict = pan.answer(session, draft)   # answer-channel confinement
```

Rotate canaries after suspected exposure:

```python
pan.rotate(session)   # retires synthetic canaries; operator seeds survive
```

Full API surface: see the sidecar's `/openapi.json`.

## Tests

```bash
python3 -m unittest discover -s python/tests -v
```

(spawns its own sidecar on port 8797; requires `bun` on PATH)
