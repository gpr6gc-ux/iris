// iris2_careers() + iris2_career(p_id) + intake/act — preview data for the Careers tab.
// Mirrors careers.applications / requirements / scores. Bessemer is the worked example.
import { ok } from './_state.js';

const APPS = [
  { id: 'app-bessemer', company: 'Bessemer Venture Partners', role_title: 'Full-Time Analyst (2026)', source: 'greenhouse',
    location: 'New York City, NY', onsite: 'onsite', salary_text: '$115,000 base + bonuses', status: 'tailored',
    has_resume: true, fit_score: 76.5, confidence: 0.80, verdict: 'Strong fit',
    url: 'https://job-boards.greenhouse.io/bvpanalyst/jobs/4601139005',
    tailored_resume_ref: 'Greyson_Ragone_Resume_Bessemer_Analyst.docx',
    jd_raw: 'Two-year VC analyst apprenticeship for recent grads. Interact with 100+ CEOs to identify seed-to-Series C startups; collaborate with partners on diligence and investment roadmaps; develop sector expertise in vertical software, AI infrastructure, supply chain, healthcare, climate, and consumer internet. Requires: graduation winter 2025–summer 2026; deep curiosity about technology and entrepreneurship; demonstrated leadership on campus and/or beyond; effective communication; unrelenting determination; fluency in fundamental business concepts; strong academics, any major.',
    requirements: [
      { seq: 1, label: 'Investment & diligence fluency', category: 'skill', weight: 0.20, must_have: false, coverage: 0.95, state: 'met', evidence: 'IB internship (3-statement, DCF, comps, memos), HIMS equity thesis, Falco LBO.' },
      { seq: 2, label: 'Sector alignment with Bessemer’s focus', category: 'sector', weight: 0.20, must_have: false, coverage: 0.75, state: 'partial', evidence: 'Deep on supply chain (Anaplan) and healthcare (EDI, HIMS); emerging on AI/vertical software; not shown: climate, consumer internet.' },
      { seq: 3, label: 'Technology & entrepreneurship curiosity', category: 'soft', weight: 0.15, must_have: false, coverage: 0.60, state: 'partial', evidence: 'Strongest signal is building IRIS (an AI operating system) — now on the resume.' },
      { seq: 4, label: 'Recent-grad eligibility (grad by summer 2026)', category: 'eligibility', weight: 0.10, must_have: true, coverage: 1.00, state: 'met', evidence: 'B.A. May 2025 + MSBA expected 2026 — inside the window.' },
      { seq: 5, label: 'Demonstrated leadership (campus and/or beyond)', category: 'soft', weight: 0.10, must_have: false, coverage: 0.40, state: 'gap', evidence: 'Explicitly required; addressed by framing the IRIS build as a leadership role.' },
      { seq: 6, label: 'Communication & persuasion', category: 'soft', weight: 0.08, must_have: false, coverage: 0.70, state: 'partial', evidence: 'Investment memos and cross-functional stakeholder partnering.' },
      { seq: 7, label: 'Fluency in fundamental business concepts', category: 'skill', weight: 0.07, must_have: false, coverage: 0.95, state: 'met', evidence: 'Economics degree, IB internship, valuation across public and private.' },
      { seq: 8, label: 'Strong academic performance (any major)', category: 'education', weight: 0.05, must_have: false, coverage: 0.85, state: 'met', evidence: 'Econ + CS minor + MSBA. Add GPA if ≥3.5.' },
      { seq: 9, label: 'Unrelenting determination / drive', category: 'soft', weight: 0.05, must_have: false, coverage: 0.60, state: 'partial', evidence: 'Self-directed building (IRIS) is the best evidence.' },
    ],
    odds: { band: 'Competitive reach', pool_percentile: 75, selectivity: 'Highly selective',
      note: 'A strong resume puts you near the top of the pool, but analyst classes are tiny and offer rates run in the low single digits. Biggest lever is a warm referral.' },
    gaps: [
      { rank: 1, action: 'Add IRIS as a project', lift: '+6', lever: false, why: 'Covers AI-infrastructure sector, entrepreneurial curiosity, and drive in one move.' },
      { rank: 2, action: 'Restore one leadership line', lift: '+3', lever: false, why: 'Bessemer explicitly requires campus/beyond leadership.' },
      { rank: 3, action: 'Get a warm referral', lift: 'biggest lever', lever: true, why: 'Single highest-leverage move; outweighs any resume point.' },
      { rank: 4, action: 'Add GPA if ≥ 3.5', lift: '+2', lever: false, why: 'Makes strong academic performance explicit.' },
    ],
    rationale: 'Weighted across 9 role requirements. Applying the top two edits lifts the fit to ~82.' },

  { id: 'app-sample', company: 'Insight Partners', role_title: 'Investment Analyst', source: 'linkedin',
    location: 'New York City, NY', onsite: 'hybrid', salary_text: '$110–130k', status: 'parsed',
    has_resume: false, fit_score: 68, confidence: 0.6, verdict: 'Target',
    url: null, tailored_resume_ref: null,
    jd_raw: 'Growth-stage software investing. Sourcing, diligence, and portfolio support across ScaleUp software.',
    requirements: [
      { seq: 1, label: 'Software / growth-investing interest', category: 'sector', weight: 0.25, must_have: false, coverage: 0.7, state: 'partial', evidence: 'Building IRIS + valuation work; less growth-stage exposure.' },
      { seq: 2, label: 'Diligence & modeling', category: 'skill', weight: 0.25, must_have: false, coverage: 0.9, state: 'met', evidence: 'IB internship + LBO/DCF projects.' },
      { seq: 3, label: 'Sourcing / outbound', category: 'soft', weight: 0.2, must_have: false, coverage: 0.5, state: 'partial', evidence: 'Some via leads engine; not a formal sourcing role yet.' },
    ],
    odds: { band: 'Target', pool_percentile: 60, selectivity: 'Competitive',
      note: 'Sample record showing a second pipeline entry — replace with your real applications.' },
    gaps: [{ rank: 1, action: 'Tailor a resume to this posting', lift: '+5', lever: false, why: 'No tailored version yet — generate one to lift sourcing/sector coverage.' }],
    rationale: 'Sample application to illustrate the pipeline.' },
];

