// iris2_commerce() dashboard + iris2_commerce_order(p_id) + write RPCs — preview data for the Commerce
// tab. Mirrors the commerce schema lifecycle (order → payment → fulfillment → entitlement).
import { ok } from './_state.js';

const ORDERS = [
  { id: 'ord-ml', status: 'fulfilled', amount_usd: 1500, source: 'stripe', is_demo: false,
    created_at: '2026-09-02T15:00:00Z', customer: { id: 'c-mer', name: 'Meridian Health', email: 'ap@meridianhealth.com', kind: 'org' },
    offer: { id: 'of-ml', name: 'ModelLens Model Health Audit - Single Model', price_usd: 1500, billing: 'one_time' },
    lane: { id: 'l-ml', title: 'ModelLens', key: 'modellens' }, paid_usd: 1500, fulfillment: 'delivered',
    items: [{ id: 'it1', description: 'ModelLens Model Health Audit - Single Model', qty: 1, unit_price_usd: 1500, amount_usd: 1500 }],
    payments: [{ id: 'p1', amount_usd: 1500, method: 'card', status: 'captured', provider: 'stripe', ledger_id: 'led-1', captured_at: '2026-09-02T15:05:00Z', created_at: '2026-09-02T15:05:00Z' }],
    fulfillments: [{ id: 'f1', kind: 'modellens_audit', status: 'delivered', artifact_ref: 'https://iris/projects/modellens', detail: null, delivered_at: '2026-09-04T18:00:00Z' }],
    entitlements: [{ id: 'e1', kind: 'access', status: 'active', access_ref: 'projects://modellens/meridian', expires_at: null }] },
  { id: 'ord-rva', status: 'paid', amount_usd: 29, source: 'gumroad', is_demo: false,
    created_at: '2026-09-06T12:00:00Z', customer: { id: 'c-inv', name: 'RVA Investor', email: 'investor@example.com', kind: 'person' },
    offer: { id: 'of-rva', name: 'RVA Distressed Deal Sheet - Monthly', price_usd: 29, billing: 'monthly' },
    lane: { id: 'l-rva', title: 'RVA Deal Sheet', key: 'rva_deal' }, paid_usd: 29, fulfillment: null,
    items: [{ id: 'it2', description: 'RVA Distressed Deal Sheet - Monthly', qty: 1, unit_price_usd: 29, amount_usd: 29 }],
    payments: [{ id: 'p2', amount_usd: 29, method: 'card', status: 'captured', provider: 'gumroad', ledger_id: 'led-2', captured_at: '2026-09-06T12:01:00Z', created_at: '2026-09-06T12:01:00Z' }],
    fulfillments: [], entitlements: [] },
  { id: 'ord-ins', status: 'pending', amount_usd: 4500, source: 'manual', is_demo: false,
    created_at: '2026-09-07T09:00:00Z', customer: { id: 'c-est', name: 'Northwind Estate', email: 'gp@northwind.com', kind: 'org' },
    offer: { id: 'of-est', name: 'ModelLens Estate Audit - 3 Models', price_usd: 4500, billing: 'one_time' },
    lane: { id: 'l-ml', title: 'ModelLens', key: 'modellens' }, paid_usd: 0, fulfillment: null,
    items: [{ id: 'it3', description: 'ModelLens Estate Audit - 3 Models', qty: 1, unit_price_usd: 4500, amount_usd: 4500 }],
    payments: [], fulfillments: [], entitlements: [] },
];

const OFFERS = [
  { id: 'of-est', name: 'ModelLens Estate Audit - 3 Models', price_usd: 4500, billing: 'one_time', status: 'draft', lane_id: 'l-ml', lane: 'ModelLens' },
  { id: 'of-ml', name: 'ModelLens Model Health Audit - Single Model', price_usd: 1500, billing: 'one_time', status: 'draft', lane_id: 'l-ml', lane: 'ModelLens' },
  { id: 'of-care', name: 'Automation Care Plan', price_usd: 300, billing: 'monthly', status: 'draft', lane_id: 'l-auto', lane: 'Automation' },
  { id: 'of-rva', name: 'RVA Distressed Deal Sheet - Monthly', price_usd: 29, billing: 'monthly', status: 'draft', lane_id: 'l-rva', lane: 'RVA Deal Sheet' },
];

const funnel = () => {
  const m = {};
  for (const o of ORDERS.filter((x) => !x.is_demo)) { m[o.status] = m[o.status] || { status: o.status, n: 0, usd: 0 }; m[o.status].n += 1; m[o.status].usd += o.amount_usd; }
  return Object.values(m);
};

export const commerce = () => ok({
  kpis: {
    open_orders: ORDERS.filter((o) => !o.is_demo && ['draft', 'pending', 'paid', 'fulfilled'].includes(o.status)).length,
    awaiting_payment: ORDERS.filter((o) => !o.is_demo && o.status === 'pending').length,
    awaiting_fulfillment: ORDERS.filter((o) => !o.is_demo && o.status === 'paid').length,
    active_entitlements: ORDERS.reduce((s, o) => s + o.entitlements.filter((e) => e.status === 'active').length, 0),
    mtd_recognized_usd: 1529, lifetime_recognized_usd: 1529,
    customers: 3, demo_orders: 0,
  },
  funnel: funnel(),
  orders: ORDERS.map((o) => ({ id: o.id, status: o.status, amount_usd: o.amount_usd, source: o.source, is_demo: o.is_demo, created_at: o.created_at, customer: o.customer.name, offer: o.offer.name, lane: o.lane.title, paid_usd: o.paid_usd, fulfillment: o.fulfillment })),
  offers: OFFERS,
  customers: ORDERS.map((o) => ({ id: o.customer.id, name: o.customer.name, email: o.customer.email, is_demo: false })),
});

export const commerceOrder = (args) => {
  const id = args && (args.p_id || args.id);
  const o = ORDERS.find((x) => x.id === id) || ORDERS[0];
  return ok(o);
};
export const commerceCustomerUpsert = (a) => ok({ customer_id: `cust_${Math.random().toString(16).slice(2, 10)}` });
export const commerceOrderCreate = (a) => ok({ ...ORDERS[2], id: `ord_${Math.random().toString(16).slice(2, 10)}`, status: 'pending' });
export const commerceOrderAdvance = (a) => { const o = ORDERS.find((x) => x.id === (a && a.p_id)) || ORDERS[0]; return ok({ ...o, status: a && a.p_to }); };
export const commercePaymentRecord = (a) => { const o = ORDERS.find((x) => x.id === (a && a.p_order_id)) || ORDERS[0]; return ok({ payment_id: 'pmt_x', ledger_id: o.is_demo ? null : 'led_x', order_status: 'paid', idempotent: false, order: { ...o, status: 'paid', paid_usd: o.amount_usd } }); };
export const commerceFulfill = (a) => { const o = ORDERS.find((x) => x.id === (a && a.p_order_id)) || ORDERS[0]; return ok({ ...o, status: 'fulfilled', fulfillments: [{ id: 'f_x', kind: a && a.p_kind, status: 'delivered', artifact_ref: a && a.p_artifact_ref, detail: a && a.p_detail, delivered_at: new Date().toISOString() }] }); };
export const commerceEntitlementSet = (a) => ok({ entitlement_id: `ent_${Math.random().toString(16).slice(2, 10)}` });
