import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { StatusTarefa, Tarefa } from '../../types';
import { COLUNAS, agruparPorStatus } from '../../lib/tarefas';
import { IconButton } from '../ui';
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
  /** Criar já na coluna — o "+" do cabeçalho. Ausente = a coluna não oferece. */
  onNova?: (status: StatusTarefa) => void;
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
  onNova,
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
    /* REDESENHO 14/ago/2026 — a faixa que rolava na horizontal virou a GRADE
       do mockup "Analizze - App".

       O quadro tem quatro colunas fixas, e com `w-64` numa faixa rolante a
       quarta ("Concluída") ficava fora da tela em qualquer notebook: para ver
       o que terminou era preciso descobrir que aquela região rolava para o
       lado. Com `auto-fit` as quatro dividem a largura disponível e colapsam
       em uma só no celular — o mesmo raciocínio do `GRADE_CARTOES`, e aqui com
       um ganho a mais: quem arrasta enxerga a coluna de destino sem antes
       rolar até ela. */
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4 items-start">
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
            /* A coluna perdeu a moldura permanente: no mockup ela é uma seção
               aberta, e quatro caixas cinzas lado a lado competiam com os
               cartões que elas contêm. A moldura volta SÓ durante o arraste,
               que é o único momento em que a coluna precisa se anunciar como
               alvo — e aí ela é tracejada, a convenção de "solte aqui". */
            className={`group/coluna flex flex-col gap-2.5 rounded-xl border-2 border-dashed p-1.5 transition ${
              realce ? 'border-blue-400 bg-blue-50/60' : 'border-transparent'
            }`}
          >
            <header className="flex items-center gap-2 px-1.5">
              <span className={`h-2 w-2 rounded-full ${BARRA_COLUNA[coluna]}`} aria-hidden="true" />
              <h3 className="text-xs font-bold text-slate-900">
                {TITULO_COLUNA[coluna]}
              </h3>
              {/* A contagem perdeu a pastilha cinza: quatro pastilhas na mesma
                  linha de leitura pesavam mais que os títulos que elas contam,
                  e o número é metadado, não selo. */}
              <span className="data-font text-2xs font-semibold text-slate-500">{itens.length}</span>

              {/* Criar já na coluna. Escondido até o cursor entrar — quatro "+"
                  permanentes disputariam com o botão "Nova tarefa" do topo, que
                  é a ação principal da tela —, e de volta no foco de teclado e
                  no dedo, onde hover não existe. */}
              {onNova && (
                <IconButton
                  rotulo={`Nova tarefa em ${coluna}`}
                  tamanho="sm"
                  tom="acao"
                  onClick={() => onNova(coluna)}
                  className="ml-auto opacity-0 transition group-hover/coluna:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                >
                  <Plus size={13} />
                </IconButton>
              )}
            </header>

            <div className="flex min-h-24 flex-col gap-2">
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
