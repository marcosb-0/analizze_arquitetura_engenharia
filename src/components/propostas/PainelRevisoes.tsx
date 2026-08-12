import { History } from 'lucide-react';
import { RevisaoProposta } from '../../types';
import { formatarDataBR } from '../../lib/data';
import { formatBRL } from '../../lib/preco';
import { CONTROLE_ALTURA } from '../ui';
import ComparadorRevisoes from './ComparadorRevisoes';

interface Props {
  revisoes: RevisaoProposta[];
  /** Convertida, aprovada ou rejeitada: o histórico não recebe mais versões. */
  bloqueado: boolean;
  /** O orçamento da proposta ainda está sendo buscado. */
  carregando: boolean;
  onNovaRevisao: () => void;
}

export default function PainelRevisoes({
  revisoes,
  bloqueado,
  carregando,
  onNovaRevisao,
}: Props) {
  return (
    <div className="space-y-3.5 border-t border-slate-200 pt-4 text-left">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
          <History size={15} className="text-slate-500" />
          <span>Histórico de Revisões ({revisoes.length})</span>
        </h4>
        {/* Uma revisão congela o orçamento vigente — o mesmo motivo que trava os
            itens vale aqui. E enquanto o orçamento não chegou, o diálogo
            ofereceria o caminho de valor digitado por engano. */}
        {!bloqueado && !carregando ? (
          <button
            id="add-revision-btn"
            onClick={onNovaRevisao}
            title="Congela o orçamento e os valores atuais como uma nova versão do histórico"
            className={`${CONTROLE_ALTURA.sm} inline-flex items-center text-xs text-blue-600 font-bold hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 rounded transition active:scale-95`}
          >
            + Nova Revisão
          </button>
        ) : bloqueado ? (
          // O botão simplesmente sumia. Sem rastro, não dá para saber se a
          // função não existe ou se está indisponível agora.
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">
            Histórico encerrado
          </span>
        ) : null}
      </div>

      {revisoes.length >= 2 && <ComparadorRevisoes revisoes={revisoes} />}

      {revisoes.length === 0 ? (
        <p className="text-xs text-slate-500 italic pl-1">
          Esta proposta de obra ainda está em sua versão de partida original.
        </p>
      ) : (
        <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
          {revisoes.map((rev) => (
            <div key={rev.versao} className="flex gap-3 relative">
              <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center font-bold text-xs text-slate-500 shrink-0 z-10 shadow-sm">
                v{rev.versao}
              </div>
              <div className="flex-1 bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs space-y-1">
                <div className="flex justify-between items-center text-slate-500">
                  <span className="font-mono">Revisado em: {formatarDataBR(rev.data)}</span>
                  <span className="font-mono font-bold text-slate-800">{formatBRL(rev.valor)}</span>
                </div>
                <p className="text-slate-600 leading-relaxed italic">" {rev.alteracoes} "</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
