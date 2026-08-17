import { useMemo, useState } from 'react';
import { Building2, CalendarOff, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Tarefa } from '../../types';
import {
  DIAS_SEMANA,
  agruparPorPrazo,
  deslocarMes,
  gradeDoMes,
  inicioDoMes,
  mesDe,
  rotuloMes,
} from '../../lib/calendarioTarefas';
import { formatarDataBR, hojeISO } from '../../lib/data';
import { statusTom } from '../../constants/status';
import { Button, Card, CHIP, FOCO, IconButton } from '../ui';
import { MIME_TAREFA } from './constantes';

interface CalendarioProps {
  tarefas: Tarefa[];
  nomeObra: (id?: string) => string | undefined;
  /**
   * Arrastar para outro dia GRAVA `prazo`, e o `campo` não pode: a trigger
   * `trg_tarefa_campo_so_status` recusa qualquer coluna que não seja `status`.
   * Sem esta prop o arraste dele morreria no servidor com um toast de erro para
   * um gesto que a tela nunca deveria ter oferecido.
   */
  podeReagendar: boolean;
  podeEditar: boolean;
  onReagendar: (id: string, prazo?: string) => void;
  onEditar: (t: Tarefa) => void;
  /** Cria já com o dia clicado no campo de prazo. */
  onNova: (prazo?: string) => void;
}

/** Quantos cartões cabem numa célula antes de o resto virar "+N". */
const LIMITE_POR_DIA = 3;

/** O alvo de soltar que significa "tirar o prazo" — o trilho, não uma data. */
const SEM_DATA = 'sem-data';

/**
 * O calendário do mês — a terceira leitura da MESMA tabela `tarefas`.
 *
 * A pauta ("minhas do dia") responde "o que eu faço agora"; o quadro responde
 * "onde está cada coisa"; o calendário responde a pergunta que nenhum dos dois
 * respondia: **em que dia isto cai, e a semana que vem está cheia?**. É a leitura
 * que o escritório usa para prometer prazo ao cliente sem abrir planilha.
 *
 * ## O que o desenho pegou emprestado do Notion, e o que não
 *
 * Emprestado: a grade de semanas inteiras com hairline entre as células, o dia
 * de hoje marcado por disco, os dias do mês vizinho presentes e apagados, o "+"
 * que aparece na célula sob o cursor, o "+N" que expande o dia cheio, e o trilho
 * "Sem data" de onde se arrasta uma tarefa para dentro do calendário.
 *
 * NÃO emprestado: a calha cinza permanente por trás de cada bloco. O redesenho
 * de 14/ago/2026 tirou a moldura fixa das colunas do quadro justamente porque
 * caixas cinzas lado a lado competem com os cartões que elas contêm; a moldura
 * volta só durante o arraste, quando ela tem trabalho a fazer.
 *
 * ## A grade não é uma tabela
 *
 * Foi tentador escrever isto como `<table>` — sete colunas, cabeçalho de dias da
 * semana. Mas a célula aqui não é um dado numa interseção linha×coluna: é uma
 * região com título (o dia), uma lista dentro e um botão de criar. `role="grid"`
 * pediria navegação por setas que este componente não implementa, e uma tabela
 * mentiria sobre a relação entre as células. Cada dia é uma `<section>` com
 * rótulo próprio, e o caminho de teclado é o que já existe: Tab até a tarefa,
 * Enter para abrir.
 */
