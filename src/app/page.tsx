'use client';

import { useState, useEffect, useCallback } from 'react';
import MetricCard from '@/components/MetricCard';
import CampaignCard from '@/components/CampaignCard';
import ChartsSection from '@/components/ChartsSection';

interface Summary {
  total_campaigns: number;
  active_campaigns: number;
  paused_campaigns: number;
  total_spend: number;
  total_spend_raw: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_reach: number;
  avg_ctr: number;
  avg_cpc: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  metrics: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    conversions: number;
    cpa: number;
    roas: number | null;
    outbound_clicks: number;
    outbound_ctr: number;
  };
  recommendations: { type: string; text: string }[];
  performance_score: number;
}

interface ApiData {
  generated_at: string;
  cached?: boolean;
  user?: { id: string; name: string };
  summary: Summary;
  campaigns: Campaign[];
}

function fmt(n: number | null | undefined, prefix = '', suffix = '', dec = 2) {
  if (n === null || n === undefined) return 'N/A';
  return `${prefix}${n.toFixed(dec)}${suffix}`;
}

function fmtInt(n: number) {
  return (n || 0).toLocaleString('pt-BR');
}

export default function Dashboard() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'charts'>('overview');
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [sortBy, setSortBy] = useState<'spend' | 'ctr' | 'score' | 'conversions'>('spend');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/campaigns');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao buscar dados');
      }
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch('/api/refresh', { method: 'POST' });
    await fetchData();
    setRefreshing(false);
  };

  const filteredCampaigns = (data?.campaigns || [])
    .filter(c => filter === 'ALL' || c.status === filter)
    .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'spend') return b.metrics.spend - a.metrics.spend;
      if (sortBy === 'ctr') return b.metrics.ctr - a.metrics.ctr;
      if (sortBy === 'score') return b.performance_score - a.performance_score;
      if (sortBy === 'conversions') return b.metrics.conversions - a.metrics.conversions;
      return 0;
    });

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0a0a0f' }}>
        <div className="text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-full border-4 border-transparent animate-spin mx-auto"
              style={{ borderTopColor: '#1877F2', borderRightColor: '#00C896' }} />
          </div>
          <p className="text-white text-lg font-semibold">Buscando dados da Meta API...</p>
          <p className="text-gray-400 text-sm mt-2">Pode levar alguns segundos dependendo do número de campanhas</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0a0a0f' }}>
        <div className="glass-card max-w-md w-full text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">Erro ao carregar dados</h2>
          <p className="text-red-400 text-sm mb-4 font-mono bg-black bg-opacity-40 rounded p-3">{error}</p>
          <p className="text-gray-400 text-sm mb-6">
            Verifique se o token de acesso está válido e se a conta tem permissões de leitura de anúncios.
          </p>
          <button
            onClick={fetchData}
            className="px-6 py-2 rounded-lg font-semibold text-white"
            style={{ background: '#1877F2' }}
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const s = data.summary;
  const totalSpend = s.total_spend_raw || s.total_spend || 0;

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0f' }}>
      {/* Header */}
      <header style={{ background: '#13131f', borderBottom: '1px solid #2a2a4a' }}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-lg"
                style={{ background: 'linear-gradient(135deg, #1877F2, #00C896)' }}>M</div>
              <div>
                <h1 className="text-lg font-bold text-white">Meta Campaign Analytics</h1>
                {data.user && (
                  <p className="text-xs text-gray-400">{data.user.name} • Todo o tempo</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {data.cached && (
                <span className="text-xs px-2 py-1 rounded" style={{ background: '#2a2a4a', color: '#8888aa' }}>
                  Dados em cache
                </span>
              )}
              <span className="text-xs text-gray-500">
                Atualizado: {new Date(data.generated_at).toLocaleString('pt-BR')}
              </span>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#1877F2' }}
              >
                {refreshing ? '⟳ Atualizando...' : '⟳ Atualizar'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: '#13131f', display: 'inline-flex', border: '1px solid #2a2a4a' }}>
          {(['overview', 'campaigns', 'charts'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: activeTab === tab ? '#1877F2' : 'transparent',
                color: activeTab === tab ? 'white' : '#8888aa',
              }}
            >
              {tab === 'overview' ? '📊 Visão Geral' : tab === 'campaigns' ? '🎯 Campanhas' : '📈 Gráficos'}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <MetricCard
                title="Investimento Total"
                value={`R$ ${typeof totalSpend === 'number' ? totalSpend.toFixed(2) : totalSpend}`}
                subtitle="Todo o tempo"
                color="#1877F2"
                icon="💰"
              />
              <MetricCard
                title="Campanhas"
                value={s.total_campaigns}
                subtitle={`${s.active_campaigns} ativas • ${s.paused_campaigns} pausadas`}
                color="#00C896"
                icon="📋"
              />
              <MetricCard
                title="Impressões"
                value={fmtInt(s.total_impressions)}
                subtitle={`Alcance: ${fmtInt(s.total_reach)}`}
                color="#9C6FFF"
                icon="👁️"
              />
              <MetricCard
                title="Conversões"
                value={s.total_conversions}
                subtitle={`${fmtInt(s.total_clicks)} cliques`}
                color="#FF4466"
                icon="🎯"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <MetricCard
                title="CTR Médio"
                value={`${(s.avg_ctr || 0).toFixed(2)}%`}
                subtitle="Taxa de clique"
                color="#FFB800"
                icon="🖱️"
              />
              <MetricCard
                title="CPC Médio"
                value={`R$ ${(s.avg_cpc || 0).toFixed(2)}`}
                subtitle="Custo por clique"
                color="#00D4FF"
                icon="💸"
              />
              <MetricCard
                title="Total Cliques"
                value={fmtInt(s.total_clicks)}
                subtitle="Todos os anúncios"
                color="#FF6B35"
                icon="🔗"
              />
              <MetricCard
                title="Total Alcance"
                value={fmtInt(s.total_reach)}
                subtitle="Pessoas únicas"
                color="#00C896"
                icon="👥"
              />
            </div>

            {/* Top 3 campaigns by score */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
                🏆 Top Campanhas por Performance
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...data.campaigns]
                  .sort((a, b) => b.performance_score - a.performance_score)
                  .slice(0, 3)
                  .map((c, i) => (
                    <div key={c.id} className="glass-card relative overflow-hidden">
                      <div className="absolute top-3 right-3 text-2xl">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                      </div>
                      <p className="text-xs text-gray-400 mb-1">{c.status}</p>
                      <p className="font-semibold text-white text-sm mb-3 pr-8">{c.name}</p>
                      <div className="flex gap-3">
                        <div>
                          <p className="text-xs text-gray-500">Score</p>
                          <p className="text-lg font-bold"
                            style={{ color: c.performance_score >= 70 ? '#00C896' : c.performance_score >= 40 ? '#FFB800' : '#FF4466' }}>
                            {c.performance_score}/100
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">CTR</p>
                          <p className="text-lg font-bold text-white">{c.metrics.ctr.toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Gasto</p>
                          <p className="text-sm font-bold text-white">R$ {c.metrics.spend.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Alerts / Recommendations summary */}
            <div>
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
                🚨 Alertas Prioritários
              </h2>
              <div className="glass-card">
                {data.campaigns.flatMap(c =>
                  c.recommendations
                    .filter(r => r.type === 'error' || r.type === 'warning')
                    .map(r => ({ ...r, campaign: c.name }))
                ).slice(0, 8).map((item, i) => (
                  <div key={i} className={`flex items-start gap-3 py-3 ${i > 0 ? 'border-t' : ''}`}
                    style={{ borderColor: '#2a2a4a' }}>
                    <span className={`metric-badge flex-shrink-0 ${item.type === 'error' ? 'badge-error' : 'badge-warning'}`}>
                      {item.type === 'error' ? '✗' : '⚠'}
                    </span>
                    <div>
                      <p className="text-xs text-gray-400">{item.campaign}</p>
                      <p className="text-sm text-white">{item.text}</p>
                    </div>
                  </div>
                ))}
                {data.campaigns.flatMap(c => c.recommendations.filter(r => r.type === 'error' || r.type === 'warning')).length === 0 && (
                  <p className="text-green-400 text-sm text-center py-4">✓ Nenhum alerta crítico encontrado</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* CAMPAIGNS TAB */}
        {activeTab === 'campaigns' && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#13131f', border: '1px solid #2a2a4a' }}>
                {(['ALL', 'ACTIVE', 'PAUSED'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
                    style={{
                      background: filter === f ? (f === 'ACTIVE' ? '#00C896' : f === 'PAUSED' ? '#FFB800' : '#1877F2') : 'transparent',
                      color: filter === f ? 'white' : '#8888aa',
                    }}
                  >
                    {f === 'ALL' ? `Todas (${data.campaigns.length})` :
                     f === 'ACTIVE' ? `Ativas (${s.active_campaigns})` :
                     `Pausadas (${s.paused_campaigns})`}
                  </button>
                ))}
              </div>

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#13131f', border: '1px solid #2a2a4a', color: '#e8e8f0' }}
              >
                <option value="spend">Ordenar: Maior Gasto</option>
                <option value="ctr">Ordenar: Maior CTR</option>
                <option value="score">Ordenar: Maior Score</option>
                <option value="conversions">Ordenar: Mais Conversões</option>
              </select>

              <input
                type="text"
                placeholder="Buscar campanha..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs flex-1 min-w-[200px]"
                style={{ background: '#13131f', border: '1px solid #2a2a4a', color: '#e8e8f0' }}
              />
            </div>

            <p className="text-xs text-gray-500 mb-4">{filteredCampaigns.length} campanhas encontradas (clique para expandir)</p>

            {filteredCampaigns.length === 0 ? (
              <div className="glass-card text-center py-12">
                <p className="text-gray-400">Nenhuma campanha encontrada com os filtros atuais.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCampaigns.map(campaign => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            )}
          </>
        )}

        {/* CHARTS TAB */}
        {activeTab === 'charts' && (
          <ChartsSection campaigns={data.campaigns} />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 text-center" style={{ borderTop: '1px solid #2a2a4a' }}>
        <p className="text-xs text-gray-500">
          Meta Campaign Analytics • Dados via Meta Graph API v21.0 • Todo o tempo (date_preset=maximum)
        </p>
      </footer>
    </div>
  );
}
