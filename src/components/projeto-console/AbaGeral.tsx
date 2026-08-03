import { Calendar, Clock, DollarSign, MapPin, Percent } from 'lucide-react';
import { Funcionario, Projeto } from '../../types';
import { formatarDataBR } from '../../lib/data';
import { getWorkingDays } from '../../lib/diasUteis';
import { formatBRL } from '../../lib/preco';

interface Props {
  projeto: Projeto;
  responsavelFuncionario?: Funcionario;
  progressoFisico: number;
  saldoDisponivel: number;
}

export default function AbaGeral({
  projeto,
  responsavelFuncionario,
  progressoFisico,
  saldoDisponivel,
}: Props) {
  const diasUteis = getWorkingDays(projeto.dataInicio, projeto.dataFim);

  return (
    <div id="tab-pane-geral" className="space-y-4 text-left">
      {/* Quick overview metric row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded text-white font-bold shrink-0">
            <Percent size={18} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase">Evolução Física Média</span>
            <h4 className="text-lg font-bold text-slate-900">{progressoFisico}%</h4>
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-3">
          <div className="p-2 bg-emerald-500 rounded text-white shrink-0">
            <DollarSign size={18} />
          </div>
          <div>
            <span
              className="text-xs font-bold text-slate-400 uppercase"
              title="Orçado menos executado — não desconta valores já contratados."
            >
              Saldo a Executar
            </span>
            <h4
              className={`text-lg font-bold font-mono ${saldoDisponivel >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {formatBRL(saldoDisponivel)}
            </h4>
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded text-blue-400 shrink-0">
            <Calendar size={18} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase">Previsão de Entrega</span>
            <h4 className="text-sm font-bold text-slate-800">{formatarDataBR(projeto.dataFim)}</h4>
            <span className="text-2xs text-blue-600 font-bold font-mono">({diasUteis} dias úteis)</span>
          </div>
        </div>
      </div>

      {/* Core Address & Responsibles Card */}
      <div className="bg-slate-50/50 p-3.5 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Localização e Detalhes da Obra
          </h4>
          <div className="space-y-1.5 text-xs text-slate-700">
            <p className="flex items-center gap-2">
              <MapPin size={14} className="text-blue-500 shrink-0" />
              <span>
                <strong>Endereço do Canteiro:</strong> {projeto.enderecoObra}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-400 shrink-0" />
              <span>
                <strong>Mobilização Inicial:</strong> {formatarDataBR(projeto.dataInicio)}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <Clock size={14} className="text-slate-400 shrink-0" />
              <span>
                <strong>Duração Real Útil:</strong> {diasUteis} dias úteis (fim de semana descontado)
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Responsabilidade e Liderança
          </h4>
          <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center font-bold text-blue-800 shrink-0 text-xs">
              {projeto.responsavelInterno
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div>
              <h5 className="font-bold text-xs text-slate-950">{projeto.responsavelInterno}</h5>
              <p className="text-xs text-slate-500">
                {responsavelFuncionario?.cargo || 'Responsável a definir'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
