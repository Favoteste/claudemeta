#!/usr/bin/env node
/**
 * FAVO REVEAL — Ativar campanha após aprovação
 * Executa: node ativar-favo-reveal.js
 */

const https = require('https');
const readline = require('readline');
const fs = require('fs');

const TOKEN = 'EAAVJJGQJPfUBQ7hEGsZCNUMVLyuqUZAOy4dLF9poHOVSdhbN7kVn8vCcfOX2xmoC1kZCMik5vb4Md2bq7roQRLfmAXUjHzBOIkFrUxqI1IQsT7WPvcbCqq6AqLKpxAyqEClUDcYZCEzcJAjp8YqVPcaVPKHkPm19lCNhsvZAqu5Ay3H8bOYMnlRvZBZCyjsxHwZCLr4BeiPBUOVtnHApCqnk0zsyaQPdtOreiZAYiMymVQQOJr3hzX9hZCPaRDSoIdJOd8q5tn36vMtUICzkAxnHZBw07LU';
const BASE = 'https://graph.facebook.com/v21.0';

function apiPost(id, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ ...params, access_token: TOKEN }).toString();
    const options = {
      hostname: 'graph.facebook.com',
      path: `/v21.0/${id}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const j = JSON.parse(data);
        if (j.error) reject(new Error(j.error.message));
        else resolve(j);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

async function main() {
  if (!fs.existsSync('favo-reveal-ids.json')) {
    console.log('❌ favo-reveal-ids.json não encontrado. Rode primeiro: node criar-favo-reveal.js');
    process.exit(1);
  }

  const ids = JSON.parse(fs.readFileSync('favo-reveal-ids.json'));
  console.log('\n═══════════════════════════════════════════════');
  console.log('  FAVO REVEAL — Ativação de Campanha');
  console.log('═══════════════════════════════════════════════');
  console.log(`\n  Campanha ID: ${ids.campaign_id}`);
  console.log(`  Ad Sets: ${ids.adset_ids.length}`);
  ids.adset_ids.forEach(a => console.log(`    • ${a.name} (${a.id})`));
  console.log(`\n  ⚠ Isso vai ATIVAR a campanha e começar a gastar orçamento.`);
  console.log(`  Confirme que os criativos estão vinculados antes de continuar.\n`);

  const confirm = await ask('Ativar agora? (s/N): ');
  if (confirm.toLowerCase() !== 's') { console.log('\nCancelado.'); process.exit(0); }

  console.log('\nAtivando...');
  try {
    await apiPost(ids.campaign_id, { status: 'ACTIVE' });
    console.log(`  ✓ Campanha ATIVA — ID: ${ids.campaign_id}`);
  } catch(e) {
    console.log(`  ✗ Erro ao ativar campanha: ${e.message}`);
  }

  for (const adset of ids.adset_ids) {
    try {
      await apiPost(adset.id, { status: 'ACTIVE' });
      console.log(`  ✓ Ad set ativo: ${adset.name}`);
    } catch(e) {
      console.log(`  ✗ Erro ${adset.name}: ${e.message}`);
    }
  }

  console.log('\n🚀 FAVO REVEAL está ao vivo!');
  console.log('   Acompanhe em: business.facebook.com/adsmanager\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
