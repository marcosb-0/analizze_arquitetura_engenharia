import { Calendar, Clock, DollarSign } from 'lucide-react';
import { Proposta } from '../../types';
import { formatarDataBR } from '../../lib/data';
import { formatarPrazo } from '../../lib/prazo';
import { formatBRL } from '../../lib/preco';
import { CORES_VALIDADE, rotuloValidade, situacaoValidade } from '../../lib/validadeProposta';

interface Props {
  proposta: Proposta;
  qtdItens: number;
  bloqueado: boolean;
  onEditar: () => void;
}

export default function IndicadoresProposta({ proposta, qtdItens, bloqueado, onEditar }: Props) {
  const temItens = qtdItens > 0;
  const situacao = situacaoValidade(proposta);
  const rotulo = rotuloValidade(proposta);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-left space-y-1">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
          Investimento Estimado
        </span>
        <div className="flex items-center gap-1">
          <DollarSign size={15} className="text-emerald-500" />
          <span className="font-mono text-xs font-bold text-slate-950">
            {formatBRL(proposta.valorEstimado)}
          </span>
        </div>
        {/* Sem isto, um valor zerado parecia defeito. Ele é o estado correto de
            uma proposta recém-aberta: ou vem do orçamento montado abaixo, ou de
            um valor digitado na edição. */}
        <span className="text-2xs text-slate-500 leading-tight block">
          {temItens
            ? `Calculado: ${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'} + BDI de ${proposta.bdiPercentual}%`
            : proposta.valorManual > 0
              ? 'Valor digitado — passa a ser calculado ao montar o orçamento'
              : 'Monte o orçamento abaixo ou digite um valor em Editar'}
        </span>
      </div>

      {/* Prazo e validade nascem vazios agora. Em vez de exibir um travessão
          mudo, o campo em branco convida a preenchê-lo — é onde o usuário vai
          procurar quando perceber que falta. */}
      <button
        type="button"
        onClick={onEditar}
        disabled={bloqueado}
        className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-left space-y-1 transition enabled:hover:border-blue-300 enabled:hover:bg-blue-50/30 disabled:cursor-default outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
          Prazo de Execução
        </span>
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-slate-500" />
          {proposta.prazoExecucaoDias ? (
            <span className="text-xs font-semibold text-slate-800">
              {formatarPrazo(proposta.prazoExecucaoDias)}
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-500 italic">
              {bloqueado ? 'Não informado' : 'Definir prazo em dias'}
            </span>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={onEditar}
        disabled={bloqueado}
        className={`p-3 rounded-lg border text-left space-y-1 transition enabled:hover:border-blue-300 disabled:cursor-default outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          situacao === 'vencida'
            ? 'bg-rose-50/60 border-rose-200'
            : situacao === 'vence-hoje' || situacao === 'a-vencer'
              ? 'bg-amber-50/60 border-amber-200'
              : 'bg-slate-50 border-slate-200'
        }`}
      >
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
          Data Limite Validade
        </span>
        <div className="flex items-center gap-1.5">
          <Calendar size={14} className={situacao === 'vencida' ? 'text-rose-500' : 'text-slate-500'} />
          {proposta.dataValidade ? (
            <span className="text-xs font-semibold text-slate-800 font-mono">
              {formatarDataBR(proposta.dataValidade)}
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-500 italic">
              {bloqueado ? 'Não informada' : 'Definir validade'}
            </span>
          )}
          {rotulo && (
            <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${CORES_VALIDADE[situacao]}`}>
              {rotulo}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}
