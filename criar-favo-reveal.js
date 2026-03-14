#!/usr/bin/env node
/**
 * FAVO REVEAL — Criação de Campanha do Zero
 * Executa: node criar-favo-reveal.js
 *
 * O que faz:
 *  1. Valida interesses e comportamentos via /search (IDs reais)
 *  2. Verifica pixel instalado na conta
 *  3. Cria campanha FAVO REVEAL (rascunho / PAUSED)
 *  4. Cria 5 ad sets — um por ângulo de copy
 *  5. Exibe resumo completo
 *  6. Aguarda aprovação explícita antes de ativar
 */

const https = require('https');
const readline = require('readline');

const TOKEN = 'EAAVJJGQJPfUBQ7hEGsZCNUMVLyuqUZAOy4dLF9poHOVSdhbN7kVn8vCcfOX2xmoC1kZCMik5vb4Md2bq7roQRLfmAXUjHzBOIkFrUxqI1IQsT7WPvcbCqq6AqLKpxAyqEClUDcYZCEzcJAjp8YqVPcaVPKHkPm19lCNhsvZAqu5Ay3H8bOYMnlRvZBZCyjsxHwZCLr4BeiPBUOVtnHApCqnk0zsyaQPdtOreiZAYiMymVQQOJr3hzX9hZCPaRDSoIdJOd8q5tn36vMtUICzkAxnHZBw07LU';
const BASE = 'https://graph.facebook.com/v21.0';

// ─── Config ─────────────────────────────────────────────────────────────────

const CAMPAIGN_NAME  = 'FAVO REVEAL - Diagnóstico de Marca';
const DAILY_BUDGET   = 3000; // R$30,00 em centavos (Meta usa centavos)
const OBJECTIVE      = 'OUTCOME_LEADS';

const AD_COPIES = [
  {
    name: 'REVEAL_01_Dor',
    angle: 'Dor',
    headline: 'Sua marca afasta clientes sem você perceber.',
    body: 'Descubra em minutos o que está travando o crescimento da sua marca. Diagnóstico 100% gratuito.',
    cta: 'LEARN_MORE',
    cta_label: 'Fazer meu diagnóstico grátis',
    utm: 'favo-reveal-adset-dor',
  },
  {
    name: 'REVEAL_02_Curiosidade',
    angle: 'Curiosidade',
    headline: 'Você sabe qual nota sua marca tira hoje?',
    body: 'A Favo criou um diagnóstico gratuito que revela os pontos fortes e os gaps da sua marca em menos de 5 minutos.',
    cta: 'LEARN_MORE',
    cta_label: 'Descubra agora',
    utm: 'favo-reveal-adset-curiosidade',
  },
  {
    name: 'REVEAL_03_Gratuidade',
    angle: 'Gratuidade / Urgência',
    headline: 'Grátis. Rápido. Revelador.',
    body: 'O Favo Reveal analisa sua marca e aponta exatamente o que precisa melhorar. Sem enrolação, sem custo.',
    cta: 'SIGN_UP',
    cta_label: 'Acessar diagnóstico grátis',
    utm: 'favo-reveal-adset-gratuidade',
  },
  {
    name: 'REVEAL_04_Comparacao',
    angle: 'Comparação',
    headline: 'As marcas que crescem têm uma coisa em comum: elas se conhecem.',
    body: 'Descubra como sua marca está posicionada comparada à outras empresas do setor. Diagnóstico gratuito da Favo em menos de 5 minutos.',
    cta: 'LEARN_MORE',
    cta_label: 'Quero conhecer minha marca',
    utm: 'favo-reveal-adset-comparacao',
  },
  {
    name: 'REVEAL_05_Identidade',
    angle: 'Identidade',
    headline: 'Quem leva o negócio a sério, conhece a própria marca.',
    body: 'O Favo Reveal é o diagnóstico gratuito que empreendedores usam para entender onde sua marca está e onde precisa chegar.',
    cta: 'SIGN_UP',
    cta_label: 'Fazer meu diagnóstico',
    utm: 'favo-reveal-adset-identidade',
  },
];

const INTEREST_QUERIES = [
  'Entrepreneurship',
  'Business management',
  'Digital marketing',
  'Branding',
  'Brand identity',
  'Business growth',
  'Marketing strategy',
  'Small business',
];

const BEHAVIOR_QUERIES = [
  'Small business owners',
  'Business page admins',
  'Engaged shoppers',
];

const EXCLUSION_QUERIES = [
  'Students',
];