export default function Calendario({
  tarefas,
  nomeObra,
  podeReagendar,
  podeEditar,
  onReagendar,
  onEditar,
  onNova,
}: CalendarioProps) {
  const hoje = hojeISO();
  const [ancora, setAncora] = useState(() => inicioDoMes(hoje));
  /** Dia sob o cursor durante o arraste — só realce; o estado real é `prazo`. */
  const [alvo, setAlvo] = useState<string | null>(null);
  /** Os dias em que a pessoa pediu para ver tudo, e não só os três primeiros. */
  const [expandidos, setExpandidos] = useState<string[]>([]);
  /**
   * O dia tocado na versão estreita da grade. Só existe abaixo de `sm`: ali a
   * célula mede ~46 px e não cabe título nenhum (medido — cada tarefa virava uma
   * ÚNICA letra truncada), então a célula mostra pontos e a lista do dia abre
   * embaixo. Começa em hoje, que é o dia que alguém abrindo o app quer ver.
   */
  const [diaAberto, setDiaAberto] = useState(hoje);

  const { porDia, semPrazo } = useMemo(() => agruparPorPrazo(tarefas), [tarefas]);
  const semanas = useMemo(() => gradeDoMes(ancora), [ancora]);
  const mesAtual = mesDe(ancora);

  const noMes = useMemo(
    () =>
      Object.entries(porDia).reduce(
        (n, [dia, itens]) => (mesDe(dia) === mesAtual ? n + itens.length : n),
        0
      ),
    [porDia, mesAtual]
  );

  /**
   * Solta o card num dia (ou no trilho, quando `dia` é indefinido).
   *
   * A guarda de "mesmo lugar" é a mesma do quadro, e existe pelo mesmo motivo:
   * sem ela, todo arraste em que a pessoa desiste no meio e solta de volta vira
   * uma escrita no servidor — e, com o otimista, um piscar do cartão.
   */
  const soltar = (e: React.DragEvent, dia?: string) => {
    e.preventDefault();
    setAlvo(null);
    const id = e.dataTransfer.getData(MIME_TAREFA);
    if (!id) return;
    const atual = tarefas.find((t) => t.id === id);
    if (!atual || (atual.prazo ?? undefined) === dia) return;
    onReagendar(id, dia);
  };

  const aceitarArraste = (e: React.DragEvent, chave: string) => {
    // Sem o preventDefault o navegador RECUSA o drop e o cursor mostra
    // "proibido" — o erro clássico do drag-and-drop HTML5.
    if (!podeReagendar || !e.dataTransfer.types.includes(MIME_TAREFA)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setAlvo(chave);
  };

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-slate-900 first-letter:uppercase">
          {/* `first-letter:uppercase` e não `capitalize`: o rótulo é "agosto de
              2026", e o `capitalize` do CSS pega TODA palavra — sairia "Agosto
              De 2026". */}
          {rotuloMes(ancora)}
        </h3>

        <div className="flex items-center gap-1">
          <IconButton
            rotulo="Mês anterior"
            tamanho="sm"
            tom="acao"
            onClick={() => setAncora((a) => deslocarMes(a, -1))}
          >
            <ChevronLeft size={14} />
          </IconButton>
          <Button variante="secundario" tamanho="sm" onClick={() => setAncora(inicioDoMes(hoje))}>
            Hoje
          </Button>
          <IconButton
            rotulo="Próximo mês"
            tamanho="sm"
            tom="acao"
            onClick={() => setAncora((a) => deslocarMes(a, 1))}
          >
            <ChevronRight size={14} />
          </IconButton>
        </div>

        <p className="ml-auto text-2xs text-slate-500">
          <span className="data-font font-bold text-slate-900">{noMes}</span>{' '}
          {noMes === 1 ? 'tarefa com prazo neste mês' : 'tarefas com prazo neste mês'}
        </p>
      </header>

      {/* Painel + trilho, o mesmo desenho de Início, Financeiro e Obra · Geral:
          à esquerda o que se acompanha, à direita o que pede ação. Abaixo de
          `lg` colapsa e o trilho vai para o fim. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)] gap-4 items-start">
        <div className="space-y-3">
          <Card semPadding className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {DIAS_SEMANA.map((dia) => (
                <span
                  key={dia}
                  className="px-1.5 py-1.5 text-center text-2xs font-bold uppercase tracking-wider text-slate-500 sm:px-2 sm:text-left"
                >
                  {dia}
                </span>
              ))}
            </div>

            {/* O hairline entre células é o `gap` deixando o fundo aparecer: uma
                borda por célula duplicaria de espessura nos encontros e brigaria
                com a borda do `Card` nas quatro pontas. */}
            <div className="grid grid-cols-7 gap-px bg-slate-200">
              {semanas.flat().map((dia) => (
                <Dia
                  key={dia}
                  dia={dia}
                  itens={porDia[dia] ?? []}
                  doMes={mesDe(dia) === mesAtual}
                  ehHoje={dia === hoje}
                  selecionado={dia === diaAberto}
                  expandido={expandidos.includes(dia)}
                  realce={alvo === dia}
                  nomeObra={nomeObra}
                  podeReagendar={podeReagendar}
                  podeEditar={podeEditar}
                  onExpandir={() => setExpandidos((e) => [...e, dia])}
                  onSelecionar={() => setDiaAberto(dia)}
                  onEditar={onEditar}
                  onNova={onNova}
                  onDragOver={(e) => aceitarArraste(e, dia)}
                  onDragLeave={() => setAlvo((a) => (a === dia ? null : a))}
                  onDrop={(e) => soltar(e, dia)}
                />
              ))}
            </div>
          </Card>

          <DiaAberto
            dia={diaAberto}
            itens={porDia[diaAberto] ?? []}
            nomeObra={nomeObra}
            podeEditar={podeEditar}
            onEditar={onEditar}
            onNova={onNova}
          />
        </div>

        <SemData
          itens={semPrazo}
          realce={alvo === SEM_DATA}
          nomeObra={nomeObra}
          podeReagendar={podeReagendar}
          podeEditar={podeEditar}
          onEditar={onEditar}
          onDragOver={(e) => aceitarArraste(e, SEM_DATA)}
          onDragLeave={() => setAlvo((a) => (a === SEM_DATA ? null : a))}
          onDrop={(e) => soltar(e, undefined)}
        />
      </div>
    </div>
  );
}

