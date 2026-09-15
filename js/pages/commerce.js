// Commerce (V3 commercial engine): the order → payment → fulfillment → entitlement lifecycle that sits
// between rev.offers (what we sell) and rev.revenue_ledger (recognized money). Owner drives it here;
// n8n / payment webhooks drive it through the token RPCs. Recognized revenue is real payments only —
// reference/demo rows are badged and never touch the ledger.

import { h, fmt, clear, truncate, extLink } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { setCount } from '../store.js';
import { toast, openDialog, openPanel, closePanel, confirmDialog, promptDialog, pill, emptyState } from '../ui.js';
import { load, card, kpi, statePill } from './_common.js';

const STAGES = ['draft', 'pending', 'paid', 'fulfilled', 'closed'];
const STAGE_TONE = { draft: 'neutral', pending: 'warn', paid: 'primary', fulfilled: 'good', closed: 'good', refunded: 'bad', canceled: 'bad' };

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_commerce', {}, draw);
  return () => {};
}

function draw(d, host, reload) {
  const k = d.kpis || {};
  const orders = d.orders || [];
  setCount('commerce', (k.awaiting_fulfillment || 0) + (k.awaiting_payment || 0) || null);

  // ---- KPI band (recognized money is real-payments only; demo rows never post)
  host.append(h('div.kpis',
    kpi('revenue', 'Recognized · this month', fmt.money(k.mtd_recognized_usd, 0), (k.lifetime_recognized_usd ? `${fmt.money(k.lifetime_recognized_usd, 0)} lifetime · ` : '') + 'via commerce · ledger only'),
    kpi('inbox', 'Open orders', fmt.int(k.open_orders), `${fmt.int(k.awaiting_payment)} awaiting payment`, k.awaiting_payment ? 'warn' : ''),
    kpi('projects', 'Awaiting fulfillment', fmt.int(k.awaiting_fulfillment), 'paid · not yet delivered', k.awaiting_fulfillment ? 'warn' : 'good'),
    kpi('shield', 'Active entitlements', fmt.int(k.active_entitlements), `${fmt.int(k.customers)} customer${k.customers === 1 ? '' : 's'}`)));

  // ---- funnel strip (real orders by stage)
  const funnel = d.funnel || [];
  const byStage = funnel.reduce((m, f) => { m[f.status] = f; return m; }, {});
  const funnelStrip = h('div.cm-funnel', STAGES.map((s, i) => {
    const f = byStage[s] || { n: 0, usd: 0 };
    return h('div.cm-stage', { class: `tone-${STAGE_TONE[s]}` },
      h('div.cm-stage-n', fmt.int(f.n)),
      h('div.cm-stage-k', s),
      f.usd ? h('div.cm-stage-usd', fmt.money(f.usd, 0)) : null,
      i < STAGES.length - 1 ? h('span.cm-arrow', iconEl('arrow-right', 'ic-14')) : null);
  }));

  // ---- orders table
  const newBtn = h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => newOrderDialog(d, reload) }, iconEl('plus'), 'New order');
  const head = h('div.card-head', h('h2', 'Orders'), h('div.hint', newBtn));
  const body = orders.length ? h('div.tbl-wrap', ordersTable(orders, reload)) : emptyState('No orders yet', 'Create one, or let a payment webhook (Gumroad, Stripe, Upwork) file it through the token API. Offers come from your revenue lanes.');
  const ordersCard = h('div.card.flush', head, funnelStrip, body,
    h('div.foot-note', 'Recognized revenue is captured payments on real orders only. Reference rows are badged ', pill('demo', 'status neutral nodot'), ' and never post to the ledger.'));
  host.append(ordersCard);
}

function ordersTable(orders, reload) {
  const tbody = h('tbody');
  for (const o of orders) {
    const tr = h('tr.clickable', { tabindex: 0, 'aria-label': `Order for ${o.customer || 'customer'}` });
    const open = () => openOrder(o.id, reload);
    tr.addEventListener('click', (e) => { if (e.target.closest('button,a')) return; open(); });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    const paid = Number(o.paid_usd || 0); const total = Number(o.amount_usd || 0);
    const paidCell = total > 0
      ? h('td.num', { class: paid >= total ? 'good' : paid > 0 ? 'warn' : 'muted' }, fmt.money(paid, 0))
      : h('td.num.muted', '—');
    tr.append(
      h('td', h('b', o.customer || '—'), o.is_demo ? h('span.cm-demo', 'demo') : null),
      h('td.wrap', { style: { maxWidth: '220px' } }, o.offer || h('span.muted', o.lane || 'custom')),
      h('td.num', total ? fmt.money(total, 0) : '—'),
      paidCell,
      h('td', statePill(o.status)),
      h('td', o.fulfillment ? statePill(o.fulfillment) : h('span.muted', '—')),
      h('td.muted.nowrap.hide-sm', fmt.day(o.created_at)));
    tbody.append(tr);
  }
  return h('table.tbl',
    h('thead', h('tr', h('th', 'Customer'), h('th', 'Offer'), h('th.num', 'Total'), h('th.num', 'Paid'), h('th', 'Status'), h('th', 'Fulfillment'), h('th.hide-sm', 'Opened'))),
    tbody);
}

