// iris2_studio() + iris2_studio_production(p_id) + iris2_studio_act — sample data for preview.
// Mirrors rev.video_productions / render_jobs / providers (the AI video pipeline skeleton).
import { ok } from './_state.js';

const PROV = [
  { key: 'video_gen.default', capability: 'video_gen', label: 'AI video generation (cinematic shots)', vendor: null, enabled: false, credential_ref: 'VIDEO_GEN_API_KEY', is_default: true, required: true },
  { key: 'tts.default', capability: 'tts', label: 'Voiceover (text-to-speech)', vendor: null, enabled: false, credential_ref: 'TTS_API_KEY', is_default: true, required: true },
  { key: 'captions.default', capability: 'captions', label: 'Captions / burned-in subtitles', vendor: null, enabled: false, credential_ref: 'CAPTIONS_API_KEY', is_default: true, required: true },
  { key: 'assembly.default', capability: 'assembly', label: 'Assembly / render (stitch clips + VO + captions)', vendor: null, enabled: false, credential_ref: 'ASSEMBLY_API_KEY', is_default: true, required: true },
  { key: 'music.default', capability: 'music', label: 'Background music (optional)', vendor: null, enabled: false, credential_ref: 'MUSIC_API_KEY', is_default: false, required: false },
  { key: 'thumbnail.default', capability: 'thumbnail', label: 'Thumbnail / cover (optional)', vendor: null, enabled: false, credential_ref: 'THUMBNAIL_API_KEY', is_default: false, required: false },
];
const LANES = [
  { id: 'lane-iris', key: 'iris_build_series', title: 'Building an AI operating system in public (YouTube / Shorts scripts)' },
  { id: 'lane-auto', key: 'automation_services', title: 'McCourt AI / Sightline: automation builds for small operators' },
  { id: 'lane-deal', key: 'deal_sheet', title: 'RVA Distressed Deal Sheet (subscription)' },
  { id: 'lane-karta', key: 'karta_authority', title: 'Karta / ModelLens authority content' },
];
const P = [
  { id: 'prod-1', title: '[scaffold] Idea → draft example', lane: LANES[0], status: 'draft', format: 'short', aspect: '9:16', duration_target_s: 40, scene_count: 0, cost_usd: 0, created_by: 'scaffold',
    concept: 'Skeleton example: a fresh idea lands here from a lane before any script is written. Replace with real niche briefs once the niche is chosen.', style_notes: 'cinematic, high-contrast, kinetic captions', script: null, scenes: [], render_jobs: [] },
  { id: 'prod-2', title: '[scaffold] Script written example', lane: LANES[1], status: 'scripted', format: 'short', aspect: '9:16', duration_target_s: 45, scene_count: 0, cost_usd: 0, created_by: 'scaffold',
    concept: 'Skeleton example at the scripted stage — the voiceover script exists, storyboard not yet built.', style_notes: 'clean, brand-forward, bold captions',
    script: 'HOOK: The one automation every small operator is sleeping on.  BODY: Here is the workflow, start to finish.  CTA: Follow for the build.', scenes: [], render_jobs: [] },
  { id: 'prod-3', title: '[scaffold] Storyboarded example', lane: LANES[0], status: 'storyboarded', format: 'short', aspect: '9:16', duration_target_s: 15, scene_count: 3, cost_usd: 0, created_by: 'scaffold',
    concept: 'Skeleton example at the storyboarded stage — script broken into scenes with per-scene voiceover, on-screen caption, and a cinematic prompt slot.', style_notes: 'cinematic, film-grain, kinetic captions',
    script: 'HOOK: I gave an AI its own operating system.  BEAT: Here is what happened on day one.  CTA: Building in public — follow along.',
    scenes: [
      { seq: 1, vo_text: 'I gave an AI its own operating system.', on_screen_text: 'I gave an AI its own OS', scene_prompt: '<cinematic prompt — filled by the niche step>', duration_s: 5, status: 'pending' },
      { seq: 2, vo_text: 'Here is what happened on day one.', on_screen_text: 'Day one', scene_prompt: '<cinematic prompt — filled by the niche step>', duration_s: 6, status: 'pending' },
      { seq: 3, vo_text: 'Building in public — follow along.', on_screen_text: 'Follow the build', scene_prompt: '<cinematic prompt — filled by the niche step>', duration_s: 4, status: 'pending' },
    ], render_jobs: [] },
  { id: 'prod-4', title: '[scaffold] Rendering example', lane: LANES[2], status: 'rendering', format: 'short', aspect: '9:16', duration_target_s: 15, scene_count: 2, cost_usd: 0, created_by: 'scaffold',
    concept: 'Skeleton example at the rendering stage — render jobs are queued for the worker. No assets are produced until a provider is enabled.', style_notes: 'cinematic, data-overlay, bold captions',
    script: 'HOOK: Three distressed RVA deals the MLS missed this week.  BODY: Deal by deal.  CTA: Full sheet in bio.',
    scenes: [
      { seq: 1, vo_text: 'Three distressed deals the MLS missed this week.', on_screen_text: '3 deals the MLS missed', scene_prompt: '<cinematic prompt>', duration_s: 5, status: 'rendering' },
      { seq: 2, vo_text: 'Deal by deal, here is the math.', on_screen_text: 'The math', scene_prompt: '<cinematic prompt>', duration_s: 7, status: 'pending' },
    ],
    render_jobs: [
      { id: 'job-1', scene_seq: 1, kind: 'video_gen', provider_key: 'video_gen.default', state: 'pending', output_url: null, cost_usd: null },
      { id: 'job-2', scene_seq: null, kind: 'tts', provider_key: 'tts.default', state: 'pending', output_url: null, cost_usd: null },
    ] },
];

