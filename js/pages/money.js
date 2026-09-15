// Money: owner only. In preview mode the page is replaced by a "hidden in preview" card (public assets never show personal
// financials). Live: renders iris2_money against the LIVE payload — every number carries its age and basis; unknown is never $0.

import { h, fmt } from '../util.js';
import { iconEl } from '../icons.js';
import { S } from '../store.js';
import { pill, emptyState } from '../ui.js';
import { load, card, kpi } from './_common.js';

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  if (S.preview) {
    host.append(h('div.card.money-hidden',
      h('div.blur', { 'aria-hidden': 'true' }, ...Array.from({ length: 6 }, () => h('div'))),
      h('div.msg', iconEl('eye-off'), h('h2', { style: { marginTop: '8px' } }, 'Money is hidden in preview'), h('p.muted', { style: { marginTop: '6px', fontSize: '13px', lineHeight: '1.55' } }, 'Personal financials never appear in a public or sample asset. Sign in as the owner to see net worth, accounts, holdings, liabilities and the month’s insights — all served by iris2_money and gated by the allow-list.'))));
    return () => {};
  }
  load(host, 'iris2_money', {}, draw);
  return () => {};
}

const sevStripe = (s) => ({ warn: 'HIGH', watch: 'MEDIUM', good: 'GOOD', info: 'LOW' }[String(s || '').toLowerCase()] || 'LOW');

