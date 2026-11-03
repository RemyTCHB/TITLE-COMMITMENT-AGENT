// Help (everyone, from the account menu): the user guide for the person's role, what their role can do, and the
// everyday steps. The guides are PDFs built by docs/guide/build_guide.py into public/guides/ (the same GUIDES).
import { Icon } from '../ui.jsx';

const GUIDES = {
  member: { name: 'TC Guide', file: 'Title_Commitment_Agent_TC_Guide.pdf',
    about: 'Reviewing commitments, working the list, exports, the Team Hub and the daily email.' },
  lead: { name: 'Team Leader Guide', file: 'Title_Commitment_Agent_Team_Leader_Guide.pdf',
    about: 'The TC Guide plus section 14: approving what the agent learns (the Feedback Inbox and lessons).' },
  manager: { name: 'Manager Guide', file: 'Title_Commitment_Agent_Manager_Guide.pdf',
    about: 'Everything, plus section 14: the team, settings, permissions and connections.' },
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

function GuideCard({ g, mine }) {
  return (
    <article class={`card help-guide ${mine ? 'mine' : ''}`}>
      <span class="help-icon"><Icon name="book" size={22} /></span>
      <div class="help-text">
        <b>{g.name}{mine && <span class="chip green">Yours</span>}</b>
        <span>{g.about}</span>
      </div>
      <div class="toolbar">
        <a class={`btn pill sm ${mine ? 'primary' : 'glass'}`} href={url(g)} target="_blank" rel="noopener">
          <Icon name="file" /> Open</a>
        <a class="btn ghost pill sm" href={url(g)} download><Icon name="download" /> Download</a>
      </div>
    </article>
  );
}

export function Help({ me }) {
  const yours = guideFor(me), can = me?.can || {};
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

      <div class="section-head"><h2>Your Guide</h2><p>A PDF, opens in a new tab.</p></div>
      <GuideCard g={GUIDES[yours]} mine />

      {me?.admin && (
        <>
          <div class="section-head"><h2>All Guides</h2><p>Send the right one to someone new.</p></div>
          <div class="help-list">
            {['member', 'lead'].map(k => <GuideCard key={k} g={GUIDES[k]} />)}
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
    </>
  );
}
