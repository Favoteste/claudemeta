'use client';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  color?: string;
  icon?: string;
  format?: 'currency' | 'percent' | 'number';
}

export default function MetricCard({ title, value, subtitle, trend, color = '#1877F2', icon }: MetricCardProps) {
  const trendPositive = trend !== undefined && trend >= 0;

  return (
    <div className="glass-card relative overflow-hidden">
      <div
        className="absolute top-0 left-0 w-1 h-full rounded-l-xl"
        style={{ background: color }}
      />
      <div className="pl-2">
        <div className="flex items-start justify-between mb-2">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8888aa' }}>
            {title}
          </p>
          {icon && <span className="text-xl">{icon}</span>}
        </div>
        <p className="text-2xl font-bold text-white">{value}</p>
        {subtitle && (
          <p className="text-xs mt-1" style={{ color: '#8888aa' }}>{subtitle}</p>
        )}
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-semibold ${trendPositive ? 'text-green-400' : 'text-red-400'}`}>
            <span>{trendPositive ? '↑' : '↓'}</span>
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
