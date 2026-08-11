import { useCallback, useMemo, useState } from 'react';
import {
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Diamond,
  FolderPlus,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  EdicaoEtapa,
  EtapaCronograma,
  EtapaOrcamentoVinculo,
  Funcionario,
  MedicaoObra,
  MudancasCronograma,
  NovaMedicao,
  PatchOrdem,
  Projeto,
} from '../../types';
import { formatarDataBR } from '../../lib/data';
import { formatarQuantidade } from '../../lib/medicaoQuantidade';
import { getWorkingDays } from '../../lib/diasUteis';
import { aplainar } from '../../lib/cronograma/wbs';
import { motivoParaNaoAgrupar } from '../../lib/cronograma/arrasteEap';
import {
  desindentar,
  indentar,
  moverEntreIrmaos,
} from '../../lib/cronograma/reordenar';
import { useFeedback } from '../FeedbackContext';
import { useArrasteEap } from './useArrasteEap';
import ModalEtapa, { AlvoEtapa } from './ModalEtapa';
import ModalMedicao from './ModalMedicao';
import ModalVinculo, { AlvoVinculo } from './ModalVinculo';
import Gantt from './gantt/Gantt';
import PainelDependencias from './gantt/PainelDependencias';
import type { DadosDaObra } from './useDadosDaObra';
import { Button, IconButton } from '../ui';

interface Props {
  projeto: Projeto;
  dados: DadosDaObra;
  funcionarios: Funcionario[];
  podeGerenciar: boolean;
  podeMedir: boolean;
  /** Obra pausada ou finalizada não aceita boletim novo. */
  medicaoBloqueada: boolean;
  onAddEtapa: (etapa: EtapaCronograma) => Promise<boolean>;
  onUpdateEtapa: (id: string, patch: EdicaoEtapa) => Promise<boolean>;
  onRemoveEtapa: (id: string) => Promise<boolean>;
  onAplicarCronograma: (mudancas: MudancasCronograma) => Promise<boolean>;
  onSalvarBaseline: () => Promise<boolean>;
  onAddVinculo: (vinculo: EtapaOrcamentoVinculo) => Promise<boolean>;
  onRemoveVinculo: (id: string) => void;
  onAddMedicao: (med: NovaMedicao, fotos: File[]) => Promise<MedicaoObra | null>;
  onUpdateProjetoSituacao: (projId: string, situacao: Projeto['situacao']) => Promise<boolean>;
}

