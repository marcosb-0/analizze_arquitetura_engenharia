import { Building2, ChevronLeft, Pencil } from 'lucide-react';
import { Projeto } from '../../types';
import { StatusBadge } from '../../constants/status';
import { ALVO, Button, Card, Select } from '../ui';

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
    <Card
      id="console-header"
      semPadding
      className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left"
    >
      <div className="flex items-start gap-4">
        <button
          id="back-to-projects-btn"
          onClick={onVoltar}
          className={`inline-flex items-center justify-center p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/40 rounded-lg text-slate-500 hover:text-slate-800 transition active:scale-95 shrink-0 ${ALVO.md}`}
          aria-label="Voltar para a lista"
          title="Voltar para a lista"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-2xs font-mono text-blue-600 bg-blue-50 border border-blue-100/60 px-2 py-0.5 rounded font-bold uppercase tracking-wider cursor-help"
              title={projeto.id}
            >
              Código Obra: {projeto.id.slice(0, 8).toUpperCase()}
            </span>
            <StatusBadge type="projeto" status={projeto.situacao} />
          </div>
          <h2 className="text-base font-extrabold tracking-tight text-slate-950 flex items-center gap-1.5">
            <span>Projeto</span>
            <span className="text-blue-600 font-bold">{projeto.nome}</span>
          </h2>
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Building2 size={13} className="text-slate-500" />
            <span className="text-slate-500">
              Cliente: <strong className="text-slate-800 font-bold">{nomeCliente || 'N/A'}</strong>
            </span>
          </p>
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
            <span>Editar Obra</span>
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
    </Card>
  );
}
