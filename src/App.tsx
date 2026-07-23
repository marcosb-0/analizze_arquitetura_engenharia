/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DashboardOverview from './components/DashboardOverview';
import ClientesTab from './components/ClientesTab';
import PropostasTab from './components/PropostasTab';
import FornecedoresTab from './components/FornecedoresTab';
import ProjetosTab from './components/ProjetosTab';
import EquipeTab from './components/EquipeTab';
import DocumentosTab from './components/DocumentosTab';
import CatalogoTab from './components/CatalogoTab';
import EmpresaTab from './components/EmpresaTab';
import AcessosTab from './components/AcessosTab';
import RequireRole from './components/RequireRole';

import { 
  Cliente, 
  Proposta, 
  Fornecedor, 
  Projeto,
  ItemOrcamento,
  AlteracaoOrcamento,
  Funcionario,
  MedicaoObra, 
  Documento,
  RevisaoProposta,
  CompraFornecedor,
  InsumoCatalogo,
  ContaFinanceira,
  LancamentoFinanceiro,
  ConversaoObraPayload
} from './types';

import { ChevronRight } from 'lucide-react';
import { useFeedback } from './components/FeedbackContext';
import { useAuth } from './contexts/AuthContext';
import LoginScreen from './components/LoginScreen';
import Spinner from './components/Spinner';
import { useClientes } from './hooks/useClientes';
import { useClienteDocumentos } from './hooks/useClienteDocumentos';
import { useFornecedores } from './hooks/useFornecedores';
import { useFuncionarios } from './hooks/useFuncionarios';
import { usePropostas } from './hooks/usePropostas';
import { useCatalogo } from './hooks/useCatalogo';
import { useFinanceiro } from './hooks/useFinanceiro';
import { useDocumentos } from './hooks/useDocumentos';
import { useDocumentoCategorias } from './hooks/useDocumentoCategorias';
import { CorCategoriaDocumento } from './types';
import { useProjetos } from './hooks/useProjetos';
import { useOrcamento } from './hooks/useOrcamento';
import { useCronograma } from './hooks/useCronograma';
import { useMedicoes } from './hooks/useMedicoes';
import { useAcessos } from './hooks/useAcessos';
import { useProjetoEquipe } from './hooks/useProjetoEquipe';
import { canAccessTab } from './constants/tabAccess';

// Single source of truth for module display names — keeps the breadcrumb and
// any other label lookup in sync (the sidebar owns its own copy of the labels).
const TAB_LABELS: Record<string, string> = {
  dashboard: 'Indicadores',
  projetos: 'Projetos (Obras)',
  propostas: 'Propostas',
  clientes: 'Clientes',
  fornecedores: 'Fornecedores',
  equipe: 'Equipe',
  documentos: 'Documentos',
  empresa: 'Financeiro',
  catalogo: 'Catálogo de Insumos',
  acessos: 'Gestão de Acessos',
};

