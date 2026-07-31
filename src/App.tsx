/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import RequireRole from './components/RequireRole';

/**
 * Cada aba é um chunk próprio.
 *
 * O app era um único bundle de 1,5 MB: quatro componentes de 1.400+ linhas, o
 * Recharts (usado por uma aba só) e o motion carregavam antes do login, para
 * todo mundo. Um usuário do papel `campo`, que só enxerga Indicadores e Obras,
 * baixava o catálogo de insumos e o módulo financeiro sem nunca abri-los.
 *
 * A aba só é buscada quando alguém navega até ela, e fica em cache depois —
 * trocar de aba uma segunda vez é instantâneo.
 */
const DashboardOverview = lazy(() => import('./components/DashboardOverview'));
const ClientesTab = lazy(() => import('./components/ClientesTab'));
const PropostasTab = lazy(() => import('./components/PropostasTab'));
const FornecedoresTab = lazy(() => import('./components/FornecedoresTab'));
const ProjetosTab = lazy(() => import('./components/ProjetosTab'));
const EquipeTab = lazy(() => import('./components/EquipeTab'));
const DocumentosPanel = lazy(() => import('./components/DocumentosPanel'));
const CatalogoTab = lazy(() => import('./components/CatalogoTab'));
const EmpresaTab = lazy(() => import('./components/EmpresaTab'));
const AcessosTab = lazy(() => import('./components/AcessosTab'));

import { 
  Proposta, 
  Projeto,
  ConversaoObraPayload
} from './types';

import { ChevronRight, Menu, Wallet } from 'lucide-react';
import EmptyState from './components/EmptyState';
import { useFeedback } from './components/FeedbackContext';
import { useAuth } from './contexts/AuthContext';
import LoginScreen from './components/LoginScreen';
import AcessoIndisponivel from './components/AcessoIndisponivel';
import Spinner from './components/Spinner';
import { useClientes } from './hooks/useClientes';
import { useClienteDocumentos } from './hooks/useClienteDocumentos';
import { useFornecedores } from './hooks/useFornecedores';
import { useFuncionarios } from './hooks/useFuncionarios';
import { useFuncionarioDocumentos } from './hooks/useFuncionarioDocumentos';
import { usePropostas } from './hooks/usePropostas';
import { useEmpresaConfig } from './hooks/useEmpresaConfig';
import { useCatalogo } from './hooks/useCatalogo';
import { useSinapi } from './hooks/useSinapi';
import { useFinanceiro } from './hooks/useFinanceiro';
import { useDocumentos } from './hooks/useDocumentos';
import { useDocumentoCategorias } from './hooks/useDocumentoCategorias';
import { CorCategoriaDocumento } from './types';
import { useProjetos } from './hooks/useProjetos';
import { useOrcamento } from './hooks/useOrcamento';
import { useInsumosProjeto } from './hooks/useInsumosProjeto';
import { useCronograma } from './hooks/useCronograma';
import { useMedicoes } from './hooks/useMedicoes';
import { useAcessos } from './hooks/useAcessos';
import { useProjetoEquipe } from './hooks/useProjetoEquipe';
import { canAccessTab, rolesForTab } from './constants/tabAccess';

// Single source of truth for module display names — keeps the breadcrumb and
// any other label lookup in sync (the sidebar owns its own copy of the labels).
const TAB_LABELS: Record<string, string> = {
  dashboard: 'Indicadores',
  projetos: 'Projetos (Obras)',
  propostas: 'Propostas',
  clientes: 'Clientes',
  fornecedores: 'Fornecedores',
  equipe: 'Equipe',
  documentos: 'Documentos da Empresa',
  empresa: 'Financeiro',
  catalogo: 'Catálogo de Insumos',
  acessos: 'Gestão de Acessos',
};

/**
 * Que conjuntos de dados cada aba precisa.
 *
 * Antes os 20 hooks buscavam tudo no login, para todo papel. Aqui a aba declara
 * o que consome, e o hook só dispara quando alguém chega nela — mas uma vez
 * carregado o dado permanece (ver `dadosAtivos`), então voltar a uma aba já
 * visitada é instantâneo e nenhuma escrita perde contexto.
 *
 * Vale como documentação também: é o único lugar do código que diz, em uma
 * linha por aba, de que a tela depende.
 */
