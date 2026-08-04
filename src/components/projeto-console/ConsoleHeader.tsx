import { Building2, ChevronLeft, Pencil } from 'lucide-react';
import { Projeto } from '../../types';

const CORES_SITUACAO: Record<Projeto['situacao'], string> = {
  Planejamento: 'bg-slate-100 text-slate-600 border border-slate-200/50',
  'Em Execução': 'bg-blue-50 text-blue-700 border border-blue-100',
  Pausado: 'bg-rose-50 text-rose-700 border border-rose-100',
  Finalizado: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
};

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
    <div
      id="console-header"
      className="bg-white text-slate-800 p-5 rounded-xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left shadow-xs"
    >
      <div className="flex items-start gap-4">
        <button
          id="back-to-projects-btn"
          onClick={onVoltar}
          className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/40 rounded-lg text-slate-500 hover:text-slate-800 transition active:scale-95 shrink-0"
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
            <span
              className={`text-2xs font-bold px-2 py-0.5 rounded-full ${CORES_SITUACAO[projeto.situacao] || 'bg-slate-100'}`}
            >
              {projeto.situacao}
            </span>
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
          <button
            id="console-editar-obra-btn"
            type="button"
            onClick={onEditarObra}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300/70 rounded-lg px-3 py-2 text-xs font-bold shadow-xs transition flex items-center gap-1.5 active:scale-95"
            title="Editar dados da obra"
          >
            <Pencil size={13} />
            <span>Editar Obra</span>
          </button>
          <select
            id="console-project-situacao"
            value={projeto.situacao}
            onChange={(e) => onMudarSituacao(e.target.value as Projeto['situacao'])}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300/70 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 cursor-pointer font-bold shadow-xs transition"
          >
            <option value="Planejamento">Mudar para: Planejamento</option>
            <option value="Em Execução">Mudar para: Em Execução</option>
            <option value="Pausado">Mudar para: Pausado</option>
            <option value="Finalizado">Mudar para: Finalizado</option>
          </select>
        </div>
      )}
    </div>
  );
}
