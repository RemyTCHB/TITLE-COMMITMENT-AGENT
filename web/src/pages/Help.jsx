// Help (everyone, from the account menu): the user guide for the person's role, read in the app as in the Universal
// Team Hub (contents on the left, the guide with its pictures; full screen on a phone) or as a PDF, what their role
// can do, and the everyday steps. Team Leaders and Managers also see the Team Hub's delete passwords in their guide,
// fetched from the hub through the engine each time (never in the page or the PDF).
// docs/guide/build_guide.py builds the PDFs and guides.json (the same guides as HTML) into public/guides/.
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api.js';
import { Icon, Spinner } from '../ui.jsx';

const GUIDES = {
  member: { name: 'TC Guide', file: 'Title_Commitment_Agent_TC_Guide.pdf',
    about: 'Reviewing commitments, working the list, exports, the Team Hub and the daily email.' },
  lead: { name: 'Team Leader Guide', file: 'Title_Commitment_Agent_Team_Leader_Guide.pdf',
    about: 'The TC Guide plus section 14: approving what the agent learns, and the Team Hub\'s delete passwords.' },
  manager: { name: 'Manager Guide', file: 'Title_Commitment_Agent_Manager_Guide.pdf',
    about: 'Everything, plus section 14: the team, settings, permissions, connections and every delete password.' },
};
const ROLE = { manager: 'Manager', lead: 'Team Leader', member: 'Member' };
const url = g => `/guides/${g.file}`;

// Which guide is yours: Managers get theirs; anyone who may approve lessons gets the Team Leader Guide.
export function guideFor(me) {
  if (me?.admin) return 'manager';
  return me?.can?.approve_lessons ? 'lead' : 'member';
}

const STEPS = [
  ['New commitment', 'Analyze → drop the PDF (and the contract) → Read Documents → confirm the deal type and closing date → Run Full Review.'],
  ['Every morning', 'Read the 8 AM email → open each deal → Open Only → work what\'s due → update statuses and notes.'],
  ['Item done', 'Tick its box (Cleared). A Closing Blocker is ticked done in the Team Hub too.'],
  ['Set a due date', 'Click the date on the item → pick the day → − / + for the time → Set Due Date.'],
  ['Send the list', 'Deal → Export List → pick what to include → PDF, Word, Excel, CSV, Google Sheets or Docs. A copy is kept in the team\'s Drive folder.'],
  ['Revised commitment', 'Deal → Updated Commitment → upload → Read Documents → Run Full Review. Statuses and notes carry over.'],
  ['Deal closed', 'Bottom of the deal → Mark Deal Closed.'],
];
const MISSING = ['Something\'s missing', 'Deal → Report Missing Item → fill it in → Send Feedback.'];
const APPROVE = ['Approve a lesson', 'Knowledge → Feedback Inbox → edit it into a general rule (no names, amounts or case numbers) → Approve Lesson.'];
const MANAGE = [
  ['Team', 'Your photo → Team: add people, roles, departments and photos → Save Changes.'],
  ['Settings', 'Your photo → Settings: permissions, who gets the email, due dates, the Drive folder → Save Settings.'],
];

let guidesP = null;  // guides.json, fetched once
const loadGuides = () => (guidesP = guidesP || fetch('/guides/guides.json', { cache: 'no-cache' })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .catch(e => { guidesP = null; throw e; }));

