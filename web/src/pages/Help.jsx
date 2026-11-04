// Help, set up as in the Universal Team Hub: your photo → Help (or Settings → Open Help) opens a panel with the guide for
// your role. At the top, the guide PDFs to open or download: yours first (Team Leaders and Managers: your own copy ends
// with a page of your Team Hub delete passwords, added here in the browser), then the other guides your role may send
// on (without passwords). Below, the guide itself: contents on the left (a row along the top on narrower screens), the
// guide with its pictures on the right; full screen on a phone. The passwords come from the hub through the engine each
// time (GET /v1/help/passwords), never stored. docs/guide/build_guide.py builds the PDFs and guides.json (the same
// guides as HTML) into public/guides/.
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useSettings } from '../data.js';
import { Icon, Spinner, useToast, when } from '../ui.jsx';

const GUIDES = {
  member: { name: 'TC Guide', file: 'Title_Commitment_Agent_TC_Guide.pdf', for: 'for TCs',
    about: 'Reviewing commitments, working the list, exports, the Team Hub and the daily email.' },
  lead: { name: 'Team Leader Guide', file: 'Title_Commitment_Agent_Team_Leader_Guide.pdf', for: 'for Team Leaders',
    about: 'Ends with your departments\' delete passwords.' },
  manager: { name: 'Manager Guide', file: 'Title_Commitment_Agent_Manager_Guide.pdf', for: 'for Managers',
    about: 'Ends with every delete password.' },
};
const SHARE = { manager: ['manager', 'lead', 'member'], lead: ['lead', 'member'], member: ['member'] };

// Which guide is yours: Managers get theirs; anyone who may approve lessons gets the Team Leader Guide.
export function guideFor(me) {
  if (me?.admin) return 'manager';
  return me?.can?.approve_lessons ? 'lead' : 'member';
}

let guidesP = null;  // guides.json, fetched once
const loadGuides = () => (guidesP = guidesP || fetch('/guides/guides.json', { cache: 'no-cache' })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .catch(e => { guidesP = null; throw e; }));

// Settings → Help, as in the hub's My Settings.
export function HelpCard({ me, onOpen }) {
  const role = guideFor(me);
  return (
    <div class="help-card">
      <Icon name="help" size={28} />
      <div>
        <b>Help</b>
        <span>The {GUIDES[role].name}, with screenshots{role === 'member' ? '.'
          : ` and the Team Hub's delete passwords for ${role === 'manager' ? 'every department' : 'your departments'}.`}</span>
      </div>
      <button class="btn primary pill sm" type="button" onClick={onOpen}>Open Help</button>
    </div>
  );
}

// ---------------------------------------------------------------- your own PDF: + Your Delete Passwords
const get = u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`Could not load ${u}`); return r.arrayBuffer(); });

