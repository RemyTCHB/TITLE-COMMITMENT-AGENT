// Deals (home): every reviewed deal, newest first, with its open Closing Blockers and progress.
import { useMemo, useState } from 'preact/hooks';
import { isOpen, useAllItems, useDeals } from '../data.js';
import { go } from '../router.js';
import { Bar, Icon, PageTitle, PinLine, Ring, Seg, Spinner, Stat, daysUntil, fmtDate } from '../ui.jsx';

function DealCard({ d, items }) {
  const live = (items || []).filter(i => i.change !== 'removed');
  const blockers = live.filter(i => i.priority === 'blocker' && isOpen(i)).length;
  const done = live.filter(i => !isOpen(i)).length;
  const pct = live.length ? Math.round((100 * done) / live.length) : 0;
  const days = daysUntil(d.closing_date);
  const open = d.status === 'open';
  const progress = open && items !== undefined && live.length > 0;
  return (
    <a class="card deal-card" href={`#/deal/${d.id}`}>
      {progress && <Ring pct={pct} cls="ring-wide" />}
      <div class="grow">
        <span class="row-title">{d.address || `Deal ${d.id}`}</span>
        <span class="row-sub">
          {[d.deal_type, d.closing_date && `closing ${fmtDate(d.closing_date)}`, d.tc && `TC ${d.tc}`, d.title_company]
            .filter(Boolean).join(' · ')}
        </span>
        <div class="prog-line">
          {progress && <Ring pct={pct} cls="ring-phone" />}
          {progress && <Bar done={done} total={live.length} what="Items Cleared" />}
          {!open ? <span class="chip">Closed</span>
            : items === undefined ? <Spinner />
              : blockers ? <span class="chip red"><span class="dot" />{blockers} blocker{blockers === 1 ? '' : 's'}</span>
                : <span class="chip green"><Icon name="check" size={12} stroke={3} /> No blockers</span>}
          {open && days !== null && (
            <span class={`chip ${days < 0 ? 'red' : days <= 7 ? 'orange' : ''}`}>
              {days < 0 ? `${-days}d past closing` : days === 0 ? 'Closing today' : `${days}d to closing`}
            </span>)}
        </div>
      </div>
      <Icon name="right" size={18} />
    </a>
  );
}

export function Deals() {
  const { deals, error } = useDeals();
  const [view, setView] = useState('open');
  const [q, setQ] = useState('');
  const open = (deals || []).filter(d => d.status === 'open');
  const itemsByDeal = useAllItems(open.map(d => d.id));
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (deals || []).filter(d => (view === 'all' || (view === 'open') === (d.status === 'open'))
      && words.every(w => [d.address, d.tc, d.title_company, d.commitment_number, d.deal_type]
        .join(' ').toLowerCase().includes(w)));
  }, [deals, view, q]);
  const openBlockers = open.reduce((n, d) => n + (itemsByDeal[d.id] || [])
    .filter(i => i.priority === 'blocker' && isOpen(i)).length, 0);
  const closingSoon = open.filter(d => { const n = daysUntil(d.closing_date); return n !== null && n >= 0 && n <= 7; }).length;
  return (
    <>
      <PageTitle>Title Commitment <span class="accent">Agent</span></PageTitle>

      <PinLine cls="tabs-line">
        <Seg label="Which deals" value={view} onChange={setView} options={[
          { value: 'open', label: 'Open', n: open.length },
          { value: 'closed', label: 'Closed', n: (deals || []).length - open.length },
          { value: 'all', label: 'All', n: (deals || []).length }]} />
        <div class="line-stats">
          <Stat value={open.length} label="Open Deals" />
          <Stat value={openBlockers} label="Open Blockers" cls={openBlockers ? 'red' : 'green'} />
          <Stat value={closingSoon} label="Closing In 7 Days" />
        </div>
      </PinLine>

      <div class="card bar-card">
        <label class="sr" for="deal-search">Search deals</label>
        <input id="deal-search" class="input" style="flex:1 1 260px" placeholder="Search By Address, TC, Title Company Or Commitment #"
          value={q} onInput={e => setQ(e.currentTarget.value)} />
        <a class="btn primary" href="#/analyze"><Icon name="upload" /> Analyze A Commitment</a>
      </div>

      {error ? <div class="note red" role="alert">Couldn't load the deals: {error.message}</div>
        : deals === undefined ? <p class="lede"><Spinner /> Loading deals…</p>
          : shown.length ? (
            <div class="list">{shown.map(d => <DealCard key={d.id} d={d} items={d.status === 'open' ? itemsByDeal[d.id] : []} />)}</div>
          ) : (
            <section class="empty">
              <h3>{q ? 'No deals match' : view === 'open' ? 'No open deals' : 'No deals yet'}</h3>
              <p>{q ? 'Try fewer words.' : 'Analyze a commitment to start a deal.'}</p>
              {!q && <p style="margin-top:16px"><button class="btn primary pill" onClick={() => go('analyze')}>
                <Icon name="upload" /> Analyze A Commitment</button></p>}
            </section>
          )}
    </>
  );
}