function Passwords({ pw, reader, mine }) {
  if (!mine) return <p class="note">{reader === 'manager' ? 'Managers see every delete password here.' : 'Team Leaders see their departments\' delete passwords here.'}</p>;
  if (!pw) return <p class="note"><Spinner /> Loading your passwords from the Team Hub…</p>;
  if (pw.error) return <p class="note red">{pw.error} Close the guide and open it again to retry.</p>;
  const rows = [...pw.rows.map(r => [r.dept, r.lead, r.sub]), ...pw.own.map(o => [`${o.name} (own, tasks and subtasks)`, o.pw, o.pw])];
  if (!rows.length) return <p class="note">{reader === 'manager' ? 'No delete passwords are set up in the Team Hub yet.' : 'No departments are turned on for you in the Team Hub yet, so there are no passwords to show. Ask a manager.'}</p>;
  const code = v => v ? <code>{v}</code> : <span class="muted">Not set</span>;
  return (
    <div class="g-table g-pw">
      <table>
        <thead><tr><th>{reader === 'manager' ? 'Department or person' : 'Department'}</th><th>Team Leader password (tasks)</th><th>Subtask password</th></tr></thead>
        <tbody>{rows.map(([who, lead, sub]) => <tr key={who}><td class="b">{who}</td><td>{code(lead)}</td><td>{code(sub)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// The guide inside the app: contents (sections) on the left, the guide on the right; it follows your scrolling.
function GuideReader({ reader, mine, onClose }) {
  const [g, setG] = useState(null), [err, setErr] = useState(''), [sec, setSec] = useState(0), [pw, setPw] = useState(null);
  const body = useRef(null), panel = useRef(null);
  useEffect(() => {
    loadGuides().then(all => setG(all[reader])).catch(() => setErr('Could not load the guide. Check your connection and try again.'));
    if (mine && reader !== 'member') api.helpPasswords().then(setPw).catch(e => setPw({ error: e.message }));
    const key = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; };
  }, [reader]);
  useEffect(() => {  // keep the section you're on in view in the contents (a sideways row on a phone)
    panel.current?.querySelector('.guide-nav button.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sec, g]);
  const heads = () => [...(body.current?.querySelectorAll('h2[data-sec]') || [])];
  const goTo = i => { const h = heads()[i]; if (h) body.current.scrollTo({ top: Math.max(0, h.offsetTop - 12), behavior: 'smooth' }); setSec(i); };
  const onScroll = e => {
    const el = e.currentTarget; let i = 0;
    heads().forEach((h, j) => { if (h.offsetTop - 40 <= el.scrollTop) i = j; });
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) i = heads().length - 1;
    if (i !== sec) setSec(i);
  };
  const [before, after] = g ? g.html.split('<div data-hub-pw></div>') : ['', ''];
  return createPortal(  // on the page body, above the header (the main column is a layer of its own)
    <div class="guide-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div class="guide-panel" role="dialog" aria-modal="true" aria-label={g?.title || 'Help'} tabIndex={-1} ref={panel}>
        <div class="guide-head">
          <div>
            <span class="eyebrow">Help</span>
            <h2>{g?.title || GUIDES[reader].name}</h2>
            <p>Title Commitment Agent · for {g?.for || '…'}</p>
          </div>
          <a class="btn glass pill sm" href={url(GUIDES[reader])} target="_blank" rel="noopener"><Icon name="download" /> PDF</a>
          <button class="guide-close" onClick={onClose} title="Close" aria-label="Close"><Icon name="x" /></button>
        </div>
        <div class="guide-main">
          <nav class="guide-nav" aria-label="Contents">
            {(g?.sections || []).map((x, i) => (
              <button key={x.id} class={i === sec ? 'on' : ''} onClick={() => goTo(i)}><span>{x.num}</span>{x.title}</button>))}
          </nav>
          <div class="guide-body" ref={body} onScroll={onScroll}>
            {!g ? <p class="note">{err || <><Spinner /> Loading the guide…</>}</p> : (
              <>
                <div dangerouslySetInnerHTML={{ __html: before }} />
                {after !== undefined && <Passwords pw={pw} reader={reader} mine={mine} />}
                {after !== undefined && <div dangerouslySetInnerHTML={{ __html: after }} />}
              </>)}
          </div>
        </div>
      </div>
    </div>, document.body);
}

function GuideCard({ g, mine, onRead }) {
  return (
    <article class={`card help-guide ${mine ? 'mine' : ''}`}>
      <span class="help-icon"><Icon name="book" size={22} /></span>
      <div class="help-text">
        <b>{g.name}{mine && <span class="chip green">Yours</span>}</b>
        <span>{g.about}</span>
      </div>
      <div class="toolbar">
        <button class={`btn pill sm ${mine ? 'primary' : 'glass'}`} onClick={onRead}><Icon name="book" /> Read The Guide</button>
        <a class="btn ghost pill sm" href={url(g)} target="_blank" rel="noopener"><Icon name="file" /> PDF</a>
      </div>
    </article>
  );
}

export function Help({ me }) {
  const yours = guideFor(me), can = me?.can || {};
  const [reading, setReading] = useState('');
  const role = me?.admin ? 'manager' : me?.role || 'member';
  const abilities = [
    ['Review commitments and work the list', true],
    ['Export, and see the Team Hub and the daily email', true],
    ['Report Missing Item', can.report_missing !== false],
    ['Approve lessons (Knowledge → Feedback Inbox)', !!can.approve_lessons],
    ['Change the team and the settings', !!me?.admin],
  ];
  const steps = [...STEPS.slice(0, 3), ...(can.report_missing !== false ? [MISSING] : []), ...STEPS.slice(3),
    ...(can.approve_lessons ? [APPROVE] : []), ...(me?.admin ? MANAGE : [])];
  return (
    <>
      <section class="hero">
        <div class="hero-text">
          <div class="eyebrow-row"><span class="eyebrow">{me ? ROLE[role] : 'Help'}</span></div>
          <h1 class="title">Help And <span class="accent">Guides</span></h1>
          <p class="lede">The guide for your role, what your role can do, and the everyday steps.</p>
        </div>
      </section>

      <div class="section-head"><h2>Your Guide</h2><p>Read it here, or open the PDF to print or save.</p></div>
      <GuideCard g={GUIDES[yours]} mine onRead={() => setReading(yours)} />

      {me?.admin && (
        <>
          <div class="section-head"><h2>All Guides</h2><p>Send the right one to someone new.</p></div>
          <div class="help-list">
            {['member', 'lead'].map(k => <GuideCard key={k} g={GUIDES[k]} onRead={() => setReading(k)} />)}
          </div>
        </>)}

      <div class="help-cols">
        <section class="card help-card">
          <h2>What You Can Do</h2>
          <ul class="help-can">
            {abilities.map(([text, ok]) => (
              <li key={text} class={ok ? '' : 'off'}>
                <span class="help-mark" aria-label={ok ? 'Yes' : 'No'}><Icon name={ok ? 'check' : 'x'} size={14} stroke={3} /></span>
                {text}</li>))}
          </ul>
          {!me?.admin && <p class="row-sub" style="margin:0">A manager can change what your role may do (Settings → Permissions).</p>}
        </section>
        <section class="card help-card">
          <h2>Everyday Steps</h2>
          <dl class="help-steps">
            {steps.map(([what, how]) => <div key={what}><dt>{what}</dt><dd>{how}</dd></div>)}
          </dl>
        </section>
      </div>
      {reading && <GuideReader reader={reading} mine={reading === yours} onClose={() => setReading('')} />}
    </>
  );
}
