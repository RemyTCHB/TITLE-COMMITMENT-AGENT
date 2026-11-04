"""Checks the live connections from outside (GitHub Actions, Run workflow): the Team Hub accepts this app's signed
requests for Help's delete passwords, the engine is up and asks for sign-in, and the page serves the guides.
Prints status codes and counts only, never a password (the Actions logs are public): it asks the hub about an
address that isn't on the hub's team, which by design gets no passwords.

    uv run python scripts/connections_check.py
"""

from __future__ import annotations

import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from titleagent import hub  # noqa: E402
from titleagent.config import load_secrets  # noqa: E402

ENGINE = os.environ.get("ENGINE_URL") or "https://title-agent-engine-622792668017.us-east1.run.app"
APP = os.environ.get("APP_URL") or hub.APP_URL
NOBODY = "connection-check@totalchb.com"  # a team-domain address that is on no team: no passwords


def main() -> int:
    failed = 0
    secrets = load_secrets()
    if not secrets.has_hub:
        print("FAIL hub: HUB_SYNC_SECRET is not set")
        failed += 1
    else:
        try:
            out = hub.passwords(secrets, NOBODY)
            rows, own = len(out["rows"]), len(out["own"])
            ok = rows == 0 and own == 0
            print(f"{'ok  ' if ok else 'FAIL'} hub passwords: signed request accepted; {rows} departments, {own} own "
                  "for an address on no team (expected 0 and 0)")
            failed += not ok
        except hub.HubPasswordsError as exc:
            print(f"FAIL hub passwords: {exc}")
            failed += 1
    for name, url, want in (("engine Help passwords without sign-in", f"{ENGINE}/v1/help/passwords", 401),
                            ("engine health", f"{ENGINE}/health", 200),
                            ("page in-app guides", f"{APP}/guides/guides.json", 200)):
        try:
            r = requests.get(url, timeout=30)
            extra = ""
            if url.endswith("guides.json") and r.status_code == 200:
                extra = f", {len(r.json())} guides"
            ok = r.status_code == want
            print(f"{'ok  ' if ok else 'FAIL'} {name}: {r.status_code} (expected {want}){extra}")
        except (requests.RequestException, ValueError) as exc:
            ok = False
            print(f"FAIL {name}: {type(exc).__name__}")
        failed += not ok
    print("All connections work." if not failed else f"{failed} check(s) failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
