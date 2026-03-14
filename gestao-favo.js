#!/usr/bin/env node
/**
 * FAVO — Gestão de Público Meta Ads
 * Executa: node gestao-favo.js
 *
 * Fluxo:
 *  1. Lista campanhas ARQ / BRANDING / AUDIOVISUAL
 *  2. Lê targeting atual de cada ad set
 *  3. Valida TODOS os IDs via /search (nunca inventa ID)
 *  4. Mostra JSON final por campanha
 *  5. Aguarda confirmação explícita antes de qualquer POST
 *  6. Aplica via POST /{adset-id}
 */

const https = require('https');
const readline = require('readline');

const TOKEN = 'EAAVJJGQJPfUBQ7hEGsZCNUMVLyuqUZAOy4dLF9poHOVSdhbN7kVn8vCcfOX2xmoC1kZCMik5vb4Md2bq7roQRLfmAXUjHzBOIkFrUxqI1IQsT7WPvcbCqq6AqLKpxAyqEClUDcYZCEzcJAjp8YqVPcaVPKHkPm19lCNhsvZAqu5Ay3H8bOYMnlRvZBZCyjsxHwZCLr4BeiPBUOVtnHApCqnk0zsyaQPdtOreiZAYiMymVQQOJr3hzX9hZCPaRDSoIdJOd8q5tn36vMtUICzkAxnHZBw07LU';
const BASE = 'https://graph.facebook.com/v21.0';

// ─── Helpers ───────────────────────────────────────────────────────────────

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${BASE}/${path}${sep}access_token=${TOKEN}`;
    https.get(url, { timeout: 15000 }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.error) reject(new Error(`[${json.error.code}] ${json.error.message}`));
          else resolve(json);
        } catch(e) { reject(e); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

function apiPost(adsetId, targeting) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ targeting: JSON.stringify(targeting), access_token: TOKEN }).toString();
    const options = {
      hostname: 'graph.facebook.com',
      path: `/v21.0/${adsetId}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(`[${json.error.code}] ${json.error.message}`));
          else resolve(json);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