const summary = (a) => ({ id: a.id, company: a.company, role_title: a.role_title, source: a.source,
  location: a.location, onsite: a.onsite, salary_text: a.salary_text, status: a.status,
  has_resume: a.has_resume, fit_score: a.fit_score, confidence: a.confidence, verdict: a.verdict,
  created_at: '2026-09-07', updated_at: '2026-09-07' });

export const careers = () => ok({
  applications: APPS.map(summary),
  pipeline: APPS.reduce((m, a) => { m[a.status] = (m[a.status] || 0) + 1; return m; }, {}),
  stats: { tracked: APPS.length, applied: APPS.filter((a) => ['applied', 'interviewing', 'offer'].includes(a.status)).length,
    avg_fit: Math.round(APPS.reduce((s, a) => s + (a.fit_score || 0), 0) / APPS.length * 10) / 10 },
  note: 'Drop a job link or paste a description to add a role. IRIS parses the posting, tailors your resume, and scores the fit.',
});

export const career = (args) => {
  const id = args && (args.p_id || args.id);
  const a = APPS.find((x) => x.id === id) || APPS[0];
  return ok({
    application: { id: a.id, company: a.company, role_title: a.role_title, source: a.source, url: a.url,
      location: a.location, onsite: a.onsite, salary_text: a.salary_text, status: a.status, jd_raw: a.jd_raw,
      tailored_resume_ref: a.tailored_resume_ref, applied_at: null, created_at: '2026-09-07', meta: {} },
    requirements: a.requirements,
    score: { fit_score: a.fit_score, confidence: a.confidence, verdict: a.verdict, odds: a.odds, gaps: a.gaps, sub: {}, rationale: a.rationale, computed_at: '2026-09-07' },
    // shaped from the first real run (Anduril, 2026-09-14): 12 changes, 10 questions, ~$0.13 per job
    tailoring: a.status === 'tailored' ? {
      docx_name: a.tailored_resume_ref, has_docx: true, docx_bytes: 10782, model: 'claude-sonnet-4-6', cost_usd: 0.13, updated_at: '2026-09-07T23:30:00Z',
      keywords: { used: ['financial analyst', 'variance analysis', 'Anaplan', 'accounts receivable', 'Excel modeling', 'financial reporting'], unused: ['Earned Value Management', 'Cost Accounting Standards', 'FAR'], from_posting: [] },
      changes: [
        { section: 'summary', where: 'summary', from: 'Financial and data analyst with hands-on experience in enterprise planning…', to: 'Financial analyst with hands-on experience in financial modeling, variance analysis, billing reconciliation, and enterprise planning…', why: 'Reorients toward program finance; adds the posting’s exact terms', verify: false },
        { section: 'experience', where: 'Keplr Vision', from: 'Performed accounts receivable variance analysis to support revenue cycle optimization…', to: 'Performed accounts receivable variance analysis to support revenue recognition accuracy…', why: 'ATS keyword: revenue recognition', verify: true },
        { section: 'projects', where: 'Public Equity Valuation – Hims & Hers', from: 'included in base resume', to: '(dropped)', why: 'Less relevant than the projection model; keeps one page', verify: false },
      ],
      prep: {
        elevator_pitch: 'I’m a financial analyst with a background in enterprise planning, billing reconciliation, and financial modeling. At Keplr Vision I reconciled over 10,000 monthly billing records and caught $20,000 in revenue leakage; at Karta I build Anaplan planning models for a manufacturer. B.A. Economics from UVA, finishing an MSBA at William & Mary.',
        likely_questions: [
          { q: 'Walk me through how you have handled a large, messy dataset and turned it into a financial insight.', why_asked: 'Core job function is reconciling financial data across systems.', answer_outline: 'S: 10,000+ monthly billing records across three systems. T: find discrepancies before month-end. A: Excel automation + SQL cross-validation. R: ~$20,000 leakage found, ~30% less manual time.' },
          { q: 'You have no EVM or government-contracting experience. How will you get up to speed?', why_asked: 'Named gap in the posting.', answer_outline: 'Acknowledge; posting says it is trained; DAU primers; variance analysis is the foundation EVM builds on.' },
        ],
        stories: [{ name: 'Revenue leakage at Keplr', situation: 'Three billing systems, no single source of truth.', task: 'Find discrepancies before close.', action: 'Built parsers and SQL checks.', result: '~$20,000 identified; 30% faster reconciliation.', use_for: ['data', 'ownership'] }],
        gap_handling: [{ gap: 'No EVM / CAS / FAR', how_to_address: 'Say so plainly; cite the posting’s “trained over time”; connect variance analysis to cost-at-completion tracking.' }],
        questions_to_ask: ['What does the first month-end close look like for a new analyst on this team?', 'Which program milestones drive the finance calendar this year?'],
        company_notes: ['Defense technology company; the role sits in program finance for an autonomous aircraft program (from the posting).'],
        first_90_days: 'Learn the cost structure and the close calendar first; take ownership of one recurring variance package by day 60; automate the parts of it that are spreadsheet work by day 90.',
        red_flags_to_check: ['Onsite in Costa Mesa, CA', 'Security clearance eligibility — confirm before applying'],
      },
    } : null,
  });
};
export const careerFile = () => ok({ name: 'Greyson_Ragone_Resume_preview.docx', b64: 'UEsDBBQAAAAIAA==', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

export const careerIntake = (a) => ok({ id: `app_${Math.random().toString(16).slice(2, 10)}`, status: 'new', message: 'Intake stored (preview).' });
export const careerAct = (a) => ok({ id: a && a.p_id, action: a && a.p_action, ok: true });
