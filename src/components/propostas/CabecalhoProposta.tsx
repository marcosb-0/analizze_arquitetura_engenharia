import { ChevronLeft, Copy, Pencil, Trash2 } from 'lucide-react';
import { Proposta } from '../../types';
import { ALVO, Chip, IconButton, Select } from '../ui';

interface Props {
  proposta: Proposta;
  nomeCliente: string;
  /** Fecha a proposta e devolve a carteira. */
  onVoltar: () => void;
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
  onVoltar,
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
    <div className="flex justify-between items-start gap-4 border-b border-slate-200 pb-3">
      {/* A volta é a primeira coisa do cabeçalho, no mesmo lugar e com o mesmo
          desenho do console da obra (`ConsoleHeader`): as duas telas são o
          mesmo movimento — uma lista que sai para um registro entrar — e um
          "voltar" em dois cantos diferentes obrigaria a procurá-lo. Ela existe
          além do botão voltar do browser e da migalha da topbar, porque é a que
          fica ao alcance do olho de quem já está lendo a proposta. */}
      <div className="flex items-start gap-3 min-w-0">
        <button
          id="back-to-propostas-btn"
          onClick={onVoltar}
          className={`inline-flex items-center justify-center p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/40 rounded-lg text-slate-500 hover:text-slate-800 transition active:scale-95 shrink-0 ${ALVO.md}`}
          aria-label="Voltar para a carteira de propostas"
          title="Voltar para a carteira de propostas"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="text-left min-w-0">
          <Chip tom="informativo" className="data-font">
            {proposta.numero}
          </Chip>
          <h3 className="text-base font-bold text-slate-950 mt-1.5 leading-snug">
            {proposta.descricao}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Cliente Solicitante: <strong className="text-slate-800">{nomeCliente}</strong>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 items-end shrink-0">
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
