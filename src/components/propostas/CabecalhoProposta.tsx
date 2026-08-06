import { Copy, Pencil, Trash2 } from 'lucide-react';
import { Proposta } from '../../types';
import { IconButton, Select } from '../ui';

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
          <Select
            id="proposta-detail-status-select"
            value={proposta.status}
            disabled={convertida}
            onChange={(e) => onMudarStatus(e.target.value as Proposta['status'])} fundo="suave" className="font-semibold hover:bg-slate-100 cursor-pointer disabled:bg-slate-100"
          >
            <option value="Elaboração">Status: Elaboração</option>
            <option value="Enviada">Status: Enviada</option>
            <option value="Aprovada">Status: Aprovada</option>
            <option value="Rejeitada">Status: Rejeitada</option>
          </Select>
          {/* Valor, BDI, prazo e validade deixaram de ser pedidos no cadastro;
              é por aqui que eles entram — e é o caminho que faltava para
              acertar os dados de uma proposta duplicada, que nasce com o
              escopo da origem e sem validade. */}
          <IconButton
            rotulo="Editar dados da proposta"
            dica={bloqueado ? motivoBloqueio : 'Editar cliente, escopo, valor, BDI, prazo e validade'}
            tom="acao"
            id={`editar-proposta-btn-${proposta.id}`}
            onClick={onEditar}
            disabled={bloqueado}
          >
            <Pencil size={16} />
          </IconButton>
          <IconButton
            rotulo="Duplicar proposta"
            dica="Duplicar: cria uma nova proposta em elaboração com o mesmo orçamento"
            tom="acao"
            carregando={duplicando}
            id={`duplicar-proposta-btn-${proposta.id}`}
            onClick={onDuplicar}
            disabled={duplicando}
          >
            <Copy size={16} />
          </IconButton>
          {/* Separador antes da ação destrutiva: Excluir ficava encostado em
              Duplicar, dois ícones cinza de 16px a quatro pixels um do outro,
              com resultados opostos e irreversíveis. */}
          <span className="w-px h-5 bg-slate-200 mx-0.5" aria-hidden="true" />
          <IconButton
            rotulo="Excluir proposta"
            dica={convertida ? 'Proposta convertida em obra — não pode ser excluída' : 'Excluir Proposta'}
            tom="perigo"
            id={`delete-proposta-btn-${proposta.id}`}
            onClick={onExcluir}
            disabled={convertida}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
        <span className="text-xs text-slate-500">
          {convertida ? 'Status travado pela obra vinculada' : 'Clique para alterar status'}
        </span>
      </div>
    </div>
  );
}