const DADOS_POR_ABA: Record<string, readonly string[]> = {
  // Os indicadores cruzam o funil comercial com o avanço físico e financeiro.
  dashboard: ['clientes', 'propostas', 'projetos', 'orcamento', 'cronograma', 'medicoes', 'funcionarios'],
  // O console da obra abre orçamento, cronograma, medições, documentos e equipe.
  projetos: ['projetos', 'clientes', 'propostas', 'funcionarios', 'fornecedores', 'orcamento',
             'insumos', 'catalogo', 'cronograma', 'medicoes', 'documentos', 'projetoEquipe'],
  propostas: ['propostas', 'clientes', 'funcionarios', 'projetos', 'catalogo', 'fornecedores', 'empresaConfig'],
  clientes: ['clientes', 'clienteDocumentos', 'projetos', 'propostas'],
  fornecedores: ['fornecedores', 'financeiro', 'catalogo'],
  equipe: ['funcionarios', 'funcionarioDocumentos', 'projetos', 'cronograma'],
  documentos: ['documentos', 'documentoCategorias'],
  empresa: ['financeiro', 'funcionarios', 'projetos', 'fornecedores', 'medicoes', 'empresaConfig'],
  catalogo: ['catalogo', 'projetos', 'fornecedores'],
  acessos: ['acessos', 'funcionarios'],
};

