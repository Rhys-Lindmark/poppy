"""Expose the signed Commonplace workflow to Hermes as a read-only tool."""

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("poppy-pap")
script = Path(__file__).with_name("hermes-pap.mjs")
node = sys.argv[1]


@mcp.tool()
def prepare_commonplace_edition() -> dict:
    """Find a free Commonplace reading edition using PAP 1.0 discovery and a signed guest Session.
    Return the terms and a review URL. The User approves the backup in the browser.
    """
    try:
        result = subprocess.run(
            [node, str(script)], capture_output=True, check=True, text=True, timeout=30,
        )
        proposal = json.loads(result.stdout)
        request = proposal["signed_requests"][0]
        evidence = {
            "observed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "protocol_version": proposal["protocol_version"],
            "request": request,
            "tool": "prepare_commonplace_edition",
        }
        folder = Path.home() / ".config/poppy"
        with tempfile.NamedTemporaryFile(mode="w", dir=folder, delete=False) as receipt:
            json.dump(evidence, receipt)
        os.replace(receipt.name, folder / "pap-last-evidence.json")
        return proposal
    except (subprocess.SubprocessError, ValueError) as error:
        raise RuntimeError("The signed Commonplace lookup did not finish.") from error


if __name__ == "__main__":
    mcp.run(transport="stdio")