// shaped from the first real run (2026-09-14): two scripts written from the lanes' own topics, rendered by the IRIS worker
P.unshift(
  { id: 'prod-r1', title: 'SUM inside LOOKUP kills calc speed — stage it', lane: LANES[0], status: 'ready', format: 'short', aspect: '9:16', duration_target_s: 40, scene_count: 0, cost_usd: 0, created_by: 'studio-writer',
    concept: 'SUM and LOOKUP combined in one formula (ML-FRM-002): why it is slow and how to stage it in two line items', style_notes: null,
    script: 'Combining SUM and LOOKUP in one formula is a silent performance killer. Here is what happens. Anaplan resolves the lookup for every cell, then aggregates, every single time. Split it. Stage the lookup in its own line item, then SUM off that. Two line items, one calculation, and the engine can cache the middle step. Rule ML-FRM-002 if you want to look it up. Follow for one Anaplan fix a day.',
    scenes: [], render_jobs: [{ id: 'job-r1', kind: 'assembly', provider_key: 'assembly.iris', state: 'done', output_url: 'https://example.invalid/studio/prod-r1.mp4', error: null }],
    final_url: 'https://example.invalid/studio/prod-r1.mp4', hook: 'Combining SUM and LOOKUP in one formula is a silent performance killer.',
    post: { hook: 'Combining SUM and LOOKUP in one formula is a silent performance killer.', caption: 'One formula doing two jobs quietly wrecks your recalc. Here is how to split it and why it matters.', hashtags: ['#anaplan', '#modelbuilder', '#fpanda', '#anaplanmodel'], phrases: ['SUM + LOOKUP in one formula', 'Stage the LOOKUP first', 'Two line items, one calc', 'Calc time cut in half'], topic: 'SUM and LOOKUP combined in one formula (ML-FRM-002)', lane_key: 'karta_authority', words: 96 } },
  { id: 'prod-r2', title: 'EOB extraction: what the pipeline does and won’t guess', lane: LANES[1], status: 'rendering', format: 'short', aspect: '9:16', duration_target_s: 40, scene_count: 0, cost_usd: 0, created_by: 'studio-writer',
    concept: 'EOB PDF to underpayment finding: what the extraction pipeline does and what it refuses to guess', style_notes: null,
    script: 'Underpayments do not disappear. They sit in PDFs nobody reads twice. The pipeline reads every EOB line, matches it to the fee schedule, and flags what paid short. What it will not do is guess. A line it cannot match goes to a person, with the reason. Follow for the next build.',
    scenes: [], render_jobs: [{ id: 'job-r2', kind: 'assembly', provider_key: 'assembly.iris', state: 'claimed', output_url: null, error: null }],
    final_url: null, hook: 'Underpayments do not disappear. They sit in PDFs.',
    post: { hook: 'Underpayments do not disappear. They sit in PDFs.', caption: 'Underpayments don’t disappear — they sit in PDFs. The pipeline finds them. Here is what it will and won’t do on its own.', hashtags: ['#medicalbilling', '#rcm', '#aiautomation'], phrases: ['Underpayments sit in PDFs', 'Every EOB line matched', 'It will not guess', 'A person gets the rest'], topic: 'EOB PDF to underpayment finding', lane_key: 'automation_services', words: 62 } }
);
// the renderer that actually exists: voice + captions + assembly, keyless
PROV.unshift(
  { key: 'tts.edge', capability: 'tts', label: 'Voice — Microsoft neural (edge-tts, keyless)', vendor: 'microsoft-edge', enabled: true, credential_ref: null, is_default: true, required: true },
  { key: 'captions.iris', capability: 'captions', label: 'Captions — word timings from the voice track', vendor: 'iris', enabled: true, credential_ref: null, is_default: true, required: true },
  { key: 'assembly.iris', capability: 'assembly', label: 'Assembly — IRIS render worker (ffmpeg + karaoke captions)', vendor: 'iris', enabled: true, credential_ref: null, is_default: true, required: true }
);