export default function App() {
  const { toast } = useFeedback();
  const { session, profile, active, profileError, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // Abaixo de `lg` a sidebar é uma gaveta sobreposta — antes ela era coluna fixa
  // de 240px em qualquer largura, e o app simplesmente não abria num celular.
  const [menuAberto, setMenuAberto] = useState(false);

  // Conjuntos já pedidos por alguma aba visitada. Só cresce: um dado carregado
  // não é descartado ao sair da aba, senão trocar de aba e voltar refaria tudo.
  const [dadosAtivos, setDadosAtivos] = useState<Set<string>>(
    () => new Set(DADOS_POR_ABA.dashboard)
  );

  useEffect(() => {
    const precisa = DADOS_POR_ABA[activeTab];
    if (!precisa) return;
    setDadosAtivos((atual) => {
      const faltando = precisa.filter((d) => !atual.has(d));
      if (faltando.length === 0) return atual; // evita re-render desnecessário
      return new Set([...atual, ...faltando]);
    });
  }, [activeTab]);

  // `active` entra aqui, e não só na guarda de render mais abaixo: os hooks são
  // chamados antes de qualquer `return`, então sem isto um acesso desativado
  // ainda disparava as ~7 buscas do conjunto do dashboard — todas voltando
  // vazias pela RLS. Também evita buscar antes de o perfil ser conhecido.
  const ativo = (dado: string) => active && dadosAtivos.has(dado);

  // --- ENTIDADES JÁ MIGRADAS PARA O SUPABASE ---
  const { clientes, handleAddCliente, handleUpdateCliente, handleDeleteCliente } = useClientes(ativo('clientes'));
  const {
    clienteDocumentos,
    handleUploadClienteDocumento,
    handleDeleteClienteDocumento,
    handleDownloadClienteDocumento,
  } = useClienteDocumentos(ativo('clienteDocumentos'));
  const {
    fornecedores,
    loading: loadingFornecedores,
    handleAddFornecedor,
    handleUpdateFornecedor,
    handleSetAtivoFornecedor,
    handleDeleteFornecedor,
    handleAddCompra,
    handleTogglePago,
  } = useFornecedores(ativo('fornecedores'));
  const {
    funcionarios,
    loading: funcionariosLoading,
    handleAddFuncionario,
    handleUpdateFuncionario,
    handleUpdateStatusFuncionario,
    handleUpdateSalarioFuncionario,
  } = useFuncionarios(ativo('funcionarios'));
  const {
    funcionarioDocumentos,
    handleUploadFuncionarioDocumento,
    handleUpdateValidadeDocumento,
    handleDeleteFuncionarioDocumento,
    handleDownloadFuncionarioDocumento,
  } = useFuncionarioDocumentos(ativo('funcionarioDocumentos'));
  const {
    propostas,
    itensProposta,
    loading: propostasLoading,
    carregandoDetalhe: propostaCarregandoDetalhe,
    carregarDetalheProposta,
    handleAddProposta,
    handleUpdateProposta,
    handleDuplicarProposta,
    handleUpdateBdiVisivelPdf,
    handleUpdateStatusProposta,
    handleUpdateBdi,
    handleAddRevision,
    handleDeleteProposta,
    handleAddItemProposta,
    handleAjustarItemProposta,
    handleAjustarQuantidadeItemProposta,
    handleRemoveItemProposta,
  } = usePropostas(ativo('propostas'));
  // Papel timbrado do documento impresso. Fica aqui porque quem consome é a
  // aba Propostas, e quem edita é a aba Empresa.
  const {
    empresa,
    handleSaveEmpresa,
    handleUploadLogo,
    handleRemoverLogo,
  } = useEmpresaConfig(ativo('empresaConfig'));
  const {
    catalogo,
    total: catalogoTotal,
    loading: catalogoLoading,
    filtro: catalogoFiltro,
    paginas: catalogoPaginas,
    aplicarFiltro: aplicarFiltroCatalogo,
    recarregar: recarregarCatalogo,
    carregarDetalhe: carregarDetalheCatalogo,
    handleAddCatalogoItem,
    handleUpdateCatalogoItem,
    handleSetAtivoCatalogoItem,
    carregarUsos: carregarUsosCatalogo,
    handleExcluirCatalogoItem,
    handleAddCotacao,
    handleDesativarCotacao,
    handleAdotarPrecoCotacao,
    handleAddComponente,
    handleUpdateComponente,
    handleRemoverComponente,
    buscarCandidatosComponente,
  } = useCatalogo(ativo('catalogo'));
  // A base de referência SINAPI acompanha a aba de catálogo: é de lá que o
  // painel de adoção é aberto. O hook só vai ao servidor quando o painel abre.
  const sinapi = useSinapi(ativo('catalogo'));
  const { contas, lancamentos, resultadoObras, loading: financeiroLoading, handleAddConta, handleAddLancamento, handleUpdateLancamento, handleUpdateConta, handleExcluirConta, handleToggleContaAtiva, handleGerarFaturamento, handleToggleLancamentoPago, handleDeleteLancamento } =
    useFinanceiro(ativo('financeiro'));
  const {
    documentos,
    handleAddDocumento,
    handleAddVersion,
    handleUpdateDocumento,
    handleDeleteDocumento,
    handleDownloadDocumento,
    handlePreviewUrlDocumento,
    refetch: refetchDocumentos,
  } = useDocumentos(ativo('documentos'));
  const { categorias: documentoCategorias, handleAddCategoria, handleUpdateCategoria, handleDeleteCategoria } = useDocumentoCategorias(ativo('documentoCategorias'));

  // Renaming a category cascades on the DB side (documentos.tipo FK), but the
  // already-loaded documentos list needs a manual refetch to pick it up.
  const handleUpdateCategoriaAndSync = async (id: string, patch: { nome?: string; cor?: CorCategoriaDocumento }) => {
    await handleUpdateCategoria(id, patch);
    if (patch.nome) refetchDocumentos();
  };
  const {
    projetos,
    loading: projetosLoading,
    handleCreateManualProjeto,
    handleConvertFromProposta,
    handleUpdateProjeto,
    handleUpdateProjetoSituacao,
    handleDeleteProjeto: handleDeleteProjetoBase,
  } = useProjetos(ativo('projetos'));
  const { orcamentos, alteracoesOrcamento, handleAddOrcamentoItem, refreshOrcamentos } = useOrcamento(ativo('orcamento'));
  const {
    insumosProjeto,
    refreshInsumosProjeto,
    handleAddInsumoProjeto: handleAddInsumoProjetoBase,
    handleAjustarPrecoInsumo: handleAjustarPrecoInsumoBase,
    handleAjustarQuantidadeInsumo: handleAjustarQuantidadeInsumoBase,
    handleRessincronizarBase,
    handleRemoveInsumoProjeto: handleRemoveInsumoProjetoBase,
  } = useInsumosProjeto(ativo('insumos'));
  const {
    cronograma,
    vinculos,
    handleAddEtapa,
    handleUpdateEtapa,
    handleRemoveEtapa: handleRemoveEtapaBase,
    handleAddVinculo,
    handleRemoveVinculo,
    refreshCronograma,
  } = useCronograma(ativo('cronograma'));
  const {
    medicoes,
    refreshMedicoes,
    handleAddMedicao: handleAddMedicaoBase,
    handleAprovarMedicao: handleAprovarMedicaoBase,
    handleRejeitarMedicao: handleRejeitarMedicaoBase,
    handleFotoUrlMedicao,
  } = useMedicoes(ativo('medicoes'));
  const { acessos, loading: acessosLoading, handleUpdateRole, handleToggleActive, handleUpdateFuncionarioLink } =
    useAcessos(ativo('acessos'));
  const {
    projetoEquipe,
    perfisCampo,
    handleAddMembro: handleAddMembroEquipe,
    handleRemoveMembro: handleRemoveMembroEquipe,
    refreshProjetoEquipe,
  } = useProjetoEquipe(ativo('projetoEquipe'));

  // Convert an approved proposal into the central Project/Obra using the values
  // the user reviewed in the conversion wizard (orçamento + cronograma + vínculos),
  // via fn_criar_projeto_from_proposta in one DB transaction — see
  // useProjetos.handleConvertFromProposta / projetosService.convertPropostaWithPayload.
  // No longer distributes a fixed percentage split; the payload drives everything.
  const handleConvertToProject = async (
    prop: Proposta,
    payload: ConversaoObraPayload
  ): Promise<string | null> => {
    const newProjId = await handleConvertFromProposta(prop.id, payload);
    if (!newProjId) return null;
    await Promise.all([refreshOrcamentos(), refreshCronograma()]);
    toast.success('Obra iniciada com sucesso.', `A proposta ${prop.numero} foi convertida em obra.`);

    // Force redirect to Projects module and open the newly created project console!
    setSelectedProjectId(newProjId);
    setActiveTab('projetos');
    return newProjId;
  };


  // --- HANDLERS: PROJETOS (CENTRAL HUB) ---
  // Manual creation now delegates the whole thing (projeto + 5 staggered default
  // stages, no orçamento) to fn_criar_projeto_manual in one DB transaction —
  // see useProjetos.handleCreateManualProjeto / projetosService.createManual.
  // Replaces the old client-side `defaultStages.forEach(handleAddEtapa)` that
  // fired 5 un-awaited inserts with no rollback and collapsed most stages onto
  // the same day. After it lands we refetch the cronograma view.
  const handleAddProjeto = async (proj: Projeto): Promise<string | null> => {
    const newProjId = await handleCreateManualProjeto(proj);
    if (!newProjId) return null;
    await refreshCronograma();
    return newProjId;
  };

  // Devolve se a obra foi mesmo excluída para a tela só confirmar depois disso —
  // um perfil sem permissão de delete não recebe erro do PostgREST, então o
  // service conta as linhas afetadas (ver projetosService.remove).
  const handleDeleteProjeto = async (id: string): Promise<boolean> => {
    const ok = await handleDeleteProjetoBase(id);
    if (!ok) return false;
    // Budget items, stages and measurements all have an `on delete cascade`
    // FK to projetos now, so the DB cleans them up automatically — just
    // refetch local state so the UI reflects it immediately. Medições,
    // documentos, insumos e equipe também caem no cascade: sem estes refetches
    // eles ficavam em memória apontando para uma obra que não existe mais e
    // seguiam alimentando os contadores do dashboard.
    refreshOrcamentos();
    refreshCronograma();
    refreshMedicoes();
    refreshInsumosProjeto();
    refreshProjetoEquipe();
    refetchDocumentos();
    return true;
  };

  // Apagar uma etapa leva os boletins dela junto (cascade), e o valor executado
  // das linhas de orçamento é derivado desses boletins — por isso o orçamento
  // precisa ser recarregado também.
  const handleRemoveEtapa = async (id: string): Promise<boolean> => {
    const ok = await handleRemoveEtapaBase(id);
    if (!ok) return false;
    await Promise.all([refreshOrcamentos(), refreshMedicoes()]);
    return true;
  };

  // --- HANDLERS: INSUMOS DA OBRA (QUANTITATIVO + AJUSTE DE PREÇO) ---
  // Quantidade e ajuste recalculam `itens_orcamento.valor_orcado` por trigger no
  // banco (fn_sync_valor_item_orcamento) — nenhum desses valores é computado no
  // cliente. Por isso toda escrita aqui é seguida de um refetch do orçamento.
  const handleAddInsumoProjeto = async (novo: Parameters<typeof handleAddInsumoProjetoBase>[0]) => {
    const criado = await handleAddInsumoProjetoBase(novo);
    if (criado) await refreshOrcamentos();
    return criado;
  };

  const handleAjustarPrecoInsumo = async (id: string, ajuste: Parameters<typeof handleAjustarPrecoInsumoBase>[1]) => {
    const atualizado = await handleAjustarPrecoInsumoBase(id, ajuste);
    if (atualizado) await refreshOrcamentos();
    return atualizado;
  };

  const handleAjustarQuantidadeInsumo = async (id: string, quantidade: number) => {
    const atualizado = await handleAjustarQuantidadeInsumoBase(id, quantidade);
    if (atualizado) await refreshOrcamentos();
    return atualizado;
  };

  const handleRemoveInsumoProjeto = async (id: string) => {
    const ok = await handleRemoveInsumoProjetoBase(id);
    if (ok) await refreshOrcamentos();
    return ok;
  };

  // --- HANDLERS: MEASUREMENTS (MEDIÇÕES) ---
  // A medição's financial fan-out (via etapa_orcamento_vinculo) and the
  // etapa's percentual/status are both computed server-side (fix #1) — after
  // a successful insert we just refetch the two derived views.
  const handleAddMedicao = async (
    med: { projetoId: string; etapaId: string; percentualMedido: number; observacoes: string },
    fotos: File[]
  ): Promise<boolean> => {
    const created = await handleAddMedicaoBase(med, fotos);
    if (!created) return false;
    await Promise.all([refreshOrcamentos(), refreshCronograma()]);
    return true;
  };

  // Approving a medição fans out to the orçamento and can promote the obra —
  // after it lands, refetch the two derived views. 'overrun' bubbles up so the
  // console can ask for an explicit override.
  const handleAprovarMedicao = async (medicaoId: string, permitirOverrun = false) => {
    const result = await handleAprovarMedicaoBase(medicaoId, permitirOverrun);
    if (result === 'ok') {
      await Promise.all([refreshOrcamentos(), refreshCronograma()]);
    }
    return result;
  };

  const handleRejeitarMedicao = async (medicaoId: string, motivo: string) => {
    const ok = await handleRejeitarMedicaoBase(medicaoId, motivo);
    if (ok) {
      await Promise.all([refreshOrcamentos(), refreshCronograma()]);
    }
    return ok;
  };


  // Helper for counts badge on sidebar
  const countsObj = {
    clientes: clientes.length,
    propostas: propostas.length,
    fornecedores: fornecedores.length,
    projetos: projetos.length,
    equipe: funcionarios.length,
    // A aba mostra só o acervo da empresa; documento de obra é contado no console.
    documentos: documentos.filter((d) => d.projetoId === null).length
  };

  const navigateTab = (tabId: string, projectId: string | null = null) => {
    // Dashboard cards can point at modules the role can't access (matrix in
    // constants/tabAccess); the sidebar is already filtered, this guards the rest.
    if (!canAccessTab(profile?.role, tabId)) return;
    setActiveTab(tabId);
    if (projectId) {
      setSelectedProjectId(projectId);
    } else {
      setSelectedProjectId(null);
    }
  };

  const activeProject = selectedProjectId ? projetos.find(p => p.id === selectedProjectId) : null;

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC] text-blue-600">
        <Spinner size={24} />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  // Autenticado, mas sem permissão de uso. Desde
  // `20260802100001_papel_respeita_active.sql` a RLS já barra tudo para perfil
  // desativado (fn_current_role devolve NULL) — sem esta guarda o usuário veria
  // a aplicação inteira vazia e sem explicação, que é justamente o "estado
  // morto" apontado no §5.2 da auditoria. Cobre também a falha de leitura do
  // perfil, em que `role` nulo esconde todas as abas.
  if (!active) {
    return (
      <AcessoIndisponivel
        erro={profileError}
        email={profile?.email ?? session.user.email}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div id="app-root-container" className="flex h-screen bg-[#F8FAFC] overflow-hidden font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white">

      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedProjectId={selectedProjectId}
        activeProjectName={activeProject?.nome ?? null}
        clearSelectedProject={() => setSelectedProjectId(null)}
        counts={countsObj}
        profile={profile}
        onSignOut={signOut}
        menuAberto={menuAberto}
        onFecharMenu={() => setMenuAberto(false)}
      />

      {/* Main Workspace Frame */}
      <main id="main-content-area" className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        
        {/* Upper Top Navbar Context */}
        <header id="top-navbar" className="bg-white border-b border-slate-100 h-14 shrink-0 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3 min-w-0">
            {/* Abre a gaveta. Some a partir de `lg`, onde a sidebar já está visível. */}
            <button
              type="button"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu de navegação"
              aria-expanded={menuAberto}
              className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition shrink-0"
            >
              <Menu size={18} />
            </button>
            {/* Breadcrumbs dinâmicos e clicáveis — cada nível anterior navega de volta */}
            <nav className="flex items-center gap-2 text-xs text-slate-500">
              {/* Raiz: Indicadores (= página inicial). Clicável quando não estamos nela. */}
              {activeTab === 'dashboard' ? (
                <span className="font-semibold text-slate-700">{TAB_LABELS.dashboard}</span>
              ) : (
                <button
                  onClick={() => navigateTab('dashboard')}
                  className="font-semibold text-slate-400 hover:text-blue-600 transition"
                >
                  {TAB_LABELS.dashboard}
                </button>
              )}

              {/* Nível do módulo. Clicável (volta para a lista) quando há um projeto aberto. */}
              {activeTab !== 'dashboard' && (
                <>
                  <ChevronRight size={13} className="text-slate-300" />
                  {activeProject ? (
                    <button
                      onClick={() => setSelectedProjectId(null)}
                      className="font-semibold text-slate-500 hover:text-blue-600 transition"
                    >
                      {TAB_LABELS[activeTab] ?? activeTab}
                    </button>
                  ) : (
                    <span className="font-semibold text-slate-700">{TAB_LABELS[activeTab] ?? activeTab}</span>
                  )}
                </>
              )}

              {/* Nível do projeto: página atual, não clicável. */}
              {activeProject && (
                <>
                  <ChevronRight size={13} className="text-slate-300" />
                  <span className="font-extrabold text-blue-600">{activeProject.nome}</span>
                </>
              )}
            </nav>
          </div>
        </header>

        {/* Dynamic Inner Tab View */}
        <div id="tab-viewport" className="flex-1 overflow-y-auto p-4 lg:p-6 grid-lines">
          {/* O fallback aparece só na primeira visita a cada aba: depois o chunk
              está em cache e a troca é síncrona. */}
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-24 text-blue-600" role="status" aria-label="Carregando módulo">
                <Spinner size={22} />
              </div>
            }
          >
          {activeTab === 'dashboard' && (
            <DashboardOverview 
              clientes={clientes}
              propostas={propostas}
              projetos={projetos}
              orcamentos={orcamentos}
              alteracoesOrcamento={alteracoesOrcamento}
              cronograma={cronograma}
              vinculos={vinculos}
              medicoes={medicoes}
              equipeCount={funcionarios.filter(f => f.status === 'Ativo').length}
              role={profile?.role}
              onNavigate={navigateTab}
            />
          )}

          {activeTab === 'clientes' && (
            <ClientesTab
              clientes={clientes}
              projetos={projetos}
              propostas={propostas}
              clienteDocumentos={clienteDocumentos}
              onAddCliente={handleAddCliente}
              onUpdateCliente={handleUpdateCliente}
              onDeleteCliente={handleDeleteCliente}
              onUploadClienteDocumento={handleUploadClienteDocumento}
              onDeleteClienteDocumento={handleDeleteClienteDocumento}
              onDownloadClienteDocumento={handleDownloadClienteDocumento}
            />
          )}

          {activeTab === 'propostas' && (
            <PropostasTab
              propostas={propostas}
              itensProposta={itensProposta}
              loading={propostasLoading}
              carregandoDetalhe={propostaCarregandoDetalhe}
              carregarDetalheProposta={carregarDetalheProposta}
              clientes={clientes}
              funcionarios={funcionarios}
              projetos={projetos}
              catalogo={catalogo}
              fornecedores={fornecedores}
              empresa={empresa}
              aplicarFiltroCatalogo={aplicarFiltroCatalogo}
              onAddProposta={handleAddProposta}
              onUpdateProposta={handleUpdateProposta}
              onDuplicarProposta={handleDuplicarProposta}
              onUpdateStatus={handleUpdateStatusProposta}
              onAbrirObra={(projetoId) => navigateTab('projetos', projetoId)}
              onUpdateBdi={handleUpdateBdi}
              onUpdateBdiVisivelPdf={handleUpdateBdiVisivelPdf}
              onAddRevision={handleAddRevision}
              onConvertToProject={handleConvertToProject}
              onDeleteProposta={handleDeleteProposta}
              onAddItemProposta={handleAddItemProposta}
              onAjustarItemProposta={handleAjustarItemProposta}
              onAjustarQuantidadeItemProposta={handleAjustarQuantidadeItemProposta}
              onRemoveItemProposta={handleRemoveItemProposta}
            />
          )}

          {activeTab === 'fornecedores' && (
            <FornecedoresTab
              fornecedores={fornecedores}
              loading={loadingFornecedores}
              contas={contas}
              catalogo={catalogo}
              onAddFornecedor={handleAddFornecedor}
              onUpdateFornecedor={handleUpdateFornecedor}
              onSetAtivoFornecedor={handleSetAtivoFornecedor}
              onDeleteFornecedor={handleDeleteFornecedor}
              onAddCompra={handleAddCompra}
              onTogglePago={handleTogglePago}
            />
          )}

          {activeTab === 'projetos' && (
            <ProjetosTab 
              projetos={projetos}
              clientes={clientes}
              propostas={propostas}
              funcionarios={funcionarios}
              fornecedores={fornecedores}
              orcamentos={orcamentos}
              alteracoesOrcamento={alteracoesOrcamento}
              insumosProjeto={insumosProjeto}
              catalogo={catalogo}
              cronograma={cronograma}
              vinculos={vinculos}
              medicoes={medicoes}
              documentos={documentos}
              documentoCategorias={documentoCategorias}
              projetoEquipe={projetoEquipe}
              perfisCampo={perfisCampo}
              selectedProjectId={selectedProjectId}
              role={profile?.role}
              loading={projetosLoading}
              onSelectProject={setSelectedProjectId}
              onAddProjeto={handleAddProjeto}
              onUpdateProjeto={handleUpdateProjeto}
              onDeleteProjeto={handleDeleteProjeto}
              onUpdateProjetoSituacao={handleUpdateProjetoSituacao}
              onAddEtapa={handleAddEtapa}
              onUpdateEtapa={handleUpdateEtapa}
              onRemoveEtapa={handleRemoveEtapa}
              onAddOrcamentoItem={handleAddOrcamentoItem}
              onAjustarPrecoInsumo={handleAjustarPrecoInsumo}
              onAjustarQuantidadeInsumo={handleAjustarQuantidadeInsumo}
              onRessincronizarBaseInsumo={handleRessincronizarBase}
              onRemoveInsumoProjeto={handleRemoveInsumoProjeto}
              onAddVinculo={handleAddVinculo}
              onRemoveVinculo={handleRemoveVinculo}
              onAddMedicao={handleAddMedicao}
              onAprovarMedicao={handleAprovarMedicao}
              onRejeitarMedicao={handleRejeitarMedicao}
              onFotoUrlMedicao={handleFotoUrlMedicao}
              onAddDocumento={handleAddDocumento}
              onAddVersionDocumento={handleAddVersion}
              onUpdateDocumento={handleUpdateDocumento}
              onDeleteDocumento={handleDeleteDocumento}
              onDownloadDocumento={handleDownloadDocumento}
              onPreviewUrlDocumento={handlePreviewUrlDocumento}
              onAddCategoriaDocumento={handleAddCategoria}
              onUpdateCategoriaDocumento={handleUpdateCategoriaAndSync}
              onDeleteCategoriaDocumento={handleDeleteCategoria}
              onAddMembroEquipe={handleAddMembroEquipe}
              onRemoveMembroEquipe={handleRemoveMembroEquipe}
            />
          )}

          {activeTab === 'equipe' && (
            <EquipeTab
              funcionarios={funcionarios}
              projetos={projetos}
              cronograma={cronograma}
              loading={funcionariosLoading}
              funcionarioDocumentos={funcionarioDocumentos}
              onAddFuncionario={handleAddFuncionario}
              onUpdateFuncionario={handleUpdateFuncionario}
              onUpdateStatusFuncionario={handleUpdateStatusFuncionario}
              onUpdateSalarioFuncionario={handleUpdateSalarioFuncionario}
              onUploadFuncionarioDocumento={handleUploadFuncionarioDocumento}
              onUpdateValidadeDocumento={handleUpdateValidadeDocumento}
              onDeleteFuncionarioDocumento={handleDeleteFuncionarioDocumento}
              onDownloadFuncionarioDocumento={handleDownloadFuncionarioDocumento}
            />
          )}

          {activeTab === 'documentos' && (
            <DocumentosPanel
              escopo="empresa"
              projetoId={null}
              documentos={documentos}
              categorias={documentoCategorias}
              onAddDocumento={handleAddDocumento}
              onAddVersion={handleAddVersion}
              onUpdateDocumento={handleUpdateDocumento}
              onDeleteDocumento={handleDeleteDocumento}
              onDownloadDocumento={handleDownloadDocumento}
              onPreviewUrl={handlePreviewUrlDocumento}
              onAddCategoria={handleAddCategoria}
              onUpdateCategoria={handleUpdateCategoriaAndSync}
              onDeleteCategoria={handleDeleteCategoria}
            />
          )}

          {activeTab === 'catalogo' && (
            <CatalogoTab
              catalogo={catalogo}
              total={catalogoTotal}
              loading={catalogoLoading}
              filtro={catalogoFiltro}
              paginas={catalogoPaginas}
              projetos={projetos}
              fornecedores={fornecedores}
              aplicarFiltro={aplicarFiltroCatalogo}
              recarregar={recarregarCatalogo}
              carregarDetalhe={carregarDetalheCatalogo}
              onAddCatalogoItem={handleAddCatalogoItem}
              onUpdateCatalogoItem={handleUpdateCatalogoItem}
              onSetAtivoCatalogoItem={handleSetAtivoCatalogoItem}
              carregarUsosInsumo={carregarUsosCatalogo}
              onExcluirCatalogoItem={handleExcluirCatalogoItem}
              onAddOrcamentoItem={handleAddOrcamentoItem}
              onAddInsumoProjeto={handleAddInsumoProjeto}
              onAddCotacao={handleAddCotacao}
              onDesativarCotacao={handleDesativarCotacao}
              onAdotarPrecoCotacao={handleAdotarPrecoCotacao}
              onAddComponente={handleAddComponente}
              onUpdateComponente={handleUpdateComponente}
              onRemoverComponente={handleRemoverComponente}
              buscarCandidatosComponente={buscarCandidatosComponente}
              sinapi={sinapi}
            />
          )}

          {activeTab === 'empresa' && (
            // Defesa em profundidade: a RLS já devolve vazio para quem não é
            // admin/financeiro, mas sem isto a tela inteira — formulários de
            // lançamento, folha, botões de faturar — ainda era montada e
            // convidava a ações que morreriam no servidor. `rolesForTab` evita
            // repetir a matriz de acesso aqui.
            <RequireRole
              allow={rolesForTab('empresa')}
              fallback={
                <EmptyState
                  icon={Wallet}
                  title="Módulo financeiro restrito"
                  description="Só os perfis de administração e financeiro têm acesso ao caixa, ao razão e à folha de pagamento."
                />
              }
            >
              <EmpresaTab
                funcionarios={funcionarios}
                projetos={projetos}
                fornecedores={fornecedores}
                contas={contas}
                medicoes={medicoes}
                resultadoObras={resultadoObras}
                loading={financeiroLoading}
                onAddConta={handleAddConta}
                lancamentos={lancamentos}
                onAddLancamento={handleAddLancamento}
                onUpdateLancamento={handleUpdateLancamento}
                onUpdateConta={handleUpdateConta}
                onExcluirConta={handleExcluirConta}
                onToggleContaAtiva={handleToggleContaAtiva}
                onGerarFaturamento={handleGerarFaturamento}
                onToggleLancamentoPago={handleToggleLancamentoPago}
                onDeleteLancamento={handleDeleteLancamento}
                empresa={empresa}
                onSaveEmpresa={handleSaveEmpresa}
                onUploadLogo={handleUploadLogo}
                onRemoverLogo={handleRemoverLogo}
              />
            </RequireRole>
          )}

          {activeTab === 'acessos' && (
            <RequireRole allow={['admin']}>
              <AcessosTab
                acessos={acessos}
                funcionarios={funcionarios}
                loading={acessosLoading}
                onUpdateRole={handleUpdateRole}
                onToggleActive={handleToggleActive}
                onUpdateFuncionarioLink={handleUpdateFuncionarioLink}
              />
            </RequireRole>
          )}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
