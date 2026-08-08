import { useState } from 'react';
import type { StatusTarefa, Tarefa } from '../../types';
import { COLUNAS, agruparPorStatus } from '../../lib/tarefas';
import CardTarefa from './CardTarefa';
import { BARRA_COLUNA, MIME_TAREFA, TITULO_COLUNA } from './constantes';

interface QuadroProps {
  tarefas: Tarefa[];
  /** Resolvem id → nome. O card não busca nada sozinho. */
  nomePessoa: (id?: string) => string | undefined;
  nomeObra: (id?: string) => string | undefined;
  podeMover: boolean;
  podeEditar: boolean;
  onMover: (id: string, status: StatusTarefa) => void;
  onEditar: (t: Tarefa) => void;
  onExcluir: (t: Tarefa) => void;
}

export default function Quadro({
  tarefas,
  nomePessoa,
  nomeObra,
  podeMover,
  podeEditar,
  onMover,
  onEditar,
  onExcluir,
}: QuadroProps) {
  // A coluna sob o cursor durante o arraste. Só realce — o estado real é o
  // `status` da tarefa, e quem o muda é o `onDrop`.
  const [alvo, setAlvo] = useState<StatusTarefa | null>(null);
  const colunas = agruparPorStatus(tarefas);

  const soltar = (e: React.DragEvent, coluna: StatusTarefa) => {
    e.preventDefault();
    setAlvo(null);
    const id = e.dataTransfer.getData(MIME_TAREFA);
    // Soltar o card na própria coluna não é operação: sem esta guarda, todo
    // arraste que a pessoa desiste no meio vira uma escrita no servidor.
    if (!id || tarefas.find((t) => t.id === id)?.status === coluna) return;
    onMover(id, coluna);
  };

  return (
    // Rola na horizontal no celular, e a página nunca rola junto: cada coluna
    // tem largura mínima e o contêiner é quem tem o overflow.
    <div className="flex gap-3 overflow-x-auto pb-2">
      {COLUNAS.map((coluna) => {
        const itens = colunas[coluna];
        const realce = alvo === coluna;

        return (
          <section
            key={coluna}
            aria-label={`${TITULO_COLUNA[coluna]} — ${itens.length} ${itens.length === 1 ? 'tarefa' : 'tarefas'}`}
            onDragOver={(e) => {
              // Sem o preventDefault o navegador RECUSA o drop e o cursor mostra
              // "proibido" — é o erro clássico do drag-and-drop HTML5.
              if (!e.dataTransfer.types.includes(MIME_TAREFA)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setAlvo(coluna);
            }}
            // `relatedTarget` dentro da própria coluna é o card filho recebendo o
            // ponteiro, não a saída da coluna — sem esta checagem o realce pisca a
            // cada card que o cursor atravessa.
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo(null);
            }}
            onDrop={(e) => soltar(e, coluna)}
            className={`flex w-64 shrink-0 flex-col rounded-xl border transition ${
              realce ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            <header className="flex items-center gap-2 px-3 pt-3 pb-2">
              <span className={`h-2 w-2 rounded-full ${BARRA_COLUNA[coluna]}`} aria-hidden="true" />
              <h3 className="text-2xs font-bold uppercase tracking-wider text-slate-700">
                {TITULO_COLUNA[coluna]}
              </h3>
              <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-2xs font-bold text-slate-600 border border-slate-200">
                {itens.length}
              </span>
            </header>

            <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
              {itens.map((t) => (
                <CardTarefa
                  key={t.id}
                  tarefa={t}
                  responsavel={nomePessoa(t.responsavelId)}
                  obra={nomeObra(t.projetoId)}
                  podeMover={podeMover}
                  podeEditar={podeEditar}
                  onMover={onMover}
                  onEditar={onEditar}
                  onExcluir={onExcluir}
                />
              ))}

              {itens.length === 0 && (
                // Texto e não caixa vazia: uma coluna sem nada precisa dizer que
                // é um alvo de arraste, senão parece região quebrada.
                <p className="rounded-lg border border-dashed border-slate-200 px-2 py-4 text-center text-2xs text-slate-500">
                  {realce ? 'Solte aqui' : 'Nada aqui'}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
