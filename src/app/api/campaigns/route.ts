import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TOKEN = '1487795529530869|ZN-LEkit58D0lEJd2-wwkHGJIbA';
const BASE = 'https://graph.facebook.com/v21.0';

const METRICS = [
  'impressions', 'reach', 'frequency',
  'clicks', 'unique_clicks', 'inline_link_clicks',
  'ctr', 'unique_ctr',
  'cpc', 'cpm', 'cpp',
  'spend',
  'actions', 'unique_actions',
  'cost_per_action_type', 'cost_per_unique_action_type',
  'conversions',
  'purchase_roas',
  'outbound_clicks', 'outbound_clicks_ctr',
].join(',');

async function metaFetch(endpoint: string) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${BASE}/${endpoint}${sep}access_token=${TOKEN}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Meta API error: ${res.status}`);
  return res.json();
}

async function fetchAllPages(endpoint: string): Promise<any[]> {
  let all: any[] = [];
  let data = await metaFetch(endpoint);
  if (data.data) all = all.concat(data.data);
  else return [data];

  while (data.paging?.next) {
    const next = new URL(data.paging.next);
    const nextEndpoint = next.pathname.replace('/v21.0/', '') + next.search.replace(`?access_token=${TOKEN}&`, '?').replace(`&access_token=${TOKEN}`, '');
    data = await metaFetch(nextEndpoint);
    if (!data.data) break;
    all = all.concat(data.data);
  }
  return all;
}

function generateRecommendations(metrics: {
  ctr: number; cpc: number; cpm: number; cpa: number;
  frequency: number; spend: number; conversions: number; status: string;
}) {
  const recs: { type: string; text: string }[] = [];

  if (metrics.status === 'PAUSED') {
    recs.push({ type: 'info', text: 'Campanha pausada. Avalie se deve ser reativada ou arquivada.' });
  }
  if (metrics.frequency > 3.5) {
    recs.push({ type: 'warning', text: `Frequência alta (${metrics.frequency.toFixed(1)}x). Renove os criativos para evitar fadiga do público.` });
  }
  if (metrics.ctr < 0.5 && metrics.ctr > 0) {
    recs.push({ type: 'warning', text: `CTR baixo (${metrics.ctr.toFixed(2)}%). Teste novos criativos ou reveja a segmentação.` });
  } else if (metrics.ctr >= 2) {
    recs.push({ type: 'success', text: `CTR excelente (${metrics.ctr.toFixed(2)}%). Considere escalar o orçamento.` });
  }
  if (metrics.cpc > 5 && metrics.cpc < 999) {
    recs.push({ type: 'warning', text: `CPC elevado (R$ ${metrics.cpc.toFixed(2)}). Melhore o Quality Score ou reduza o lance.` });
  }
  if (metrics.cpm > 50 && metrics.cpm < 999) {
    recs.push({ type: 'warning', text: `CPM alto (R$ ${metrics.cpm.toFixed(2)}). Segmentação pode estar muito restrita.` });
  }
  if (metrics.conversions === 0 && metrics.spend > 100) {
    recs.push({ type: 'error', text: `Sem conversões com R$ ${metrics.spend.toFixed(2)} investidos. Verifique o pixel e a landing page.` });
  }
  if (metrics.cpa > 0 && metrics.cpa < 30) {
    recs.push({ type: 'success', text: `CPA eficiente (R$ ${metrics.cpa.toFixed(2)}). Excelente retorno — aumente o orçamento.` });
  } else if (metrics.cpa > 100) {
    recs.push({ type: 'error', text: `CPA muito alto (R$ ${metrics.cpa.toFixed(2)}). Reveja o funil e o público-alvo.` });
  }
  if (recs.length === 0) {
    recs.push({ type: 'info', text: 'Aguarde mais dados para uma análise completa desta campanha.' });
  }
  return recs;
}

function calcScore({ ctr, cpc, cpm, frequency, conversions }: any) {
  let score = 50;
  if (ctr >= 2) score += 20; else if (ctr >= 1) score += 10; else if (ctr < 0.5 && ctr > 0) score -= 10;
  if (frequency > 4) score -= 15; else if (frequency > 3) score -= 5;
  if (conversions > 0) score += 15;
  if (cpc < 3 && cpc > 0) score += 10; else if (cpc > 10) score -= 10;
  return Math.max(0, Math.min(100, score));
}

export async function GET() {
  try {
    // Check if cached data exists
    const cacheFile = path.join(process.cwd(), 'data', 'analysis_report.json');
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      // Return cached if less than 1 hour old
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < 3600000) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // Fetch fresh data from Meta API
    const me = await metaFetch('me?fields=id,name');
    const adAccounts = await fetchAllPages(`${me.id}/adaccounts?fields=id,name,account_id,currency,timezone_name,amount_spent&limit=100`);

    let allCampaigns: any[] = [];
    const allInsights: Record<string, any> = {};

    for (const account of adAccounts) {
      const campaigns = await fetchAllPages(
        `${account.id}/campaigns?fields=id,name,status,objective,created_time,start_time,stop_time,daily_budget,lifetime_budget&limit=100`
      );
      allCampaigns = allCampaigns.concat(campaigns);

      for (const campaign of campaigns) {
        const insights = await fetchAllPages(
          `${campaign.id}/insights?fields=${METRICS}&date_preset=maximum&limit=1`
        );
        allInsights[campaign.id] = insights;
      }
    }

    // Build report
    const report: any = {
      generated_at: new Date().toISOString(),
      user: me,
      ad_accounts: adAccounts,
      summary: {
        total_campaigns: allCampaigns.length,
        active_campaigns: allCampaigns.filter(c => c.status === 'ACTIVE').length,
        paused_campaigns: allCampaigns.filter(c => c.status === 'PAUSED').length,
        total_spend_raw: 0,
        total_impressions: 0,
        total_clicks: 0,
        total_conversions: 0,
        total_reach: 0,
      },
      campaigns: [],
    };

    for (const campaign of allCampaigns) {
      const insights = allInsights[campaign.id] || [];
      const insight = insights[0] || {};

      const spend = parseFloat(insight.spend || 0);
      const impressions = parseInt(insight.impressions || 0);
      const clicks = parseInt(insight.clicks || 0);
      const ctr = parseFloat(insight.ctr || 0);
      const cpc = parseFloat(insight.cpc || 0);
      const cpm = parseFloat(insight.cpm || 0);
      const reach = parseInt(insight.reach || 0);
      const frequency = parseFloat(insight.frequency || 0);
      const uniqueClicks = parseInt(insight.unique_clicks || 0);

      let conversions = 0;
      let cpa = 0;
      if (insight.actions) {
        const purchaseAction = insight.actions.find((a: any) =>
          a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
        );
        if (purchaseAction) {
          conversions = parseInt(purchaseAction.value || 0);
          cpa = conversions > 0 ? spend / conversions : 0;
        }
      }

      // All actions breakdown
      const actionsBreakdown = (insight.actions || []).map((a: any) => ({
        type: a.action_type,
        value: parseInt(a.value || 0),
      }));

      report.summary.total_spend_raw += spend;
      report.summary.total_impressions += impressions;
      report.summary.total_clicks += clicks;
      report.summary.total_conversions += conversions;
      report.summary.total_reach += reach;

      const roas = insight.purchase_roas?.[0]?.value;
      const outboundClicks = insight.outbound_clicks?.[0]?.value || 0;
      const outboundCtr = insight.outbound_clicks_ctr?.[0]?.value || 0;

      report.campaigns.push({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective || 'N/A',
        created_time: campaign.created_time,
        start_time: campaign.start_time,
        stop_time: campaign.stop_time,
        daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
        lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
        metrics: {
          spend,
          impressions,
          reach,
          clicks,
          unique_clicks: uniqueClicks,
          ctr,
          cpc,
          cpm,
          frequency,
          conversions,
          cpa,
          roas: roas ? parseFloat(roas) : null,
          outbound_clicks: parseInt(outboundClicks),
          outbound_ctr: parseFloat(outboundCtr),
        },
        actions_breakdown: actionsBreakdown,
        recommendations: generateRecommendations({ ctr, cpc, cpm, cpa, frequency, spend, conversions, status: campaign.status }),
        performance_score: calcScore({ ctr, cpc, cpm, frequency, conversions }),
        raw_insight: insight,
      });
    }

    report.campaigns.sort((a: any, b: any) => b.metrics.spend - a.metrics.spend);
    report.summary.total_spend = report.summary.total_spend_raw;
    report.summary.avg_ctr = report.summary.total_impressions > 0
      ? (report.summary.total_clicks / report.summary.total_impressions * 100)
      : 0;
    report.summary.avg_cpc = report.summary.total_clicks > 0
      ? (report.summary.total_spend_raw / report.summary.total_clicks)
      : 0;

    // Cache the result
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(dataDir, 'campaigns_raw.json'), JSON.stringify(allCampaigns, null, 2));
    fs.writeFileSync(path.join(dataDir, 'insights_raw.json'), JSON.stringify(allInsights, null, 2));

    return NextResponse.json(report);
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
