// iris2_estate_deals(p_limit) + iris2_estate_set_assumptions(p_patch)
// The cashflow-rental finder: real for-sale inventory, deterministic underwriting on read, ranked.
// The uw objects mirror the SQL engine's real output shape (re.underwrite) so preview == live.
import { ok, STATE } from './_state.js';

const BUY_BOX = () => ({
  max_price: 350000, max_units: 2, target_dscr: 1.30, target_coc: 0.08,
  down: 0.25, rate: 0.07, vacancy: 0.07, management: 0.09, repairs: 0.08, capex: 0.07,
  tax_rate_of_price: 0.008, insurance_per_unit_annual: 1500, closing: 0.03, amort_years: 30,
  min_cash_flow_per_unit_monthly: 100, ...STATE.buyBoxPatch,
});

// Sample listings with engine-shaped underwrites. Addresses are generic; numbers are real re.underwrite output.
const DEALS = [
  {
    listing_id: 'sample-1', address: '124 Marlowe St', city: 'Newport News', state: 'VA', zip: '23601',
    price: 165000, beds: 3, baths: 1.5, sqft: 1400, units: 1, property_type: 'single_family', days_on_market: 41,
    url: 'https://www.example.com/1', rent: 2100, rent_confidence: 'HIGH', rent_method: 'api',
    uw: { ok: true, grade: 'A', score: 84.2, passes: true, dscr: 1.549, cap_rate: 0.0927, cash_on_cash: 0.0791,
      cash_flow_mo: 305, cash_flow_per_unit: 305, cash_required: 46200, monthly_pi: 823, egi_mo: 1932, opex_mo: 657,
      noi_yr: 15300, grm: 6.5, one_pct: 0.0127, rent_total: 2100, units: 1, price: 165000, meets_dscr_target: true,
      why: { cf: 100, cap: 100, coc: 55, ptr: 100, dscr: 91 } },
  },
  {
    listing_id: 'sample-2', address: '88 Aberdeen Rd', city: 'Hampton', state: 'VA', zip: '23661',
    price: 158000, beds: 3, baths: 1.5, sqft: 1300, units: 1, property_type: 'single_family', days_on_market: 22,
    url: 'https://www.example.com/2', rent: 1850, rent_confidence: 'HIGH', rent_method: 'api',
    uw: { ok: true, grade: 'B', score: 68.4, passes: true, dscr: 1.425, cap_rate: 0.0853, cash_on_cash: 0.0559,
      cash_flow_mo: 206, cash_flow_per_unit: 206, cash_required: 44240, monthly_pi: 788, egi_mo: 1702, opex_mo: 579,
      noi_yr: 13476, grm: 7.1, one_pct: 0.0117, rent_total: 1850, units: 1, price: 158000, meets_dscr_target: true,
      why: { cf: 100, cap: 88, coc: 12, ptr: 100, dscr: 64 } },
  },
  {
    listing_id: 'sample-3', address: '412 Colley Ave', city: 'Norfolk', state: 'VA', zip: '23504',
    price: 230000, beds: 2, baths: 2, sqft: 1800, units: 2, property_type: 'duplex', days_on_market: 60,
    url: 'https://www.example.com/3', rent: 1250, rent_confidence: 'HIGH', rent_method: 'api',
    uw: { ok: true, grade: 'F', score: 24.6, passes: false, dscr: 1.169, cap_rate: 0.07, cash_on_cash: 0.0004,
      cash_flow_mo: 2, cash_flow_per_unit: 1, cash_required: 64400, monthly_pi: 1148, egi_mo: 2300, opex_mo: 958,
      noi_yr: 16100, grm: 7.7, one_pct: 0.0109, rent_total: 2500, units: 2, price: 230000, meets_dscr_target: false,
      why: { cf: 0, cap: 50, coc: 0, ptr: 100, dscr: 28 } },
  },
  {
    listing_id: 'sample-4', address: '2010 Grove Ave', city: 'Richmond', state: 'VA', zip: '23220',
    price: 285000, beds: 3, baths: 2, sqft: 1600, units: 1, property_type: 'single_family', days_on_market: 12,
    url: 'https://www.example.com/4', rent: 2300, rent_confidence: 'HIGH', rent_method: 'api',
    uw: { ok: true, grade: 'F', score: 7.8, passes: false, dscr: 0.908, cap_rate: 0.0544, cash_on_cash: -0.0554,
      cash_flow_mo: -368, cash_flow_per_unit: -368, cash_required: 79800, monthly_pi: 1422, egi_mo: 2116, opex_mo: 825,
      noi_yr: 15498, grm: 10.3, one_pct: 0.0081, rent_total: 2300, units: 1, price: 285000, meets_dscr_target: false,
      why: { cf: 0, cap: 11, coc: 0, ptr: 61, dscr: 0 } },
  },
];

export function estateDeals(args = {}) {
  const bb = BUY_BOX();
  let deals = DEALS
    .filter((d) => d.price <= bb.max_price && d.units <= bb.max_units)
    .slice(0, args.p_limit || 40)
    // ranked exactly like the RPC: passing first, then by score
    .sort((a, b) => (Number(b.uw.passes) - Number(a.uw.passes)) || (b.uw.score - a.uw.score));
  return ok({
    connected: true,
    buy_box: bb,
    deals,
    counts: { active_listings: DEALS.length, in_buy_box: deals.length },
    note: 'Deterministic underwriting on live for-sale inventory. Rent from RentCast estimate where present, else HUD FMR (VA) by bedroom. Decision-support, not advice.',
  });
}

export function estateSetAssumptions(args = {}) {
  const patch = args.p_patch || {};
  // the page sends buy-box column names; BUY_BOX() spreads display names, so map column → display
  const MAP = { down_payment_rate: 'down', interest_rate: 'rate', vacancy_rate: 'vacancy', management_rate: 'management',
    max_price: 'max_price', max_units: 'max_units', target_dscr: 'target_dscr', target_coc: 'target_coc' };
  for (const [col, disp] of Object.entries(MAP)) if (patch[col] != null && Number.isFinite(Number(patch[col]))) STATE.buyBoxPatch[disp] = Number(patch[col]);
  return ok({ buy_box: BUY_BOX(), note: 'Assumptions updated. Re-open the finder to underwrite live listings against them.' });
}