const stages = () => P.reduce((a, p) => { a[p.status] = (a[p.status] || 0) + 1; return a; }, {});

export const studio = () => ok({
  productions: P.filter((p) => p.created_by !== 'scaffold').map((p) => ({ id: p.id, title: p.title, lane_key: p.lane.key, lane_title: p.lane.title, status: p.status, format: p.format, aspect: p.aspect, duration_target_s: p.duration_target_s, scene_count: p.scene_count, cost_usd: p.cost_usd, thumbnail_url: null, final_url: p.final_url || null, hook: p.hook || null, topic: p.post ? p.post.topic : null, error: null, created_by: p.created_by, updated_at: '2026-09-14' })),
  stages: stages(),
  providers: PROV,
  provider_readiness: { required: 4, enabled: 3, missing: PROV.filter((x) => x.required && !x.enabled).map((x) => x.label) },
  posting: { tiktok_connected: false, how: 'download the mp4 + copy the caption; mark posted here' },
  ready_unposted: 1,
  lanes: LANES,
  as_of: '2026-09-06T19:00:00Z',
  note: 'TikTok machine: every day the writer picks a lane and an unused topic, writes a 35–45 s script with a hook, key phrases and the post text; the render worker turns it into a 9:16 mp4 (neural voice, word-timed captions, generated motion background) and it lands here as READY. Posting is your tap: download, paste the caption. No TikTok posting credential is connected, so nothing is published without you.',
});

export const studioProduction = (args) => {
  const id = args && (args.p_id || args.id);
  const p = P.find((x) => x.id === id) || P[0];
  return ok({
    id: p.id, title: p.title, concept: p.concept, script: p.script, scenes: p.scenes,
    lane: { id: p.lane.id, key: p.lane.key, title: p.lane.title, voice_notes: null },
    format: p.format, aspect: p.aspect, duration_target_s: p.duration_target_s, voice_key: null,
    style_notes: p.style_notes, caption_style: {}, status: p.status, audio_url: null, final_url: p.final_url || null, post: p.post || null,
    thumbnail_url: null, cost_usd: p.cost_usd, error: null, created_by: p.created_by,
    approved_at: null, published_at: null, created_at: '2026-09-06', updated_at: '2026-09-06',
    render_jobs: p.render_jobs,
  });
};
export const studioAct = (args) => studioProduction(args);