const CITIES = [
  { key: '1058365', name: 'São Paulo', region: 'São Paulo', country: 'BR', radius: 30, distance_unit: 'kilometer' },
  { key: '1049716', name: 'Florianópolis', region: 'Santa Catarina', country: 'BR', radius: 20, distance_unit: 'kilometer' },
  { key: '1032540', name: 'Curitiba', region: 'Paraná', country: 'BR', radius: 25, distance_unit: 'kilometer' },
  { key: '1057968', name: 'Porto Alegre', region: 'Rio Grande do Sul', country: 'BR', radius: 25, distance_unit: 'kilometer' },
  { key: '1057275', name: 'Rio de Janeiro', region: 'Rio de Janeiro', country: 'BR', radius: 30, distance_unit: 'kilometer' },
  { key: '1036044', name: 'Belo Horizonte', region: 'Minas Gerais', country: 'BR', radius: 25, distance_unit: 'kilometer' },
  { key: '1033044', name: 'Campinas', region: 'São Paulo', country: 'BR', radius: 20, distance_unit: 'kilometer' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${BASE}/${path}${sep}access_token=${TOKEN}`;
    https.get(url, { timeout: 15000 }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          if (j.error) reject(new Error(`[${j.error.code}] ${j.error.message}`));
          else resolve(j);
        } catch(e) { reject(e); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

function apiPost(endpoint, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ ...params, access_token: TOKEN }).toString();
    const url = new URL(`${BASE}/${endpoint}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) reject(new Error(`[${j.error.code}] ${j.error.message}`));
          else resolve(j);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject).on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

