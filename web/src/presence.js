// Who's online (the header's Active pill, as in the Universal Team Hub): this browser checks in every minute, and
// the list is read live from Firestore (presence/), so someone who opens the app or signs out shows at once, as in the
// hub. The hub's page writes its check-ins itself; here the page writes nothing (CLAUDE.md), so the check-in goes
// through the engine (POST /v1/presence). Until the live read is allowed (firestore.rules), the engine's answer to
// each check-in is the list. The check-ins are quiet: they never move the Live clock.
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'preact/hooks';
import { api } from './api.js';
import { db } from './firebase.js';
import { now } from './status.js';

const BEAT_MS = 60 * 1000, ONLINE_MS = 5 * 60 * 1000;  // as the hub: a check-in a minute; seen in five minutes = online
const DEVICE = (() => {
  try {
    let d = localStorage.getItem('tca-device');
    if (!d) { d = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem('tca-device', d); }
    return d;
  } catch { return 'dnostore'; }
})();
const TYPE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';

let docs = null;    // presence/ as read live: [{email, sessions}]
let online = null;  // [{email, mobile, desktop}] once known
const subs = new Set();
const publish = list => { online = list; subs.forEach(f => f(online)); };

// Everyone with a device seen in the last five minutes, by the server-synced clock (as the hub).
function count() {
  if (!docs) return;
  const t = now();
  publish(docs.map(p => {
    const live = Object.values(p.sessions || {}).filter(s => s && t - (s.at || 0) < ONLINE_MS);
    return { email: p.email, mobile: live.some(s => s.type === 'Mobile'), desktop: live.some(s => s.type !== 'Mobile') };
  }).filter(p => p.email && (p.mobile || p.desktop)));
}

const beat = (out = false) => api.presence({ device: DEVICE, type: TYPE, out })
  .then(r => { if (!docs) publish(r.online || []); }, () => { /* tried again in a minute */ });

// From sign-in until sign-out (main.jsx).
export function startPresence() {
  beat();
  const i = setInterval(() => { beat(); count(); }, BEAT_MS);  // recounted each minute as check-ins age
  const stop = onSnapshot(collection(db, 'presence'),
    snap => { docs = snap.docs.map(d => d.data()); count(); },
    () => { docs = null; });  // not allowed yet: the engine's answers keep the list
  return () => { clearInterval(i); stop(); docs = null; publish(null); };
}

// Sign Out: mark this device gone first (as the hub), but never hold the sign-out up for long.
export const presenceOut = () => Promise.race([beat(true), new Promise(r => setTimeout(r, 1500))]);

export function useOnline() {
  const [o, setO] = useState(online);
  useEffect(() => { subs.add(setO); setO(online); return () => subs.delete(setO); }, []);
  return o;
}