async function fetchAllPages(path) {
  let all = [];
  let data = await apiGet(path);
  if (data.data) all = all.concat(data.data); else return [data];
  while (data.paging?.next) {
    const next = new URL(data.paging.next);
    const p = (next.pathname + next.search).replace('/v21.0/', '').replace(`?access_token=${TOKEN}&`, '?').replace(`&access_token=${TOKEN}`, '');
    try { data = await apiGet(p); if (!data.data) break; all = all.concat(data.data); } catch(e) { break; }
  }
  return all;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

function log(msg) { console.log(msg); }
function sep(char = '─', len = 60) { log(char.repeat(len)); }
function h1(t) { sep('═'); log(`  ${t}`); sep('═'); }
function h2(t) { log(`\n┌─ ${t}`); }

// ─── Interest / Behavior search ────────────────────────────────────────────

async function searchInterest(query) {
  try {
    const r = await apiGet(`search?type=adinterest&q=${encodeURIComponent(query)}&limit=5`);
    return (r.data || []).slice(0, 3);
  } catch(e) { return []; }
}

async function searchBehavior(query) {
  try {
    const r = await apiGet(`search?type=adbehavior&q=${encodeURIComponent(query)}&limit=5`);
    return (r.data || []).slice(0, 3);
  } catch(e) { return []; }
}

async function resolveInterests(queries) {
  const resolved = [];
  const unresolved = [];
  log('\n  Validando interesses na Meta API...');
  for (const q of queries) {
    const results = await searchInterest(q);
    if (results.length === 0) {
      unresolved.push(q);
      log(`  ✗ "${q}" — sem resultado`);
    } else {
      const best = results[0];
      resolved.push({ id: best.id, name: best.name });
      const match = best.name.toLowerCase() === q.toLowerCase() ? '✓' : '~';
      log(`  ${match} "${q}" → "${best.name}" (ID: ${best.id})`);
    }
  }
  return { resolved, unresolved };
}

async function resolveBehaviors(queries) {
  const resolved = [];
  const unresolved = [];
  log('\n  Validando comportamentos na Meta API...');
  for (const q of queries) {
    const results = await searchBehavior(q);
    if (results.length === 0) {
      // Try interest search as fallback
      const fallback = await searchInterest(q);
      if (fallback.length > 0) {
        resolved.push({ id: fallback[0].id, name: fallback[0].name });
        log(`  ~ "${q}" → fallback interesse: "${fallback[0].name}" (ID: ${fallback[0].id})`);
      } else {
        unresolved.push(q);
        log(`  ✗ "${q}" — sem resultado mesmo no fallback`);
      }
    } else {
      const best = results[0];
      resolved.push({ id: best.id, name: best.name });
      log(`  ✓ "${q}" → "${best.name}" (ID: ${best.id})`);
    }
  }
  return { resolved, unresolved };
}

// ─── Playbook ───────────────────────────────────────────────────────────────

const PLAYBOOK = {
  ARQ: {
    label: 'ARQ — Arquitetura / Design de Interiores',
    matchRegex: /ARQ|ARQUITETURA|ARCHITECT|INTERIOR|DECOR/i,
    age_min: 30, age_max: 55, exclude_age_max: 24,
    interest_queries: [
      'Luxury real estate', 'Real estate investment', 'Home renovation',
      'Interior design', 'Luxury goods', 'Residential architecture',
      'Home improvement', 'Property investment'
    ],
    behavior_queries: [
      'Frequent international travelers', 'Engaged shoppers',
      'Homeowners', 'Recently moved'
    ],
    exclusion_queries: ['Students', 'Renting'],
  },
  BRANDING: {
    label: 'BRANDING — Posicionamento de Marca',
    matchRegex: /BRANDING|BRAND|MARCA|POSICIONAMENTO/i,
    age_min: 30, age_max: 55, exclude_age_max: 27,
    interest_queries: [
      'Brand identity', 'Brand strategy', 'Rebranding',
      'Business growth', 'Scaling a business', 'Marketing strategy',
      'Business consulting', 'Executive leadership', 'LinkedIn',
      'Value proposition', 'Brand management', 'Corporate identity'
    ],
    behavior_queries: [
      'Business page admins', 'Business decision makers',
      'Engaged shoppers', 'Frequent international travelers'
    ],
    exclusion_queries: ['Students', 'Job seekers', 'Multi-level marketing'],
    notes: 'Se "Rebranding" ou "Positioning" não retornarem, usar "Brand awareness", "Brand management", "Corporate identity".'
  },
  AUDIOVISUAL: {
    label: 'AUDIOVISUAL / PODCAST — Autoridade & Conteúdo',
    matchRegex: /AUDIO|AUDIOVISUAL|PODCAST|VIDEO|VÍDEO|CONTEÚDO|CONTENT/i,
    age_min: 28, age_max: 52, exclude_age_max: 27,
    interest_queries: [
      'Podcasting', 'Personal branding', 'Content creation',
      'Digital marketing', 'Entrepreneurship', 'Instagram',
      'YouTube', 'Online learning', 'Coaching', 'Online courses'
    ],
    behavior_queries: [
      'Business page admins', 'Engaged shoppers', 'Small business owners'
    ],
    exclusion_queries: ['Students', 'Photography', 'Freelancer'],
  },
};

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  h1('FAVO — Gestão de Público Meta Ads');

  // 1. Get user + accounts
  log('\n[1/7] Autenticando...');
  const me = await apiGet('me?fields=id,name');
  log(`  Usuário: ${me.name} (${me.id})`);

  log('\n[2/7] Buscando contas de anúncio...');
  const accounts = await fetchAllPages(`${me.id}/adaccounts?fields=id,name,account_status&limit=100`);
  log(`  ${accounts.length} conta(s) encontrada(s):`);
  accounts.forEach((a, i) => log(`  [${i}] ${a.name || '(sem nome)'} — ${a.id}`));

  let accountId;
  if (accounts.length === 1) {
    accountId = accounts[0].id;
    log(`\n  Usando: ${accounts[0].name} (${accountId})`);
  } else {
    const idx = await ask('\n  Digite o número da conta FAVOHUB: ');
    accountId = accounts[parseInt(idx)]?.id;
    if (!accountId) { log('  Índice inválido. Encerrando.'); process.exit(1); }
  }

  // 3. Get campaigns
  log('\n[3/7] Buscando campanhas...');
  const campaigns = await fetchAllPages(`${accountId}/campaigns?fields=id,name,status&limit=200`);

  const matched = {};
  for (const [key, pb] of Object.entries(PLAYBOOK)) {
    const found = campaigns.filter(c => pb.matchRegex.test(c.name));
    matched[key] = found;
    const names = found.map(c => `"${c.name}" [${c.status}]`).join(', ');
    log(`  ${key}: ${found.length} campanha(s) — ${names || 'NENHUMA'}`);
  }

  // 4. Get ad sets
  log('\n[4/7] Buscando ad sets e targeting atual...');
  const adsetsByKey = {};
  for (const [key, camps] of Object.entries(matched)) {
    adsetsByKey[key] = [];
    for (const camp of camps) {
      const adsets = await fetchAllPages(`${camp.id}/adsets?fields=id,name,status,targeting,age_min,age_max,daily_budget,lifetime_budget&limit=100`);
      adsetsByKey[key].push(...adsets);
    }
    log(`  ${key}: ${adsetsByKey[key].length} ad set(s)`);
  }

  // 5. Validate IDs + build new targeting per campaign
  const plans = {};
  for (const [key, pb] of Object.entries(PLAYBOOK)) {
    const adsets = adsetsByKey[key];
    if (adsets.length === 0) {
      log(`\n  ⚠ ${key}: sem ad sets encontrados, pulando.`);
      continue;
    }

    h2(`Validando IDs — ${pb.label}`);
    if (pb.notes) log(`  Nota: ${pb.notes}`);

    const { resolved: interests, unresolved: unresolvedInt } = await resolveInterests(pb.interest_queries);
    const { resolved: behaviors, unresolved: unresolvedBeh } = await resolveBehaviors(pb.behavior_queries);
    const { resolved: exclusions } = await resolveInterests(pb.exclusion_queries);

    // Preserve existing geo_locations from first ad set
    const existingTargeting = adsets[0].targeting || {};
    const geo = existingTargeting.geo_locations || { countries: ['BR'] };

    const newTargeting = {
      age_min: pb.age_min,
      age_max: pb.age_max,
      geo_locations: geo,
      flexible_spec: [{
        interests: interests.map(i => ({ id: i.id, name: i.name })),
        behaviors: behaviors.map(b => ({ id: b.id, name: b.name })),
      }],
      exclusions: {
        interests: exclusions.map(e => ({ id: e.id, name: e.name })),
      },
    };

    plans[key] = { pb, adsets, newTargeting, unresolvedInt, unresolvedBeh };
  }

  // 6. Show JSON final + summary
  h1('STEP 5 — TARGETING JSON VALIDADO POR CAMPANHA');

  for (const [key, plan] of Object.entries(plans)) {
    const { pb, adsets, newTargeting, unresolvedInt, unresolvedBeh } = plan;
    sep();
    log(`\n📋 ${pb.label}`);
    log(`   Ad sets afetados: ${adsets.map(a => a.name).join(', ')}`);
    log(`   Faixa etária: ${pb.age_min}–${pb.age_max} (exclui 18–${pb.exclude_age_max})`);

    log('\n   TARGETING JSON FINAL:');
    log(JSON.stringify(newTargeting, null, 4).split('\n').map(l => '   ' + l).join('\n'));

    if (unresolvedInt.length > 0) log(`\n   ⚠ Interesses SEM correspondência na API: ${unresolvedInt.join(', ')}`);
    if (unresolvedBeh.length > 0) log(`\n   ⚠ Comportamentos SEM correspondência na API: ${unresolvedBeh.join(', ')}`);

    log(`\n   Interesses confirmados: ${newTargeting.flexible_spec[0].interests.length}`);
    log(`   Comportamentos confirmados: ${newTargeting.flexible_spec[0].behaviors.length}`);
    log(`   Exclusões confirmadas: ${newTargeting.exclusions.interests.length}`);
  }

  // 7. Confirmation + Apply
  sep('═');
  log('\n⚠  NENHUMA ALTERAÇÃO FOI FEITA AINDA.');
  log('   Revise os JSONs acima para cada campanha.');
  sep('═');

  for (const [key, plan] of Object.entries(plans)) {
    const { pb, adsets, newTargeting } = plan;
    log(`\n📋 ${pb.label} — ${adsets.length} ad set(s)`);
    adsets.forEach(a => log(`   • ${a.name} [${a.status}]`));

    const confirm = await ask(`\n   Aplicar targeting em "${pb.label}"? (s/N): `);
    if (confirm.toLowerCase() !== 's') {
      log(`   ✗ Pulado — sem alterações em ${key}.`);
      continue;
    }

    log(`\n   Aplicando...`);
    for (const adset of adsets) {
      try {
        await apiPost(adset.id, newTargeting);
        log(`   ✓ ${adset.name} — atualizado com sucesso`);
      } catch(e) {
        log(`   ✗ ${adset.name} — ERRO: ${e.message}`);
      }
    }
  }

  sep('═');
  log('\n✅ Gestão de público concluída.');
  log('   Verifique no Meta Ads Manager para confirmar as alterações.\n');
}

main().catch(e => {
  console.error('\n❌ Erro fatal:', e.message);
  process.exit(1);
});
