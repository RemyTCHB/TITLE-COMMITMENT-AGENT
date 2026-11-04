// The header, to the Universal Team Hub's standard (RemyTCHB/HUB docs/HEADER.md):
// left the logo and the Live clock, middle the page tabs (one company, so no company switch), right Active, light /
// dark and the photo. Pinned; only its padding slims once the page scrolls. Phones: row 1 logo, clock (time only),
// photo; row 2 the tabs; Active and light / dark move into the photo menu (Who's Online).
import { useEffect, useRef, useState } from 'preact/hooks';
import { useSettings } from './data.js';
import { api } from './api.js';
import { signIn, signInWithToken, signOutNow } from './firebase.js';
import { presenceOut, useOnline } from './presence.js';
import { go } from './router.js';
import { clearFailure, eastern, liveState, now, useStatus } from './status.js';
import { useTheme } from './theme.js';
import { Icon, Menu, Modal, Seg, Spinner, initials, useMenu, useToast } from './ui.jsx';

const TABS = [
  { value: 'deals', label: 'Deals' }, { value: 'analyze', label: 'Analyze' },
  { value: 'training', label: 'Training' }, { value: 'knowledge', label: 'Knowledge' },
];

const HEAD = { live: 'Live: Everything Is Saved', saving: 'Saving…', unsaved: 'Not Saved', offline: 'Offline',
  connecting: 'Connecting…' };
const LABEL = { live: 'Live', saving: 'Saving', unsaved: 'Not Saved', offline: 'Offline', connecting: 'Connecting' };

// The Live clock: the server-synced Eastern time in the colours of the connection, and its details.
function LiveClock() {
  const s = useStatus();
  const st = liveState(s);
  const menu = useMenu();
  const [t, setT] = useState(now());
  useEffect(() => { const i = setInterval(() => setT(now()), 1000); return () => clearInterval(i); }, []);
  const e = eastern(t);
  const f = s.failure;
  const text = {
    live: 'You see the team\'s changes as they happen, and every change you make is saved for the whole team.',
    saving: 'Your latest change is on its way: a review, a re-run, an export or an update to the list.',
    unsaved: f ? `${f.message}${!f.refused && !f.retry ? ' Do it again once the connection is back.' : ''}` : '',
    offline: 'The page can\'t reach the database right now. What you see may be out of date; it catches up once the connection is back.',
    connecting: 'Connecting to the database…',
  }[st];
  const saved = s.lastSaved ? (x => `Last saved ${x.date} ${x.short} ${x.zone}`)(eastern(s.lastSaved))
    : 'Nothing changed since you opened the page.';
  return (
    <>
      <button type="button" class={`live-clock ${st}`} onClick={menu.open} aria-haspopup="true"
        aria-label={`Status: ${LABEL[st]}. Show details`} title={HEAD[st]}>
        <span class="dot" />
        <span class="when"><span class="date">{e.date} </span>{e.time} {e.zone}</span>
        {st === 'live' && <span class="sheen" aria-hidden="true" />}
      </button>
      <Menu menu={menu} label="Status" cls="live-menu" keepOpen>
        <div class="live-head"><span class={`dot ${st}`} /><b>{HEAD[st]}</b></div>
        <p>{text}</p>
        <p class="muted">{saved}</p>
        {st === 'unsaved' && (f?.retry
          ? <button type="button" class="btn primary pill sm" onClick={() => { const r = f.retry; clearFailure(); menu.close(); r(); }}>Retry Now</button>
          : <button type="button" class="btn glass pill sm" onClick={() => { clearFailure(); menu.close(); }}>OK</button>)}
      </Menu>
    </>
  );
}

