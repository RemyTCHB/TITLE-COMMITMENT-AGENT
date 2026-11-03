"""The Universal Team Hub connection (titleagent/hub.py): only Closing Blockers go, signed; changes made in the hub
come back as statuses; the engine takes signed hub updates and sends deals after changes. Made-up data only."""

import json

import pytest

from titleagent import hub
from titleagent.config import Secrets
from titleagent.models import ActionItem, Source

SECRETS = Secrets(None, None, None, hub_url="https://hub.example/api/title-agent", hub_secret="s3cret")


def item(key, priority="blocker", status="Open", **x):
    return ActionItem(key=key, priority=priority, category="Other", title=f"Item {key}", action=f"Do {key}",
                      provided_by="Seller", sources=[Source(ref=f"B-I {key}")], status=status, **x)


def a_deal(store):
    deal_id = store.create_deal(by="pat.tc@totalchb.com", address="1 Sample Way, Exampleton, OH")
    store.replace_items(deal_id, [item("1", due_date="2026-11-05"), item("2", priority="before"),
                                  item("3", priority="fyi"), item("4", status="Cleared"),
                                  item("5", change="removed")])
    return deal_id


class FakeHub:
    def __init__(self, updates=None):
        self.sent, self.updates = [], updates or []

    def __call__(self, url, data, headers, timeout):
        assert hub.verify("s3cret", data, headers["X-Hub-Timestamp"], headers["X-Hub-Signature"])
        self.sent.append(json.loads(data))
        updates = self.updates

        class R:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {"ok": True, "task": "ta-x", "created": True, "changed": True, "updates": updates}

        return R()


def test_signatures():
    body = b'{"a":1}'
    head = hub.signed_headers("s3cret", body, ts=1000)
    assert hub.verify("s3cret", body, head["X-Hub-Timestamp"], head["X-Hub-Signature"], now=1100)
    assert not hub.verify("s3cret", body + b" ", head["X-Hub-Timestamp"], head["X-Hub-Signature"], now=1100)
    assert not hub.verify("other", body, head["X-Hub-Timestamp"], head["X-Hub-Signature"], now=1100)
    assert not hub.verify("s3cret", body, head["X-Hub-Timestamp"], head["X-Hub-Signature"], now=2000)
    assert not hub.verify(None, body, head["X-Hub-Timestamp"], head["X-Hub-Signature"], now=1100)


def test_only_closing_blockers_go_and_hub_changes_come_back(store):
    deal_id = a_deal(store)
    fake = FakeHub(updates=[{"key": "1", "status": "Cleared", "by": "Monz Miller"},
                            {"key": "2", "status": "Cleared", "by": "Monz Miller"}])   # not a blocker: ignored
    out = hub.sync(store, SECRETS, deal_id, post=fake)
    sent = fake.sent[0]
    assert sent["deal"] == {"id": deal_id, "address": "1 Sample Way, Exampleton, OH",
                            "url": f"https://title.totalchb.com/#/deal/{deal_id}"}
    assert [b["key"] for b in sent["blockers"]] == ["1", "4"]                 # no Before Closing / FYI / removed
    assert sent["blockers"][0] == {"key": "1", "priority": "blocker", "title": "Item 1", "action": "Do 1",
                                   "sources": ["B-I 1"], "due_date": "2026-11-05", "status": "Open"}
    assert out["applied"] == 1
    # a time picked here goes as an Eastern time (the hub reads it as is; a day alone is 9:00 AM there)
    store.update_item(deal_id, "4", due_date="2026-11-06", due_time="17:30")
    store.update_item(deal_id, "1", due_date="2026-11-01", due_time="08:05")  # the day the clocks go back
    sent = hub.payload(store, deal_id)["blockers"]
    assert [b["due_date"] for b in sent] == ["2026-11-01T08:05:00-05:00", "2026-11-06T17:30:00-05:00"]
    store.update_item(deal_id, "1", due_date="2026-10-30", due_time="09:00")
    assert hub.payload(store, deal_id)["blockers"][0]["due_date"] == "2026-10-30T09:00:00-04:00"
    items = {i.key: i for i in store.get_items(deal_id)}
    assert items["1"].status == "Cleared" and items["2"].status == "Open"
    assert store.get_deal(deal_id)["hub_task"] == "ta-x"


def test_safe_sync_never_raises(store, monkeypatch):
    deal_id = a_deal(store)

    def down(*a, **k):
        raise ConnectionError("hub down")

    monkeypatch.setattr(hub.requests, "post", down)
    assert hub.safe_sync(store, SECRETS, deal_id) is None
    assert store.get_deal(deal_id)["hub_error"] == "ConnectionError"
    assert hub.safe_sync(store, Secrets(None, None, None), deal_id) is None   # hub not set up: nothing happens


