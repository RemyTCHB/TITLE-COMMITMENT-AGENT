# CLAUDE.md — Title Commitment Agent (Total Cash Home Buyers)

Reviews title commitments and lists everything needed to close. Live at **title.totalchb.com** (since 2026-10-29):
the page in `web/` (Vercel, **the Universal Team Hub's design**: RemyTCHB/HUB's stylesheet and
components), the engine in `engine/` + `titleagent/` (Cloud Run), data in Firebase (project `title-commitment-agent`).
`docs/PLAN.md` holds the owner's decisions on the rules (section 0); `docs/PLAN-v2.md` how it runs. Keep this file in
sync when a rule changes. (The first Streamlit version and its Neon database were retired on 2026-10-30.)

## Non-negotiables
- **Never leave a numbered item behind.** Every Schedule B-I and B-II number must get a disposition; the numbering
  check (`titleagent/numbering.py`) is code, not AI, and its gaps are shown, never hidden. Don't weaken it.
- **Privacy.** Commitments, contracts, exports and the closers' lists are real deal data: never commit them, never
  copy them into tests, fixtures, prompts, lessons, logs or commit messages. Tests use `titleagent/demo.py`
  (made-up data). `*.pdf`, `.data/` and exports are gitignored. The repository and its Actions logs are public:
  scripts print counts, never deal details.
- **Lessons are general rules** (no names, amounts, case numbers) and go live only after an admin approves them.
- Secrets only from environment variables (`titleagent/config.py`): Cloud Run gets them from GitHub secrets at deploy.
  Never in code or chat.
- **Access**: only verified @totalchb.com Google accounts. The engine checks every request's Firebase ID token
  (`engine/main.py`); the Firestore / Storage rules (`firebase/`) let the page read team data and write nothing but
  the person's own uploads. Every change goes through the engine.

## The team's standard (from the 8 worked commitments, owner 2026-10-25, updated 2026-10-28)
- **Closing Blocker** = needs money paid to, or a document from, someone outside the closing table, or a court /
  government action: mortgages (incl. lis pendens), judgments (current or prior owner), tax-lien certificates,
  state / city tax liens, workers' comp liens, municipal maintenance liens, delinquent utilities, taxes sold to a
  third party, pending foreclosures, recorded memoranda (agreement / lease / option / wind) to terminate,
  commitment errors.
- **Before Closing** = routine requirements handled in the normal course (deed, premium, entity docs, FinCEN,
  HOA statement, affidavits, transfer forms, bring-down, taxes due or past due shown only in B-II, a certified
  copy of a quiet title judgment entry). Taxes become blockers only when sold or certified as a lien.
- **Review / FYI** = standard exceptions and notes. A clean title has zero blockers.
- The TC owns every item; `provided_by` is who actually has it.

## Code map
- `titleagent/`: `pipeline.py` (steps), `prompts.py` (system prompt, seed lessons), `checklist.py`, `numbering.py`,
  `grounding.py`, `compare.py` (updated commitments), `llm.py` (Claude calls: structured output, streaming,
  server-side fallback), `flows.py` (read / review / re-run / train / export), `firestore_store.py` (the data),
  `storage.py` (`open_store()`), `exports/` (incl. `google_export.gs`), `emailer.py`, `training.py`, `demo.py`.
- `engine/main.py`: the Cloud Run service (FastAPI) around `flows.py`. Packages: `engine/requirements.txt`
  (`uv export --no-dev --no-hashes --no-emit-project --format requirements-txt -o engine/requirements.txt`).
