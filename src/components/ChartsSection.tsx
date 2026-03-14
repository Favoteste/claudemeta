'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ScatterChart, Scatter, ZAxis,
} from 'recharts';

const COLORS = ['#1877F2', '#00C896', '#FFB800', '#FF4466', '#9C6FFF', '#FF6B35', '#00D4FF'];

function shortName(name: string, maxLen = 18) {
  return name.length > maxLen ? name.substring(0, maxLen) + '…' : name;
}

function formatCurrency(value: number) {
  return `R$ ${value.toFixed(2)}`;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  metrics: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    conversions: number;
    cpa: number;
    roas: number | null;
    reach: number;
    frequency: number;
  };
  performance_score: number;
}

export default function ChartsSection({ campaigns }: { campaigns: Campaign[] }) {
  if (!campaigns || campaigns.length === 0) return null;

  const topBySpend = [...campaigns]
    .filter(c => c.metrics.spend > 0)
    .sort((a, b) => b.metrics.spend - a.metrics.spend)
    .slice(0, 8);

  const spendData = topBySpend.map(c => ({
    name: shortName(c.name),
    spend: parseFloat(c.metrics.spend.toFixed(2)),
    clicks: c.metrics.clicks,
    ctr: parseFloat(c.metrics.ctr.toFixed(3)),
  }));

  const statusCount = campaigns.reduce((acc: Record<string, number>, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(statusCount).map(([name, value]) => ({ name, value }));
  const pieColors: Record<string, string> = { ACTIVE: '#00C896', PAUSED: '#FFB800', ARCHIVED: '#8888aa', DELETED: '#FF4466' };

  const ctrVsCpc = campaigns
    .filter(c => c.metrics.ctr > 0 && c.metrics.cpc > 0 && c.metrics.cpc < 100)
    .map(c => ({
      ctr: parseFloat(c.metrics.ctr.toFixed(3)),
      cpc: parseFloat(c.metrics.cpc.toFixed(2)),
      spend: c.metrics.spend,
      name: shortName(c.name, 25),
    }));

  const scoreData = [...campaigns]
    .sort((a, b) => b.performance_score - a.performance_score)
    .slice(0, 10)
    .map(c => ({
      name: shortName(c.name),
      score: c.performance_score,
      fill: c.performance_score >= 70 ? '#00C896' : c.performance_score >= 40 ? '#FFB800' : '#FF4466',
    }));

  const customTooltipStyle = {
    backgroundColor: '#13131f',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    color: '#e8e8f0',
    fontSize: '12px',
  };

  return (
    <div className="space-y-6">
      {/* Row 1: Spend bar + Status pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">
            💰 Investimento por Campanha (Top 8)
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={spendData} margin={{ top: 0, right: 0, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#8888aa', fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fill: '#8888aa', fontSize: 10 }} tickFormatter={v => `R$${v}`} />
              <Tooltip contentStyle={customTooltipStyle} formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, 'Investido']} />
              <Bar dataKey="spend" fill="#1877F2" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">
            📊 Status das Campanhas
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={pieColors[entry.name] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={customTooltipStyle} />
              <Legend
                formatter={(value) => <span style={{ color: '#e8e8f0', fontSize: 12 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Performance scores */}
      <div className="glass-card">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">
          🎯 Score de Performance por Campanha (Top 10)
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={scoreData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: '#8888aa', fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#8888aa', fontSize: 10 }} />
            <Tooltip contentStyle={customTooltipStyle} formatter={(v: any) => [`${v}/100`, 'Score']} />
            <Bar dataKey="score" radius={[0, 4, 4, 0]}>
              {scoreData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Row 3: CTR vs CPC scatter */}
      {ctrVsCpc.length > 1 && (
        <div className="glass-card">
          <h3 className="text-sm font-semibold text-gray-300 mb-1 uppercase tracking-wide">
            📈 CTR vs CPC (eficiência)
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Ideal: alto CTR + baixo CPC (canto superior esquerdo). Tamanho = investimento.
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
              <XAxis
                dataKey="cpc"
                name="CPC"
                type="number"
                tick={{ fill: '#8888aa', fontSize: 10 }}
                label={{ value: 'CPC (R$)', position: 'insideBottom', offset: -10, fill: '#8888aa', fontSize: 11 }}
              />
              <YAxis
                dataKey="ctr"
                name="CTR"
                type="number"
                tick={{ fill: '#8888aa', fontSize: 10 }}
                label={{ value: 'CTR (%)', angle: -90, position: 'insideLeft', fill: '#8888aa', fontSize: 11 }}
              />
              <ZAxis dataKey="spend" range={[40, 400]} name="Investido" />
              <Tooltip
                contentStyle={customTooltipStyle}
                formatter={(v: any, name: string) => {
                  if (name === 'CPC') return [`R$ ${Number(v).toFixed(2)}`, 'CPC'];
                  if (name === 'CTR') return [`${Number(v).toFixed(2)}%`, 'CTR'];
                  if (name === 'Investido') return [`R$ ${Number(v).toFixed(2)}`, 'Investido'];
                  return [v, name];
                }}
                cursor={{ strokeDasharray: '3 3' }}
              />
              <Scatter data={ctrVsCpc} fill="#1877F2" fillOpacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Row 4: CPM & CPC bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">
            📣 CTR por Campanha
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={spendData} margin={{ top: 0, right: 0, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
              <XAxis dataKey="name" tick={{ fill: '#8888aa', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: '#8888aa', fontSize: 10 }} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={customTooltipStyle} formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'CTR']} />
              <Bar dataKey="ctr" fill="#00C896" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">
            🖱️ Cliques por Campanha
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={spendData} margin={{ top: 0, right: 0, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
              <XAxis dataKey="name" tick={{ fill: '#8888aa', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: '#8888aa', fontSize: 10 }} />
              <Tooltip contentStyle={customTooltipStyle} formatter={(v: any) => [v.toLocaleString('pt-BR'), 'Cliques']} />
              <Bar dataKey="clicks" fill="#9C6FFF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