async function withPasswords(base, { role, who, pw, guide }) {
  const [{ PDFDocument, rgb }, { default: fontkit }] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')]);
  const doc = await PDFDocument.load(base);
  doc.registerFontkit(fontkit);
  const [fh, fb, fr] = await Promise.all(['Baloo2-700-latin.ttf', 'NunitoSans-700-latin.ttf', 'NunitoSans-400-latin.ttf']
    .map(f => get(`/guides/fonts/${f}`).then(b => doc.embedFont(b))));
  const hex = h => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const INDIGO = hex('#4d458a'), RED = hex('#bd2239'), INK = hex('#211e33'), BODY = hex('#47445a'), MUTED = hex('#767388');
  const LAV = hex('#f2f1f9'), LINE = hex('#dddbea');
  const W = 612, H = 792, M = 58, page = doc.addPage([W, H]);
  let y = H - 70;
  const text = (t, x, yy, f, size, color) => page.drawText(String(t).replace(/[\u202f\u00a0]/g, ' '), { x, y: yy, font: f, size, color });
  const wrap = (t, f, size, width) => {
    const out = []; let line = '';
    t.split(' ').forEach(w => { const next = line ? `${line} ${w}` : w; if (f.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = w; } else line = next; });
    if (line) out.push(line);
    return out;
  };
  const para = (t, f = fr, size = 10.5, color = BODY, gap = 15) => { wrap(t, f, size, W - 2 * M).forEach(l => { text(l, M, y, f, size, color); y -= gap; }); y -= 4; };
  const fit = (t, f, size, width) => { let s = t; while (s.length > 1 && f.widthOfTextAtSize(s, size) > width) s = s.slice(0, -4) + '...'; return s; };
  text('TITLE COMMITMENT AGENT', M, y, fb, 9, RED); y -= 30;
  text('Your Delete Passwords', M, y, fh, 26, INDIGO); y -= 14;
  page.drawRectangle({ x: M, y, width: 60, height: 3, color: RED }); y -= 22;
  para(`For ${who} · ${role === 'manager' ? 'Manager' : 'Team Leader'} · ${when(new Date())}`, fr, 9.5, MUTED, 13);
  para(role === 'manager'
    ? 'Every delete password in the Universal Team Hub, straight from the hub. Use a department\'s Team Leader password to delete someone else\'s task there, and its subtask password to remove a subtask.'
    : 'The passwords for the departments you lead in the Universal Team Hub, straight from the hub. Use the Team Leader password to delete a team member\'s task, and the subtask password to remove a subtask. Share only the subtask password with your members when they need it.');
  y -= 6;
  const cols = [M, M + 170, M + 340], rows = [...pw.rows.map(r => [r.dept, r.lead || 'Not set', r.sub || 'Not set']),
    ...pw.own.map(o => [`${o.name} (own)`, o.pw, o.pw])];
  page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 26, color: INDIGO });
  [role === 'manager' ? 'Department or person' : 'Department', 'Team Leader password (tasks)', 'Subtask password']
    .forEach((h, i) => text(h, cols[i] + 10, y, fh, 10, rgb(1, 1, 1)));
  y -= 30;
  rows.forEach((r, i) => {
    if (i % 2) page.drawRectangle({ x: M, y: y - 9, width: W - 2 * M, height: 26, color: LAV });
    r.forEach((v, j) => text(fit(v, j ? fr : fb, 10.5, 160), cols[j] + 10, y, j ? fr : fb, 10.5, INK));
    page.drawLine({ start: { x: M, y: y - 9 }, end: { x: W - M, y: y - 9 }, thickness: 0.6, color: LINE });
    y -= 26;
  });
  if (!rows.length) para(role === 'manager' ? 'No delete passwords are set up in the Team Hub yet.'
    : 'No departments are turned on for you in the Team Hub yet, so there are no passwords to show. Ask a manager.');
  y -= 14;
  para('Passwords are case-sensitive. Keep this page private: it is added only to your own copy, and only when you open or download it from Help.', fr, 9.5, MUTED, 13);
  text(`Title Commitment Agent · ${guide} · Confidential`, M, 34, fb, 8, INDIGO);
  text(String(doc.getPageCount()), W - M - 8, 34, fb, 8, RED);
  return doc.save();
}