def test_engine_takes_signed_hub_updates_and_sends_changes(monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    from engine.main import Engine, create_app
    from tests.conftest import firestore_store
    from titleagent import demo

    store = firestore_store()
    fake = FakeHub()
    monkeypatch.setattr(hub.requests, "post", fake)
    tokens = {"tc": {"email": "pat.tc@totalchb.com", "email_verified": True, "uid": "u-tc"}}
    client = TestClient(create_app(Engine(secrets=SECRETS, store=store, llm=demo.scripted_llm,
                                          verify=lambda t: tokens[t])))
    deal_id = a_deal(store)

    body = json.dumps({"deal_id": deal_id, "updates": [{"key": "1", "status": "Cleared", "by": "Monz Miller"}]})
    assert client.post("/v1/hub/items", content=body).status_code == 401                       # unsigned
    bad = hub.signed_headers("wrong", body.encode())
    assert client.post("/v1/hub/items", content=body, headers=bad).status_code == 401
    r = client.post("/v1/hub/items", content=body, headers=hub.signed_headers("s3cret", body.encode()))
    assert r.json() == {"ok": True, "applied": 1}
    assert {i.key: i.status for i in store.get_items(deal_id)}["1"] == "Cleared"
    assert fake.sent == []                                                       # no echo back to the hub

    # a TC reopens a blocker here: the deal goes to the hub; a Before Closing item doesn't trigger it
    client.patch(f"/v1/deals/{deal_id}/items", json={"key": "2", "status": "Cleared"},
                 headers={"Authorization": "Bearer tc"})
    assert fake.sent == []
    client.patch(f"/v1/deals/{deal_id}/items", json={"key": "1", "status": "Open"},
                 headers={"Authorization": "Bearer tc"})
    assert len(fake.sent) == 1 and fake.sent[0]["blockers"][0]["status"] == "Open"


class Answer:
    def __init__(self, status, body=None):
        self.status_code, self.body = status, body or {}

    def json(self):
        return self.body


def test_help_passwords_come_from_the_hub_signed():
    asked = []

    def post(url, data, headers, timeout):
        assert hub.verify("s3cret", data, headers["X-Hub-Timestamp"], headers["X-Hub-Signature"])
        asked.append((url, json.loads(data)))
        return Answer(200, {"rows": [{"dept": "TC", "lead": "made-up-1", "sub": "made-up-2", "extra": "x"}],
                            "own": [{"name": "Sample Person", "pw": "made-up-3"}]})

    out = hub.passwords(SECRETS, "Sam.Rivera@totalchb.com", post=post)
    assert asked == [("https://hub.example/api/title-agent/passwords", {"email": "sam.rivera@totalchb.com"})]
    assert out == {"rows": [{"dept": "TC", "lead": "made-up-1", "sub": "made-up-2"}],
                   "own": [{"name": "Sample Person", "pw": "made-up-3"}]}
    with pytest.raises(hub.HubPasswordsError, match="doesn't share"):  # the hub hasn't added the endpoint yet
        hub.passwords(SECRETS, "a@totalchb.com", post=lambda *a, **k: Answer(404))
    with pytest.raises(hub.HubPasswordsError, match="isn't connected"):
        hub.passwords(Secrets(None, None, None), "a@totalchb.com")


def test_engine_help_passwords_only_for_team_leaders_and_managers(monkeypatch):
    from tests.conftest import firestore_store
    from tests.test_engine import h, verify

    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    from engine.main import Engine, create_app
    from titleagent import demo

    store = firestore_store()
    store.set_setting("team", [{"name": "Pat Tc", "email": "pat.tc@totalchb.com", "role": "manager", "dept": ""},
                               {"name": "Owner Lead", "email": "owner@totalchb.com", "role": "lead", "dept": "TC"}],
                      by="test")
    store.set_setting("admins", ["pat.tc@totalchb.com"], by="test")
    asked = []
    monkeypatch.setattr(hub, "passwords", lambda _s, email: asked.append(email) or {"rows": [], "own": []})
    client = TestClient(create_app(Engine(secrets=SECRETS, store=store, llm=demo.scripted_llm, verify=verify)))
    for who in ("tc", "owner"):  # the manager and the Team Leader
        r = client.get("/v1/help/passwords", headers=h(who))
        assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    assert asked == ["pat.tc@totalchb.com", "owner@totalchb.com"]
    store.set_setting("team", [{"name": "Pat Tc", "email": "pat.tc@totalchb.com", "role": "manager", "dept": ""},
                               {"name": "Owner", "email": "owner@totalchb.com", "role": "member", "dept": "TC"}],
                      by="test")
    assert client.get("/v1/help/passwords", headers=h("owner")).json() == {"rows": [], "own": []}  # a Member
    assert asked == ["pat.tc@totalchb.com", "owner@totalchb.com"]  # the hub wasn't asked

    def down(*_a):
        raise hub.HubPasswordsError("Couldn't reach the Team Hub. Try again.")

    monkeypatch.setattr(hub, "passwords", down)
    r = client.get("/v1/help/passwords", headers=h("tc"))
    assert r.status_code == 503 and r.json()["detail"] == "Couldn't reach the Team Hub. Try again."
