import { Copy, Pencil, Trash2 } from 'lucide-react';
import { Proposta } from '../../types';
import Spinner from '../Spinner';

interface Props {
  proposta: Proposta;
  nomeCliente: string;
  /** Convertida em obra: o status vira registro histórico e não muda mais. */
  convertida: boolean;
  /** Convertida, aprovada ou rejeitada — orçamento e cabeçalho ficam travados. */
  bloqueado: boolean;
  motivoBloqueio?: string;
  duplicando: boolean;
  onMudarStatus: (status: Proposta['status']) => void;
  onEditar: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
}

export default function CabecalhoProposta({
  proposta,
  nomeCliente,
  convertida,
  bloqueado,
  motivoBloqueio,
  duplicando,
  onMudarStatus,
  onEditar,
  onDuplicar,
  onExcluir,
}: Props) {
  return (
    <div className="flex justify-between items-start border-b border-slate-200 pb-3">
      <div className="text-left">
        <span className="text-xs font-mono bg-blue-50 border border-blue-200 text-blue-800 font-bold px-2 py-0.5 rounded">
          CÓDIGO: {proposta.numero}
        </span>
        <h3 className="text-base font-bold text-slate-950 mt-1.5 leading-snug">
          {proposta.descricao}
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Cliente Solicitante: <strong className="text-slate-800">{nomeCliente}</strong>
        </p>
      </div>

      <div className="flex flex-col gap-1 items-end">
        <div className="flex items-center gap-1.5">
          <select
            id="proposta-detail-status-select"
            value={proposta.status}
            disabled={convertida}
            onChange={(e) => onMudarStatus(e.target.value as Proposta['status'])}
            className="border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-700 font-semibold bg-slate-50 hover:bg-slate-100 transition cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            <option value="Elaboração">Status: Elaboração</option>
            <option value="Enviada">Status: Enviada</option>
            <option value="Aprovada">Status: Aprovada</option>
            <option value="Rejeitada">Status: Rejeitada</option>
          </select>
          {/* Valor, BDI, prazo e validade deixaram de ser pedidos no cadastro;
              é por aqui que eles entram — e é o caminho que faltava para
              acertar os dados de uma proposta duplicada, que nasce com o
              escopo da origem e sem validade. */}
          <button
            id={`editar-proposta-btn-${proposta.id}`}
            onClick={onEditar}
            disabled={bloqueado}
            aria-label="Editar dados da proposta"
            className="text-slate-500 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition active:scale-95 disabled:text-slate-200 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            title={bloqueado ? motivoBloqueio : 'Editar cliente, escopo, valor, BDI, prazo e validade'}
          >
            <Pencil size={16} />
          </button>
          <button
            id={`duplicar-proposta-btn-${proposta.id}`}
            onClick={onDuplicar}
            disabled={duplicando}
            aria-label="Duplicar proposta"
            className="text-slate-500 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition active:scale-95 disabled:opacity-40"
            title="Duplicar: cria uma nova proposta em elaboração com o mesmo orçamento"
          >
            {duplicando ? <Spinner size={16} /> : <Copy size={16} />}
          </button>
          {/* Separador antes da ação destrutiva: Excluir ficava encostado em
              Duplicar, dois ícones cinza de 16px a quatro pixels um do outro,
              com resultados opostos e irreversíveis. */}
          <span className="w-px h-5 bg-slate-200 mx-0.5" aria-hidden="true" />
          <button
            id={`delete-proposta-btn-${proposta.id}`}
            onClick={onExcluir}
            disabled={convertida}
            aria-label="Excluir proposta"
            className="text-slate-500 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition active:scale-95 disabled:text-slate-200 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            title={
              convertida ? 'Proposta convertida em obra — não pode ser excluída' : 'Excluir Proposta'
            }
          >
            <Trash2 size={16} />
          </button>
        </div>
        <span className="text-xs text-slate-500">
          {convertida ? 'Status travado pela obra vinculada' : 'Clique para alterar status'}
        </span>
      </div>
    </div>
  );
}
