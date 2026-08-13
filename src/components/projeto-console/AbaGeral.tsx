import { AlertTriangle, Calendar, Clock, DollarSign, MapPin, Percent } from 'lucide-react';
import { Funcionario, Projeto } from '../../types';
import { AvancoFisicoDetalhado, avisoDoAvanco } from '../../lib/avanco';
import { formatarDataBR } from '../../lib/data';
import { getWorkingDays } from '../../lib/diasUteis';
import { formatBRL } from '../../lib/preco';
import { FaixaKpis, Kpi } from '../ui';

interface Props {
  projeto: Projeto;
  responsavelFuncionario?: Funcionario;
  progressoFisico: number;
  /** A procedência do número acima — ver `avisoDoAvanco`. */
  avancoFisico: AvancoFisicoDetalhado;
  saldoDisponivel: number;
}

export default function AbaGeral({
  projeto,
  responsavelFuncionario,
  progressoFisico,
  avancoFisico,
  saldoDisponivel,
}: Props) {
  const avisoAvanco = avisoDoAvanco(avancoFisico);
  const diasUteis = getWorkingDays(projeto.dataInicio, projeto.dataFim);

  return (
    <div id="tab-pane-geral" className="space-y-4 text-left">
      {/* Quick overview metric row — eram três caixas cinzentas com chip de
          ícone dentro do card do workspace, que por sua vez estava dentro do
          shell. Viraram três números. */}
      <FaixaKpis colunas={3}>
        <Kpi
          icone={<Percent size={13} />}
          rotulo="Evolução física média"
          valor={
            <span className="inline-flex items-center gap-1.5">
              {progressoFisico}%
              {/*
                O KPI mostrava o percentual sem dizer de onde ele vem. Sem
                vínculo etapa↔orçamento a conta é média simples, e uma etapa sem
                vínculo não move o número nem quando é medida (§5.2, item 5).
              */}
              {avisoAvanco && (
                <span role="img" aria-label={avisoAvanco} title={avisoAvanco} className="flex">
                  <AlertTriangle size={13} className="text-amber-600 shrink-0" aria-hidden />
                </span>
              )}
            </span>
          }
          detalhe={
            avancoFisico.ponderado
              ? 'Média das etapas ponderada pelo orçamento vinculado a cada uma.'
              : 'Média simples das etapas: nenhuma tem item de orçamento vinculado.'
          }
        />
        <Kpi
          icone={<DollarSign size={13} />}
          rotulo="Saldo a executar"
          valor={
            <span className={saldoDisponivel >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
              {formatBRL(saldoDisponivel)}
            </span>
          }
          detalhe="Orçado menos executado — não desconta valores já contratados."
        />
        <Kpi
          icone={<Calendar size={13} />}
          rotulo="Previsão de entrega"
          valor={formatarDataBR(projeto.dataFim)}
          detalhe={`${diasUteis} dias úteis`}
        />
      </FaixaKpis>

      {/* Core Address & Responsibles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
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
              <Calendar size={14} className="text-slate-500 shrink-0" />
              <span>
                <strong>Mobilização Inicial:</strong> {formatarDataBR(projeto.dataInicio)}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <Clock size={14} className="text-slate-500 shrink-0" />
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
