#!/usr/bin/env node
/**
 * Meta Graph API - Instagram Campaign Data Fetcher
 * Fetches all campaigns, ad sets, ads and insights for ALL TIME
 * Saves raw data to /data/*.json
 *
 * Usage: node fetchData.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = '1487795529530869|ZN-LEkit58D0lEJd2-wwkHGJIbA';
const BASE_URL = 'graph.facebook.com';
const API_VERSION = 'v21.0';
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Metrics to fetch for insights
const CAMPAIGN_METRICS = [
  'impressions', 'reach', 'frequency',
  'clicks', 'unique_clicks', 'inline_link_clicks',
  'ctr', 'unique_ctr',
  'cpc', 'cpm', 'cpp',
  'spend',
  'actions', 'unique_actions',
  'cost_per_action_type', 'cost_per_unique_action_type',
  'conversions', 'conversion_values',
  'purchase_roas',
  'outbound_clicks', 'outbound_clicks_ctr',
  'video_play_actions', 'video_p25_watched_actions',
  'video_p50_watched_actions', 'video_p75_watched_actions',
  'video_p100_watched_actions',
].join(',');

function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    const sep = endpoint.includes('?') ? '&' : '?';
    const fullPath = `/${API_VERSION}/${endpoint}${sep}access_token=${TOKEN}`;

    const options = {
      hostname: BASE_URL,
      path: fullPath,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            console.error(`API Error: ${parsed.error.message}`);
            resolve(null);
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function fetchAllPages(endpoint) {
  let allData = [];
  let response = await apiGet(endpoint);
  if (!response) return allData;

  if (response.data) allData = allData.concat(response.data);
  else return [response];

  while (response.paging && response.paging.next) {
    const next = new URL(response.paging.next);
    const nextPath = next.pathname.replace(`/${API_VERSION}/`, '') + next.search;
    response = await apiGet(nextPath.replace(`?access_token=${TOKEN}&`, '?').replace(`&access_token=${TOKEN}`, ''));
    if (!response || !response.data) break;
    allData = allData.concat(response.data);
  }

  return allData;
}

function saveJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  Saved: ${filePath}`);
}

function formatMetric(value) {
  if (!value) return '0';
  return parseFloat(value).toFixed(2);
}

async function generateReport(campaigns, insights) {
  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      total_campaigns: campaigns.length,
      active_campaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      paused_campaigns: campaigns.filter(c => c.status === 'PAUSED').length,
      total_spend: 0,
      total_impressions: 0,
      total_clicks: 0,
      total_conversions: 0,
    },
    campaigns: []
  };

  for (const campaign of campaigns) {
    const campaignInsights = insights[campaign.id] || [];
    const allTimeInsight = campaignInsights.find(i => i.date_start) || campaignInsights[0] || {};

    const spend = parseFloat(allTimeInsight.spend || 0);
    const impressions = parseInt(allTimeInsight.impressions || 0);
    const clicks = parseInt(allTimeInsight.clicks || 0);
    const ctr = parseFloat(allTimeInsight.ctr || 0);
    const cpc = parseFloat(allTimeInsight.cpc || 0);
    const cpm = parseFloat(allTimeInsight.cpm || 0);
    const reach = parseInt(allTimeInsight.reach || 0);
    const frequency = parseFloat(allTimeInsight.frequency || 0);

    // Extract conversions from actions
    let conversions = 0;
    let cpa = 0;
    if (allTimeInsight.actions) {
      const purchaseAction = allTimeInsight.actions.find(a =>
        a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
      );
      if (purchaseAction) {
        conversions = parseInt(purchaseAction.value || 0);
        cpa = conversions > 0 ? spend / conversions : 0;
      }
    }

    report.summary.total_spend += spend;
    report.summary.total_impressions += impressions;
    report.summary.total_clicks += clicks;
    report.summary.total_conversions += conversions;

    // Generate recommendations
    const recommendations = generateRecommendations({
      ctr, cpc, cpm, cpa, frequency, spend, conversions, clicks, status: campaign.status
    });

    report.campaigns.push({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      objective: campaign.objective,
      created_time: campaign.created_time,
      metrics: {
        spend: formatMetric(spend),
        impressions,
        reach,
        clicks,
        ctr: formatMetric(ctr) + '%',
        cpc: 'R$ ' + formatMetric(cpc),
        cpm: 'R$ ' + formatMetric(cpm),
        frequency: formatMetric(frequency),
        conversions,
        cpa: cpa > 0 ? 'R$ ' + formatMetric(cpa) : 'N/A',
        roas: allTimeInsight.purchase_roas ? allTimeInsight.purchase_roas[0]?.value : 'N/A',
      },
      recommendations,
      performance_score: calculateScore({ ctr, cpc, cpm, frequency, conversions }),
    });
  }

  // Sort by spend descending
  report.campaigns.sort((a, b) => parseFloat(b.metrics.spend) - parseFloat(a.metrics.spend));

  report.summary.total_spend = 'R$ ' + formatMetric(report.summary.total_spend);
  report.summary.avg_ctr = report.summary.total_impressions > 0
    ? formatMetric(report.summary.total_clicks / report.summary.total_impressions * 100) + '%'
    : '0%';

  return report;
}

function generateRecommendations({ ctr, cpc, cpm, cpa, frequency, spend, conversions, clicks, status }) {
  const recs = [];

  if (status === 'PAUSED') {
    recs.push({ type: 'info', text: 'Campanha pausada. Avalie se deve ser reativada ou arquivada.' });
  }

  if (frequency > 3.5) {
    recs.push({ type: 'warning', text: `Frequencia alta (${frequency.toFixed(1)}x). Renove os criativos para evitar fadiga do publico.` });
  }

  if (ctr < 0.5 && clicks > 0) {
    recs.push({ type: 'warning', text: `CTR baixo (${ctr.toFixed(2)}%). Teste novos criativos ou reveja a segmentacao do publico.` });
  } else if (ctr >= 2) {
    recs.push({ type: 'success', text: `CTR excelente (${ctr.toFixed(2)}%). Considere escalar o orcamento desta campanha.` });
  }

  if (cpc > 5 && cpc < 999) {
    recs.push({ type: 'warning', text: `CPC elevado (R$ ${cpc.toFixed(2)}). Melhore o Quality Score ou reduza o lance.` });
  }

  if (cpm > 50 && cpm < 999) {
    recs.push({ type: 'warning', text: `CPM alto (R$ ${cpm.toFixed(2)}). Reveja a segmentacao - publico pode estar muito restrito.` });
  }

  if (conversions === 0 && spend > 100) {
    recs.push({ type: 'error', text: `Sem conversoes com R$ ${spend.toFixed(2)} investidos. Verifique o pixel e otimizacao da landing page.` });
  }

  if (cpa > 0 && cpa < 30) {
    recs.push({ type: 'success', text: `CPA eficiente (R$ ${cpa.toFixed(2)}). Excelente retorno - aumente o orcamento.` });
  } else if (cpa > 100) {
    recs.push({ type: 'error', text: `CPA muito alto (R$ ${cpa.toFixed(2)}). Reveja funil de conversao e publico-alvo.` });
  }

  if (recs.length === 0) {
    recs.push({ type: 'info', text: 'Campanha sem dados suficientes. Aguarde mais dados para analise completa.' });
  }

  return recs;
}

function calculateScore({ ctr, cpc, cpm, frequency, conversions }) {
  let score = 50;
  if (ctr >= 2) score += 20;
  else if (ctr >= 1) score += 10;
  else if (ctr < 0.5 && ctr > 0) score -= 10;
  if (frequency > 4) score -= 15;
  else if (frequency > 3) score -= 5;
  if (conversions > 0) score += 15;
  if (cpc < 3 && cpc > 0) score += 10;
  else if (cpc > 10) score -= 10;
  return Math.max(0, Math.min(100, score));
}

async function main() {
  console.log('\n Meta Graph API - Instagram Campaign Analyzer');
  console.log('==============================================\n');

  // 1. Get user info
  console.log('1. Buscando informacoes do usuario...');
  const me = await apiGet('me?fields=id,name');
  if (!me) { console.error('Falha ao autenticar. Verifique o token.'); process.exit(1); }
  console.log(`   Usuario: ${me.name} (ID: ${me.id})`);
  saveJSON('user.json', me);

  // 2. Get ad accounts
  console.log('\n2. Buscando contas de anuncio...');
  const adAccounts = await fetchAllPages(`${me.id}/adaccounts?fields=id,name,account_id,account_status,currency,timezone_name,amount_spent&limit=100`);
  console.log(`   Encontradas ${adAccounts.length} contas`);
  saveJSON('ad_accounts.json', adAccounts);

  if (adAccounts.length === 0) {
    console.log('\nNenhuma conta de anuncio encontrada. Verifique permissoes do token.');
    process.exit(0);
  }

  let allCampaigns = [];
  let allInsights = {};
  let allAdSets = [];
  let allAds = [];

  for (const account of adAccounts) {
    console.log(`\n3. Processando conta: ${account.name || account.id}`);

    // 3. Get campaigns
    console.log('   Buscando campanhas...');
    const campaigns = await fetchAllPages(
      `${account.id}/campaigns?fields=id,name,status,objective,created_time,start_time,stop_time,budget_remaining,daily_budget,lifetime_budget,bid_strategy&limit=100`
    );
    console.log(`   Encontradas ${campaigns.length} campanhas`);
    allCampaigns = allCampaigns.concat(campaigns);

    // 4. Get insights for each campaign (ALL TIME)
    for (const campaign of campaigns) {
      console.log(`   Buscando insights: ${campaign.name.substring(0, 50)}...`);

      const insights = await fetchAllPages(
        `${campaign.id}/insights?fields=${CAMPAIGN_METRICS}&date_preset=maximum&time_increment=all_days&limit=1`
      );

      allInsights[campaign.id] = insights;
    }

    // 5. Get ad sets
    console.log('   Buscando conjuntos de anuncios...');
    const adSets = await fetchAllPages(
      `${account.id}/adsets?fields=id,name,status,campaign_id,targeting,optimization_goal,billing_event,bid_amount,daily_budget,lifetime_budget&limit=100`
    );
    allAdSets = allAdSets.concat(adSets);

    // 6. Get ads
    console.log('   Buscando anuncios...');
    const ads = await fetchAllPages(
      `${account.id}/ads?fields=id,name,status,adset_id,campaign_id,creative&limit=100`
    );
    allAds = allAds.concat(ads);
  }

  // Save raw data
  console.log('\n4. Salvando dados brutos...');
  saveJSON('campaigns_raw.json', allCampaigns);
  saveJSON('insights_raw.json', allInsights);
  saveJSON('adsets_raw.json', allAdSets);
  saveJSON('ads_raw.json', allAds);

  // Generate analysis report
  console.log('\n5. Gerando relatorio de analise...');
  const report = await generateReport(allCampaigns, allInsights);
  saveJSON('analysis_report.json', report);

  // Save human-readable text report
  let textReport = `RELATORIO DE ANALISE DE CAMPANHAS META/INSTAGRAM
Gerado em: ${new Date().toLocaleString('pt-BR')}
${'='.repeat(60)}

RESUMO GERAL
------------
Total de campanhas: ${report.summary.total_campaigns}
Campanhas ativas: ${report.summary.active_campaigns}
Campanhas pausadas: ${report.summary.paused_campaigns}
Investimento total (todo o tempo): ${report.summary.total_spend}
Total de impressoes: ${report.summary.total_impressions.toLocaleString('pt-BR')}
Total de cliques: ${report.summary.total_clicks.toLocaleString('pt-BR')}
CTR medio: ${report.summary.avg_ctr}
Total de conversoes: ${report.summary.total_conversions}

${'='.repeat(60)}

ANALISE POR CAMPANHA
--------------------
`;

  for (const campaign of report.campaigns) {
    textReport += `\n${campaign.name}
${'─'.repeat(50)}
Status: ${campaign.status} | Objetivo: ${campaign.objective || 'N/A'}
Score de Performance: ${campaign.performance_score}/100

METRICAS (TODO O TEMPO):
  Investimento: ${campaign.metrics.spend}
  Impressoes: ${campaign.metrics.impressions.toLocaleString('pt-BR')}
  Alcance: ${campaign.metrics.reach.toLocaleString('pt-BR')}
  Cliques: ${campaign.metrics.clicks.toLocaleString('pt-BR')}
  CTR: ${campaign.metrics.ctr}
  CPC: ${campaign.metrics.cpc}
  CPM: ${campaign.metrics.cpm}
  Frequencia: ${campaign.metrics.frequency}
  Conversoes: ${campaign.metrics.conversions}
  CPA: ${campaign.metrics.cpa}
  ROAS: ${campaign.metrics.roas}

RECOMENDACOES:
${campaign.recommendations.map(r => `  [${r.type.toUpperCase()}] ${r.text}`).join('\n')}
`;
  }

  fs.writeFileSync(path.join(DATA_DIR, 'analysis_report.txt'), textReport);
  console.log(`  Saved: ${path.join(DATA_DIR, 'analysis_report.txt')}`);

  console.log('\n Analise concluida com sucesso!');
  console.log(`Dados salvos em: ${DATA_DIR}`);
  console.log('\nArquivos gerados:');
  console.log('  - user.json');
  console.log('  - ad_accounts.json');
  console.log('  - campaigns_raw.json');
  console.log('  - insights_raw.json');
  console.log('  - adsets_raw.json');
  console.log('  - ads_raw.json');
  console.log('  - analysis_report.json');
  console.log('  - analysis_report.txt');
}

main().catch(console.error);
