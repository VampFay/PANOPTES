"""PANOPTES sidecar REST client — stdlib only (urllib)."""

from __future__ import annotations

import json
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional, Sequence


class PanoptesError(RuntimeError):
    """Raised for transport errors and non-2xx sidecar responses."""

    def __init__(self, message: str, status: Optional[int] = None, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


@dataclass(frozen=True)
class Mediation:
    """One mediated decision — allow or deny, with reasons and organs."""

    decision: str
    reasons: Sequence[str] = field(default_factory=tuple)
    organs: Sequence[str] = field(default_factory=tuple)
    remedy: Optional[Mapping[str, Any]] = None
    remedy_plan: Optional[Mapping[str, Any]] = None
    sanitized_draft: Optional[str] = None
    authority_consult: Optional[Mapping[str, Any]] = None
    raw: Mapping[str, Any] = field(default_factory=dict)

    @property
    def allowed(self) -> bool:
        return self.decision == "allow"

    @property
    def denied(self) -> bool:
        return self.decision == "deny"


class PanoptesClient:
    """Thin, typed client over the PANOPTES sidecar REST API."""

    def __init__(
        self,
        base_url: str = "http://localhost:8787",
        token: Optional[str] = None,
        tenant_id: Optional[str] = None,
        timeout: float = 10.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.tenant_id = tenant_id
        self.timeout = timeout

    # ------------------------------------------------------------ plumbing

    def _request(self, method: str, path: str, body: Any = None) -> Any:
        url = f"{self.base_url}{path}"
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self.tenant_id:
            headers["X-Panoptes-Tenant"] = self.tenant_id
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                payload = res.read().decode("utf-8")
                return json.loads(payload) if payload.strip() else None
        except urllib.error.HTTPError as e:
            payload = e.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(payload) if payload.strip() else None
            except json.JSONDecodeError:
                parsed = payload
            message = parsed.get("error") if isinstance(parsed, dict) else payload
            raise PanoptesError(f"{method} {path} -> {e.code}: {message}", status=e.code, body=parsed) from e
        except urllib.error.URLError as e:
            raise PanoptesError(f"{method} {path} unreachable: {e.reason}") from e

    # ---------------------------------------------------------- infra

    def health(self) -> Mapping[str, Any]:
        return self._request("GET", "/healthz")

    def ready(self) -> Mapping[str, Any]:
        return self._request("GET", "/readyz")

    def openapi(self) -> Mapping[str, Any]:
        return self._request("GET", "/openapi.json")

    # ------------------------------------------------------ sessions

    def new_session(self, canaries: Optional[Sequence[str]] = None, tenant_id: Optional[str] = None) -> str:
        body: dict[str, Any] = {}
        if canaries:
            body["canaries"] = list(canaries)
        if tenant_id:
            body["tenantId"] = tenant_id
        out = self._request("POST", "/v1/sessions", body)
        return out["sessionId"]

    def status(self, session: str) -> Mapping[str, Any]:
        return self._request("GET", f"/v1/sessions/{session}")

    def rotate(self, session: str) -> Mapping[str, Any]:
        """Rotate synthetic canaries (operator seeds survive; numeric secrets never rotate)."""
        return self._request("POST", f"/v1/sessions/{session}/rotate", {})

    def fault(self, session: str, reason: str = "operator-declared integrity fault") -> Mapping[str, Any]:
        return self._request("POST", f"/v1/sessions/{session}/fault", {"reason": reason})

    def audit(self, session: str, limit: int = 200) -> Sequence[Mapping[str, Any]]:
        return self._request("GET", f"/v1/sessions/{session}/audit?limit={int(limit)}")["events"]

    # ------------------------------------------------------ mediation

    def check(self, session: str, tool: str, args: Optional[Mapping[str, Any]] = None) -> Mediation:
        """Mediate a tool call BEFORE dispatch. deny means: do not run the tool."""
        out = self._request(
            "POST",
            f"/v1/sessions/{session}/check",
            {"tool": tool, "args": dict(args or {})},
        )
        return Mediation(
            decision=out["decision"],
            reasons=tuple(out.get("reasons", [])),
            organs=tuple(out.get("organs", [])),
            remedy=out.get("remedy"),
            remedy_plan=out.get("remedyPlan"),
            sanitized_draft=out.get("sanitizedDraft"),
            authority_consult=out.get("authorityConsult"),
            raw=out,
        )

    def observe(self, session: str, tool: str, output: str, args: Optional[Mapping[str, Any]] = None) -> Mapping[str, Any]:
        """Feed a completed tool output back: applies the delta, updates the
        memory ledger, screens for injected instructions."""
        return self._request(
            "POST",
            f"/v1/sessions/{session}/observe",
            {"tool": tool, "args": dict(args or {}), "output": output},
        )

    def answer(self, session: str, draft: str) -> Mapping[str, Any]:
        """Check the final answer draft (answer-channel confinement)."""
        return self._request("POST", f"/v1/sessions/{session}/answer", {"draft": draft})

    def world(self, session: str, store: str, content: str) -> Mapping[str, Any]:
        """Enroll world content for canary auto-enrollment (sensitive stores only)."""
        return self._request(
            "POST",
            f"/v1/sessions/{session}/world",
            {"store": store, "content": content},
        )


def start_sidecar(
    repo_root: str,
    policy: str = "examples/policies/bench.json",
    port: int = 8787,
    token: Optional[str] = None,
    extra_args: Sequence[str] = (),
) -> subprocess.Popen:
    """Launch `bun run src/cli.ts serve` or `node ...` as a subprocess (helper for tests/dev).

    Returns the Popen handle; the caller is responsible for .terminate().
    """
    bun = shutil.which("bun")
    node = shutil.which("node")
    if bun:
        cmd = [bun, "run", "src/cli.ts", "serve", "--policy", policy, "--port", str(port), *extra_args]
    elif node:
        cmd = [node, "src/cli.ts", "serve", "--policy", policy, "--port", str(port), *extra_args]
    else:
        raise PanoptesError("neither 'bun' nor 'node' executable found in PATH")

    if token:
        cmd += ["--token", token]
    proc = subprocess.Popen(cmd, cwd=repo_root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    client = PanoptesClient(f"http://127.0.0.1:{port}")
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            if client.health().get("ok"):
                return proc
        except PanoptesError:
            time.sleep(0.2)
        except Exception:
            time.sleep(0.2)
    proc.terminate()
    raise PanoptesError("sidecar did not become ready within 15s")
