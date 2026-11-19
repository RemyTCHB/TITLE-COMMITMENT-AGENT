// Knowledge: the Feedback Inbox (admins turn feedback into lessons), the lessons the agent follows on every deal, and
// the professional checklist, which the team can add to with the checklist password (owner 2026-11-19).
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useReference, useSettings } from '../data.js';
import { db } from '../firebase.js';
import { Icon, Modal, PageTitle, Seg, Spinner, useToast, when } from '../ui.jsx';

const KIND = { missing: 'Missing Item', not_needed: 'Not Needed', wrong: 'Wrong Info', training: 'Training Gap',
  moved: 'Moved Section' };
const SECTION = { blocker: 'Closing Blocker', before: 'Before Closing', fyi: 'Review / FYI' };

function useCol(name) {
  const [rows, setRows] = useState(undefined);
  useEffect(() => onSnapshot(collection(db, name), s => setRows(s.docs.map(d => d.data())), () => setRows([])), [name]);
  return rows;
}

// A suggested starting point; the admin edits it into a general rule.
function suggested(f) {
  const d = f.detail || {};
  if (d.suggested_lesson) return d.suggested_lesson;
  if (f.kind === 'missing') return `On every commitment, check for: ${f.text}. ${d.why || ''}`.trim();
  if (f.kind === 'not_needed') return `Do not list this as an action item when it appears: ${f.text}`;
  if (f.kind === 'moved') return `Items like "${f.text}" are ${SECTION[d.to]}, not ${SECTION[d.from]}.`;
  return f.text;
}

function InboxCard({ f, admin }) {
  const toast = useToast();
  const [text, setText] = useState(suggested(f));
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState('');
  const d = f.detail || {};
  useEffect(() => { if (!edited) setText(suggested(f)); }, [d.suggested_lesson, d.to]);  // the agent's draft arrives
  const act = async approve => {
    setBusy(approve ? 'yes' : 'no');
    try { await api.resolve(f.id, approve, text); toast(approve ? 'Lesson approved: it applies from the next review.' : 'Rejected.'); }
    catch (e) { toast(e.message, true); setBusy(''); }
  };
  return (
    <article class="card row-card p-before" style="display:flex;flex-direction:column;gap:10px">
      <div class="eyebrow-row">
        <span class="chip orange">{KIND[f.kind] || f.kind}</span>
        <span class="row-sub">{f.created_by} · {when(f.created_at)}{f.deal_id ? ' · ' : ''}
          {f.deal_id && <a href={`#/deal/${f.deal_id}`}>deal</a>}{d.where ? ` · ${d.where}` : ''}</span>
      </div>
      <span class="row-title">{f.text}</span>
      {f.kind === 'moved' && <span class="row-sub">Moved from <b>{SECTION[d.from]}</b> to <b>{SECTION[d.to]}</b>
        {d.source ? ` · ${d.source.split(':')[0]}` : ''}</span>}
      {d.why && <span class="row-sub">{d.why}</span>}
      {['moved', 'missing'].includes(f.kind) && !d.suggested_lesson && <span class="row-sub"><Spinner /> The agent is drafting the lesson…</span>}
      <label class="field"><span>Lesson The Agent Will Follow</span>
        <textarea class="input" rows={3} value={text} disabled={!admin} onInput={e => { setText(e.currentTarget.value); setEdited(true); }} /></label>
      <p class="row-sub" style="margin:0">Write it as a general rule: no names, addresses, amounts or case numbers from one deal.</p>
      {admin && (
        <div class="toolbar">
          <button class="btn primary pill sm" disabled={!!busy || !text.trim()} onClick={() => act(true)}>
            {busy === 'yes' ? <Spinner /> : <Icon name="check" />} Approve Lesson</button>
          <button class="btn ghost pill sm" disabled={!!busy} onClick={() => act(false)}>Reject</button>
        </div>)}
    </article>
  );
}

// Where an approved lesson was learned (the Feedback Inbox entry it came from): only shown here, never sent to the agent.
function LearnedFrom({ r }) {
  const what = r.kind === 'moved' ? `${r.by || 'Someone'} moved "${r.item}" from ${SECTION[r.from]} to ${SECTION[r.to]}`
    : r.kind === 'missing' ? `${r.by || 'Someone'} reported "${r.item}" missing`
      : r.kind === 'training' ? `Training: the agent missed "${r.item}"` : `Feedback on "${r.item}"`;
  return (
    <span class="row-sub learned"><Icon name="book" size={13} /> Learned from: {what}
      {r.deal_id ? <> on <a href={`#/deal/${r.deal_id}`}>{r.address || `deal ${r.deal_id}`}</a></> : ''}</span>
  );
}

