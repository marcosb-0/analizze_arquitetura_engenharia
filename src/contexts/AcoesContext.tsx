import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type {
  AjustePreco,
  ConversaoObraPayload,
  CorCategoriaDocumento,
  EdicaoEtapa,
  EtapaCronograma,
  EtapaOrcamentoVinculo,
  MudancasCronograma,
  ItemOrcamento,
  Projeto,
  Proposta,
} from '../types';
import type { NovoInsumoProjeto } from '../services/insumosProjetoService';
import { useFeedback } from '../components/FeedbackContext';
import { useNavegacao } from './NavegacaoContext';
import {
  useContratosDados,
  useCronogramaDados,
  useDocumentoCategoriasDados,
  useDocumentosDados,
  useInsumosProjetoDados,
  useMedicoesDados,
  useOrcamentoDados,
  useProjetoEquipeDados,
  useProjetosDados,
  useCargaEquipeDados,
  useMedicoesAFaturarDados,
  useResumoObrasDados,
} from './DadosContext';

/**
 * As escritas que atravessam mais de um domínio.
 *
 * São os "12 handlers de composição" que o §1.2 apontava no `App`. Não são
 * enfeite: cada um existe porque o BANCO deriva algo a partir da escrita, e o
 * cliente precisa reler o que foi derivado — apagar uma etapa leva os boletins
 * dela, e o valor executado das linhas de orçamento sai desses boletins.
 *
 * Ficam num contexto próprio, e não espalhados pelos hooks de domínio, por dois
 * motivos. Primeiro, `useCronograma` não deve conhecer `useOrcamento` — a
 * dependência é da AÇÃO, não do domínio. Segundo, o valor deste contexto só
 * depende de handlers já estáveis, então ele nunca muda de identidade: quem
 * consome ações não re-renderiza quando os dados mudam.
 */
interface Acoes {
  /** Converte a proposta aprovada em obra e já abre o console dela. */
  converterPropostaEmObra: (prop: Proposta, payload: ConversaoObraPayload) => Promise<string | null>;
  /**
   * Gera o contrato da proposta aprovada e leva o usuário até ele.
   *
   * Vive aqui, e não em `usePropostas`, pelo mesmo motivo da conversão: parte
   * de uma proposta, escreve em outro domínio e termina em outra aba. É
   * INDEPENDENTE da conversão em obra — uma proposta pode gerar contrato sem
   * ter virado obra, e vice-versa; a ordem entre as duas é do negócio.
   */
  gerarContratoDaProposta: (prop: Proposta) => Promise<string | null>;
  criarObra: (proj: Projeto) => Promise<string | null>;
  excluirObra: (id: string) => Promise<boolean>;
  criarEtapa: (etapa: EtapaCronograma) => Promise<boolean>;
  editarEtapa: (id: string, patch: EdicaoEtapa) => Promise<boolean>;
  removerEtapa: (id: string) => Promise<boolean>;
  /** Reposiciona a EAP e reagenda datas em lote, numa transação só. */
  aplicarCronograma: (mudancas: MudancasCronograma) => Promise<boolean>;
  /** Congela o plano vigente da obra como linha de base. */
  salvarBaseline: () => Promise<boolean>;
  /**
   * As quatro abaixo passaram a viver aqui em 04/ago/2026, junto com o resumo
   * agregado (§4.2, item 23). Nenhuma delas cruza dois domínios de DADO — o que
   * elas cruzam é o número derivado: criar etapa muda `etapas_total`, vincular
   * item muda a PONDERAÇÃO do avanço físico sem mudar valor nenhum, e adicionar
   * item de orçamento muda `itens_total` e `valor_orcado`. Deixá-las nos hooks
   * de domínio seria deixar quatro caminhos por onde a lista de obras volta a
   * mostrar número velho.
   */
  vincularItem: (vinculo: EtapaOrcamentoVinculo) => Promise<boolean>;
  desvincularItem: (id: string) => Promise<void>;
  adicionarItemOrcamento: (item: ItemOrcamento) => Promise<ItemOrcamento | null>;
  adicionarInsumo: (novo: NovoInsumoProjeto) => ReturnType<ReturnType<typeof useInsumosProjetoDados>['handleAddInsumoProjeto']>;
  ajustarPrecoInsumo: (id: string, ajuste: AjustePreco) => ReturnType<ReturnType<typeof useInsumosProjetoDados>['handleAjustarPrecoInsumo']>;
  ajustarQuantidadeInsumo: (id: string, quantidade: number) => ReturnType<ReturnType<typeof useInsumosProjetoDados>['handleAjustarQuantidadeInsumo']>;
  removerInsumo: (id: string) => Promise<boolean>;
  registrarMedicao: (
    med: { projetoId: string; etapaId: string; percentualMedido: number; observacoes: string },
    fotos: File[]
  ) => Promise<boolean>;
  aprovarMedicao: (medicaoId: string, permitirOverrun?: boolean) => Promise<'ok' | 'overrun' | 'error'>;
  rejeitarMedicao: (medicaoId: string, motivo: string) => Promise<boolean>;
  renomearCategoriaDocumento: (id: string, patch: { nome?: string; cor?: CorCategoriaDocumento }) => Promise<void>;
}

