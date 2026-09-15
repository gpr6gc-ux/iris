// iris2_intel() — sources, scout finds, harvest.
import { ago, ok } from './_state.js';

const S = (name, url, kind, status, priority, crawls, finds, discovered_by, lastAgo, why) => ({ name, url, kind, status, priority, crawls, finds, yield: crawls ? +((finds / crawls) * 100).toFixed(1) : 0, discovered_by, last_crawled_at: ago(lastAgo), why });

export function intel() {
  return ok({
    sources: [
      S('community.anaplan.com/kb', 'https://community.anaplan.com/kb', 'knowledge base', 'active', 1, 412, 14, 'owner', '72s', 'Planual rules and performance guidance'),
      S('docs.n8n.io/release-notes', 'https://docs.n8n.io/release-notes/', 'docs', 'active', 2, 188, 9, 'owner', '8m', 'capabilities that change the automation stack'),
      S('supabase.com/docs', 'https://supabase.com/docs', 'docs', 'active', 2, 160, 7, 'scout-signals', '31m', 'platform capabilities · realtime, auth, vault'),
      S('sec.gov · EDGAR 8-K (SIC 80xx)', 'https://www.sec.gov/cgi-bin/browse-edgar', 'filings', 'paused', 3, 1104, 31, 'owner', '15m', 'healthcare catalysts · rate-limited, backoff'),
      S('rva.gov · tax sales & delinquency', 'https://www.rva.gov/finance/tax-sales', 'public records', 'active', 1, 96, 22, 'owner', '71m', 'forced-sale signals for the deal radar'),
      S('linkedin.com/jobs · Anaplan', 'https://www.linkedin.com/jobs/', 'job board', 'active', 2, 61, 6, 'scout-markets', '3h', 'lead signals: model rebuilds, CoE hires'),
      S('github.com/n8n-io/n8n-workflows', 'https://github.com/n8n-io/n8n-workflows', 'repo', 'active', 3, 77, 12, 'harvester', '40m', 'workflow patterns for the harvester'),
      S('anaplan.com/blog', 'https://www.anaplan.com/blog/', 'blog', 'candidate', 4, 12, 1, 'universal-crawler', '33m', 'self-discovered · low yield so far'),
      S('fred.stlouisfed.org', 'https://fred.stlouisfed.org', 'data', 'active', 2, 240, 240, 'owner', '10d', 'macro series · currently stale'),
      S('richmondgov.com/legal-notices', 'https://www.richmondgov.com/legal-notices', 'public records', 'active', 2, 58, 9, 'scout-signals', '2d', 'foreclosure notices'),
      S('reddit.com/r/anaplan', 'https://www.reddit.com/r/anaplan/', 'forum', 'dead', 5, 20, 0, 'universal-crawler', '20d', 'no signal in 20 crawls'),
      S('beehiiv.com/docs', 'https://developers.beehiiv.com', 'docs', 'candidate', 4, 3, 1, 'scout-work', '1d', 'newsletter provider evaluation'),
    ],
    self_discovered: 4,
    finds: {
      pending: [
        { id: 'find_01', statement: 'Anaplan Polaris engine changes the cost model for sparse modules — several ML-SIZ rules need a Polaris branch.', detail: 'Community thread + release note; affects Model Size deductions.', at: ago('2h'), by: 'scout-craft', confidence: 0.7 },
        { id: 'find_02', statement: 'Netlify now supports per-deploy CSP nonces via edge functions.', detail: 'Could replace the static header for the 5.0 board.', at: ago('6h'), by: 'scout-work', confidence: 0.6 },
        { id: 'find_03', statement: 'Richmond publishes surplus-property auctions as a CSV feed.', detail: 'Adds a sixth forced-sale signal without scraping.', at: ago('9h'), by: 'scout-signals', confidence: 0.8 },
      ],
      adopted: [
        { statement: 'Supabase Realtime broadcast from triggers (realtime.send) replaces polling.', detail: 'Adopted into the 5.0 contract.', at: ago('3d'), adopted_at: ago('2d') },
        { statement: 'Machine tokens with scopes replace the single board token.', detail: 'brain.app_tokens_v2 + Vault.', at: ago('4d'), adopted_at: ago('3d') },
        { statement: 'ModelLens findings persist into karta.efficiency_findings for lineage.', detail: 'Bundle importer.', at: ago('6d'), adopted_at: ago('5d') },
      ],
    },
    harvest: {
      repos: [
        { repo: 'n8n-io/n8n-workflows', url: 'https://github.com/n8n-io/n8n-workflows', at: ago('40m'), artifacts: [{ type: 'pattern', title: 'Wait-node paging for heavy RPC bursts', detail: 'Applies to the enrichment burst at :01.' }, { type: 'workflow', title: 'Error workflow → Slack digest', detail: 'Reusable for the failing-workflow list.' }, { type: 'pattern', title: 'Sub-workflow per credential', detail: 'Keeps platform credentials out of agent nodes.' }] },
        { repo: 'supabase/supabase', url: 'https://github.com/supabase/supabase', at: ago('5h'), artifacts: [{ type: 'snippet', title: 'realtime.messages RLS policy for private channels', detail: 'select when is_owner(auth.uid()).' }] },
        { repo: 'nlpaueb/edgar-crawler', url: 'https://github.com/nlpaueb/edgar-crawler', at: ago('1d'), artifacts: [{ type: 'component', title: '8-K item parser', detail: 'Feeds the Factory build proposal.' }] },
      ],
      counts: { repos: 77, artifacts: 214, patterns: 61, workflows: 38 },
    },
    pattern_library_size: 1240,
  });
}