export default function App() {
  const { toast, confirm } = useFeedback();
  const { session, profile, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // --- ENTIDADES JÁ MIGRADAS PARA O SUPABASE ---
  const { clientes, handleAddCliente, handleUpdateCliente, handleDeleteCliente } = useClientes();
  const {
    clienteDocumentos,
    handleUploadClienteDocumento,
    handleDeleteClienteDocumento,
    handleDownloadClienteDocumento,
  } = useClienteDocumentos();
  const {
    fornecedores,
    handleAddFornecedor,
    handleUpdateFornecedor,
    handleDeleteFornecedor,
    handleAddCompra,
    handleTogglePago,
  } = useFornecedores();
  const {
    funcionarios,
    handleAddFuncionario,
    handleUpdateStatusFuncionario,
    handleUpdateSalarioFuncionario,
    handleDeleteFuncionario,
  } = useFuncionarios();
  const { propostas, handleAddProposta, handleUpdateStatusProposta, handleAddRevision, handleDeleteProposta } = usePropostas();
  const {
    catalogo,
    handleAddCatalogoItem,
    handleUpdateCatalogoItem,
    handleDeleteCatalogoItem,
    handleAddCotacao,
    handleRemoveCotacao,
  } = useCatalogo();
  const { contas, lancamentos, handleAddConta, handleAddLancamento, handleGerarFaturamento, handleToggleLancamentoPago, handleDeleteLancamento } =
    useFinanceiro();
  const {
    documentos,
    handleAddDocumento,
    handleAddVersion,
    handleDeleteDocumento,
    handleDownloadDocumento,
    refetch: refetchDocumentos,
  } = useDocumentos();
  const { categorias: documentoCategorias, handleAddCategoria, handleUpdateCategoria, handleDeleteCategoria } = useDocumentoCategorias();

  // Renaming a category cascades on the DB side (documentos.tipo FK), but the
  // already-loaded documentos list needs a manual refetch to pick it up.
  const handleUpdateCategoriaAndSync = async (id: string, patch: { nome?: string; cor?: CorCategoriaDocumento }) => {
    await handleUpdateCategoria(id, patch);
    if (patch.nome) refetchDocumentos();
  };
  const {
    projetos,
    handleCreateManualProjeto,
    handleConvertFromProposta,
    handleUpdateProjetoSituacao,
    handleDeleteProjeto: handleDeleteProjetoBase,
  } = useProjetos();
  const { orcamentos, alteracoesOrcamento, handleAddOrcamentoItem, refreshOrcamentos } = useOrcamento();
  const {
    cronograma,
    vinculos,
    handleAddVinculo,
    handleRemoveVinculo,
    refreshCronograma,
  } = useCronograma();
  const {
    medicoes,
    handleAddMedicao: handleAddMedicaoBase,
    handleAprovarMedicao: handleAprovarMedicaoBase,
    handleRejeitarMedicao: handleRejeitarMedicaoBase,
  } = useMedicoes();
  const { acessos, loading: acessosLoading, handleUpdateRole, handleToggleActive, handleUpdateFuncionarioLink } =
    useAcessos();
  const { projetoEquipe, perfisCampo, handleAddMembro: handleAddMembroEquipe, handleRemoveMembro: handleRemoveMembroEquipe } =
    useProjetoEquipe();

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

  const handleDeleteProjeto = (id: string) => {
    handleDeleteProjetoBase(id);
    // Budget items, stages and measurements all have an `on delete cascade`
    // FK to projetos now, so the DB cleans them up automatically — just
    // refetch local state so the UI reflects it immediately.
    refreshOrcamentos();
    refreshCronograma();
  };

  // --- HANDLERS: MEASUREMENTS (MEDIÇÕES) ---
  // A medição's financial fan-out (via etapa_orcamento_vinculo) and the
  // etapa's percentual/status are both computed server-side (fix #1) — after
  // a successful insert we just refetch the two derived views.
  const handleAddMedicao = async (
    med: { projetoId: string; etapaId: string; percentualMedido: number; observacoes: string },
    fotos: File[]
  ) => {
    const created = await handleAddMedicaoBase(med, fotos);
    if (created) {
      await Promise.all([refreshOrcamentos(), refreshCronograma()]);
    }
    return created;
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

  const handleRejeitarMedicao = async (medicaoId: string) => {
    const ok = await handleRejeitarMedicaoBase(medicaoId);
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
    documentos: documentos.length
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
      />

      {/* Main Workspace Frame */}
      <main id="main-content-area" className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        
        {/* Upper Top Navbar Context */}
        <header id="top-navbar" className="bg-white border-b border-slate-100 h-14 shrink-0 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
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
        <div id="tab-viewport" className="flex-1 overflow-y-auto p-6 grid-lines">
          {activeTab === 'dashboard' && (
            <DashboardOverview 
              clientes={clientes}
              propostas={propostas}
              projetos={projetos}
              orcamentos={orcamentos}
              alteracoesOrcamento={alteracoesOrcamento}
              cronograma={cronograma}
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
              clientes={clientes}
              funcionarios={funcionarios}
              onAddProposta={handleAddProposta}
              onUpdateStatus={handleUpdateStatusProposta}
              onAddRevision={handleAddRevision}
              onConvertToProject={handleConvertToProject}
              onDeleteProposta={handleDeleteProposta}
            />
          )}

          {activeTab === 'fornecedores' && (
            <FornecedoresTab
              fornecedores={fornecedores}
              contas={contas}
              onAddFornecedor={handleAddFornecedor}
              onUpdateFornecedor={handleUpdateFornecedor}
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
              cronograma={cronograma}
              vinculos={vinculos}
              medicoes={medicoes}
              documentos={documentos}
              projetoEquipe={projetoEquipe}
              perfisCampo={perfisCampo}
              selectedProjectId={selectedProjectId}
              role={profile?.role}
              onSelectProject={setSelectedProjectId}
              onAddProjeto={handleAddProjeto}
              onDeleteProjeto={handleDeleteProjeto}
              onUpdateProjetoSituacao={handleUpdateProjetoSituacao}
              onAddOrcamentoItem={handleAddOrcamentoItem}
              onAddVinculo={handleAddVinculo}
              onRemoveVinculo={handleRemoveVinculo}
              onAddMedicao={handleAddMedicao}
              onAprovarMedicao={handleAprovarMedicao}
              onRejeitarMedicao={handleRejeitarMedicao}
              onAddDocumento={handleAddDocumento}
              onDownloadDocumento={handleDownloadDocumento}
              onAddMembroEquipe={handleAddMembroEquipe}
              onRemoveMembroEquipe={handleRemoveMembroEquipe}
            />
          )}

          {activeTab === 'equipe' && (
            <EquipeTab 
              funcionarios={funcionarios}
              projetos={projetos}
              cronograma={cronograma}
              onAddFuncionario={handleAddFuncionario}
              onUpdateStatusFuncionario={handleUpdateStatusFuncionario}
              onUpdateSalarioFuncionario={handleUpdateSalarioFuncionario}
              onDeleteFuncionario={handleDeleteFuncionario}
            />
          )}

          {activeTab === 'documentos' && (
            <DocumentosTab
              documentos={documentos}
              projetos={projetos}
              categorias={documentoCategorias}
              onAddDocumento={handleAddDocumento}
              onAddVersion={handleAddVersion}
              onDeleteDocumento={handleDeleteDocumento}
              onDownloadDocumento={handleDownloadDocumento}
              onAddCategoria={handleAddCategoria}
              onUpdateCategoria={handleUpdateCategoriaAndSync}
              onDeleteCategoria={handleDeleteCategoria}
            />
          )}

          {activeTab === 'catalogo' && (
            <CatalogoTab 
              catalogo={catalogo}
              projetos={projetos}
              fornecedores={fornecedores}
              onAddCatalogoItem={handleAddCatalogoItem}
              onUpdateCatalogoItem={handleUpdateCatalogoItem}
              onDeleteCatalogoItem={handleDeleteCatalogoItem}
              onAddOrcamentoItem={handleAddOrcamentoItem}
              onAddCotacao={handleAddCotacao}
              onRemoveCotacao={handleRemoveCotacao}
            />
          )}

          {activeTab === 'empresa' && (
            <EmpresaTab
              funcionarios={funcionarios}
              projetos={projetos}
              fornecedores={fornecedores}
              contas={contas}
              medicoes={medicoes}
              onAddConta={handleAddConta}
              lancamentos={lancamentos}
              onAddLancamento={handleAddLancamento}
              onGerarFaturamento={handleGerarFaturamento}
              onToggleLancamentoPago={handleToggleLancamentoPago}
              onDeleteLancamento={handleDeleteLancamento}
            />
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
        </div>
      </main>
    </div>
  );
}