interface DiaProps {
  dia: string;
  itens: Tarefa[];
  doMes: boolean;
  ehHoje: boolean;
  /** Só desenha abaixo de `sm`, onde a célula é resumo e a lista abre embaixo. */
  selecionado: boolean;
  expandido: boolean;
  realce: boolean;
  nomeObra: (id?: string) => string | undefined;
  podeReagendar: boolean;
  podeEditar: boolean;
  onExpandir: () => void;
  onSelecionar: () => void;
  onEditar: (t: Tarefa) => void;
  onNova: (prazo?: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

/** Quantos pontos a célula estreita desenha antes de dizer "+n". */
const LIMITE_PONTOS = 3;

function Dia({
  dia,
  itens,
  doMes,
  ehHoje,
  selecionado,
  expandido,
  realce,
  nomeObra,
  podeReagendar,
  podeEditar,
  onExpandir,
  onSelecionar,
  onEditar,
  onNova,
  onDragOver,
  onDragLeave,
  onDrop,
}: DiaProps) {
  const visiveis = expandido ? itens : itens.slice(0, LIMITE_POR_DIA);
  const ocultas = itens.length - visiveis.length;
  const numero = Number(dia.slice(8));

  return (
    <section
      // O rótulo carrega a data por extenso porque "12" sozinho não localiza
      // ninguém num leitor de tela — e a contagem evita ter de percorrer a lista
      // para saber se o dia tem algo.
      aria-label={`${formatarDataBR(dia)} — ${itens.length} ${itens.length === 1 ? 'tarefa' : 'tarefas'}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group relative flex min-h-14 flex-col gap-1 p-1 transition sm:min-h-28 sm:p-1.5
        ${realce ? 'bg-blue-50' : doMes ? 'bg-white' : 'bg-slate-50'}
        ${selecionado ? 'ring-2 ring-inset ring-blue-500 sm:ring-0' : ''}`}
    >
      {/* O alvo de toque da versão estreita: cobre a célula inteira e some a
          partir de `sm`, onde cada tarefa já é um botão próprio. É `<button>` e
          não `onClick` na `<section>` para não inventar um controle que o
          teclado não alcança. */}
      <button
        type="button"
        aria-label={`Ver as tarefas de ${formatarDataBR(dia)}`}
        onClick={onSelecionar}
        className={`absolute inset-0 z-10 sm:hidden ${FOCO}`}
      />

      <div className="flex items-center justify-between gap-1">
        <span
          className={`data-font mx-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-2xs font-bold sm:mx-0 ${
            ehHoje ? 'bg-blue-600 text-white' : doMes ? 'text-slate-700' : 'text-slate-500'
          }`}
        >
          {numero}
        </span>

        {/* Criar direto no dia — o gesto que o Notion ensinou e que economiza a
            digitação da data. Fica escondido até o cursor entrar na célula
            (senão são 35 "+" azuis competindo com as tarefas), mas volta a
            aparecer no foco de teclado e no dedo, onde não existe hover. */}
        {podeEditar && (
          <IconButton
            rotulo={`Nova tarefa em ${formatarDataBR(dia)}`}
            tamanho="sm"
            tom="acao"
            onClick={() => onNova(dia)}
            className="hidden opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 sm:inline-flex pointer-coarse:opacity-100"
          >
            <Plus size={13} />
          </IconButton>
        )}
      </div>

      {/* A célula estreita: um ponto por tarefa, na cor do status. Sem título —
          medido no navegador, a 390 px de viewport a coluna tem 46 px e o
          título saía truncado em UMA letra, que não informa nada e ainda finge
          que informa. */}
      {itens.length > 0 && (
        <div className="flex items-center justify-center gap-0.5 sm:hidden" aria-hidden="true">
          {itens.slice(0, LIMITE_PONTOS).map((t) => (
            <span
              key={t.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: CHIP[statusTom('tarefa', t.status)].ponto }}
            />
          ))}
          {itens.length > LIMITE_PONTOS && (
            <span className="data-font text-2xs font-semibold leading-none text-slate-500">
              +{itens.length - LIMITE_PONTOS}
            </span>
          )}
        </div>
      )}

      <ul className="hidden flex-col gap-1 sm:flex">
        {visiveis.map((t) => (
          <CartaoDoDia
            key={t.id}
            tarefa={t}
            obra={nomeObra(t.projetoId)}
            podeReagendar={podeReagendar}
            podeEditar={podeEditar}
            onEditar={onEditar}
          />
        ))}
      </ul>

      {ocultas > 0 && (
        <button
          type="button"
          onClick={onExpandir}
          className="hidden rounded-lg px-1.5 py-0.5 text-left text-2xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:block"
        >
          + {ocultas} {ocultas === 1 ? 'tarefa' : 'tarefas'}
        </button>
      )}

      {/* A célula vazia não anuncia nada em repouso — 35 caixas dizendo "nada
          aqui" seriam o ruído que a grade existe para evitar. Ela só se declara
          alvo quando há um card no ar. */}
      {realce && itens.length === 0 && (
        <span className="text-2xs font-semibold text-blue-600">Solte aqui</span>
      )}
    </section>
  );
}

interface DiaAbertoProps {
  dia: string;
  itens: Tarefa[];
  nomeObra: (id?: string) => string | undefined;
  podeEditar: boolean;
  onEditar: (t: Tarefa) => void;
  onNova: (prazo?: string) => void;
}

/**
 * A lista do dia tocado — a metade do calendário estreito.
 *
 * Existe só abaixo de `sm`, e não é redundância: ali a célula virou resumo
 * (pontos), então sem este painel a grade mostraria QUE há trabalho num dia e
 * nunca QUAL. Acima de `sm` some inteiro, porque a célula já carrega os títulos.
 *
 * O arraste não aparece aqui de propósito: `dragstart` do HTML5 não existe em
 * tela de toque, em navegador nenhum. Quem está no telefone reagenda pelo campo
 * "Prazo" do formulário, que o toque no cartão abre.
 */
function DiaAberto({ dia, itens, nomeObra, podeEditar, onEditar, onNova }: DiaAbertoProps) {
  return (
    <section aria-label={`Tarefas de ${formatarDataBR(dia)}`} className="space-y-2 sm:hidden">
      <header className="flex items-center gap-2">
        <h4 className="text-xs font-bold text-slate-900">{formatarDataBR(dia)}</h4>
        {/* Zero não desenha: a frase logo abaixo já diz que o dia está livre, e
            um "0" ao lado da data é a mesma informação pela segunda vez. */}
        {itens.length > 0 && (
          <span className="data-font text-2xs font-semibold text-slate-500">{itens.length}</span>
        )}
        {podeEditar && (
          <IconButton
            rotulo={`Nova tarefa em ${formatarDataBR(dia)}`}
            tamanho="sm"
            tom="acao"
            onClick={() => onNova(dia)}
            className="ml-auto"
          >
            <Plus size={13} />
          </IconButton>
        )}
      </header>

      {itens.length === 0 ? (
        <p className="text-2xs text-slate-500">Nada marcado para este dia.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {itens.map((t) => (
            <CartaoDoDia
              key={t.id}
              tarefa={t}
              obra={nomeObra(t.projetoId)}
              podeReagendar={false}
              podeEditar={podeEditar}
              onEditar={onEditar}
              detalhado
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface CartaoProps {
  tarefa: Tarefa;
  obra?: string;
  podeReagendar: boolean;
  podeEditar: boolean;
  onEditar: (t: Tarefa) => void;
  /** O trilho mostra a obra; a célula do dia não tem largura para ela. */
  detalhado?: boolean;
}

/**
 * A tarefa dentro de uma célula, ou dentro do trilho.
 *
 * O `<li>` é quem arrasta e o `<button>` é quem age: `dragstart` borbulha até o
 * ancestral arrastável, então o botão continua clicável e focável enquanto o
 * item inteiro segue o cursor. Um `<button draggable>` funciona, mas mistura os
 * dois papéis num elemento cuja semântica já é "aperte-me".
 *
 * Quem não pode editar não recebe botão nenhum: o `campo` enxerga o calendário
 * (as tarefas dele) e não tem o que fazer ali além de olhar. Um botão que abre
 * um formulário que o servidor recusa é pior que nenhum botão.
 */
function CartaoDoDia({ tarefa, obra, podeReagendar, podeEditar, onEditar, detalhado = false }: CartaoProps) {
  const concluida = tarefa.status === 'Concluída';
  const ponto = CHIP[statusTom('tarefa', tarefa.status)].ponto;

  const corpo = (
    <>
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ponto }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-2xs font-semibold ${concluida ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
          {tarefa.titulo}
        </span>
        {detalhado && obra && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs text-slate-500">
            <Building2 size={10} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{obra}</span>
          </span>
        )}
      </span>
    </>
  );

  const aparencia =
    'flex w-full items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-left transition';

  return (
    <li
      draggable={podeReagendar}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_TAREFA, tarefa.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={podeReagendar ? 'cursor-grab active:cursor-grabbing' : ''}
    >
      {podeEditar ? (
        <button
          type="button"
          onClick={() => onEditar(tarefa)}
          title={tarefa.titulo}
          className={`${aparencia} hover:border-blue-300 hover:bg-blue-50/40`}
        >
          {corpo}
        </button>
      ) : (
        <span className={aparencia} title={tarefa.titulo}>
          {corpo}
        </span>
      )}
    </li>
  );
}

interface SemDataProps {
  itens: Tarefa[];
  realce: boolean;
  nomeObra: (id?: string) => string | undefined;
  podeReagendar: boolean;
  podeEditar: boolean;
  onEditar: (t: Tarefa) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

/**
 * O trilho das tarefas sem prazo — a metade do módulo que um calendário sozinho
 * esconderia.
 *
 * A maioria das tarefas de escritório nasce sem data ("cobrar a medição da Vila
 * Nova"), e uma visão que só desenha o que tem prazo faria essas sumirem sem
 * avisar. Aqui elas ficam ao lado da grade, e o gesto de dar prazo é arrastar
 * para o dia — sem abrir formulário nenhum.
 *
 * É também o caminho de volta: soltar um cartão AQUI limpa o prazo.
 */
function SemData({
  itens,
  realce,
  nomeObra,
  podeReagendar,
  podeEditar,
  onEditar,
  onDragOver,
  onDragLeave,
  onDrop,
}: SemDataProps) {
  return (
    <section
      aria-label={`Sem data — ${itens.length} ${itens.length === 1 ? 'tarefa' : 'tarefas'}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-col gap-2 rounded-xl border-2 border-dashed p-1.5 transition ${
        realce ? 'border-blue-400 bg-blue-50/60' : 'border-transparent'
      }`}
    >
      <header className="flex items-center gap-2 px-1.5">
        <CalendarOff size={13} className="text-slate-500" aria-hidden="true" />
        <h3 className="text-xs font-bold text-slate-900">Sem data</h3>
        <span className="data-font text-2xs font-semibold text-slate-500">{itens.length}</span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {itens.map((t) => (
          <CartaoDoDia
            key={t.id}
            tarefa={t}
            obra={nomeObra(t.projetoId)}
            podeReagendar={podeReagendar}
            podeEditar={podeEditar}
            onEditar={onEditar}
            detalhado
          />
        ))}
      </ul>

      {itens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-2 py-4 text-center text-2xs text-slate-500">
          {realce ? 'Solte aqui para tirar o prazo' : 'Tudo o que está em aberto tem data.'}
        </p>
      ) : (
        podeReagendar && (
          <p className="px-1.5 text-2xs text-slate-500">
            Arraste para um dia da grade para dar prazo — ou de volta para cá para tirá-lo.
          </p>
        )
      )}
    </section>
  );
}