export default function AbaCronograma({
  projeto,
  dados,
  funcionarios,
  podeGerenciar,
  podeMedir,
  medicaoBloqueada,
  onAddEtapa,
  onUpdateEtapa,
  onRemoveEtapa,
  onAplicarCronograma,
  onSalvarBaseline,
  onAddVinculo,
  onRemoveVinculo,
  onAddMedicao,
  onUpdateProjetoSituacao,
}: Props) {
  const { toast, confirm } = useFeedback();
  const {
    etapas,
    folhas,
    arvore,
    dependencias,
    folgas,
    percentualDaEtapa,
    itens,
    vinculos,
    medicoes,
    insumos,
    pesoAlocadoPorItem,
  } = dados;

  const [alvoEtapa, setAlvoEtapa] = useState<AlvoEtapa | null>(null);
  const [alvoVinculo, setAlvoVinculo] = useState<AlvoVinculo | null>(null);
  const [etapaParaMedir, setEtapaParaMedir] = useState<string | null>(null);
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());
  const [etapaDasLigacoes, setEtapaDasLigacoes] = useState<EtapaCronograma | null>(null);

  const nomeDoEncarregado = (id: string) =>
    funcionarios.find((f) => f.id === id)?.nome || 'Profissional não cadastrado';

  /**
   * As linhas na ordem em que a tela desenha — e é essa posição que o Gantt usa
   * como coordenada vertical. Grade e gráfico leem da MESMA lista de propósito:
   * duas travessias independentes divergiriam no primeiro grupo recolhido, e a
   * barra passaria a apontar para a linha errada.
   */
  const linhas = useMemo(() => aplainar(arvore, recolhidos), [arvore, recolhidos]);

  /**
   * Quem já tem orçamento ou boletim não pode virar grupo — `fn_etapa_pai_sem_execucao`
   * recusaria, e a recusa chegaria só depois do formulário preenchido.
   */
  const etapasComExecucao = useMemo(() => {
    const ids = new Set<string>();
    for (const v of vinculos) ids.add(v.etapaId);
    for (const m of medicoes) ids.add(m.etapaId);
    return ids;
  }, [vinculos, medicoes]);

  const alternarRecolhido = (id: string) =>
    setRecolhidos((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(id)) proximo.add(id);
      return proximo;
    });

  /**
   * Reposicionar na EAP passa SEMPRE por aqui, e sempre em lote.
   *
   * Mover uma etapa renumera a lista de irmãos inteira, e o `unique
   * (projeto, pai, ordem)` do banco é deferrable — as N linhas só podem ser
   * gravadas na mesma transação. Uma tecla, uma RPC.
   */
  const reposicionar = useCallback(
    async (patches: PatchOrdem[]) => {
      if (patches.length === 0) return;
      await onAplicarCronograma({ ordens: patches });
    },
    [onAplicarCronograma]
  );

  /**
   * O arraste da linha pela alça: o mesmo `mover()` que o teclado usa, com o
   * destino escolhido pelo ponteiro.
   *
   * Grava direto, sem a confirmação que o arraste do GANTT pede: reposicionar
   * na EAP não move data de ninguém, e portanto não há sucessora surpresa para
   * avisar. O que ele muda é a numeração dos irmãos — visível na hora, e
   * desfeito arrastando de volta.
   */
  const { estado: arraste, alcas: alcasDeArraste } = useArrasteEap({
    etapas,
    comExecucao: etapasComExecucao,
    habilitado: podeGerenciar,
    aoSoltar: (patches, arrastadaId) => {
      // Soltar dentro de um grupo RECOLHIDO expande o grupo: sem isto a etapa
      // some da tela no exato gesto em que foi movida, e o único sinal de que
      // deu certo é o contador de frentes do grupo mudando de número.
      const pai = patches.find((p) => p.id === arrastadaId)?.parentId;
      if (pai) {
        setRecolhidos((atual) => {
          if (!atual.has(pai)) return atual;
          const proximo = new Set(atual);
          proximo.delete(pai);
          return proximo;
        });
      }
      void reposicionar(patches);
    },
  });

  /**
   * Em que posição da lista desenhada a faixa azul entra, e com que recuo.
   *
   * `null` quando não há arraste, quando o alvo é recusado ou quando a queda é
   * DENTRO (aí quem marca é o fundo da própria linha do grupo).
   *
   * O caso que obriga a pensar é "depois de um grupo expandido": a etapa vai
   * virar irmã do GRUPO, e desenhar a faixa logo abaixo dele — entre o grupo e
   * a primeira frente dele — diria exatamente o contrário do que vai acontecer.
   * Como `linhas` está em pré-ordem, a subárvore visível do alvo é o bloco
   * contíguo de linhas com nível maior que o dele.
   */
  const marcaDeQueda = useMemo(() => {
    if (!arraste?.alvoId || arraste.recusa || arraste.posicao === 'dentro') return null;
    const i = linhas.findIndex((l) => l.etapa.id === arraste.alvoId);
    if (i < 0) return null;
    if (arraste.posicao === 'antes') return { indice: i, nivel: linhas[i].nivel };
    let fim = i + 1;
    while (fim < linhas.length && linhas[fim].nivel > linhas[i].nivel) fim += 1;
    return { indice: fim, nivel: linhas[i].nivel };
  }, [arraste, linhas]);

  /**
   * `Alt+setas` continua sendo o caminho de teclado, e não um consolo: é a
   * convenção de todo outliner, funciona sem mouse e dispensa a mira fina que o
   * arraste exige.
   */
  const teclasDaLinha = (etapa: EtapaCronograma) => (e: React.KeyboardEvent) => {
    if (!podeGerenciar || !e.altKey) return;
    const acoes: Record<string, () => PatchOrdem[]> = {
      ArrowRight: () => indentar(etapas, etapa.id),
      ArrowLeft: () => desindentar(etapas, etapa.id),
      ArrowUp: () => moverEntreIrmaos(etapas, etapa.id, -1),
      ArrowDown: () => moverEntreIrmaos(etapas, etapa.id, 1),
    };
    const acao = acoes[e.key];
    if (!acao) return;
    e.preventDefault();
    void reposicionar(acao());
  };

  /**
   * O que acontece ao soltar uma barra.
   *
   * Quando o movimento arrasta sucessoras junto, a gravação passa por uma
   * confirmação que DIZ QUANTAS são. Foi a escolha explícita do usuário, e é a
   * diferença entre uma ferramenta que replaneja e uma que surpreende: mexer em
   * uma barra pode empurrar meia obra, e a prévia tracejada durante o arraste
   * mostra onde, mas só o diálogo dá a chance de desistir.
   *
   * Sem sucessoras afetadas não há o que confirmar — arrastar uma frente
   * isolada grava direto, como qualquer outra edição.
   */
  const confirmarArraste = useCallback(
    (mudancas: MudancasCronograma, reagendadas: number) => {
      const gravar = async () => {
        const ok = await onAplicarCronograma(mudancas);
        if (ok) toast.success('Cronograma atualizado.');
      };
      if (reagendadas === 0) {
        void gravar();
        return;
      }
      confirm({
        title: `Reagendar ${reagendadas} ${reagendadas === 1 ? 'etapa' : 'etapas'}?`,
        message: `Esta mudança empurra ${reagendadas} ${
          reagendadas === 1 ? 'etapa que depende' : 'etapas que dependem'
        } desta. As frentes com data fixada não se movem — elas passam a mostrar um aviso de conflito.`,
        onConfirm: gravar,
      });
    },
    [onAplicarCronograma, confirm, toast]
  );

  /**
   * Salvar linha de base sobrescreve a anterior, e a anterior é justamente o
   * que dá sentido a "atrasou tanto" — daí a confirmação. Sem ela, um clique
   * distraído apaga a referência do replanejamento e o gráfico passa a mostrar
   * desvio zero numa obra que derrapou meses.
   */
  const confirmarBaseline = () => {
    const jaTem = etapas.some((e) => !!e.baselineInicio);
    confirm({
      title: jaTem ? 'Substituir a linha de base?' : 'Salvar a linha de base?',
      message: jaTem
        ? 'As datas de hoje passam a ser a nova referência, e o desvio acumulado contra a base anterior é perdido.'
        : 'As datas de hoje ficam guardadas como o plano combinado, para comparar com o que for replanejado daqui em diante.',
      onConfirm: async () => {
        const ok = await onSalvarBaseline();
        if (ok) toast.success('Linha de base salva.');
      },
    });
  };

  /**
   * Excluir etapa é destrutivo além do óbvio: `medicoes_obra.etapa_id` tem
   * `on delete cascade`, então os boletins vão embora e o valor executado das
   * linhas de orçamento cai (é derivado deles). O aviso diz o tamanho do buraco.
   */
  const removerEtapa = (etapa: EtapaCronograma) => {
    const medicoesDaEtapa = medicoes.filter((m) => m.etapaId === etapa.id);
    const vinculosDaEtapa = vinculos.filter((v) => v.etapaId === etapa.id);
    const aprovadas = medicoesDaEtapa.filter((m) => m.status === 'Aprovada').length;

    const partes = [
      `${vinculosDaEtapa.length} ${vinculosDaEtapa.length === 1 ? 'vínculo de orçamento' : 'vínculos de orçamento'}`,
      `${medicoesDaEtapa.length} ${medicoesDaEtapa.length === 1 ? 'boletim de medição' : 'boletins de medição'}`,
    ];
    const alertaFinanceiro =
      aprovadas > 0
        ? ` ${aprovadas} ${aprovadas === 1 ? 'medição aprovada' : 'medições aprovadas'} serão desfeitas, e o valor executado do orçamento vai diminuir.`
        : '';

    confirm({
      title: `Excluir a etapa "${etapa.nome}"?`,
      message: `Serão removidos também ${partes.join(' e ')}.${alertaFinanceiro} Esta ação é irreversível.`,
      onConfirm: async () => {
        const ok = await onRemoveEtapa(etapa.id);
        if (ok) toast.success('Etapa excluída.');
      },
    });
  };

  return (
    <div id="tab-pane-cronograma" className="space-y-6 text-left">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Cronograma Físico da Obra
          </h4>
          <p className="text-xs text-slate-500">
            Progresso calculado a partir das medições registradas. Vincule itens de orçamento a cada
            frente para habilitar o cálculo.
            {podeGerenciar && (
              <>
                {' '}
                Para organizar a EAP, arraste a linha pela alça{' '}
                <GripVertical size={11} className="inline-block text-slate-600" aria-hidden="true" />{' '}
                — soltar no meio de um grupo põe a etapa dentro dele, e nas bordas põe antes ou
                depois. Sem mouse: foque a linha e use{' '}
                <kbd className="font-mono font-semibold text-slate-700">Alt</kbd> com as setas —
                ←/→ muda o nível, ↑/↓ muda a ordem.
              </>
            )}
          </p>
        </div>
        {podeGerenciar && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Os dois botões são o mesmo modal com formulários diferentes. Um
                grupo é uma etapa que TEM filhas, e no banco não existe coluna
                que diga isso — a separação vive aqui porque os campos são
                quase disjuntos (ver o cabeçalho de ModalEtapa). */}
            <Button
              id="console-add-grupo-btn"
              type="button"
              variante="secundario"
              onClick={() => setAlvoEtapa({ modo: 'nova', tipo: 'grupo' })}
            >
              <FolderPlus size={14} />
              <span>Novo Grupo</span>
            </Button>
            <Button
              id="console-add-etapa-btn"
              type="button"
              onClick={() => setAlvoEtapa({ modo: 'nova', tipo: 'atividade' })}
            >
              <CalendarPlus size={14} />
              <span>Nova Atividade</span>
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* O gráfico de verdade: escala de calendário, zoom, linha de hoje e as
            barras de resumo dos grupos. Substituiu um grid de 12 colunas cujos
            cinco rótulos eram interpolados linearmente entre a primeira e a
            última data — dois meses vizinhos ocupavam larguras diferentes. */}
        <Gantt
          linhas={linhas}
          dependencias={dependencias}
          folgas={folgas}
          folhas={folhas}
          onAbrirDependencias={setEtapaDasLigacoes}
          onConcluirArraste={confirmarArraste}
          recolhidos={recolhidos}
          onAlternarRecolhido={alternarRecolhido}
          percentualDaEtapa={percentualDaEtapa}
          podeGerenciar={podeGerenciar}
          onSalvarBaseline={confirmarBaseline}
          temBaseline={etapas.some((e) => !!e.baselineInicio)}
        />

        {/* Stages list — progresso físico e status são somente leitura,
            derivados das medições (fix #1). A única forma de avançar
            uma etapa é registrar uma medição. */}
        <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-xs">
                <tr>
                  <th scope="col" className="p-3">Etapa</th>
                  <th scope="col" className="p-3">Período</th>
                  <th scope="col" className="p-3">Encarregado</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3 text-center">Progresso Físico (%)</th>
                  <th scope="col" className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {etapas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-xs text-slate-500 italic">
                      Nenhuma etapa cadastrada.
                      {podeGerenciar
                        ? ' Comece por "Novo Grupo" para as grandes fases da obra, ou vá direto em "Nova Atividade".'
                        : ''}
                    </td>
                  </tr>
                )}
                {linhas.flatMap(({ etapa: step, nivel, wbs, filhos }, i) => {
                  const ehGrupo = filhos.length > 0;
                  const recolhido = recolhidos.has(step.id);
                  const semOrcamento = !ehGrupo && !vinculos.some((v) => v.etapaId === step.id);
                  const percentual = percentualDaEtapa(step);

                  // Queda DENTRO: o grupo inteiro se acende. As outras duas são
                  // a faixa entre linhas, posicionada por `marcaDeQueda`.
                  const dentro =
                    arraste?.alvoId === step.id && !arraste.recusa && arraste.posicao === 'dentro';

                  return [
                    marcaDeQueda?.indice === i && (
                      <Indicador key={`queda-${step.id}`} nivel={marcaDeQueda.nivel} />
                    ),
                    <tr
                      key={step.id}
                      data-etapa-linha={step.id}
                      tabIndex={0}
                      onKeyDown={teclasDaLinha(step)}
                      aria-level={nivel + 1}
                      aria-posinset={i + 1}
                      aria-setsize={linhas.length}
                      {...(ehGrupo ? { 'aria-expanded': !recolhido } : {})}
                      className={`transition focus:outline-none focus-visible:bg-blue-50 hover:bg-slate-50/40 ${
                        ehGrupo ? 'bg-slate-50/60' : ''
                      } ${dentro ? 'bg-blue-100/70' : ''} ${
                        arraste?.arrastadaId === step.id ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="p-3 text-slate-900">
                        <div
                          className="flex items-start gap-1.5"
                          style={{ paddingLeft: `${nivel * 16}px` }}
                        >
                          {/* A alça, e não a linha inteira: arrastar a partir de
                              qualquer ponto da célula rouba a seleção de texto do
                              nome da etapa, que é o que se copia para o diário de
                              obra. `touch-none` é obrigatório — sem ele o
                              navegador trata o gesto como rolagem e engole os
                              pointermove (mesma armadilha da Barra do Gantt). */}
                          {podeGerenciar && (
                            <span
                              {...alcasDeArraste(step)}
                              aria-hidden="true"
                              title={`Arraste para mover "${step.nome}" na EAP`}
                              className="shrink-0 mt-0.5 text-slate-500 cursor-grab active:cursor-grabbing touch-none"
                            >
                              <GripVertical size={13} />
                            </span>
                          )}
                          {ehGrupo ? (
                            <IconButton
                              rotulo={recolhido ? `Expandir ${step.nome}` : `Recolher ${step.nome}`}
                              tamanho="sm"
                              id={`recolher-etapa-${step.id}`}
                              onClick={() => alternarRecolhido(step.id)}
                            >
                              {recolhido ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                            </IconButton>
                          ) : (
                            <span className="w-6 shrink-0" aria-hidden="true" />
                          )}
                          <span>
                            <span className="font-mono text-2xs text-slate-500 mr-1.5">{wbs}</span>
                            <span className={ehGrupo ? 'font-bold' : 'font-semibold'}>
                              {step.nome}
                            </span>
                            {step.ehMarco && (
                              <Diamond
                                size={11}
                                className="inline-block ml-1.5 text-amber-600 fill-amber-400"
                                aria-label="Marco"
                              />
                            )}
                            {ehGrupo && (
                              <span className="block text-2xs text-slate-500 font-medium normal-case mt-0.5">
                                {filhos.length} {filhos.length === 1 ? 'frente' : 'frentes'} — o
                                progresso é a soma delas
                              </span>
                            )}
                            {semOrcamento && (
                              <span className="block text-2xs text-amber-600 font-semibold normal-case mt-0.5">
                                Sem orçamento vinculado
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-500">
                        <div>
                          {formatarDataBR(step.inicioEfetivo)} a {formatarDataBR(step.fimEfetivo)}
                        </div>
                        {!step.ehMarco && (
                          <div className="text-2xs text-blue-600 font-bold font-mono mt-0.5">
                            {getWorkingDays(step.inicioEfetivo, step.fimEfetivo)} dias úteis
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {/* Grupo não tem encarregado: a responsabilidade mora na frente. */}
                        <span className="font-semibold text-slate-800">
                          {ehGrupo ? '—' : nomeDoEncarregado(step.responsavelId)}
                        </span>
                      </td>
                      <td className="p-3">
                        {ehGrupo ? (
                          <span className="text-2xs text-slate-500">—</span>
                        ) : (
                          <span
                            className={`px-2 py-1 rounded font-bold text-2xs ${
                              step.status === 'Concluído'
                                ? 'bg-emerald-50 text-emerald-700'
                                : step.status === 'Em Andamento'
                                  ? 'bg-blue-50 text-blue-700'
                                  : step.status === 'Atrasado'
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {step.status}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center min-w-[160px]">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-full h-1.5 bg-slate-200 rounded-lg overflow-hidden">
                            <div
                              className={`h-full ${ehGrupo ? 'bg-slate-500' : 'bg-blue-600'}`}
                              style={{ width: `${percentual}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-900 w-10 text-right">
                            {percentual}%
                          </span>
                        </div>
                        {/* A meta em números absolutos abaixo da barra: "60 de
                            100 m²" é o que o encarregado confere em campo, e o
                            percentual sozinho esconde de qual base ele saiu. */}
                        {step.quantidadePrevista && (
                          <p className="text-2xs text-slate-500 font-mono text-right mt-0.5">
                            {formatarQuantidade(step.quantidadeExecutada)} de{' '}
                            {formatarQuantidade(step.quantidadePrevista, step.unidade)}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {podeGerenciar && (
                            <>
                              {/* Só folha vincula orçamento e recebe medição: o grupo
                                  é rollup, e medi-lo aplicaria o mesmo valor duas vezes
                                  no item (fn_execucao_so_em_folha). */}
                              {!ehGrupo && !step.ehMarco && (
                                <button
                                  id={`vincular-orcamento-etapa-${step.id}`}
                                  onClick={() => setAlvoVinculo({ modo: 'etapa', etapaId: step.id })}
                                  className="bg-slate-50 text-slate-600 hover:bg-slate-800 hover:text-white px-2 py-1 rounded font-bold text-2xs transition active:scale-95 border border-slate-200 cursor-pointer"
                                >
                                  Vincular Orçamento
                                </button>
                              )}
                              {/* Criar DENTRO só é oferecido a quem pode receber
                                  filhas — a mesma pergunta que o arraste faz
                                  antes de abrir a zona "dentro", e as mesmas
                                  três recusas de fn_etapa_pai_sem_execucao. */}
                              {!motivoParaNaoAgrupar(etapas, null, step, etapasComExecucao) && (
                                <IconButton
                                  rotulo={`Criar atividade dentro de ${step.nome}`}
                                  tamanho="sm"
                                  id={`subetapa-${step.id}`}
                                  onClick={() =>
                                    setAlvoEtapa({ modo: 'nova', tipo: 'atividade', paiId: step.id })
                                  }
                                >
                                  <Plus size={13} />
                                </IconButton>
                              )}
                              <IconButton
                                rotulo={
                                  ehGrupo
                                    ? `Renomear o grupo ${step.nome}`
                                    : 'Editar nome, prazo e encarregado'
                                }
                                tom="acao"
                                tamanho="sm"
                                id={`editar-etapa-${step.id}`}
                                onClick={() => setAlvoEtapa({ modo: 'edicao', etapa: step, ehGrupo })}
                              >
                                <Pencil size={13} />
                              </IconButton>
                              <IconButton
                                rotulo="Excluir etapa"
                                tom="perigo"
                                tamanho="sm"
                                id={`excluir-etapa-${step.id}`}
                                onClick={() => removerEtapa(step)}
                              >
                                <Trash2 size={13} />
                              </IconButton>
                            </>
                          )}
                          {podeMedir && !ehGrupo && !step.ehMarco && (
                            <button
                              id={`medir-etapa-rapido-${step.id}`}
                              disabled={medicaoBloqueada}
                              title={
                                medicaoBloqueada
                                  ? `Obra "${projeto.situacao}" — mude a situação para medir.`
                                  : undefined
                              }
                              onClick={() => setEtapaParaMedir(step.id)}
                              className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-2 py-1 rounded font-bold text-2xs transition active:scale-95 border border-blue-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-50 disabled:hover:text-blue-600"
                            >
                              Medir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>,
                  ];
                })}
                {/* A última posição da lista não tem linha "de baixo" a preceder. */}
                {marcaDeQueda?.indice === linhas.length && (
                  <Indicador nivel={marcaDeQueda.nivel} />
                )}
              </tbody>
            </table>
          </div>

          {/* O que o gesto vai fazer, em texto — e o motivo quando não vai
              fazer nada. O `role="status"` é o que dá ao arraste um equivalente
              audível: sem ele, quem não enxerga a faixa azul não tem nenhuma
              informação sobre o alvo sob o cursor. */}
          {arraste && (
            <p
              role="status"
              aria-live="polite"
              className={`px-3 py-1.5 text-2xs border-t leading-relaxed ${
                arraste.recusa
                  ? 'bg-rose-50 border-rose-200 text-rose-800 font-semibold'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              {arraste.recusa || arraste.resumo || 'Solte sobre uma linha da grade.'}
              {!arraste.recusa && arraste.aviso && (
                <span className="block text-slate-600">
                  Não dá para soltar DENTRO: {arraste.aviso}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <PainelDependencias
        etapa={etapaDasLigacoes}
        onFechar={() => setEtapaDasLigacoes(null)}
        folhas={folhas}
        dependencias={dependencias}
        podeGerenciar={podeGerenciar}
        onAplicar={onAplicarCronograma}
      />

      <ModalEtapa
        alvo={alvoEtapa}
        onFechar={() => setAlvoEtapa(null)}
        projeto={projeto}
        funcionarios={funcionarios}
        etapas={etapas}
        etapasComExecucao={etapasComExecucao}
        insumos={insumos}
        onCriar={onAddEtapa}
        onAtualizar={onUpdateEtapa}
      />

      {/* Só FOLHAS nos dois modais abaixo: grupo da EAP não vincula orçamento
          nem recebe medição (fn_execucao_so_em_folha barra no banco). Oferecer
          a opção e ser recusado depois é pior do que não oferecer — e medir um
          grupo faria fn_apply_medicao aplicar o mesmo valor duas vezes. */}
      <ModalVinculo
        alvo={alvoVinculo}
        onFechar={() => setAlvoVinculo(null)}
        etapas={folhas}
        itens={itens}
        vinculos={vinculos}
        pesoAlocadoPorItem={pesoAlocadoPorItem}
        onAdicionar={onAddVinculo}
        onRemover={onRemoveVinculo}
      />

      <ModalMedicao
        etapaInicial={etapaParaMedir}
        onFechar={() => setEtapaParaMedir(null)}
        projeto={projeto}
        etapas={folhas.filter((e) => !e.ehMarco)}
        medicoes={medicoes}
        onAdicionar={onAddMedicao}
        onMudarSituacao={onUpdateProjetoSituacao}
      />
    </div>
  );
}

/**
 * A faixa azul entre duas linhas: onde a etapa arrastada vai cair.
 *
 * É uma LINHA da tabela, e não uma borda na linha vizinha, por um motivo
 * prático: `box-shadow` em `<tr>` não é pintado com `border-collapse`, e uma
 * borda no `<td>` teria de ser repetida nas seis células para não sair
 * quebrada. Uma linha própria também resolve o caso da última posição da lista,
 * onde não existe linha "de baixo" para receber a marca.
 *
 * O recuo é o do DESTINO, não o da linha sob o cursor: é o que diferencia, a
 * olho, cair como irmã de um item dentro do grupo ou como irmã do grupo.
 */
function Indicador({ nivel }: { nivel: number }) {
  return (
    <tr aria-hidden="true">
      <td colSpan={6} className="p-0">
        <div className="h-0.5 bg-blue-600" style={{ marginLeft: `${12 + nivel * 16}px` }} />
      </td>
    </tr>
  );
}