function LessonRow({ x, admin }) {
  const toast = useToast();
  const flip = async () => {
    try { await api.setLesson(x.id, { active: !x.active }); } catch (e) { toast(e.message, true); }
  };
  return (
    <div class={`card row-card ${x.active ? 'p-fyi' : 'done'}`} style="display:flex;gap:14px;align-items:flex-start">
      <div class="row-text" style="cursor:default">
        <span style="font-size:15px;color:var(--text-body)">{x.text}</span>
        <span class="row-sub" style="font-size:13px">{(x.source || '').replace(/^./, c => c.toUpperCase())} · {x.created_by}
          {' · '}{when(x.created_at)}{x.approved_by ? ` · approved by ${x.approved_by}` : ''}</span>
        {x.ref && <LearnedFrom r={x.ref} />}
      </div>
      <button class="switch" role="switch" aria-checked={!!x.active} aria-label={x.active ? 'Turn this lesson off' : 'Turn this lesson on'}
        disabled={!admin} onClick={flip} title={admin ? '' : 'Lessons are changed by the people Settings → Permissions allows'} />
    </div>
  );
}

const TEAM_GROUP = 'Team Additions';

// Add A Check: something the agent looks for on every file (or the deal types picked), from the next review. Needs the
// checklist password (the CHECKLIST secret); the engine checks it and never keeps or logs what was typed.
function AddCheck({ reference, onClose }) {
  const toast = useToast();
  const groups = [...(reference?.checklist || []).map(g => g.group).filter(g => g !== TEAM_GROUP), TEAM_GROUP];
  const [f, setF] = useState({ group: TEAM_GROUP, name: '', look_for: '', deal_types: [], password: '' });
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.currentTarget.value });
  const flip = t => setF({ ...f, deal_types: f.deal_types.includes(t) ? f.deal_types.filter(x => x !== t) : [...f.deal_types, t] });
  const send = async () => {
    setBusy(true);
    try { await api.addCheck(f); toast('Added to the checklist: the agent runs it from the next review.'); onClose(); }
    catch (e) { toast(e.message, true); setBusy(false); }
  };
  return (
    <Modal title="Add A Check" onClose={onClose}>
      <p class="row-sub" style="margin:0">Something to look for on every file, the way a seasoned title agent would.
        Write it as a general rule: no names, addresses, amounts or numbers from one deal.</p>
      <label class="field"><span>Group</span>
        <select class="input" value={f.group} onChange={set('group')}>{groups.map(g => <option key={g}>{g}</option>)}</select></label>
      <label class="field"><span>Check</span>
        <input class="input" value={f.name} onInput={set('name')} placeholder="e.g. Final water and sewer readings" /></label>
      <label class="field"><span>What To Look For</span>
        <textarea class="input" rows={3} value={f.look_for} onInput={set('look_for')}
          placeholder="e.g. In cities that lien unpaid water or sewer bills, order a final reading and list the payoff as a Closing Blocker." /></label>
      <div class="field"><span>Deal Types (None Picked: Every Deal)</span>
        <div class="people-pick">{(reference?.deal_types || []).map(t => (
          <button key={t} type="button" class="person-chip" aria-pressed={f.deal_types.includes(t)} style="padding:6px 12px"
            onClick={() => flip(t)}>{t}{f.deal_types.includes(t) && <Icon name="check" size={14} stroke={3} />}</button>))}</div></div>
      <label class="field"><span>Checklist Password</span>
        <input class="input" type="password" autocomplete="off" value={f.password} onInput={set('password')}
          onKeyDown={e => e.key === 'Enter' && send()} /></label>
      <div class="actions">
        <button class="btn ghost pill" onClick={onClose}>Cancel</button>
        <button class="btn primary pill" disabled={busy || f.name.trim().length < 3 || f.look_for.trim().length < 10 || !f.password}
          onClick={send}>{busy ? <Spinner /> : <Icon name="plus" />} Add Check</button>
      </div>
    </Modal>
  );
}

function RemoveCheck({ check, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.removeCheck(check.id, password); toast('Removed from the checklist.'); onClose(); }
    catch (e) { toast(e.message, true); setBusy(false); }
  };
  return (
    <Modal title="Remove This Check?" onClose={onClose}>
      <p class="lede" style="font-size:15px"><b>{check.name}</b>: the agent stops running it from the next review.</p>
      <label class="field"><span>Checklist Password</span>
        <input class="input" type="password" autocomplete="off" value={password} onInput={e => setPassword(e.currentTarget.value)}
          onKeyDown={e => e.key === 'Enter' && password && send()} /></label>
      <div class="actions">
        <button class="btn ghost pill" onClick={onClose}>Cancel</button>
        <button class="btn primary pill" disabled={busy || !password} onClick={send}>{busy && <Spinner />} Remove Check</button>
      </div>
    </Modal>
  );
}

