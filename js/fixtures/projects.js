// iris2_projects() — the library of published work.
import { ok } from './_state.js';

const P = (key, name, tagline, status, kind, live_url, repo_url, stack, problem, what_it_does, use_cases, components, metrics, view) => ({ key, name, tagline, status, kind, live_url, repo_url, stack, problem, what_it_does, use_cases, components, metrics, view });

export function projects() {
  return ok({
    projects: [
      P('modellens', 'ModelLens', 'Anaplan model intelligence', 'live', 'product', 'https://modellens.netlify.app', null, ['Python engine 2.1.0', 'Streamlit desktop', 'static web', 'n8n LLM layer'],
        'Anaplan model owners cannot see where their models waste calculation, or which findings are worth a human hour.',
        'A deterministic audit engine scores a model 0–100 with capped category deductions, then an advisory LLM layer reviews the findings without ever moving the score.',
        ['Pre-sales model-health audit', 'CoE quarterly hygiene review', 'Handover due diligence'],
        ['deterministic engine', 'web viewer', 'desktop app', 'governed LLM layer', 'Karta persistence'],
        [{ label: 'sample audits', value: '4' }, { label: 'scores', value: '47.0 / 29.0 / 36.5 / 34.5' }, { label: 'rules', value: '34' }], 'modellens'),
      P('karta', 'Karta Memory', 'governed project memory', 'skeleton', 'platform', null, null, ['Postgres 17', 'RLS', 'MCP tool layer (draft)'],
        'Every Anaplan build loses its why: decisions live in meeting notes, requirements in decks, line items in the model.',
        'A schema that links requirement → decision → line item with evidence, snapshots and a write gate by role.',
        ['Why was this built this way?', 'Impact of a proposed change', 'Client-safe audit trail'],
        ['45 tables', 'lineage edges', 'proposal queue', 'MCP tools'],
        [{ label: 'clients · projects', value: '1 · 1' }, { label: 'line items traced', value: '51' }, { label: 'lineage edges', value: '29' }], 'karta'),
      P('sightline', 'Sightline', 'AR field operations', 'live', 'product', 'https://sightline-ar-demo.netlify.app', null, ['static web', 'Supabase'], 'Field AR teams work from spreadsheets and memory.', 'A field-operations console for AR follow-up with handoff packs.', ['Daily AR worklist', 'Handoff v1.4.1'], ['console', 'handoff pack'], [{ label: 'handoff', value: 'v1.4.1 shipped' }], null),
      P('keplr', 'Keplr Tracker', 'RCM operations dashboard', 'live', 'product', 'https://keplr-tracker.netlify.app', null, ['static web', 'Supabase'], 'RCM operations across 261 locations had no single view.', 'A tracker for RCM operations with location-level status.', ['Location status', 'Weekly ops review'], ['dashboard', 'importer'], [{ label: 'locations', value: '261' }, { label: 'plan', value: 'v1 · Pro' }], null),
      P('deal_sheet', 'RVA Deal Sheet', 'distressed-deal newsletter', 'live', 'offer', 'https://rva-deal-sheet.netlify.app', null, ['static web', 'generator RPC'], 'Richmond small-multifamily investors miss forced-sale signals.', 'A fortnightly sheet generated from the deal radar, published after approval.', ['Subscriber issue', 'Sales page'], ['sales page', 'generator RPC', 'publisher'], [{ label: 'issue', value: '#2 awaiting approval' }], null),
      P('functional_energy', 'Functional Energy', 'company-in-a-box', 'paused', 'venture', null, null, ['docs', 'financial model'], 'A functional beverage brand needs a plan before a co-packer.', 'Research sprints, brand and financial model documents, co-packer RFQ.', ['Co-packer RFQ', 'Brand doc'], ['3 research sprints', 'RFQ'], [{ label: 'sprints', value: '3' }], null),
      P('iris_platform', 'IRIS Platform · Council', 'Roman court war room', 'live', 'view', 'https://iris-platform.netlify.app', null, ['static web'], 'Big decisions need adversarial review.', 'A council of role-played advisors argues a decision and records the verdict.', ['Decision review'], ['council view'], [{ label: 'activity', value: 'dormant since Aug 26' }], null),
      P('compliance_box', 'Compliance Box', 'hardware comparison view', 'view', 'view', null, null, ['static view'], 'Choosing on-prem inference hardware.', 'M5 Ultra vs DGX Spark comparison.', ['Hardware decision'], ['static view'], [{ label: 'kind', value: 'static view' }], null),
      P('no_man_doctrine', 'No-Man Doctrine', 'agent write-access security', 'view', 'view', null, null, ['static view'], 'Agents with write access need a doctrine.', 'Blueprint + phased checklist for agent write access.', ['Security review'], ['static view'], [{ label: 'kind', value: 'blueprint' }], null),
    ],
  });
}
