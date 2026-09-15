// iris2_money() — wraps iris_fin_summary + iris_money_insights. Present only so the contract is complete in preview;
// the Money page never renders this in preview mode (owner rule: public assets never show personal financials).
// Every number below is synthetic.
import { ago, day, ok } from './_state.js';

export function money() {
  return ok({
    summary: {
      connected: true, message: null, net_worth: 100000, as_of: ago('5d'), cash: 20000, investments: 90000, debt: 10000,
      accounts: [
        { name: 'Checking', institution: 'Sample Bank', kind: 'depository', balance: 12000, is_asset: true },
        { name: 'Savings', institution: 'Sample Bank', kind: 'depository', balance: 8000, is_asset: true },
        { name: 'Brokerage', institution: 'Sample Broker', kind: 'investment', balance: 90000, is_asset: true },
        { name: 'Card', institution: 'Sample Card', kind: 'credit', balance: 10000, is_asset: false },
      ],
      holdings: [{ symbol: 'VTI', name: 'Total market ETF', quantity: 100, value: 30000 }, { symbol: 'VXUS', name: 'International ETF', quantity: 200, value: 12000 }],
      liabilities: [{ kind: 'credit_card', servicer: 'Sample Card', apr: 0.219, next_payment_date: day(12), balance: 10000, min_payment: 250 }],
      recent_tx: [{ merchant: 'Sample grocer', category: 'Groceries', date: day(-1), amount: -84.12, pending: false }, { merchant: 'Sample utility', category: 'Utilities', date: day(-3), amount: -132.4, pending: false }],
    },
    insights: {
      ready: true, month: day(0).slice(0, 7),
      kpis: { income: 10000, income_delta_pct: 0, real_spend: 6000, net_cash: 4000, savings_rate: 0.4, cash_buffer: 20000, buffer_days: 100 },
      categories: [{ kind: 'need', category: 'Housing', amount: 2200, weight_pct: 36.7, txn_count: 1 }, { kind: 'need', category: 'Groceries', amount: 640, weight_pct: 10.7, txn_count: 12 }, { kind: 'want', category: 'Dining', amount: 380, weight_pct: 6.3, txn_count: 9 }],
      flags: [{ severity: 'low', title: 'Card balance carrying interest', detail: 'Pay down before the 21.9% APR bites.', est_impact: 180 }],
    },
  });
}
