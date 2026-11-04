// Who's online (the header's Active pill, as in the Universal Team Hub): this browser checks in every minute and gets
// back everyone seen in the last five minutes. The hub writes its check-ins to Firestore from the page; here the page
// writes nothing (CLAUDE.md), so the check-in goes through the engine (POST /v1/presence), which also answers the list.
// The check-ins are quiet: they never move the Live clock.
import { useEffect, useState } from 'preact/hooks';
import { api } from './api.js';

const BEAT_MS = 60 * 1000;
const DEVICE = (() => {
  try {
    let d = localStorage.getItem('tca-device');
    if (!d) { d = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem('tca-device', d); }
    return d;
  } catch { return 'dnostore'; }
})();
const TYPE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';

let online = null;  // [{email, mobile, desktop}] once the first answer is in
const subs = new Set();
const beat = (out = false) => api.presence({ device: DEVICE, type: TYPE, out })
  .then(r => { online = r.online || []; subs.forEach(f => f(online)); }, () => { /* tried again in a minute */ });

// From sign-in until sign-out (main.jsx).
export function startPresence() {
  beat();
  const i = setInterval(() => beat(), BEAT_MS);
  return () => { clearInterval(i); online = null; subs.forEach(f => f(null)); };
}

// Sign Out: mark this device gone first (as the hub), but never hold the sign-out up for long.
export const presenceOut = () => Promise.race([beat(true), new Promise(r => setTimeout(r, 1500))]);

export function useOnline() {
  const [o, setO] = useState(online);
  useEffect(() => { subs.add(setO); setO(online); return () => subs.delete(setO); }, []);
  return o;
}
