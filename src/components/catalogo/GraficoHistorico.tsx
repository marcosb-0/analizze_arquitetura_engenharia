import { History } from 'lucide-react';
import { PontoHistoricoPreco } from '../../types';
import { formatBRL } from '../../lib/preco';
import { dataLocal } from '../../lib/data';

/**
 * Linha do preço de referência ao longo do tempo, desenhada à mão em SVG — são
 * poucos pontos e nenhum eixo, não justifica trazer a biblioteca de gráficos
 * para dentro do drawer.
 */
export default function GraficoHistorico({ historico }: { historico: PontoHistoricoPreco[] }) {
  if (historico.length < 2) {
    return (
      <div className="h-16 flex items-center justify-center bg-slate-50 border border-slate-100 rounded text-2xs text-slate-400 font-medium px-3 text-center">
        {historico.length === 1
          ? 'Só há o preço inicial. O próximo ponto entra sozinho quando o preço de referência for editado.'
          : 'Nenhuma variação histórica registrada.'}
      </div>
    );
  }

  const precos = historico.map((h) => h.preco);
  const max = Math.max(...precos);
  const min = Math.min(...precos);
  const diff = max - min === 0 ? 1 : max - min;
  const width = 300;
  const height = 60;

  const pontos = historico.map((h, i) => ({
    x: (i / (historico.length - 1)) * (width - 40) + 20,
    y: height - 10 - ((h.preco - min) / diff) * (height - 20),
    ...h,
  }));

  const pathD = pontos.reduce((acc, p, i) => acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), '');
  const variacao = ((precos[precos.length - 1] - precos[0]) / precos[0]) * 100;

  return (
    <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 space-y-1.5 text-left">
      <div className="flex justify-between items-center">
        <span className="text-2xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
          <History size={11} /> Histórico de preço ({historico.length} pontos)
        </span>
        <span className={`text-2xs font-mono font-bold ${variacao >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
          {variacao >= 0 ? '+' : ''}
          {variacao.toFixed(1)}% no período
        </span>
      </div>
      <svg className="w-full h-16 overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pontos.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#2563eb" />
            <text x={p.x} y={p.y - 6} fill="#1e293b" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              {p.preco.toFixed(0)}
            </text>
            <text x={p.x} y={height - 2} fill="#94a3b8" fontSize="7" textAnchor="middle">
              {dataLocal(p.data)?.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) ?? '—'}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-2xs text-slate-400 font-mono">
        <span>mín {formatBRL(min)}</span>
        <span>máx {formatBRL(max)}</span>
      </div>
    </div>
  );
}
