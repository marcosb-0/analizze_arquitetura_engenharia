import { Building2, ChevronLeft, Pencil } from 'lucide-react';
import { Projeto } from '../../types';
import { StatusBadge } from '../../constants/status';
import { Button, IconButton, Select } from '../ui';

interface Props {
  projeto: Projeto;
  nomeCliente?: string;
  podeGerenciar: boolean;
  onVoltar: () => void;
  onEditarObra: () => void;
  onMudarSituacao: (situacao: Projeto['situacao']) => void;
}

export default function ConsoleHeader({
  projeto,
  nomeCliente,
  podeGerenciar,
  onVoltar,
  onEditarObra,
  onMudarSituacao,
}: Props) {
  return (
    <header
      id="console-header"
      className="flex flex-col md:flex-row md:items-end justify-between gap-4 text-left"
    >
      <div className="flex items-start gap-3 min-w-0">
        <IconButton
          id="back-to-projects-btn"
          rotulo="Voltar para a lista de obras"
          onClick={onVoltar}
          className="mt-1 border border-slate-300 bg-superficie"
        >
          <ChevronLeft size={18} />
        </IconButton>

        <div className="min-w-0">
          <h1 className="titulo-pagina text-slate-900 truncate" title={projeto.nome}>{projeto.nome}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
            <StatusBadge type="projeto" status={projeto.situacao} />
            <span className="inline-flex items-center gap-1.5">
              <Building2 size={13} className="text-slate-500" aria-hidden="true" />
              <strong className="font-semibold text-slate-800">{nomeCliente || 'Cliente não informado'}</strong>
            </span>
            <span className="font-mono text-2xs font-semibold text-slate-500 cursor-help" title={`Código completo: ${projeto.id}`}>
              Nº {projeto.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Ações da obra — só para quem tem escrita (a RLS é a barreira real:
          financeiro e campo têm apenas SELECT). */}
      {podeGerenciar && (
        <div className="flex items-center gap-2">
          <Button
            id="console-editar-obra-btn"
            variante="secundario"
            onClick={onEditarObra}
            title="Editar dados da obra"
          >
            <Pencil size={13} />
            <span>Editar obra</span>
          </Button>
          <Select
            id="console-project-situacao"
            value={projeto.situacao}
            onChange={(e) => onMudarSituacao(e.target.value as Projeto['situacao'])} className="hover:bg-slate-50 cursor-pointer font-bold"
          >
            <option value="Planejamento">Mudar para: Planejamento</option>
            <option value="Em Execução">Mudar para: Em Execução</option>
            <option value="Pausado">Mudar para: Pausado</option>
            <option value="Finalizado">Mudar para: Finalizado</option>
          </Select>
        </div>
      )}
    </header>
  );
}
