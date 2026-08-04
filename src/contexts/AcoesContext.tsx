import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { AjustePreco, ConversaoObraPayload, CorCategoriaDocumento, Projeto, Proposta } from '../types';
import type { NovoInsumoProjeto } from '../services/insumosProjetoService';
import { useFeedback } from '../components/FeedbackContext';
import { useNavegacao } from './NavegacaoContext';
import {
  useCronogramaDados,
  useDocumentoCategoriasDados,
  useDocumentosDados,
  useInsumosProjetoDados,
  useMedicoesDados,
  useOrcamentoDados,
  useProjetoEquipeDados,
  useProjetosDados,
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
  criarObra: (proj: Projeto) => Promise<string | null>;
  excluirObra: (id: string) => Promise<boolean>;
  removerEtapa: (id: string) => Promise<boolean>;
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
  const { refreshOrcamentos } = useOrcamentoDados();
  const { handleRemoveEtapa, refreshCronograma } = useCronogramaDados();
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
  const { refetch: refetchDocumentos } = useDocumentosDados();
  const { handleUpdateCategoria } = useDocumentoCategoriasDados();

  /**
   * A conversão persiste orçamento, cronograma e vínculos revisados no wizard
   * numa transação só (`fn_criar_projeto_from_proposta`); aqui relemos as duas
   * views derivadas e levamos o usuário direto ao console da obra nova.
   */
  const converterPropostaEmObra = useCallback(
    async (prop: Proposta, payload: ConversaoObraPayload): Promise<string | null> => {
      const novoId = await handleConvertFromProposta(prop.id, payload);
      if (!novoId) return null;
      await Promise.all([refreshOrcamentos(), refreshCronograma()]);
      toast.success('Obra iniciada com sucesso.', `A proposta ${prop.numero} foi convertida em obra.`);
      setSelectedProjectId(novoId);
      setActiveTab('projetos');
      return novoId;
    },
    [handleConvertFromProposta, refreshOrcamentos, refreshCronograma, toast, setSelectedProjectId, setActiveTab]
  );

  // A criação manual delega projeto + 5 etapas escalonadas a
  // `fn_criar_projeto_manual`, numa transação; depois relemos o cronograma.
  const criarObra = useCallback(
    async (proj: Projeto): Promise<string | null> => {
      const novoId = await handleCreateManualProjeto(proj);
      if (!novoId) return null;
      await refreshCronograma();
      return novoId;
    },
    [handleCreateManualProjeto, refreshCronograma]
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
      refreshOrcamentos();
      refreshCronograma();
      refreshMedicoes();
      refreshInsumosProjeto();
      refreshProjetoEquipe();
      refetchDocumentos();
      return true;
    },
    [
      handleDeleteProjeto,
      refreshOrcamentos,
      refreshCronograma,
      refreshMedicoes,
      refreshInsumosProjeto,
      refreshProjetoEquipe,
      refetchDocumentos,
    ]
  );

  // Apagar uma etapa leva os boletins dela junto (cascade), e o valor executado
  // das linhas de orçamento é derivado desses boletins.
  const removerEtapa = useCallback(
    async (id: string): Promise<boolean> => {
      const ok = await handleRemoveEtapa(id);
      if (!ok) return false;
      await Promise.all([refreshOrcamentos(), refreshMedicoes()]);
      return true;
    },
    [handleRemoveEtapa, refreshOrcamentos, refreshMedicoes]
  );

  // Quantidade e ajuste recalculam `itens_orcamento.valor_orcado` por trigger no
  // banco (`fn_sync_valor_item_orcamento`) — nenhum desses valores é computado
  // no cliente. Por isso toda escrita de insumo relê o orçamento.
  const adicionarInsumo = useCallback(
    async (novo: NovoInsumoProjeto) => {
      const criado = await handleAddInsumoProjeto(novo);
      if (criado) await refreshOrcamentos();
      return criado;
    },
    [handleAddInsumoProjeto, refreshOrcamentos]
  );

  const ajustarPrecoInsumo = useCallback(
    async (id: string, ajuste: AjustePreco) => {
      const atualizado = await handleAjustarPrecoInsumo(id, ajuste);
      if (atualizado) await refreshOrcamentos();
      return atualizado;
    },
    [handleAjustarPrecoInsumo, refreshOrcamentos]
  );

  const ajustarQuantidadeInsumo = useCallback(
    async (id: string, quantidade: number) => {
      const atualizado = await handleAjustarQuantidadeInsumo(id, quantidade);
      if (atualizado) await refreshOrcamentos();
      return atualizado;
    },
    [handleAjustarQuantidadeInsumo, refreshOrcamentos]
  );

  const removerInsumo = useCallback(
    async (id: string) => {
      const ok = await handleRemoveInsumoProjeto(id);
      if (ok) await refreshOrcamentos();
      return ok;
    },
    [handleRemoveInsumoProjeto, refreshOrcamentos]
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
      await Promise.all([refreshOrcamentos(), refreshCronograma()]);
      return true;
    },
    [handleAddMedicao, refreshOrcamentos, refreshCronograma]
  );

  // 'overrun' sobe para a tela pedir confirmação explícita de ultrapassar 100%.
  const aprovarMedicao = useCallback(
    async (medicaoId: string, permitirOverrun = false) => {
      const resultado = await handleAprovarMedicao(medicaoId, permitirOverrun);
      if (resultado === 'ok') {
        await Promise.all([refreshOrcamentos(), refreshCronograma()]);
      }
      return resultado;
    },
    [handleAprovarMedicao, refreshOrcamentos, refreshCronograma]
  );

  const rejeitarMedicao = useCallback(
    async (medicaoId: string, motivo: string) => {
      const ok = await handleRejeitarMedicao(medicaoId, motivo);
      if (ok) {
        await Promise.all([refreshOrcamentos(), refreshCronograma()]);
      }
      return ok;
    },
    [handleRejeitarMedicao, refreshOrcamentos, refreshCronograma]
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
      criarObra,
      excluirObra,
      removerEtapa,
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
      criarObra,
      excluirObra,
      removerEtapa,
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