- Header (owner 2026-11-04): the hub's header standard (RemyTCHB/HUB `docs/HEADER.md`), `web/src/header.jsx`:
  logo + Live clock, the page tabs in the middle, Active, light / dark + photo; pinned, slims on scroll; centred page titles;
  1280px content. The Live clock (`web/src/status.js`): the time from the website's own `Date` header (as the hub:
  HEAD on load, every 15 minutes and on return; never the device clock); green while the live reads are connected,
  indigo while an engine call runs, red when the reads fail or a call fails, with Retry Now only for calls that are
  safe to repeat (`api.js` SAFE_POST). Active (owner 2026-11-04, as the hub's): who's online, seen in the last five
  minutes, with phone / desktop; phones: photo → Who's Online. The hub writes check-ins from the page; here the page
  writes nothing, so `web/src/presence.js` checks in every minute through the engine (`POST /v1/presence`, which
  answers the list; quiet, never on the Live clock); `presence/{email}` is engine-only (no rule lets the page read it).
  Viewing as someone (Login As) checks nobody in; Sign Out marks the device gone.
- `web/`: Vite + Preact. `src/pages/` one file per screen, `src/data.js` live Firestore reads, `src/api.js` engine
  calls, `src/styles.css` the hub's tokens and components. Copy the hub's look from RemyTCHB/HUB (`app/app.dc.html`),
  e.g. the due date picker (`ui.jsx` DatePicker: the day, and for item due dates an hour and minute in Eastern time, saved as `due_time` "HH:MM"; the closing date is the day only) and Team Members (`pages/Team.jsx`).
- Team (owner 2026-10-30; Managers only, from the account menu): `settings/team` (name, email, role manager / lead /
  member, dept TC, a photo as a small data: URL or the hub's photo URL), saved by `PUT /v1/team`, which also sets
  `admins` (the managers) and `tcs` (everyone in TC). It was copied once from the hub's Managers and TC department
  (2026-10-30; the copy button was then removed, the hub's `/api/title-agent/team` stays unused). Names and emails
  live only in the database, never in this public repository.
- Login As User (owner 2026-11-04, as in the hub; the owner only): on Team Members the owner (GitHub secret
  `LOGIN_AS_OWNER`, never in the repo) can view the app as anyone who has signed in before: `POST /v1/login-as` makes
  a one-time Firebase sign-in for them marked `imp`, `POST /v1/login-as/back` returns (only from such a sign-in). An
  orange bar shows whose view it is. Changes are recorded "<them> (via <owner>)" (`User.by`); each use goes to
  `audit/` (server only). The engine identity needs `scripts/login_as_setup.sh` once (Auth Viewer + Token Creator).
- Permissions (`settings.permissions`, Settings): what Team Leaders and Members may do (`approve_lessons`,
  `report_missing`); Managers always can. The engine checks them (`allowed()` in `engine/main.py`); `/v1/me` returns
  `role` and `can` for the page.
- `titleagent/hub.py`: the Universal Team Hub connection. Only Closing Blockers go (one task per deal, "Title -
  <address>", in Monz's list, tagged "Title Commitment Agent"); a blocker cleared here is done there and the reverse.
  Sent after each review / re-run / blocker change (engine, in the background) and caught up each weekday
  morning after the 8:00 email (`titleagent/daily.py`; GitHub's backup runs `scripts/hub_sync.py`, and
  `hub-sync.yml` runs by hand only; owner 2026-10-30: no 15-minute runs);
  the hub calls `POST /v1/hub/items`. Signed both ways with `HUB_SYNC_SECRET` (GitHub secret; the hub has the same
  value as `TITLE_AGENT_SYNC_SECRET`).
- The 8:00 AM ET email (Closing Blockers only, owner 2026-10-30): Google Cloud Scheduler calls the engine
  (`POST /v1/tasks/morning`, `titleagent/daily.py`, set up once with `scripts/scheduler_setup.sh`), which sends it via
  Resend; `scripts/daily_email.py` on GitHub Actions is only the later backup (GitHub runs late or skips).
- Exports (owner 2026-10-30): every export is also saved in the team's Google Drive folder (Settings), in a folder
  per type (PDF, Word, Excel, CSV, Google Sheets, Google Docs; made the first time) with the date and time in its
  name; PDF / Word / Excel / CSV still download to the person's computer, Google Sheets / Docs go only to Drive. The
  Drive copy never holds up a download (`X-Drive-Copy` header). `google_export.gs` is version 2: after a change to
  it, the person who deployed it pastes it over the old one and deploys a new version (Test Google Folder says so).
- Help (owner 2026-11-03/04; set up as in the hub's Help, `pages/Help.jsx`): your photo → Help, or Settings → Open
  Help, opens a panel with the guide for your role (Managers: the Manager Guide; anyone who may approve lessons: the
  Team Leader Guide; otherwise the TC Guide). At the top, the guide PDFs to open or download: yours first (a Team
  Leader's or Manager's own copy gets a last page, Your Delete Passwords, added in the browser with pdf-lib and the
  fonts in `web/public/guides/fonts/`), then the guides your role may send on, without passwords. Below, contents +
  the guide (a contents row on tablets, full screen on phones). `docs/guide/build_guide.py` builds the PDFs,
  `guides.json` (the same guides as HTML) and `img/` into `web/public/guides/` (a test checks Help's links); rebuild
  after a change to the guide. The hub's delete passwords: `GET /v1/help/passwords` asks the hub (`hub.passwords()`,
  `POST <hub>/passwords`, signed with `HUB_SYNC_SECRET`), which decides per person from its team; never stored,
  logged or cached, and never in the shared PDFs. `scripts/connections_check.py` (Run workflow: Connections check)
  checks the live hub, engine, guides and that the secret isn't in the page.
- `scripts/gcp_setup.sh` (one-time Google Cloud setup), `scripts/evaluate.py` (accuracy on worked commitments kept
  outside the repo).
- Model: `claude-opus-5-5`, effort `high` (accuracy first). The system prompt must stay identical across a run's
  calls (prompt caching): put per-deal details in the step's task, not the system prompt.

## Checks before pushing
`uv run ruff check .`, `uv run pytest` with the Firestore emulator (`scripts/firestore_emulator.sh &` then
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 uv run pytest`), and `cd web && npm run build`. Page changes: run the
emulators + engine + page locally (README → Working on it) and look, on a phone width too.
