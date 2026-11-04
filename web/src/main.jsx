import { render } from 'preact';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef, useState } from 'preact/hooks';
import './styles.css';
import { api } from './api.js';
import { startAurora } from './aurora.js';
import { auth, signIn, signOutNow, teamAccount } from './firebase.js';
import { go, useRoute } from './router.js';
import { Header } from './header.jsx';
import { syncClock } from './status.js';
import { Spinner, ToastHost, updateFades } from './ui.jsx';
import { Deal } from './pages/Deal.jsx';
import { Deals } from './pages/Deals.jsx';
import { Analyze } from './pages/Analyze.jsx';
import { Knowledge } from './pages/Knowledge.jsx';
import { Settings } from './pages/Settings.jsx';
import { Team } from './pages/Team.jsx';
import { HelpPanel } from './pages/Help.jsx';
import { watchConnection } from './data.js';
import { Training } from './pages/Training.jsx';

function Gate({ error, busy, onSignIn }) {
  return (
    <section class="card gate">
      <h2>Sign In To The Title Commitment <span class="accent">Agent</span></h2>
      <p>Every item needed to close, read from the title commitment. Sign in with your company Google account
        (@totalchb.com).</p>
      <button class="btn primary pill" onClick={onSignIn} disabled={busy}>
        {busy ? <Spinner /> : null} Sign In With Google
      </button>
      {error && <p class="note red" role="alert">{error}</p>}
    </section>
  );
}

function App() {
  const [user, setUser] = useState(undefined);
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);  // the Help panel, as in the hub
  const [compact, setCompact] = useState(false);  // the header slims once the page scrolls
  const route = useRoute();
  const bg = useRef(null), head = useRef(null);
  useEffect(() => startAurora(bg.current), []);
  useEffect(() => {  // the server-synced clock: now, every 15 minutes and when the tab comes back (as in the hub)
    syncClock();
    const i = setInterval(syncClock, 15 * 60 * 1000);
    const vis = () => !document.hidden && syncClock();
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', vis); };
  }, []);
  useEffect(() => {  // slim past 120px, full again within 40px of the top; the header's height for what pins under it
    const onScroll = () => setCompact(c => (c ? window.scrollY > 40 : window.scrollY > 120));
    window.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--head-h',
      `${Math.round(head.current?.getBoundingClientRect().height || 0)}px`));
    if (head.current) ro.observe(head.current);
    const fades = () => updateFades();
    window.addEventListener('resize', fades);
    document.addEventListener('scroll', fades, { capture: true, passive: true });
    return () => { window.removeEventListener('scroll', onScroll); ro.disconnect(); window.removeEventListener('resize', fades);
      document.removeEventListener('scroll', fades, { capture: true }); };
  }, []);
  useEffect(() => { updateFades(); });
  useEffect(() => onAuthStateChanged(auth, u => {
    if (u && !teamAccount(u)) { signOutNow(); setError(`${u.email} doesn't have access. Use your @totalchb.com account.`); setUser(null); return; }
    setUser(u || null);
    if (u) api.me().then(setMe).catch(e => setError(e.message));
    else setMe(null);
  }), []);
  const doSignIn = async () => {
    setBusy(true); setError('');
    try { await signIn(); } catch (e) {
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') setError(e.message);
    } finally { setBusy(false); }
  };
  const [page, arg, sub] = route;
  useEffect(() => { if (page === 'help') { setHelp(true); go(''); } }, [page]);  // old #/help links open the panel
  useEffect(() => (user ? watchConnection() : undefined), [user]);  // the Live clock's connection state
  return (
    <ToastHost>
      <canvas ref={bg} class="aurora" aria-hidden="true" />
      <Header user={user} me={me} page={page} onHelp={() => setHelp(true)} compact={compact} headRef={head} />
      <main class="main">
        {user === undefined ? <p class="lede" style="text-align:center"><Spinner /></p>
          : !user ? <Gate error={error} busy={busy} onSignIn={doSignIn} />
            : page === 'deal' ? <Deal id={arg} me={me} />
              : page === 'analyze' ? <Analyze arg={arg} sub={sub} />
                : page === 'training' ? <Training />
                  : page === 'knowledge' ? <Knowledge me={me} />
                    : page === 'team' ? <Team me={me} />
                      : page === 'settings' ? <Settings me={me} onHelp={() => setHelp(true)} />
                        : <Deals />}
      </main>
      {user && help && <HelpPanel me={me} onClose={() => setHelp(false)} />}
    </ToastHost>
  );
}

// Old-style links (/deal?id=3, in daily emails sent before 2026-10-29) open the same deal here.
const legacy = new URLSearchParams(location.search).get('id');
if (location.pathname.replace(/\/$/, '') === '/deal' && /^\d+$/.test(legacy || '')) {
  history.replaceState(null, '', `/#/deal/${legacy}`);
}

render(<App />, document.getElementById('app'));