function Passwords({ pw, role }) {
  if (!pw) return <p class="note"><Spinner /> Loading your passwords from the Team Hub…</p>;
  if (pw.error) return <p class="note red">{pw.error} Close Help and open it again to retry.</p>;
  const rows = [...pw.rows.map(r => [r.dept, r.lead, r.sub]), ...pw.own.map(o => [`${o.name} (own, tasks and subtasks)`, o.pw, o.pw])];
  if (!rows.length) return <p class="note">{role === 'manager' ? 'No delete passwords are set up in the Team Hub yet.' : 'No departments are turned on for you in the Team Hub yet, so there are no passwords to show. Ask a manager.'}</p>;
  const code = v => v ? <code>{v}</code> : <span class="muted">Not set</span>;
  return (
    <div class="g-table g-pw">
      <table>
        <thead><tr><th>{role === 'manager' ? 'Department or person' : 'Department'}</th><th>Team Leader password (tasks)</th><th>Subtask password</th></tr></thead>
        <tbody>{rows.map(([who, lead, sub]) => <tr key={who}><td class="b">{who}</td><td>{code(lead)}</td><td>{code(sub)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// The Help panel: the guide PDFs, then the guide (contents + text); it follows your scrolling.
export function HelpPanel({ me, onClose }) {
  const toast = useToast();
  const s = useSettings();
  const role = guideFor(me);
  const [g, setG] = useState(null), [err, setErr] = useState(''), [sec, setSec] = useState(0), [pw, setPw] = useState(null);
  const [busy, setBusy] = useState('');
  const body = useRef(null), panel = useRef(null), pwP = useRef(null);
  useEffect(() => {
    loadGuides().then(all => setG(all[role])).catch(() => setErr('Could not load the guide. Check your connection and try again.'));
    if (role !== 'member') {
      pwP.current = api.helpPasswords().then(p => { setPw(p); return p; }).catch(e => { const p = { error: e.message }; setPw(p); return p; });
    }
    const key = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; };
  }, [role]);
  useEffect(() => {  // keep the section you're on in view in the contents (a sideways row on narrower screens)
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
  // a guide PDF: yours (Team Leaders and Managers: + Your Delete Passwords), or another to send on, without passwords
  const pdf = async (kind, how) => {
    const guide = GUIDES[kind], mine = kind === role;
    const tab = how === 'open' ? window.open('', '_blank') : null;  // now, while the click still counts (pop-up blockers)
    setBusy(kind + how);
    try {
      let bytes = await get(`/guides/${guide.file}`);
      if (mine && role !== 'member') {
        const p = await pwP.current;
        if (!p || p.error) throw new Error(p?.error || 'Your passwords could not be loaded. Close Help and open it again.');
        const person = (s?.team || []).find(x => x.email === me.email);
        bytes = await withPasswords(bytes, { role, pw: p, guide: guide.name,
          who: person ? `${person.name} (${me.email})` : me.email });
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (tab) tab.location.href = url;
      else {
        const a = Object.assign(document.createElement('a'), { href: url, download: guide.file });
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      tab?.close();
      toast(e.message || 'Could not make the PDF.', true);
    } finally { setBusy(''); }
  };
  const [before, after] = g ? g.html.split('<div data-hub-pw></div>') : ['', ''];
  return createPortal(  // on the page body, above the header (the main column is a layer of its own)
    <div class="guide-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div class="guide-panel" role="dialog" aria-modal="true" aria-label="Help" tabIndex={-1} ref={panel}>
        <div class="guide-head">
          <div>
            <span class="eyebrow">Help</span>
            <h2>{GUIDES[role].name}</h2>
            <p>Title Commitment Agent · {GUIDES[role].for}</p>
          </div>
          <button class="guide-close" onClick={onClose} title="Close" aria-label="Close"><Icon name="x" /></button>
        </div>
        <div class="guide-pdfs">
          {SHARE[role].map(k => {
            const mine = k === role;
            return (
              <div key={k} class={`guide-pdf ${mine ? 'mine' : ''} ${busy.startsWith(k) ? 'busy' : ''}`}>
                <Icon name="book" size={18} />
                <div>
                  <b>{GUIDES[k].name}{mine && <span class="chip green">Yours</span>}</b>
                  <span>{mine ? GUIDES[k].about : 'Without passwords, to send to someone.'}</span>
                </div>
                <div class="guide-pdf-acts">
                  <button type="button" class={`btn pill sm ${mine ? 'primary' : 'glass'}`} title="Open the PDF in a new tab"
                    onClick={() => pdf(k, 'open')}>{busy === `${k}open` ? <Spinner /> : <Icon name="file" />} {busy === `${k}open` ? 'Preparing…' : 'Open'}</button>
                  <button type="button" class="btn ghost pill sm" title="Download the PDF"
                    onClick={() => pdf(k, 'download')}>{busy === `${k}download` ? <Spinner /> : <Icon name="download" />} Download</button>
                </div>
              </div>);
          })}
        </div>
        <div class="guide-main">
          <nav class="guide-nav" aria-label="Contents">
            {(g?.sections || []).map((x, i) => (
              <button key={x.id} class={i === sec ? 'on' : ''} onClick={() => goTo(i)}><span>{x.num}</span>{x.title}</button>))}
          </nav>
          <div class="guide-body" ref={body} onScroll={onScroll}>
            <div class="guide-text">
              {!g ? <p class="note">{err || <><Spinner /> Loading the guide…</>}</p> : (
                <>
                  <div dangerouslySetInnerHTML={{ __html: before }} />
                  {after !== undefined && <Passwords pw={pw} role={role} />}
                  {after !== undefined && <div dangerouslySetInnerHTML={{ __html: after }} />}
                </>)}
            </div>
          </div>
        </div>
      </div>
    </div>, document.body);
}
