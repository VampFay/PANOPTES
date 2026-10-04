"""PANOPTES Python SDK — a zero-dependency client for the PANOPTES sidecar.

Every tool call an agent makes can be mediated through a deterministic,
auditable policy engine running beside your application. This client speaks
the sidecar's REST API (stdlib urllib only — no pip installs required).

    from panoptes import PanoptesClient

    pan = PanoptesClient("http://localhost:8787", token="secret")
    session = pan.new_session(canaries=["CNRY-my-decoy-42"])

    verdict = pan.check(session, "mcp/mail/send",
                        {"to": "recruiter@other.com", "body": "hi"})
    if verdict.allowed:
        dispatch_mail(...)                 # your tool actually runs
        pan.observe(session, "mcp/mail/send", "sent", args={...})
    else:
        log(verdict.reasons)               # deterministic, auditable denial
"""

from .client import PanoptesClient, PanoptesError, Mediation

__all__ = ["PanoptesClient", "PanoptesError", "Mediation"]
__version__ = "1.0.0"