export function Knowledge({ me }) {
  const toast = useToast();
  const ref = useReference();
  const admin = !!me?.can?.approve_lessons;  // Settings → Permissions (managers always)
  const feedback = useCol('feedback');
  const lessons = useCol('lessons');
  const settings = useSettings();
  const [newLesson, setNewLesson] = useState('');
  const [showChecklist, setShowChecklist] = useState(false);
  const [dialog, setDialog] = useState(null);  // 'add' or a team check to remove
  const inbox = (feedback || []).filter(f => f.status === 'pending').sort((a, b) => b.id - a.id);
  const all = (lessons || []).sort((a, b) => a.id - b.id);
  const active = all.filter(x => x.active);
  const learned = all.filter(x => x.ref).length;
  // the built-in checks (from the engine) and the team's own (settings "checklist_extra", live)
  const team = (settings?.checklist_extra || []).map(c => ({ ...c, deal_types: c.deal_types || [], team: true }));
  const groups = [...(ref?.checklist || []).map(g => g.group), ...team.map(c => c.group || TEAM_GROUP)]
    .filter((g, n, a) => a.indexOf(g) === n)
    .map(g => ({ group: g, checks: [...((ref?.checklist || []).find(x => x.group === g)?.checks || []),
      ...team.filter(c => (c.group || TEAM_GROUP) === g)] }));
  const checks = groups.reduce((n, g) => n + g.checks.length, 0);
  const add = async () => {
    try { await api.addLesson(newLesson.trim()); setNewLesson(''); toast('Lesson added: it applies from the next review.'); }
    catch (e) { toast(e.message, true); }
  };
  return (
    <>
      <PageTitle>Team <span class="accent">Knowledge</span></PageTitle>
      <div class="tiles">
        <div class="card tile"><span>Active Lessons</span><b>{active.length}</b><small>{all.length - active.length} turned off</small></div>
        <div class="card tile"><span>Learned From The Team</span><b class={learned ? 'green' : 'muted'}>{learned}</b>
          <small>lessons from moved and missing items</small></div>
        <div class="card tile"><span>Pro Checklist</span><b>{checks || '—'}</b><small>{team.length} added by the team · {groups.length} groups</small></div>
        <div class="card tile"><span>Feedback Waiting</span><b class={inbox.length ? 'red' : 'green'}>{inbox.length}</b>
          <small>{inbox.length ? 'needs approving' : 'inbox is empty'}</small></div>
      </div>

      <div class="section-head"><h2>Feedback Inbox</h2><p>From items moved to another section, Report Missing Item and item feedback. The agent drafts each lesson; approve it to use it from the next review.</p></div>
      {feedback === undefined ? <Spinner /> : inbox.length ? (
        <div class="list">{inbox.map(f => <InboxCard key={f.id} f={f} admin={admin} />)}</div>
      ) : <div class="note green">Inbox is empty. Every piece of feedback has been reviewed.</div>}
      {inbox.length > 0 && !admin && <p class="row-sub" style="margin:0">Managers approve lessons, and whoever Settings → Permissions allows.</p>}

      <div class="section-head"><h2>Lessons</h2><p>Turn one off to stop the agent using it; it takes effect on the next review.</p></div>
      <div class="list">{all.map(x => <LessonRow key={x.id} x={x} admin={admin} />)}</div>
      {admin && (
        <div class="card bar-card">
          <input class="input" style="flex:1 1 300px" value={newLesson} onInput={e => setNewLesson(e.currentTarget.value)}
            placeholder="Add a lesson, e.g. In Florida, always order a municipal lien search." />
          <button class="btn primary" disabled={!newLesson.trim()} onClick={add}><Icon name="plus" /> Add Lesson</button>
        </div>)}

      <div class="section-head"><h2>The Professional Checklist</h2><p>What the agent checks on every deal. Anyone with
        the checklist password can add to it.</p>
        <button class="link-btn" onClick={() => setDialog('add')}><Icon name="plus" /> Add A Check</button>
        <button class="link-btn" onClick={() => setShowChecklist(!showChecklist)}>{showChecklist ? 'Hide' : 'Show'} All {checks}</button></div>
      {showChecklist && groups.map(g => (
        <section key={g.group} class="card" style="padding:16px 20px;display:flex;flex-direction:column;gap:8px">
          <h3 style="font-size:17px">{g.group}</h3>
          {g.checks.map(c => (
            <div key={c.id} class="check-line"><span><b style="color:var(--tchb-indigo-700)">{c.name}</b>
              {c.deal_types.length ? <span class="row-sub"> (only {c.deal_types.join(', ')})</span> : ''}: {c.look_for}
              {c.team && <span class="row-sub"> · <span class="chip green">Team</span> added by {c.by} {c.at ? `on ${when(c.at)}` : ''}</span>}</span>
              {c.team && <button class="mini muted" title="Remove this check" aria-label={`Remove ${c.name}`} onClick={() => setDialog(c)}>
                <Icon name="x" /></button>}</div>))}
        </section>))}
      {dialog === 'add' && <AddCheck reference={ref} onClose={() => { setDialog(null); setShowChecklist(true); }} />}
      {dialog && dialog !== 'add' && <RemoveCheck check={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}