// Who's online (presence.js): the Active pill, and its Online Now list (name, Manager or department, phone / desktop).
const PHONE = 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM12 18h.01';
const DESK = 'M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 21h8M12 17v4';
const Device = ({ on, d, what }) => (
  <span class={`dev ${on ? 'on' : ''}`} title={what} aria-label={`${on ? 'On' : 'Not on'} a ${what.toLowerCase()}`}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"><path d={d} /></svg></span>);

function OnlineNow({ menu, user, online }) {
  const s = useSettings();
  const team = s?.team || [];
  const me = (user.email || '').toLowerCase();
  const rows = (online || []).map(p => {
    const t = team.find(x => x.email === p.email);
    const name = t?.name || p.email.split('@')[0].replace(/[._]/g, ' ');
    return { ...p, name, photo: t?.photo || '',
      sub: [t?.role === 'manager' ? 'Manager' : t?.dept, p.email === me ? 'You' : ''].filter(Boolean).join(' · ') || 'Team' };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Menu menu={menu} label="Online now" cls="online-menu" keepOpen>
      <div class="label">Online Now · {rows.length}</div>
      {!rows.length && <div class="online-empty">No One Else Is Online</div>}
      {rows.map(p => (
        <div class="online-row" key={p.email}>
          <span class="dot live" />
          <span class="avatar sm">{initials(p.name)}{p.photo && <img src={p.photo} alt="" width="32" height="32" />}</span>
          <span class="who"><b>{p.name}</b><span>{p.sub}</span></span>
          <span class="devs"><Device on={p.mobile} d={PHONE} what="Phone" /><Device on={p.desktop} d={DESK} what="Desktop" /></span>
        </div>))}
    </Menu>
  );
}

function Photo({ person, user, size = 40 }) {
  return (
    <>
      {initials(person?.name || user.displayName || user.email)}
      {person?.photo && <img src={person.photo} alt="" width={size} height={size} />}
    </>
  );
}

const themeOptions = words => [
  { value: 'light', icon: 'sun', title: 'Light theme', ...(words ? { label: 'Light' } : {}) },
  { value: 'dark', icon: 'moon', title: 'Dark theme', ...(words ? { label: 'Dark' } : {}) }];

// The photo and its menu: you, then My Settings, Team Members (managers), Help, Sign Out. Only once signed in, so the
// team (for your name, photo and department) loads with your sign-in.
function Account({ user, me, onHelp, theme, setTheme, online, onOnline }) {
  const menu = useMenu();
  const photo = useRef(null);
  const s = useSettings();
  const [leaving, setLeaving] = useState(false);
  const person = (s?.team || []).find(p => p.email === (user.email || '').toLowerCase());
  const role = !me ? '' : me.admin ? 'Manager'
    : `${me.role === 'lead' ? 'Team Leader' : 'Member'}${person?.dept ? ` · ${person.dept}` : ''}`;
  const open = fn => () => { menu.close(); fn(); };
  return (
    <>
      <button class="avatar" ref={photo} title={`Signed in as ${user.email}`} aria-haspopup="true" aria-label="Your account"
        onClick={menu.open}><Photo person={person} user={user} /></button>
      <Menu menu={menu} label="Account" cls="acct-menu">
        <div class="acct-you">
          <span class="avatar"><Photo person={person} user={user} /></span>
          <span>
            <b>{person?.name || user.displayName || user.email.split('@')[0]}</b>
            <span class="email">{user.email}</span>
            {role && <span class="role">{role}</span>}
          </span>
        </div>
        <hr />
        <div class="acct-theme" onClick={e => e.stopPropagation()}>
          <Seg cls="dark-on" label="Theme" value={theme} onChange={setTheme} options={themeOptions(true)} />
        </div>
        {online && (  /* phones: the Active pill lives here */
          <button class="acct-online" onClick={open(() => onOnline(photo.current))}><Icon name="online" />
            <span>Who's Online</span><span class="count">{online.length}</span></button>)}
        <button onClick={open(() => go('settings'))}><Icon name="settings" /> My Settings</button>
        {me?.admin && <button onClick={open(() => go('team'))}><Icon name="users" /> Team Members</button>}
        <button onClick={open(onHelp)}><Icon name="help" /> Help</button>
        <button onClick={open(() => setLeaving(true))}><Icon name="out" /> Sign Out</button>
      </Menu>
      {leaving && (
        <Modal title="Sign Out?" onClose={() => setLeaving(false)}>
          <p class="lede" style="font-size:15px">Sign out of the Title Commitment Agent on this device?</p>
          <div class="actions">
            <button class="btn ghost pill" onClick={() => setLeaving(false)}>Cancel</button>
            <button class="btn primary pill" onClick={() => { setLeaving(false); (me?.imp ? Promise.resolve() : presenceOut()).finally(signOutNow); }}>Sign Out</button>
          </div>
        </Modal>)}
    </>
  );
}

// Login As User: an orange bar across the top shows whose view it is, with the way back to your own account.
function ViewingAs({ user, me }) {
  const toast = useToast();
  const s = useSettings();
  const [busy, setBusy] = useState(false);
  const team = s?.team || [];
  const them = team.find(p => p.email === user.email), owner = team.find(p => p.email === me.imp);
  const back = async () => {
    setBusy(true);
    try { await signInWithToken((await api.loginBack()).token); go(''); toast('Back to your own view.'); }
    catch (e) {  // the server couldn't: sign in with Google instead
      toast(`${e.message} Sign in with your Google account.`, true);
      try { await signOutNow(); await signIn(); } catch { /* the sign-in screen shows */ }
    } finally { setBusy(false); }
  };
  return (
    <div class="viewing-as" role="status">
      <span>Viewing the Title Commitment Agent as <b>{them?.name || user.email}</b> ({user.email})</span>
      <button type="button" onClick={back} disabled={busy}>{busy ? <Spinner /> : null}
        {busy ? 'Switching Back…' : `Back To ${owner?.name?.split(' ')[0] || 'My Account'}`}</button>
    </div>
  );
}

export function Header({ user, me, page, onHelp, compact, headRef }) {
  const [theme, setTheme] = useTheme();
  const online = useOnline();
  const active = useMenu();
  const openOnline = el => active.open({ currentTarget: el });
  return (
    <header class={`header ${compact ? 'compact' : ''}`} ref={headRef}>
      <div class="header-row">
        <div class="head-left">
          <a class="logo" href="#/" aria-label="Title Commitment Agent home">
            <img class="lg-full" src={theme === 'dark' ? '/logo-full-white.png' : '/logo-full.png'} alt="Total Cash Home Buyers" />
            <img class="lg-mark" src="/logo-mark.png" alt="Total Cash Home Buyers" width="40" height="40" />
          </a>
          {user && <LiveClock />}
        </div>
        <div class="head-break" />
        {user && (
          <Seg cls="pagetabs dark-on" label="Pages" value={page === 'deal' ? 'deals' : page}
            onChange={v => go(v === 'deals' ? '' : v)} options={TABS} />)}
        <div class="head-right">
          {user && online && (
            <button type="button" class="active-pill glass" onClick={active.open} title="Who's online now"
              aria-haspopup="true" aria-label={`Active: ${online.length} online now`}>
              <span class="dot live" /><span>Active</span><span class="count">{online.length}</span></button>)}
          <Seg cls="glass dark-on theme" label="Theme" value={theme} onChange={setTheme} options={themeOptions(false)} />
          {user && <Account user={user} me={me} onHelp={onHelp} theme={theme} setTheme={setTheme} online={online}
            onOnline={openOnline} />}
        </div>
      </div>
      {user && me?.imp && <ViewingAs user={user} me={me} />}
      {user && <OnlineNow menu={active} user={user} online={online} />}
    </header>
  );
}