function draw(d, host) {
  const s = d.summary || d.fin_summary || d; const ins = d.insights || d.money_insights || {};
  if (s.connected === false) { host.append(card(null, null, emptyState('Accounts not linked', s.message || 'Link a bank / brokerage source and sync once; the summary appears here.'))); return; }
  const k = ins.kpis || {}; const cov = s.coverage || {}; const sync = s.sync || null;
  const ageDays = s.as_of ? (Date.now() - new Date(s.as_of).getTime()) / 86400000 : null;
  const stale = sync ? (sync.state === 'stale' || sync.state === 'failing') : (ageDays != null && ageDays > 1);

  // the sync banner comes first: a balance from five days ago is not "where I stand"
  if (sync || ageDays != null) {
    const tone = stale ? (sync && sync.state === 'failing' ? 'bad' : 'warn') : 'good';
    host.append(h('div.notice', { class: tone }, iconEl(stale ? 'alert' : 'check-circle'), h('span',
      h('b', stale ? `Finance data is ${fmt.age((sync && sync.age_s) || ageDays * 86400)} old. ` : `Synced ${fmt.age((sync && sync.age_s) || ageDays * 86400)} ago. `),
      sync ? `${sync.note || ''}${sync.expected_s ? ` Expected every ${fmt.age(sync.expected_s)}.` : ''}` : '',
      sync && sync.error ? h('span.bad', ` Last error: ${sync.error}`) : null)));
  }

  const debtCell = s.debt_known === false || s.debt == null ? h('span.muted', { title: 'No liability account is linked, so debt was not measured. This is not zero.' }, 'not linked') : fmt.usd(s.debt);
  host.append(h('div.kpis',
    kpi('money', 'Net worth', fmt.usd(s.net_worth), `${s.as_of ? `as of ${fmt.date(s.as_of)}` : ''}${s.net_worth_status ? ` · ${s.net_worth_status}` : ''}`, stale ? 'warn' : ''),
    kpi('wallet', 'Cash · investments', `${fmt.compact(s.cash)} · ${fmt.compact(s.investments)}`, ['debt ', debtCell]),
    kpi('revenue', `Net cash · ${ins.month || 'month'}`, ins.ready === false ? '—' : fmt.usd(k.net_cash), ins.ready === false ? 'month not computed yet' : (k.savings_rate != null ? `savings rate ${fmt.pct(k.savings_rate, 0)} · income ${fmt.usd(k.income)} · transcribed from Era` : `income ${fmt.usd(k.income)}`)),
    kpi('clock', 'Cash buffer', k.buffer_days != null ? `${fmt.int(k.buffer_days)} days` : '—', k.cash_buffer != null ? `${fmt.usd(k.cash_buffer)} ÷ real spend ${fmt.usd(k.real_spend)} / 30 · derived` : (ins.ready === false ? 'needs a computed month' : ''))));

  const accounts = s.accounts || []; const liabilities = s.liabilities || []; const holdings = s.holdings || []; const tx = s.recent_tx || []; const cats = ins.categories || []; const flags = ins.flags || [];
  const acc = card(h('h2', 'Accounts'), `${fmt.int(accounts.length)} linked · balances ${s.as_of ? `as of ${fmt.date(s.as_of)}` : '—'}`, accounts.length ? h('div.tbl-wrap', h('table.tbl.compact', h('thead', h('tr', h('th', 'Account'), h('th', 'Kind'), h('th.num', 'Balance'))), h('tbody', accounts.map((a) => h('tr', h('td', h('b', a.name), h('div.small.muted', a.institution)), h('td.muted', a.kind), h('td.num', { class: a.is_asset ? '' : 'bad' }, fmt.usd(a.balance))))))) : emptyState('No accounts', ''), { flush: true, cls: 'f1' });
  acc.querySelector('.card-head').style.padding = '14px 16px 6px';
  const liab = card(h('h2', 'Liabilities & holdings'), `${cov.liabilities_linked ? `${fmt.int(liabilities.length)} liabilit${liabilities.length === 1 ? 'y' : 'ies'}` : 'debt not linked'} · ${cov.holdings_known ? `${fmt.int(holdings.length)} holdings` : 'positions unknown'}`, [
    liabilities.length ? h('div.list.tight', liabilities.map((l) => h('div.item.plain.stripe-MEDIUM', h('div.grow', h('div', h('b', l.servicer || l.kind), l.apr != null ? ` · ${fmt.pct((l.apr || 0) * 100, 1)} APR` : ''), h('div.sub', `next payment ${fmt.day(l.next_payment_date)} · min ${fmt.usd(l.min_payment)}`)), h('b.num', fmt.usd(l.balance))))) : null,
    holdings.length ? h('div.tbl-wrap', h('table.tbl.compact', h('thead', h('tr', h('th', 'Holding'), h('th.num', 'Qty'), h('th.num', 'Value'))), h('tbody', holdings.map((x) => h('tr', h('td', h('b', x.symbol), ' ', h('span.muted.small', x.name)), h('td.num', fmt.num(x.quantity, 0)), h('td.num', fmt.usd(x.value))))))) : null,
    !liabilities.length && !holdings.length ? emptyState('Nothing linked here yet', 'Debt and positions are not measured: no liability account or brokerage holdings source is linked. Until they are, net worth is cash + investments only.') : null], { cls: 'f1' });
  host.append(h('div.row.wrap-md', acc, liab));

  const spendCats = cats.filter((c) => c.kind === 'real' || c.kind == null); const excluded = cats.filter((c) => c.kind && c.kind !== 'real');
  const catCard = card(h('h2', `Spend · ${ins.month || 'this month'}`), ins.basis ? h('span', { title: ins.basis }, 'by category · transcribed Era totals, not derived from transactions') : 'by category', spendCats.length ? [h('div.capbars', spendCats.map((c) => h('div.capbar', h('span.name', c.category), h('div.bar', h('i', { style: { width: `${Math.min(100, c.weight_pct || 0)}%` } })), h('span.vals', h('b', fmt.usd(c.amount)), c.txn_count ? h('span.muted', ` · ${c.txn_count} tx`) : null)))),
    excluded.length ? h('div.small.muted', { style: { marginTop: '8px' } }, `excluded from spend: ${excluded.map((c) => `${c.kind} ${fmt.usd(c.amount)}`).join(' · ')}`) : null] : emptyState('No categories', ins.ready === false ? 'The month has not been computed.' : ''), { cls: 'f1' });
  const flagCard = card(h('h2', 'Flags'), flags.length ? h('span', { title: ins.flags_basis || '' }, `${fmt.int(flags.length)} · written by the sync model, not rule-derived`) : '', flags.length ? h('div.list.tight', flags.map((f) => h('div.item.col', { class: `stripe-${sevStripe(f.severity)}` }, h('div', pill(String(f.severity || 'info'), `status ${f.severity === 'warn' ? 'bad' : f.severity === 'watch' ? 'warn' : 'good'} nodot`), ' ', h('b', f.title)), h('div.sub', f.detail), f.est_impact != null ? h('div.sub', `est. impact ${fmt.usd(f.est_impact)}`) : h('div.sub.muted', 'impact not estimated')))) : emptyState('No flags', 'Nothing unusual this month.'), { cls: 'f1' });
  host.append(h('div.row.wrap-md', catCard, flagCard));

  if (tx.length) { const t = card(h('h2', 'Recent transactions'), `${fmt.int(cov.transactions || tx.length)} on file${cov.tx_from ? ` · ${fmt.day(cov.tx_from)} → ${fmt.day(cov.tx_to)}` : ''}${(cov.transactions || 0) < 30 ? ' · thin history: the sync pulled the last page only' : ''}`, h('div.tbl-wrap', h('table.tbl.compact', h('thead', h('tr', h('th', 'Merchant'), h('th', 'Category'), h('th', 'Date'), h('th.num', 'Amount'))), h('tbody', tx.map((x) => h('tr', h('td', x.merchant, x.pending ? pill('pending', 'status neutral nodot') : null), h('td.muted', x.category), h('td.muted', fmt.day(x.date)), h('td.num', { class: x.amount < 0 ? '' : 'good' }, fmt.money(x.amount))))))), { flush: true }); t.querySelector('.card-head').style.padding = '14px 16px 6px'; host.append(t); }
  const trend = (s.trend || []);
  if (trend.length < 2) host.append(h('div.foot-note', `Net-worth trend needs more than one snapshot (${trend.length} on file). Snapshots are written by the sync.`));
}
