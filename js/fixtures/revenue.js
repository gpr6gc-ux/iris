// iris2_revenue() + iris2_rev_channel_set — six lanes, seven channels (all auto_publish=false), three scored LinkedIn drafts.
import { ok, fail, STATE, isDecided } from './_state.js';
import { CONTENT } from './decisions.js';

const LANES = [
  { key: 'karta_authority', title: 'Karta authority → audit leads', offer: 'LinkedIn · newsletter', audience: 'FP&A leads and Anaplan CoE owners', status: 'active', priority: 1, monthly_target_usd: 1500, drafts: 3, readiness_pct: 68, owner_actions: ['Create the LinkedIn credential in n8n and pick the person in the Publisher node', 'Approve the first 10 drafts and tune voice_notes if the tone is off'] },
  { key: 'modellens_audit', title: 'ModelLens paid model-health audit', offer: '$1,500–$5,000 fixed fee', audience: 'Anaplan customers with 100+ module models', status: 'active', priority: 2, monthly_target_usd: 4500, drafts: 0, readiness_pct: 20, owner_actions: ['Stripe payment link for the $1,500 single-model audit → offer goes live', 'Approve the one-page offer copy on modellens.netlify.app'] },
  { key: 'deal_sheet', title: 'RVA Distressed Deal Sheet', offer: 'subscription · sales page live', audience: 'Richmond small-multifamily investors', status: 'active', priority: 3, monthly_target_usd: 600, drafts: 0, readiness_pct: 35, owner_actions: ['Subscription links ($29/mo, $199/yr) into rev.offers.url', 'Confirm republishing posture for public trustee notices'] },
  { key: 'digital_products', title: 'Digital products (n8n templates, audit checklist)', offer: 'Gumroad / Lemon Squeezy', audience: 'automation builders · Anaplan modelers', status: 'idea', priority: 4, monthly_target_usd: 400, drafts: 0, readiness_pct: 10, owner_actions: ['Gumroad account for the audit checklist + n8n templates'] },
  { key: 'automation_services', title: 'McCourt AI automation builds', offer: 'Upwork · LinkedIn proposals', audience: 'SMB ops teams · RCM', status: 'idea', priority: 5, monthly_target_usd: 3000, drafts: 0, readiness_pct: 15, owner_actions: ['Upwork profile · decide McCourt AI vs Sightline for proposals'] },
  { key: 'iris_build_series', title: 'Building IRIS (YouTube / Shorts scripts)', offer: 'scripts drafted, you film', audience: 'builders following the agentic-OS series', status: 'paused', priority: 6, monthly_target_usd: 0, drafts: 0, readiness_pct: 5, owner_actions: ['YouTube channel/brand · record approved scripts · Money tab never on camera'] },
];

const CHANNELS = [
  { key: 'linkedin_greyson', label: 'LinkedIn · personal', kind: 'linkedin', enabled: true, credential_ref: 'LinkedIn OAuth2 - Greyson', credential_present: false, note: 'credential missing' },
  { key: 'x_karta', label: 'X · @karta', kind: 'x', enabled: true, credential_ref: 'X OAuth2 - Karta', credential_present: false, note: 'credential missing' },
  { key: 'newsletter', label: 'Newsletter · weekly', kind: 'newsletter', enabled: true, credential_ref: 'Newsletter API', credential_present: false, note: 'provider not chosen' },
  { key: 'youtube_iris', label: 'YouTube · scripts only', kind: 'youtube', enabled: true, credential_ref: null, credential_present: false, note: 'scripts drafted, never auto-posted' },
  { key: 'gumroad', label: 'Gumroad', kind: 'gumroad', enabled: false, credential_ref: 'Gumroad API', credential_present: false, note: 'account needed' },
  { key: 'upwork', label: 'Upwork proposals', kind: 'upwork', enabled: true, credential_ref: null, credential_present: false, note: 'you send every proposal yourself' },
  { key: 'landing_modellens', label: 'Landing copy · modellens.netlify.app', kind: 'landing', enabled: true, credential_ref: 'Netlify deploy - modellens', credential_present: true, note: 'copy deploys only after approval' },
];

const item = (c, status) => ({ id: c.id, lane_key: 'karta_authority', channel_key: 'linkedin_greyson', kind: 'post', title: c.title, chars: c.chars, quality_score: c.quality, quality_pass: true, critic_score: c.critic, scheduled_at: null, published_at: null, external_url: null, status });

export function revenue() {
  const scored = CONTENT.filter((c) => !isDecided(c.id)).map((c) => item(c, 'scored'));
  const approved = CONTENT.filter((c) => STATE.decided.get(c.id)?.decision === 'approve').map((c) => ({ ...item(c, 'approved'), held: !STATE.channels.linkedin_greyson }));
  return ok({
    kpis: { revenue_30d_usd: 0, awaiting_approval: scored.length, scheduled: 0, published: 0, cost_per_draft_usd: 0.018 },
    lanes: LANES.map((l) => ({ ...l, drafts: l.key === 'karta_authority' ? scored.length + approved.length : l.drafts })),
    channels: CHANNELS.map((c) => ({ ...c, auto_publish: !!STATE.channels[c.key] })),
    queue: { scored, approved, scheduled: [], published: [] },
    offers: [
      { id: 'off_01', lane_key: 'modellens_audit', name: 'ModelLens Model Health Audit — single model', price_usd: 1500, url: null, status: 'draft' },
      { id: 'off_02', lane_key: 'modellens_audit', name: 'ModelLens Model Health Audit — portfolio (up to 4)', price_usd: 5000, url: null, status: 'draft' },
      { id: 'off_03', lane_key: 'deal_sheet', name: 'RVA Deal Sheet — monthly', price_usd: 29, url: 'https://rva-deal-sheet.netlify.app', status: 'live' },
      { id: 'off_04', lane_key: 'digital_products', name: 'Anaplan model-health checklist (PDF)', price_usd: 49, url: null, status: 'draft' },
    ],
    owner_actions: [
      { lane_key: 'karta_authority', text: 'Create the LinkedIn credential in n8n and pick the person in the Publisher node', done: false },
      { lane_key: 'modellens_audit', text: 'Stripe payment link for the $1,500 ModelLens audit → offer goes live', done: false },
      { lane_key: 'karta_authority', text: 'Choose a newsletter provider (Beehiiv / Buttondown) and add its API credential', done: false },
      { lane_key: 'digital_products', text: 'Gumroad account for the audit checklist + n8n templates', done: false },
      { lane_key: 'deal_sheet', text: 'Confirm the sales page URL into rev.offers.url', done: true },
    ],
  });
}

export function revChannelSet(args = {}) {
  const ch = CHANNELS.find((c) => c.key === args.p_channel_key);
  if (!ch) return fail('not_found', `unknown channel ${args.p_channel_key}`);
  STATE.channels[ch.key] = !!args.p_auto_publish;
  const released = args.p_auto_publish ? CONTENT.filter((c) => STATE.decided.get(c.id)?.decision === 'approve').length : 0;
  return ok({ channel_key: ch.key, auto_publish: !!args.p_auto_publish, released, held: args.p_auto_publish ? 0 : released });
}