async function fetchAllPages(path) {
  let all = [], data = await apiGet(path);
  if (data.data) all = all.concat(data.data); else return [data];
  while (data.paging?.next) {
    const n = new URL(data.paging.next);
    const p = (n.pathname + n.search).replace('/v21.0/', '').replace(`?access_token=${TOKEN}&`, '?').replace(`&access_token=${TOKEN}`, '');
    try { data = await apiGet(p); if (!data.data) break; all = all.concat(data.data); } catch(e) { break; }
  }
  return all;
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

function sep(c = '─', n = 62) { console.log(c.repeat(n)); }
function h1(t) { sep('═'); console.log(`  ${t}`); sep('═'); }
function log(m = '') { console.log(m); }

async function searchInterest(q) {
  try {
    const r = await apiGet(`search?type=adinterest&q=${encodeURIComponent(q)}&limit=5`);
    return r.data || [];
  } catch(e) { return []; }
}

async function searchBehavior(q) {
  try {
    const r = await apiGet(`search?type=adbehavior&q=${encodeURIComponent(q)}&limit=5`);
    return r.data || [];
  } catch(e) { return []; }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  h1('FAVO REVEAL — Criação de Campanha');

  // Auth
  const me = await apiGet('me?fields=id,name');
  log(`\nUsuário: ${me.name}`);

  // Select account
  const accounts = await fetchAllPages(`${me.id}/adaccounts?fields=id,name,account_status,currency&limit=100`);
  log(`\nContas encontradas:`);
  accounts.forEach((a, i) => log(`  [${i}] ${a.name || '(sem nome)'} — ${a.id} — ${a.currency}`));

  let accountId;
  if (accounts.length === 1) {
    accountId = accounts[0].id;
    log(`\nUsando: ${accounts[0].name}`);
  } else {
    const idx = await ask('\nNúmero da conta FAVOHUB: ');
    accountId = accounts[parseInt(idx)]?.id;
    if (!accountId) { log('Índice inválido.'); process.exit(1); }
  }

  // Landing page URL
  const landingPage = await ask('\nURL da landing page (ex: https://favohub.com.br/reveal): ');
  if (!landingPage.startsWith('http')) { log('URL inválida.'); process.exit(1); }

  // ── STEP 1: Verificar Pixel ──────────────────────────────────────────────
  log('\n[PASSO 1/5] Verificando Pixel instalado...');
  let pixelId = null;
  try {
    const pixels = await fetchAllPages(`${accountId}/adspixels?fields=id,name,last_fired_time&limit=10`);
    if (pixels.length === 0) {
      log('  ⚠ Nenhum pixel encontrado na conta. O evento Lead não será rastreado.');
      log('  → Instale o Meta Pixel na página de obrigado antes de ativar.');
    } else {
      pixels.forEach(p => {
        const lastFired = p.last_fired_time ? new Date(p.last_fired_time * 1000).toLocaleString('pt-BR') : 'nunca';
        log(`  ✓ Pixel: "${p.name}" — ID: ${p.id} — Último disparo: ${lastFired}`);
      });
      pixelId = pixels[0].id;
      log(`  → Usando pixel: ${pixelId}`);
    }
  } catch(e) {
    log(`  ⚠ Não foi possível verificar pixel: ${e.message}`);
  }

  // ── STEP 2: Validar IDs de targeting ────────────────────────────────────
  log('\n[PASSO 2/5] Validando IDs de interesses e comportamentos na Meta API...');

  log('\n  Interesses:');
  const interests = [];
  const unresolvedInt = [];
  for (const q of INTEREST_QUERIES) {
    const results = await searchInterest(q);
    if (results.length > 0) {
      interests.push({ id: results[0].id, name: results[0].name });
      const match = results[0].name.toLowerCase() === q.toLowerCase() ? '✓' : '~';
      log(`  ${match} "${q}" → "${results[0].name}" (ID: ${results[0].id})`);
    } else {
      unresolvedInt.push(q);
      log(`  ✗ "${q}" — sem resultado na API`);
    }
  }

  log('\n  Comportamentos:');
  const behaviors = [];
  for (const q of BEHAVIOR_QUERIES) {
    let results = await searchBehavior(q);
    if (results.length === 0) results = await searchInterest(q);
    if (results.length > 0) {
      behaviors.push({ id: results[0].id, name: results[0].name });
      log(`  ✓ "${q}" → "${results[0].name}" (ID: ${results[0].id})`);
    } else {
      log(`  ✗ "${q}" — sem resultado`);
    }
  }

  log('\n  Exclusões:');
  const exclusions = [];
  for (const q of EXCLUSION_QUERIES) {
    const results = await searchInterest(q);
    if (results.length > 0) {
      exclusions.push({ id: results[0].id, name: results[0].name });
      log(`  ✓ "${q}" → "${results[0].name}" (ID: ${results[0].id})`);
    }
  }

  // Build targeting object
  const targeting = {
    age_min: 28,
    age_max: 55,
    genders: [0], // 0 = todos
    geo_locations: {
      cities: CITIES,
    },
    flexible_spec: [{
      interests: interests.map(i => ({ id: i.id, name: i.name })),
      behaviors: behaviors.map(b => ({ id: b.id, name: b.name })),
    }],
    exclusions: {
      interests: exclusions.map(e => ({ id: e.id, name: e.name })),
      age_max: 24,
    },
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['feed', 'story', 'reels'],
    instagram_positions: ['stream', 'story', 'reels'],
    device_platforms: ['mobile', 'desktop'],
  };

  // ── STEP 3: Mostrar resumo ────────────────────────────────────────────────
  h1('PASSO 3/5 — RESUMO DA ESTRUTURA A SER CRIADA');

  log(`\n📋 CAMPANHA`);
  log(`   Nome: ${CAMPAIGN_NAME}`);
  log(`   Objetivo: ${OBJECTIVE}`);
  log(`   Orçamento diário total: R$ ${DAILY_BUDGET/100},00 (CBO — Meta distribui entre ad sets)`);
  log(`   Status inicial: PAUSADA (rascunho)`);

  log(`\n🎯 PÚBLICO (idêntico nos 5 ad sets)`);
  log(`   Idade: 28–55 anos`);
  log(`   Exclusão: 18–24 anos`);
  log(`   Localização: ${CITIES.map(c => c.name).join(', ')}`);
  log(`   Interesses confirmados (${interests.length}): ${interests.map(i => i.name).join(', ')}`);
  log(`   Comportamentos confirmados (${behaviors.length}): ${behaviors.map(b => b.name).join(', ')}`);
  log(`   Exclusões: Faixa 18–24 + ${exclusions.map(e => e.name).join(', ')}`);
  log(`   Posicionamentos: Feed, Stories, Reels (Facebook + Instagram)`);
  if (unresolvedInt.length > 0) log(`\n   ⚠ Sem correspondência na API: ${unresolvedInt.join(', ')}`);

  log(`\n📝 5 AD SETS (ângulos de copy):`);
  AD_COPIES.forEach((a, i) => {
    log(`\n   Adset ${i+1} — ${a.angle}`);
    log(`   Headline: "${a.headline}"`);
    log(`   Corpo: "${a.body}"`);
    log(`   CTA: ${a.cta_label}`);
    log(`   UTM: utm_content=${a.utm}`);
  });

  log(`\n🔗 Landing Page: ${landingPage}`);
  log(`   UTM final ex: ${landingPage}?utm_source=meta&utm_medium=paid&utm_campaign=favo-reveal&utm_content=favo-reveal-adset-dor`);

  if (pixelId) {
    log(`\n📡 Pixel: ${pixelId} — evento Lead será rastreado`);
  } else {
    log(`\n📡 Pixel: não encontrado — instale antes de ativar`);
  }

  log(`\n⚠  CRIATIVOS: Os ad sets serão criados sem criativo vinculado.`);
  log(`   Após confirmar, você vincula os criativos no Meta Ads Manager.`);
  log(`   (Necessário para ativar os anúncios.)`);

  // ── STEP 4: Confirmação ──────────────────────────────────────────────────
  sep();
  const confirm = await ask('\nCriar a estrutura acima como RASCUNHO? (s/N): ');
  if (confirm.toLowerCase() !== 's') {
    log('\nOperação cancelada. Nenhuma alteração feita.');
    process.exit(0);
  }

  // ── STEP 5: Criar campanha + ad sets ─────────────────────────────────────
  log('\n[PASSO 4/5] Criando campanha...');

  const today = new Date();
  const startTime = Math.floor(today.getTime() / 1000);

  // Create campaign (CBO)
  const campaign = await apiPost(`${accountId}/campaigns`, {
    name: CAMPAIGN_NAME,
    objective: OBJECTIVE,
    status: 'PAUSED',
    special_ad_categories: JSON.stringify([]),
    daily_budget: DAILY_BUDGET,
    buying_type: 'AUCTION',
  });

  log(`  ✓ Campanha criada — ID: ${campaign.id}`);

  // Create 5 ad sets
  log('\n[PASSO 5/5] Criando ad sets...');
  const createdAdsets = [];

  for (const copy of AD_COPIES) {
    const websiteUrl = `${landingPage}?utm_source=meta&utm_medium=paid&utm_campaign=favo-reveal&utm_content=${copy.utm}`;

    const adsetParams = {
      name: copy.name,
      campaign_id: campaign.id,
      status: 'PAUSED',
      optimization_goal: 'LEAD_GENERATION',
      billing_event: 'IMPRESSIONS',
      targeting: JSON.stringify(targeting),
      start_time: startTime,
      destination_type: 'WEBSITE',
    };

    if (pixelId) {
      adsetParams.promoted_object = JSON.stringify({
        pixel_id: pixelId,
        custom_event_type: 'LEAD',
      });
    }

    try {
      const adset = await apiPost(`${accountId}/adsets`, adsetParams);
      createdAdsets.push({ ...copy, id: adset.id, url: websiteUrl });
      log(`  ✓ Ad set criado: ${copy.name} — ID: ${adset.id}`);
    } catch(e) {
      log(`  ✗ Erro ao criar ${copy.name}: ${e.message}`);
    }
  }

  // ── Resumo final ─────────────────────────────────────────────────────────
  h1('✅ RASCUNHO CRIADO COM SUCESSO');

  log(`\n📋 CAMPANHA: ${CAMPAIGN_NAME}`);
  log(`   ID: ${campaign.id}`);
  log(`   Status: PAUSADA\n`);

  log(`AD SETS CRIADOS:`);
  createdAdsets.forEach((a, i) => {
    log(`\n  ${i+1}. ${a.name} — ID: ${a.id}`);
    log(`     Ângulo: ${a.angle}`);
    log(`     Headline: "${a.headline}"`);
    log(`     URL: ${a.url}`);
  });

  log(`\n━━━ PRÓXIMOS PASSOS ━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`\n1. Acesse Meta Ads Manager`);
  log(`2. Abra a campanha: "${CAMPAIGN_NAME}"`);
  log(`3. Vincule um criativo (imagem/vídeo) em cada um dos 5 ad sets`);
  log(`4. Verifique o pixel disparando evento Lead na página de obrigado`);
  log(`5. Quando tudo estiver pronto, me diga "pode ativar" e eu publico via API`);
  log(`\nOu ative manualmente clicando no toggle no Ads Manager.`);

  sep('═');
  log('\n🚀 Para ATIVAR a campanha quando estiver pronto:');
  log(`   node ativar-favo-reveal.js ${campaign.id}`);

  // Save campaign ID for activation script
  const fs = require('fs');
  fs.writeFileSync('favo-reveal-ids.json', JSON.stringify({
    campaign_id: campaign.id,
    adset_ids: createdAdsets.map(a => ({ id: a.id, name: a.name })),
    created_at: new Date().toISOString(),
  }, null, 2));
  log(`\n  IDs salvos em: favo-reveal-ids.json`);
}

main().catch(e => { console.error('\n❌ Erro:', e.message); process.exit(1); });
