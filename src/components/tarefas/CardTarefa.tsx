import { useRef, useState } from 'react';
import { Building2, CalendarDays, Check, MoreVertical, Pencil, Trash2, User } from 'lucide-react';
import type { StatusTarefa, Tarefa } from '../../types';
import { StatusBadge } from '../../constants/status';
import { COLUNAS, situacaoPrazo } from '../../lib/tarefas';
import { formatarDataBR } from '../../lib/data';
import { Card, Chip, IconButton, type TomChip } from '../ui';
import { useEscapeParaFechar } from '../../hooks/useEscapeParaFechar';
import { MIME_TAREFA } from './constantes';

interface CardTarefaProps {
  tarefa: Tarefa;
  /** Já resolvido pelo pai — o card não sabe procurar em `pessoas`. */
  responsavel?: string;
  obra?: string;
  podeMover: boolean;
  /** Editar e excluir andam juntos: quem não pauta, não apaga. */
  podeEditar: boolean;
  onMover: (id: string, status: StatusTarefa) => void;
  onEditar: (t: Tarefa) => void;
  onExcluir: (t: Tarefa) => void;
}

/**
 * Tom do chip de prazo. Atrasada é a única que grita — o resto é informação.
 *
 * Virou `<Chip>` em 14/ago/2026 (era texto colorido): o mockup "Analizze -
 * App" mostra prazo como pill ao lado da prioridade, e as duas competem pelo
 * mesmo olhar no cartão — texto solto ao lado de uma pill perdia a disputa.
 */
const TOM_PRAZO: Record<ReturnType<typeof situacaoPrazo>, TomChip> = {
  atrasada: 'negativo',
  hoje: 'atencao',
  futura: 'neutro',
  'sem-prazo': 'neutro',
};

export default function CardTarefa({
  tarefa,
  responsavel,
  obra,
  podeMover,
  podeEditar,
  onMover,
  onEditar,
  onExcluir,
}: CardTarefaProps) {
  const prazo = situacaoPrazo(tarefa.prazo);
  const concluida = tarefa.status === 'Concluída';

  return (
    <Card
      // O card inteiro arrasta, e não uma alça: alvo maior no toque e no mouse.
      // Quem não pode mover não arrasta — um arraste que sempre volta ensina que
      // o quadro está quebrado.
      //
      // NÃO usa `interativo`: arrastar não é "clicar o card", e `IconButton`s
      // internos já têm o próprio hover — `cursor-pointer` no card mentiria.
      draggable={podeMover}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_TAREFA, tarefa.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      semPadding
      className={`group/card p-2.5 transition hover:border-blue-300 hover:shadow-[0_12px_24px_-8px_rgba(16,24,40,0.14)] ${podeMover ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        <p className={`flex-1 text-xs font-semibold leading-snug ${concluida ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
          {tarefa.titulo}
        </p>
        <MenuDoCard
          tarefa={tarefa}
          podeMover={podeMover}
          podeEditar={podeEditar}
          onMover={onMover}
          onEditar={onEditar}
          onExcluir={onExcluir}
        />
      </div>

      {tarefa.descricao && (
        <p className="mt-1 line-clamp-2 text-2xs leading-snug text-slate-500">{tarefa.descricao}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs">
        <StatusBadge type="prioridade" status={tarefa.prioridade} size="sm" />

        {tarefa.prazo && (
          <Chip tom={TOM_PRAZO[prazo]}>
            <CalendarDays size={11} aria-hidden="true" />
            {/* `formatarDataBR` e não `new Date`: `prazo` é coluna `date`. */}
            {formatarDataBR(tarefa.prazo)}
            {prazo === 'atrasada' && !concluida && <span className="sr-only">— atrasada</span>}
          </Chip>
        )}

        {obra && (
          <span className="inline-flex min-w-0 items-center gap-1 text-slate-500">
            <Building2 size={11} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{obra}</span>
          </span>
        )}

        <span className={`inline-flex min-w-0 items-center gap-1 ${responsavel ? 'text-slate-500' : 'text-amber-700 font-semibold'}`}>
          <User size={11} className="shrink-0" aria-hidden="true" />
          {/* "Sem responsável" é um estado que pede ação, não um campo vazio. */}
          <span className="truncate">{responsavel ?? 'Sem responsável'}</span>
        </span>
      </div>
    </Card>
  );
}

/**
 * O menu que torna o quadro operável sem mouse.
 *
 * O arrastar do HTML5 não tem equivalente de teclado — nenhum. Sem este menu, o
 * quadro inteiro seria inacessível para quem navega por Tab, e as ações do card
 * (editar, excluir) não teriam onde morar no celular, onde não existe hover.
 */
function MenuDoCard({
  tarefa,
  podeMover,
  podeEditar,
  onMover,
  onEditar,
  onExcluir,
}: Omit<CardTarefaProps, 'responsavel' | 'obra'>) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEscapeParaFechar(aberto, () => setAberto(false));

  if (!podeMover && !podeEditar) return null;

  return (
    <div
      ref={caixa}
      /* O "…" recua até o cartão ser tocado — é o cartão que carrega o título e
         as propriedades, e um botão permanente no canto superior direito de
         cada um deles vira uma coluna de pontinhos que o olho percorre antes do
         texto. Volta a aparecer com o menu ABERTO (senão ele some debaixo do
         próprio menu quando o cursor sai do cartão), no foco de teclado
         (`focus-within`, que alcança o botão de dentro) e sob `pointer-coarse`,
         onde hover não existe e esconder é esconder de vez. */
      className={`relative shrink-0 transition focus-within:opacity-100 group-hover/card:opacity-100 pointer-coarse:opacity-100 ${
        aberto ? 'opacity-100' : 'opacity-0'
      }`}
      // Fechar quando o foco sai do menu cobre teclado e clique fora de uma vez,
      // sem um backdrop invisível capturando cliques da página inteira.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
    >
      <IconButton
        rotulo={`Ações da tarefa ${tarefa.titulo}`}
        tamanho="sm"
        tom="acao"
        aria-expanded={aberto}
        aria-haspopup="menu"
        onClick={() => setAberto((v) => !v)}
      >
        <MoreVertical size={14} />
      </IconButton>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {podeMover && (
            <>
              <p className="px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                Mover para
              </p>
              {COLUNAS.map((coluna) => {
                const atual = coluna === tarefa.status;
                return (
                  <button
                    key={coluna}
                    type="button"
                    role="menuitem"
                    disabled={atual}
                    onClick={() => {
                      onMover(tarefa.id, coluna);
                      setAberto(false);
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-2xs text-slate-700
                      hover:bg-slate-100 disabled:cursor-default disabled:font-semibold disabled:hover:bg-transparent"
                  >
                    <Check size={12} className={atual ? 'text-blue-600' : 'invisible'} aria-hidden="true" />
                    {coluna}
                  </button>
                );
              })}
            </>
          )}

          {podeEditar && (
            <>
              {podeMover && <div className="my-1 border-t border-slate-200" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onEditar(tarefa);
                  setAberto(false);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-2xs text-slate-700 hover:bg-slate-100"
              >
                <Pencil size={12} aria-hidden="true" />
                Editar
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onExcluir(tarefa);
                  setAberto(false);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-2xs text-rose-600 hover:bg-rose-50"
              >
                <Trash2 size={12} aria-hidden="true" />
                Excluir
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
