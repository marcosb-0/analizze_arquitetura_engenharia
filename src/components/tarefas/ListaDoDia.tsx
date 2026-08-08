import { Building2, Pencil, Trash2 } from 'lucide-react';
import type { StatusTarefa, Tarefa } from '../../types';
import { BLOCOS_DO_DIA, minhasDoDia, type SituacaoPrazo } from '../../lib/tarefas';
import { formatarDataBR } from '../../lib/data';
import { StatusBadge } from '../../constants/status';
import { IconButton } from '../ui';

interface ListaDoDiaProps {
  tarefas: Tarefa[];
  meuId?: string;
  nomeObra: (id?: string) => string | undefined;
  podeEditar: boolean;
  onMover: (id: string, status: StatusTarefa) => void;
  onEditar: (t: Tarefa) => void;
  onExcluir: (t: Tarefa) => void;
}

/** Só o bloco de atrasadas muda de cor — o resto é hierarquia, não alarme. */
const TOM_BLOCO: Record<SituacaoPrazo, string> = {
  atrasada: 'text-rose-600',
  hoje: 'text-amber-700',
  futura: 'text-slate-500',
  'sem-prazo': 'text-slate-500',
};

/**
 * A pauta pessoal: o que é meu e ainda não fechou, em blocos por urgência.
 *
 * Aqui o gesto é o checkbox, não o arraste. Concluir é a única transição que
 * importa nesta visão — quem quer mover para "Fazendo" ou "Em revisão" está
 * pensando em fluxo, e fluxo é o quadro.
 */
export default function ListaDoDia({
  tarefas,
  meuId,
  nomeObra,
  podeEditar,
  onMover,
  onEditar,
  onExcluir,
}: ListaDoDiaProps) {
  const blocos = minhasDoDia(tarefas, meuId);

  return (
    <div className="space-y-5">
      {BLOCOS_DO_DIA.map(({ chave, titulo }) => {
        const itens = blocos[chave];
        if (itens.length === 0) return null;

        return (
          <section key={chave}>
            <h3 className={`mb-1.5 text-2xs font-bold uppercase tracking-wider ${TOM_BLOCO[chave]}`}>
              {titulo}
              <span className="ml-1.5 font-semibold text-slate-500">({itens.length})</span>
            </h3>

            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {itens.map((t) => (
                <li key={t.id} className="group flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50">
                  {/* O rótulo embrulha o texto, então clicar no título conclui.
                      É o gesto que todo to-do tem, e ele nasce de graça do
                      <label> — sem handler no <li>, que não seria focável. */}
                  <label className="flex flex-1 min-w-0 cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => onMover(t.id, 'Concluída')}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded accent-blue-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold leading-snug text-slate-800">{t.titulo}</span>
                      {t.descricao && (
                        <span className="mt-0.5 block line-clamp-1 text-2xs text-slate-500">{t.descricao}</span>
                      )}
                      <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs">
                        <StatusBadge type="tarefa" status={t.status} size="sm" />
                        <StatusBadge type="prioridade" status={t.prioridade} size="sm" />
                        {t.prazo && (
                          <span className={`font-semibold ${TOM_BLOCO[chave]}`}>
                            {formatarDataBR(t.prazo)}
                          </span>
                        )}
                        {nomeObra(t.projetoId) && (
                          <span className="inline-flex min-w-0 items-center gap-1 text-slate-500">
                            <Building2 size={11} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">{nomeObra(t.projetoId)}</span>
                          </span>
                        )}
                      </span>
                    </span>
                  </label>

                  {podeEditar && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <IconButton rotulo={`Editar ${t.titulo}`} tamanho="sm" tom="acao" onClick={() => onEditar(t)}>
                        <Pencil size={13} />
                      </IconButton>
                      <IconButton rotulo={`Excluir ${t.titulo}`} tamanho="sm" tom="perigo" onClick={() => onExcluir(t)}>
                        <Trash2 size={13} />
                      </IconButton>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
