'use client';

import { useState } from 'react';

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
  };
  recommendations: { type: string; text: string }[];
  performance_score: number;
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? '#00C896' : score >= 40 ? '#FFB800' : '#FF4466';
  const circumference = 2 * Math.PI * 20;
  const strokeDash = (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
      <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="28" cy="28" r="20" fill="none" stroke="#2a2a4a" strokeWidth="4" />
        <circle
          cx="28" cy="28" r="20" fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${strokeDash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-sm font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

function RecommendationBadge({ type, text }: { type: string; text: string }) {
  const styles: Record<string, string> = {
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
  };
  const icons: Record<string, string> = {
    success: '✓',
    warning: '⚠',
    error: '✗',
    info: 'ℹ',
  };

  return (
    <div className={`metric-badge ${styles[type] || 'badge-info'} mb-1 mr-1 flex-shrink-0`} style={{ maxWidth: '100%', whiteSpace: 'normal', display: 'flex', alignItems: 'flex-start', padding: '4px 10px' }}>
      <span className="mr-1 flex-shrink-0">{icons[type] || 'ℹ'}</span>
      <span style={{ fontSize: '11px', lineHeight: '1.4' }}>{text}</span>
    </div>
  );
}

function fmt(n: number, prefix = '', suffix = '', decimals = 2) {
  if (!n && n !== 0) return 'N/A';
  return `${prefix}${n.toFixed(decimals)}${suffix}`;
}

function fmtInt(n: number) {
  return n ? n.toLocaleString('pt-BR') : '0';
}

export default function CampaignCard({ campaign }: { campaign: Campaign }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = campaign.status === 'ACTIVE' ? '#00C896' : campaign.status === 'PAUSED' ? '#FFB800' : '#8888aa';
  const m = campaign.metrics;

  return (
    <div className="glass-card cursor-pointer" onClick={() => setExpanded(!expanded)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: statusColor + '22', color: statusColor }}
            >
              {campaign.status}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#2a2a4a', color: '#8888aa' }}>
              {campaign.objective}
            </span>
          </div>
          <h3 className="font-semibold text-white text-sm leading-tight" style={{ fontSize: '14px' }}>
            {campaign.name}
          </h3>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <ScoreRing score={campaign.performance_score} />
          <span className="text-gray-400 text-lg">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Quick metrics row */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        <div className="text-center p-2 rounded-lg" style={{ background: '#0a0a0f' }}>
          <p className="text-xs text-gray-500">Investido</p>
          <p className="font-bold text-white text-sm">R$ {fmt(m.spend, '', '', 2)}</p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: '#0a0a0f' }}>
          <p className="text-xs text-gray-500">CTR</p>
          <p className="font-bold text-sm" style={{ color: m.ctr >= 1.5 ? '#00C896' : m.ctr >= 0.5 ? '#FFB800' : '#FF4466' }}>
            {fmt(m.ctr, '', '%')}
          </p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: '#0a0a0f' }}>
          <p className="text-xs text-gray-500">CPC</p>
          <p className="font-bold text-sm" style={{ color: m.cpc < 3 && m.cpc > 0 ? '#00C896' : m.cpc > 8 ? '#FF4466' : '#FFB800' }}>
            R$ {fmt(m.cpc, '', '', 2)}
          </p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: '#0a0a0f' }}>
          <p className="text-xs text-gray-500">Conversões</p>
          <p className="font-bold text-white text-sm">{m.conversions}</p>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid #2a2a4a' }}>
          {/* All metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Impressões', value: fmtInt(m.impressions) },
              { label: 'Alcance', value: fmtInt(m.reach) },
              { label: 'Cliques', value: fmtInt(m.clicks) },
              { label: 'Frequência', value: fmt(m.frequency, '', 'x') },
              { label: 'CPM', value: fmt(m.cpm, 'R$ ') },
              { label: 'CPA', value: m.cpa > 0 ? fmt(m.cpa, 'R$ ') : 'N/A' },
              { label: 'ROAS', value: m.roas ? fmt(m.roas, '', 'x') : 'N/A' },
              { label: 'Cliques únicos', value: fmtInt(m.clicks) },
            ].map(({ label, value }) => (
              <div key={label} className="p-2 rounded-lg" style={{ background: '#0a0a0f' }}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-semibold text-white text-sm">{value}</p>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Recomendações
            </p>
            <div className="flex flex-wrap gap-1">
              {campaign.recommendations.map((rec, i) => (
                <RecommendationBadge key={i} type={rec.type} text={rec.text} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