const AcoesCtx = createContext<Acoes | null>(null);

export function useAcoes(): Acoes {
  const ctx = useContext(AcoesCtx);
  if (!ctx) throw new Error('useAcoes() precisa estar dentro de <AcoesProvider>');
  return ctx;
}

export function AcoesProvider({ children }: { children: ReactNode }) {
  const { toast } = useFeedback();
  const { setActiveTab, setSelectedProjectId } = useNavegacao();

  const { handleConvertFromProposta, handleCreateManualProjeto, handleDeleteProjeto } = useProjetosDados();
  const { handleGerarDaProposta } = useContratosDados();
  const { handleAddOrcamentoItem, refreshOrcamentos } = useOrcamentoDados();
  const {
    handleAddEtapa,
    handleUpdateEtapa,
    handleRemoveEtapa,
    handleAplicarCronograma,
    handleSalvarBaseline,
    handleAddVinculo,
    handleRemoveVinculo,
    refreshCronograma,
  } = useCronogramaDados();
  const {
    handleAddMedicao,
    handleAprovarMedicao,
    handleRejeitarMedicao,
    refreshMedicoes,
  } = useMedicoesDados();
  const {
    handleAddInsumoProjeto,
    handleAjustarPrecoInsumo,
    handleAjustarQuantidadeInsumo,
    handleRemoveInsumoProjeto,
    refreshInsumosProjeto,
  } = useInsumosProjetoDados();
  const { refreshProjetoEquipe } = useProjetoEquipeDados();
  const { recarregar: recarregarResumo } = useResumoObrasDados();
  const { recarregarAFaturar } = useMedicoesAFaturarDados();
  const { recarregarCarga } = useCargaEquipeDados();
  const { refetch: refetchDocumentos } = useDocumentosDados();
  const { handleUpdateCategoria } = useDocumentoCategoriasDados();

  /**
   * Releitura das listas pedidas MAIS o resumo agregado, sempre.
   *
   * Toda ação daqui mexe em orçamento, cronograma ou medição, e `v_resumo_obra`
   * é derivada dos três: aprovar um boletim muda avanço físico, valor executado,
   * medições pendentes, a lista de atrasos e o feed do painel de uma vez só. Sem
   * a releitura, a lista de obras seguiria mostrando o número anterior — e como
   * ela está em OUTRA tela, o erro só apareceria depois, sem nada ligando o
   * sintoma à causa.
   *
   * Existe como helper, e não como uma chamada extra em cada um dos onze
   * handlers, porque a forma de errar isto é esquecer um: o handler raro, que
   * ninguém testa, é exatamente o que fica para trás. Aqui não há como escrever
   * a releitura sem passar por aqui.
   *
   * `relerDerivados` é a lista de tudo que é calculado a partir do núcleo e vive
   * numa TELA DIFERENTE da que escreveu — o resumo por obra, a fila de
   * faturamento e a carga da equipe. As três se protegem sozinhas do
   * desperdício: nenhuma busca nada enquanto a aba dela não tiver sido aberta.
   *
   * São uma lista só, e não um subconjunto escolhido por handler, porque a
   * escolha por handler é onde o erro mora: aprovar uma medição pode levar a
   * etapa a 100%, tirando-a da carga da equipe — ninguém liga "aprovei um
   * boletim" a "a tela de Equipe está errada" na hora de escrever o handler.
   */
  const relerDerivados = useCallback(
    () => Promise.all([recarregarResumo(), recarregarAFaturar(), recarregarCarga()]),
    [recarregarResumo, recarregarAFaturar, recarregarCarga]
  );

  const reler = useCallback(
    (...refresh: Array<() => unknown>) => Promise.all([...refresh.map((f) => f()), relerDerivados()]),
    [relerDerivados]
  );

  /**
   * A conversão persiste orçamento, cronograma e vínculos revisados no wizard
   * numa transação só (`fn_criar_projeto_from_proposta`); aqui relemos as duas
   * views derivadas e levamos o usuário direto ao console da obra nova.
   */
  const converterPropostaEmObra = useCallback(
    async (prop: Proposta, payload: ConversaoObraPayload): Promise<string | null> => {
      const novoId = await handleConvertFromProposta(prop.id, payload);
      if (!novoId) return null;
      await reler(refreshOrcamentos, refreshCronograma);
      toast.success('Obra iniciada com sucesso.', `A proposta ${prop.numero} foi convertida em obra.`);
      setSelectedProjectId(novoId);
      setActiveTab('projetos');
      return novoId;
    },
    [handleConvertFromProposta, reler, refreshOrcamentos, refreshCronograma, toast, setSelectedProjectId, setActiveTab]
  );

  const gerarContratoDaProposta = useCallback(
    async (prop: Proposta): Promise<string | null> => {
      const criado = await handleGerarDaProposta(prop.id);
      if (!criado) return null;
      toast.success(
        `Contrato ${criado.numero} gerado.`,
        'As cláusulas vieram do descritivo negociado na proposta.'
      );
      setActiveTab('contratos');
      return criado.id;
    },
    [handleGerarDaProposta, toast, setActiveTab]
  );

  // A criação manual delega projeto + 5 etapas escalonadas a
  // `fn_criar_projeto_manual`, numa transação; depois relemos o cronograma.
  const criarObra = useCallback(
    async (proj: Projeto): Promise<string | null> => {
      const novoId = await handleCreateManualProjeto(proj);
      if (!novoId) return null;
      await reler(refreshCronograma);
      return novoId;
    },
    [handleCreateManualProjeto, reler, refreshCronograma]
  );

  /**
   * Devolve se a obra foi mesmo excluída para a tela só confirmar depois disso —
   * um perfil sem permissão de delete não recebe erro do PostgREST, então o
   * service conta as linhas afetadas (ver `projetosService.remove`).
   *
   * Itens de orçamento, etapas, medições, documentos, insumos e equipe têm
   * `on delete cascade`: o banco limpa sozinho, mas sem estes refetches eles
   * ficariam em memória apontando para uma obra que não existe mais e seguiriam
   * alimentando os contadores do painel.
   */
  const excluirObra = useCallback(
    async (id: string): Promise<boolean> => {
      const ok = await handleDeleteProjeto(id);
      if (!ok) return false;
      reler(
        refreshOrcamentos,
        refreshCronograma,
        refreshMedicoes,
        refreshInsumosProjeto,
        refreshProjetoEquipe,
        refetchDocumentos
      );
      return true;
    },
    [
      handleDeleteProjeto,
      reler,
      refreshOrcamentos,
      refreshCronograma,
      refreshMedicoes,
      refreshInsumosProjeto,
      refreshProjetoEquipe,
      refetchDocumentos,
    ]
  );

  // Criar e editar etapa não mexem em orçamento nem em medição — só no resumo,
  // que conta etapas e deriva o avanço a partir delas.
  const criarEtapa = useCallback(
    async (etapa: EtapaCronograma) => {
      const ok = await handleAddEtapa(etapa);
      if (ok) await relerDerivados();
      return ok;
    },
    [handleAddEtapa, relerDerivados]
  );

  const editarEtapa = useCallback(
    async (id: string, patch: EdicaoEtapa) => {
      const ok = await handleUpdateEtapa(id, patch);
      if (ok) await relerDerivados();
      return ok;
    },
    [handleUpdateEtapa, relerDerivados]
  );

  /**
   * Reposicionar a EAP e reagendar datas em lote.
   *
   * Passa pelos derivados como as demais: mover uma etapa muda `data_fim`, e
   * `v_resumo_obra.etapas_atrasadas` e `v_etapa_atrasada` são calculadas em
   * cima dela. Reordenar sozinho não mudaria número nenhum, mas separar os dois
   * casos aqui significaria uma decisão a acertar em cada chamada — e o modo de
   * falha é o painel discordar do console até alguém recarregar a página.
   */
  const aplicarCronograma = useCallback(
    async (mudancas: MudancasCronograma) => {
      const ok = await handleAplicarCronograma(mudancas);
      if (ok) await relerDerivados();
      return ok;
    },
    [handleAplicarCronograma, relerDerivados]
  );

  /**
   * O vínculo é o caso menos óbvio e o mais fácil de esquecer: ele não altera
   * nenhum valor: nem orçado, nem executado, nem percentual. Altera o PESO de
   * cada etapa no avanço físico ponderado — e por isso o número da lista de
   * obras muda sem que nada visível na tela do console tenha mudado.
   */
  const vincularItem = useCallback(
    async (vinculo: EtapaOrcamentoVinculo) => {
      const ok = await handleAddVinculo(vinculo);
      if (ok) await relerDerivados();
      return ok;
    },
    [handleAddVinculo, relerDerivados]
  );

  const desvincularItem = useCallback(
    async (id: string) => {
      await handleRemoveVinculo(id);
      await relerDerivados();
    },
    [handleRemoveVinculo, relerDerivados]
  );

  const adicionarItemOrcamento = useCallback(
    async (item: ItemOrcamento) => {
      const criado = await handleAddOrcamentoItem(item);
      if (criado) await relerDerivados();
      return criado;
    },
    [handleAddOrcamentoItem, relerDerivados]
  );

  // Apagar uma etapa leva os boletins dela junto (cascade), e o valor executado
  // das linhas de orçamento é derivado desses boletins.
  const removerEtapa = useCallback(
    async (id: string): Promise<boolean> => {
      const ok = await handleRemoveEtapa(id);
      if (!ok) return false;
      await reler(refreshOrcamentos, refreshMedicoes);
      return true;
    },
    [handleRemoveEtapa, reler, refreshOrcamentos, refreshMedicoes]
  );

  // Quantidade e ajuste recalculam `itens_orcamento.valor_orcado` por trigger no
  // banco (`fn_sync_valor_item_orcamento`) — nenhum desses valores é computado
  // no cliente. Por isso toda escrita de insumo relê o orçamento.
  const adicionarInsumo = useCallback(
    async (novo: NovoInsumoProjeto) => {
      const criado = await handleAddInsumoProjeto(novo);
      if (criado) await reler(refreshOrcamentos);
      return criado;
    },
    [handleAddInsumoProjeto, reler, refreshOrcamentos]
  );

  const ajustarPrecoInsumo = useCallback(
    async (id: string, ajuste: AjustePreco) => {
      const atualizado = await handleAjustarPrecoInsumo(id, ajuste);
      if (atualizado) await reler(refreshOrcamentos);
      return atualizado;
    },
    [handleAjustarPrecoInsumo, reler, refreshOrcamentos]
  );

  const ajustarQuantidadeInsumo = useCallback(
    async (id: string, quantidade: number) => {
      const atualizado = await handleAjustarQuantidadeInsumo(id, quantidade);
      if (atualizado) await reler(refreshOrcamentos);
      return atualizado;
    },
    [handleAjustarQuantidadeInsumo, reler, refreshOrcamentos]
  );

  const removerInsumo = useCallback(
    async (id: string) => {
      const ok = await handleRemoveInsumoProjeto(id);
      if (ok) await reler(refreshOrcamentos);
      return ok;
    },
    [handleRemoveInsumoProjeto, reler, refreshOrcamentos]
  );

  // O fan-out financeiro da medição (via `etapa_orcamento_vinculo`) e o
  // percentual/status da etapa são calculados no servidor — depois de a escrita
  // passar, relemos as duas views derivadas.
  const registrarMedicao = useCallback(
    async (
      med: { projetoId: string; etapaId: string; percentualMedido: number; observacoes: string },
      fotos: File[]
    ): Promise<boolean> => {
      const criada = await handleAddMedicao(med, fotos);
      if (!criada) return false;
      await reler(refreshOrcamentos, refreshCronograma);
      return true;
    },
    [handleAddMedicao, reler, refreshOrcamentos, refreshCronograma]
  );

  // 'overrun' sobe para a tela pedir confirmação explícita de ultrapassar 100%.
  const aprovarMedicao = useCallback(
    async (medicaoId: string, permitirOverrun = false) => {
      const resultado = await handleAprovarMedicao(medicaoId, permitirOverrun);
      if (resultado === 'ok') {
        await reler(refreshOrcamentos, refreshCronograma);
      }
      return resultado;
    },
    [handleAprovarMedicao, reler, refreshOrcamentos, refreshCronograma]
  );

  const rejeitarMedicao = useCallback(
    async (medicaoId: string, motivo: string) => {
      const ok = await handleRejeitarMedicao(medicaoId, motivo);
      if (ok) {
        await reler(refreshOrcamentos, refreshCronograma);
      }
      return ok;
    },
    [handleRejeitarMedicao, reler, refreshOrcamentos, refreshCronograma]
  );

  // Renomear categoria cascateia em `documentos.tipo` pelo FK no banco, mas a
  // lista já carregada não enxerga isso sozinha.
  const renomearCategoriaDocumento = useCallback(
    async (id: string, patch: { nome?: string; cor?: CorCategoriaDocumento }) => {
      await handleUpdateCategoria(id, patch);
      if (patch.nome) refetchDocumentos();
    },
    [handleUpdateCategoria, refetchDocumentos]
  );

  const valor = useMemo(
    () => ({
      converterPropostaEmObra,
      gerarContratoDaProposta,
      criarObra,
      excluirObra,
      criarEtapa,
      editarEtapa,
      aplicarCronograma,
      salvarBaseline: handleSalvarBaseline,
      removerEtapa,
      vincularItem,
      desvincularItem,
      adicionarItemOrcamento,
      adicionarInsumo,
      ajustarPrecoInsumo,
      ajustarQuantidadeInsumo,
      removerInsumo,
      registrarMedicao,
      aprovarMedicao,
      rejeitarMedicao,
      renomearCategoriaDocumento,
    }),
    [
      converterPropostaEmObra,
      gerarContratoDaProposta,
      criarObra,
      excluirObra,
      criarEtapa,
      editarEtapa,
      aplicarCronograma,
      handleSalvarBaseline,
      removerEtapa,
      vincularItem,
      desvincularItem,
      adicionarItemOrcamento,
      adicionarInsumo,
      ajustarPrecoInsumo,
      ajustarQuantidadeInsumo,
      removerInsumo,
      registrarMedicao,
      aprovarMedicao,
      rejeitarMedicao,
      renomearCategoriaDocumento,
    ]
  );

  return <AcoesCtx.Provider value={valor}>{children}</AcoesCtx.Provider>;
}
