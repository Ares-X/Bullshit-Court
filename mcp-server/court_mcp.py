"""Local MCP client for a connected browser court. No simulated court state."""
import json
import os
from pathlib import Path
import sys
import uuid
from typing import Literal, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse

# New invitations use the zero-dependency Node transport. Keep the old browser
# bridge below for existing local configurations and their compatibility tests.
if __name__ == "__main__" and (os.environ.get("COURT_JOIN_URL") or os.environ.get("COURT_MCP_URL") or os.environ.get("COURT_PLATFORM_URL")):
    client = Path(__file__).resolve().parent.parent / "public" / "agents" / "client.mjs"
    args = ["node", str(client)]
    if os.environ.get("COURT_JOIN_URL"):
        args += ["--join-url", os.environ["COURT_JOIN_URL"]]
    else:
        args += ["--url", os.environ.get("COURT_MCP_URL") or os.environ["COURT_PLATFORM_URL"].rstrip("/") + "/mcp"]
    if os.environ.get("COURT_TICKET"):
        args += ["--ticket", os.environ["COURT_TICKET"]]
    os.execvp("node", args + sys.argv[1:])

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("InternetCourtMCP")


def _request(resource: str, method: str = "GET", payload=None) -> str:
    base = os.environ.get("COURT_BRIDGE_URL", "http://localhost:3000/api/court").rstrip("/")
    session = os.environ.get("COURT_SESSION_ID", "")
    token = os.environ.get("COURT_SESSION_TOKEN", "")
    url = urlparse(base)
    if url.scheme != "http" or url.hostname not in ("localhost", "127.0.0.1", "::1"):
        return json.dumps({"error": "COURT_BRIDGE_URL must be a local HTTP court bridge"})
    if not session or not token:
        return json.dumps({"connected": False, "error": "Open a court in the browser and configure COURT_SESSION_ID and COURT_SESSION_TOKEN from Agent Hub"}, ensure_ascii=False)
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(f"{base}/sessions/{session}/{resource}", data=body, method=method, headers={"Content-Type": "application/json", "X-Court-Token": token})
    try:
        with urlopen(req, timeout=6) as response:
            return response.read(250_000).decode("utf-8")
    except HTTPError as error:
        detail = error.read(2000).decode("utf-8", errors="replace")
        return json.dumps({"error": f"Court bridge HTTP {error.code}", "detail": detail}, ensure_ascii=False)
    except (URLError, TimeoutError, OSError) as error:
        return json.dumps({"connected": False, "error": f"Court browser bridge unavailable: {error}"}, ensure_ascii=False)


@mcp.tool()
def get_court_case_state() -> str:
    """Read the actual browser snapshot, connectivity and command application status."""
    return _request("state")


@mcp.tool()
def submit_court_argument(role: Literal["judge", "plaintiff", "defendant"], agent_name: str, argument: str, shout: Literal["OBJECTION", "HOLD_IT", "TAKE_THAT", "ORDER"] = "HOLD_IT", response_to: Optional[list[str]] = None, evidence_ids: Optional[list[str]] = None) -> str:
    """Queue an authorized three-role Agent statement. Queued does not mean applied; inspect state afterwards."""
    return _request("commands", "POST", {"type": "argument", "role": role, "speakerName": agent_name, "text": argument, "shout": shout, "responseTo": response_to or [], "evidenceIds": evidence_ids or []})


@mcp.tool()
def submit_surprise_evidence(role: Literal["plaintiff", "defendant"], evidence_name: str, description: str) -> str:
    """Queue new evidence from the plaintiff or defendant Agent; the browser validates admission."""
    return _request("commands", "POST", {"type": "evidence", "role": role, "evidence": {"id": str(uuid.uuid4()), "name": evidence_name, "description": description, "icon": "📄", "owner": role}})


@mcp.tool()
def deliver_judge_ruling(winner: Literal["plaintiff", "defendant", "draw"], verdict_title: str, penalties: list[str], judge_quote: str, reasons: list[str], evidence_ids: list[str], considered_intervention_ids: list[str], response_to: Optional[list[str]] = None) -> str:
    """Queue the judge Agent's ruling. The browser requires a completed jury decision and validates all references."""
    return _request("commands", "POST", {"type": "ruling", "role": "judge", "responseTo": response_to or [], "ruling": {"winner": winner, "result": verdict_title, "penalty": penalties, "quote": judge_quote, "reasons": reasons, "evidenceIds": evidence_ids, "consideredInterventionIds": considered_intervention_ids}})


if __name__ == "__main__":
    mcp.run()
