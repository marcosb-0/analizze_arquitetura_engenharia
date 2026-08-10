import { useCallback, useMemo, useState } from 'react';
import { CalendarPlus, ChevronDown, ChevronRight, Diamond, Pencil, Plus, Trash2 } from 'lucide-react';
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
import {
  desindentar,
  indentar,
  moverEntreIrmaos,
} from '../../lib/cronograma/reordenar';
import { useFeedback } from '../FeedbackContext';
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
   * `Alt+setas` é o caminho principal de reordenação, não o alternativo: é a
   * convenção de todo outliner, funciona sem mouse e dispensa a mira fina que o
   * arraste exige. O arraste (Fase 4) é o atalho.
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
                Para organizar a EAP, foque uma linha e use{' '}
                <kbd className="font-mono font-semibold text-slate-700">Alt</kbd> com as setas:
                ←/→ muda o nível, ↑/↓ muda a ordem.
              </>
            )}
          </p>
        </div>
        {podeGerenciar && (
          <Button
            id="console-add-etapa-btn"
            type="button"
            onClick={() => setAlvoEtapa({ modo: 'nova' })} className="shrink-0"
          >
            <CalendarPlus size={14} />
            <span>Nova Etapa</span>
          </Button>
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
                      {podeGerenciar ? ' Use "Nova Etapa" para montar o cronograma.' : ''}
                    </td>
                  </tr>
                )}
                {linhas.map(({ etapa: step, nivel, wbs, filhos }, i) => {
                  const ehGrupo = filhos.length > 0;
                  const recolhido = recolhidos.has(step.id);
                  const semOrcamento = !ehGrupo && !vinculos.some((v) => v.etapaId === step.id);
                  const percentual = percentualDaEtapa(step);

                  return (
                    <tr
                      key={step.id}
                      tabIndex={0}
                      onKeyDown={teclasDaLinha(step)}
                      aria-level={nivel + 1}
                      aria-posinset={i + 1}
                      aria-setsize={linhas.length}
                      {...(ehGrupo ? { 'aria-expanded': !recolhido } : {})}
                      className={`transition focus:outline-none focus-visible:bg-blue-50 hover:bg-slate-50/40 ${
                        ehGrupo ? 'bg-slate-50/60' : ''
                      }`}
                    >
                      <td className="p-3 text-slate-900">
                        <div
                          className="flex items-start gap-1.5"
                          style={{ paddingLeft: `${nivel * 16}px` }}
                        >
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
                              <IconButton
                                rotulo={`Criar subetapa dentro de ${step.nome}`}
                                tamanho="sm"
                                id={`subetapa-${step.id}`}
                                onClick={() => setAlvoEtapa({ modo: 'nova', paiId: step.id })}
                              >
                                <Plus size={13} />
                              </IconButton>
                              <IconButton
                                rotulo="Editar nome, prazo e encarregado"
                                tom="acao"
                                tamanho="sm"
                                id={`editar-etapa-${step.id}`}
                                onClick={() => setAlvoEtapa({ modo: 'edicao', etapa: step })}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