// ---------------------------------------------------------------- order drawer (the full lifecycle)
async function openOrder(id, reload) {
  let d;
  try { d = await call('iris2_commerce_order', { p_id: id }, { dedupe: false }); }
  catch (e) { toast({ title: 'Could not open order', message: e.message || 'error', kind: 'error' }); return; }
  renderOrder(d, reload);
}

function renderOrder(o, reload) {
  const cust = o.customer || {}; const paid = Number(o.paid_usd || 0); const total = Number(o.amount_usd || 0);
  const body = [];

  body.push(h('div.pills',
    statePill(o.status),
    o.is_demo ? pill('reference / demo', 'status neutral nodot') : null,
    pill(o.source || 'manual', 'status neutral nodot'),
    total ? pill(`${fmt.money(paid, 0)} of ${fmt.money(total, 0)} paid`, `status ${paid >= total && total ? 'good' : paid ? 'warn' : 'neutral'} nodot`) : null));

  // customer + offer
  body.push(sec('Customer', h('div.kv-rows',
    kv('Name', cust.name), kv('Email', cust.email || '—'), kv('Type', cust.kind || 'person'),
    o.offer ? kv('Offer', `${o.offer.name} · ${fmt.money(o.offer.price_usd, 0)} ${o.offer.billing || ''}`) : null,
    o.lane ? kv('Lane', o.lane.title) : null)));

  // items
  if ((o.items || []).length) {
    body.push(sec('Items', h('div.tbl-wrap', h('table.tbl.compact',
      h('thead', h('tr', h('th', 'Description'), h('th.num', 'Qty'), h('th.num', 'Unit'), h('th.num', 'Amount'))),
      h('tbody', o.items.map((it) => h('tr', h('td', it.description), h('td.num', fmt.int(it.qty)), h('td.num', fmt.money(it.unit_price_usd, 0)), h('td.num', fmt.money(it.amount_usd, 0)))))))));
  }

  // payments
  const payList = (o.payments || []).length
    ? h('div.list.tight', o.payments.map((p) => h('div.item.plain',
        h('div.grow', h('div', h('b', fmt.money(p.amount_usd, 2)), ' ', h('span.muted', `· ${p.method}${p.provider ? ' · ' + p.provider : ''}`)),
          h('div.sub', `${fmt.time(p.created_at)}${p.ledger_id ? ' · posted to revenue' : ''}`)),
        statePill(p.status))))
    : emptyState('No payments', 'Record one below, or a webhook files it.');
  body.push(sec('Payments', payList));

  // fulfillments
  const fList = (o.fulfillments || []).length
    ? h('div.list.tight', o.fulfillments.map((f) => h('div.item.plain',
        h('div.grow', h('div', h('b', f.kind), f.artifact_ref ? h('span.muted', ' · delivered') : null),
          f.artifact_ref ? h('div.sub', extLink(f.artifact_ref, iconEl('external', 'ic-14'), ' ', truncate(String(f.artifact_ref).replace(/^https?:\/\//, ''), 40))) : (f.detail ? h('div.sub', f.detail) : null)),
        statePill(f.status))))
    : emptyState('Not fulfilled', 'Deliver the thing, then mark it here.');
  body.push(sec('Fulfillment', fList));

  // entitlements
  if ((o.entitlements || []).length) {
    body.push(sec('Entitlements', h('div.list.tight', o.entitlements.map((e) => h('div.item.plain',
      h('div.grow', h('div', h('b', e.kind), e.access_ref ? h('span.muted', ` · ${truncate(e.access_ref, 40)}`) : null),
        e.expires_at ? h('div.sub', `expires ${fmt.day(e.expires_at)}`) : null),
      statePill(e.status))))));
  }

  // ---- footer actions (state-aware)
  const foot = [];
  const NEXT = { draft: ['pending'], pending: ['paid'], paid: ['fulfilled'], fulfilled: ['closed'] };
  if (!o.is_demo || true) {
    if ((o.status === 'pending' || o.status === 'draft')) {
      foot.push(h('button.btn.btn-primary', { type: 'button', onclick: () => recordPayment(o, reload) }, iconEl('wallet'), 'Record payment'));
    }
    if (o.status === 'paid') {
      foot.push(h('button.btn.btn-primary', { type: 'button', onclick: () => fulfill(o, reload) }, iconEl('check'), 'Mark fulfilled'));
    }
    for (const to of (NEXT[o.status] || [])) {
      if ((to === 'paid' && (o.status === 'pending' || o.status === 'draft')) || (to === 'fulfilled' && o.status === 'paid')) continue; // covered by the buttons above
      foot.push(h('button.btn', { type: 'button', onclick: () => advance(o, to, reload) }, `Move to ${to}`));
    }
    if (['draft', 'pending', 'paid', 'fulfilled'].includes(o.status)) {
      foot.push(h('button.btn.btn-ghost', { type: 'button', onclick: () => grantEntitlement(o, reload) }, 'Grant entitlement'));
    }
    if (o.status === 'paid' || o.status === 'fulfilled') {
      foot.push(h('button.btn.btn-danger.btn-ghost', { type: 'button', onclick: () => advance(o, 'refunded', reload, true) }, 'Refund'));
    }
  }

  openPanel({
    kicker: [pill('order', 'kind kind-proposal')],
    title: o.offer ? o.offer.name : (cust.name || 'Order'),
    sub: [h('span', cust.name || ''), h('span', ` · ${fmt.date(o.created_at)}`)],
    body, foot,
  });
}

const sec = (title, ...content) => h('div.detail-section', h('h3', title), ...content);
const kv = (k, v) => v == null ? null : h('div.kv-row', h('span.k', k), h('span.v', v));

// ---------------------------------------------------------------- actions
async function advance(o, to, reload, confirm = false) {
  if (confirm) {
    const ok = await confirmDialog({ title: `Move order to ${to}?`, message: to === 'refunded' ? 'Marks the order refunded. This does not move money — record the refund in your processor separately.' : `Transition the order to ${to}.`, confirmText: `Move to ${to}`, danger: to === 'refunded' });
    if (!ok) return;
  }
  try {
    const d = await call('iris2_commerce_order_advance', { p_id: o.id, p_to: to }, { dedupe: false });
    toast({ title: `Order → ${to}`, message: o.offer ? o.offer.name : '', kind: 'success' });
    renderOrder(d, reload); reload();
  } catch (e) { toast({ title: 'Could not advance', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); }
}

async function recordPayment(o, reload) {
  const total = Number(o.amount_usd || 0); const paid = Number(o.paid_usd || 0);
  const suggested = total > 0 ? Math.max(0, total - paid) : 0;
  const amt = await promptDialog({ title: 'Record a captured payment', message: `${o.offer ? o.offer.name : 'Order'} · ${total ? `${fmt.money(paid, 0)} of ${fmt.money(total, 0)} captured so far` : 'no set total'}`, label: 'Amount (USD)', placeholder: suggested ? String(suggested) : '0.00', confirmText: 'Record payment', required: true });
  if (amt === null) return;
  const n = Number(String(amt).replace(/[^0-9.]/g, ''));
  if (!(n >= 0)) { toast({ title: 'Enter a valid amount', kind: 'warn' }); return; }
  try {
    const d = await call('iris2_commerce_payment_record', { p_order_id: o.id, p_amount: n, p_method: 'manual', p_status: 'captured' }, { dedupe: false });
    const posted = d && d.ledger_id;
    toast({ title: 'Payment recorded', message: `${fmt.money(n, 2)} captured · order ${d?.order_status || 'updated'}${posted ? ' · posted to revenue' : (o.is_demo ? ' · demo (not posted)' : '')}`, kind: 'success' });
    if (d && d.order) renderOrder(d.order, reload); else openOrder(o.id, reload);
    reload();
  } catch (e) { toast({ title: 'Could not record payment', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 8000 }); }
}

async function fulfill(o, reload) {
  const kind = o.offer && /audit/i.test(o.offer.name) ? 'modellens_audit' : o.offer && /deal sheet/i.test(o.offer.name) ? 'deal_sheet' : 'custom';
  const ref = await promptDialog({ title: 'Mark fulfilled', message: `${o.offer ? o.offer.name : 'Order'} — record what was delivered.`, label: 'Artifact link or note (optional)', placeholder: 'https://… or a short note', confirmText: 'Mark delivered' });
  if (ref === null) return;
  const isUrl = /^https?:\/\//i.test(ref.trim());
  try {
    const d = await call('iris2_commerce_fulfill', { p_order_id: o.id, p_kind: kind, p_status: 'delivered', p_artifact_ref: isUrl ? ref.trim() : null, p_detail: isUrl ? null : (ref.trim() || null) }, { dedupe: false });
    toast({ title: 'Fulfilled', message: `${o.offer ? o.offer.name : 'Order'} · delivered`, kind: 'success' });
    renderOrder(d, reload); reload();
  } catch (e) { toast({ title: 'Could not fulfill', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); }
}

async function grantEntitlement(o, reload) {
  const ref = await promptDialog({ title: 'Grant entitlement', message: `Give ${o.customer ? o.customer.name : 'the customer'} access tied to this order.`, label: 'Access reference (optional)', placeholder: 'account id, URL, license key…', confirmText: 'Grant access' });
  if (ref === null) return;
  const kind = o.offer && /(monthly|annual|subscription)/i.test(o.offer.billing || '') ? 'subscription' : 'access';
  try {
    await call('iris2_commerce_entitlement_set', { p_customer_id: o.customer.id, p_order_id: o.id, p_offer_id: o.offer ? o.offer.id : null, p_kind: kind, p_status: 'active', p_access_ref: ref.trim() || null }, { dedupe: false });
    toast({ title: 'Entitlement granted', message: `${kind} · active`, kind: 'success' });
    openOrder(o.id, reload); reload();
  } catch (e) { toast({ title: 'Could not grant', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); }
}

// ---------------------------------------------------------------- new order
function newOrderDialog(d, reload) {
  const offers = (d.offers || []).filter((o) => o.price_usd != null);
  const customers = d.customers || [];
  const offerSel = h('select.input', { 'aria-label': 'Offer' }, h('option', { value: '' }, 'Select an offer…'),
    offers.map((o) => h('option', { value: o.id }, `${o.name} — ${fmt.money(o.price_usd, 0)}${o.lane ? ` · ${o.lane}` : ''}`)));
  const custSel = h('select.input', { 'aria-label': 'Existing customer' }, h('option', { value: '' }, 'New customer…'),
    customers.filter((c) => !c.is_demo).map((c) => h('option', { value: c.id }, `${c.name}${c.email ? ` · ${c.email}` : ''}`)));
  const nameIn = h('input.input', { type: 'text', placeholder: 'Customer name', 'aria-label': 'Customer name' });
  const emailIn = h('input.input', { type: 'email', placeholder: 'Email (optional)', 'aria-label': 'Customer email' });
  const newFields = h('div.stack.tight', nameIn, emailIn);
  custSel.addEventListener('change', () => { newFields.hidden = !!custSel.value; });

  openDialog({
    title: 'New order',
    sub: 'Creates a draft order from one of your offers. Record a payment to recognize revenue.',
    body: h('div.stack',
      h('div.field', h('label', 'Offer'), offerSel),
      h('div.field', h('label', 'Customer'), custSel),
      h('div.field', newFields)),
    actions: [
      { label: 'Cancel', class: 'btn-ghost' },
      { label: 'Create order', class: 'btn-primary', icon: 'check', onClick: async () => {
        if (!offerSel.value) { offerSel.focus(); toast({ title: 'Pick an offer', kind: 'warn' }); return false; }
        try {
          let customerId = custSel.value;
          if (!customerId) {
            const name = nameIn.value.trim();
            if (!name) { nameIn.focus(); toast({ title: 'Enter a customer name', kind: 'warn' }); return false; }
            const cu = await call('iris2_commerce_customer_upsert', { p_name: name, p_email: emailIn.value.trim() || null }, { dedupe: false });
            customerId = cu.customer_id;
          }
          const od = await call('iris2_commerce_order_create', { p_customer_id: customerId, p_offer_id: offerSel.value, p_status: 'pending' }, { dedupe: false });
          toast({ title: 'Order created', message: 'Draft order opened — record a payment when it clears.', kind: 'success' });
          reload();
          setTimeout(() => renderOrder(od, reload), 120);
        } catch (e) { toast({ title: 'Could not create order', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 8000 }); return false; }
      } },
    ],
  });
}
