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
import PessoasTab from './components/PessoasTab';
import EmpresaTab from './components/EmpresaTab';

import { 
  Cliente, 
  Proposta, 
  Fornecedor, 
  Projeto, 
  ItemOrcamento, 
  AlteracaoOrcamento, 
  EtapaCronograma, 
  Funcionario, 
  MedicaoObra, 
  Documento,
  RevisaoProposta,
  CompraFornecedor,
  InsumoCatalogo,
  ContaFinanceira,
  LancamentoFinanceiro
} from './types';

import { ChevronRight, Search, Bell } from 'lucide-react';
import { useFeedback } from './components/FeedbackContext';
import { useAuth } from './contexts/AuthContext';
import LoginScreen from './components/LoginScreen';
import Spinner from './components/Spinner';
import { useClientes } from './hooks/useClientes';
import { useFornecedores } from './hooks/useFornecedores';
import { useFuncionarios } from './hooks/useFuncionarios';
import { usePropostas } from './hooks/usePropostas';
import { useCatalogo } from './hooks/useCatalogo';
import { useFinanceiro } from './hooks/useFinanceiro';
import { useDocumentos } from './hooks/useDocumentos';
import { useProjetos } from './hooks/useProjetos';
import { useOrcamento } from './hooks/useOrcamento';
import { useCronograma } from './hooks/useCronograma';
import { useMedicoes } from './hooks/useMedicoes';

export default function App() {
  const { toast, confirm } = useFeedback();
  const { session, profile, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // --- ENTIDADES JÁ MIGRADAS PARA O SUPABASE ---
  const { clientes, handleAddCliente, handleDeleteCliente } = useClientes();
  const {
    fornecedores,
    handleAddFornecedor,
    handleDeleteFornecedor,
    handleAddCompra,
    handleTogglePago,
  } = useFornecedores();
  const {
    funcionarios,
    handleAddFuncionario,
    handleUpdateStatusFuncionario,
    handleDeleteFuncionario,
  } = useFuncionarios();
  const { propostas, handleAddProposta, handleUpdateStatusProposta, handleAddRevision } = usePropostas();
  const {
    catalogo,
    handleAddCatalogoItem,
    handleUpdateCatalogoItem,
    handleDeleteCatalogoItem,
    handleAddCotacao,
    handleRemoveCotacao,
  } = useCatalogo();
  const { contas, lancamentos, handleAddConta, handleAddLancamento, handleToggleLancamentoPago, handleDeleteLancamento } =
    useFinanceiro();
  const { documentos, handleAddDocumento, handleAddVersion, handleDeleteDocumento, handleDownloadDocumento } = useDocumentos();
  const {
    projetos,
    handleAddProjeto: handleAddProjetoBase,
    handleConvertToProject: handleConvertToProjectBase,
    handleUpdateProjetoSituacao,
    handleDeleteProjeto: handleDeleteProjetoBase,
  } = useProjetos();
  const { orcamentos, alteracoesOrcamento, handleAddOrcamentoItem, handleAddAlteracaoOrcamento, refreshOrcamentos } =
    useOrcamento();
  const {
    cronograma,
    vinculos,
    handleAddEtapa,
    handleAddVinculo,
    handleRemoveVinculo,
    refreshCronograma,
  } = useCronograma();
  const { medicoes, handleAddMedicao: handleAddMedicaoBase } = useMedicoes();

  const [modoInterface, setModoInterface] = useState<'Avançado' | 'Simplificado'>(() => {
    const saved = localStorage.getItem('constru_modo_interface');
    return (saved === 'Simplificado' || saved === 'Avançado') ? (saved as any) : 'Avançado';
  });

  useEffect(() => {
    localStorage.setItem('constru_modo_interface', modoInterface);
  }, [modoInterface]);


  // AUTOMATIC ACTION: Convert Approved Proposal to central Project.
  // Delegates the whole creation (projeto + orçamento padrão + cronograma
  // padrão + vínculos) to fn_criar_projeto_padrao in one DB transaction —
  // see useProjetos.handleConvertToProject / projetosService.convertProposta.
  // NOTE: no longer auto-creates a placeholder "Contrato_Execucao_*.pdf" doc —
  // that was always fake metadata with no real file behind it (pre-Storage-
  // migration prototype behavior). Real contract upload is a manual step in
  // Documentos, since a real Storage object needs real bytes.
  const handleConvertToProject = async (prop: Proposta) => {
    const newProjId = await handleConvertToProjectBase(prop.id);
    if (!newProjId) return;
    await Promise.all([refreshOrcamentos(), refreshCronograma()]);
    toast.success('Obra iniciada com sucesso.', `A proposta ${prop.numero} foi convertida em projeto.`);

    // Force redirect to Projects module and open the newly created project console!
    setSelectedProjectId(newProjId);
    setActiveTab('projetos');
  };


  // --- HANDLERS: PROJETOS (CENTRAL HUB) ---
  const handleAddProjeto = (proj: Projeto) => {
    handleAddProjetoBase(proj);

    // When starting a project manually, append standard chronogram stages automatically.
    // No budget items are auto-created in this flow (matches prior behavior),
    // so no etapa_orcamento_vinculo is auto-created either — the user links
    // budget lines to these stages later via the console's vinculo UI.
    const defaultStages: EtapaCronograma[] = [
      { id: crypto.randomUUID(), projetoId: proj.id, nome: 'Fundação / Terraplanagem', dataInicio: proj.dataInicio, dataFim: proj.dataInicio, responsavelId: funcionarios[1]?.id || funcionarios[0]?.id, percentualExecutado: 0, status: 'Não Iniciado' },
      { id: crypto.randomUUID(), projetoId: proj.id, nome: 'Estrutura / Alvenaria', dataInicio: proj.dataInicio, dataFim: proj.dataFim, responsavelId: funcionarios[1]?.id || funcionarios[0]?.id, percentualExecutado: 0, status: 'Não Iniciado' },
      { id: crypto.randomUUID(), projetoId: proj.id, nome: 'Instalações', dataInicio: proj.dataInicio, dataFim: proj.dataFim, responsavelId: funcionarios[3]?.id || funcionarios[0]?.id, percentualExecutado: 0, status: 'Não Iniciado' },
      { id: crypto.randomUUID(), projetoId: proj.id, nome: 'Acabamentos', dataInicio: proj.dataInicio, dataFim: proj.dataFim, responsavelId: funcionarios[2]?.id || funcionarios[0]?.id, percentualExecutado: 0, status: 'Não Iniciado' },
      { id: crypto.randomUUID(), projetoId: proj.id, nome: 'Entrega', dataInicio: proj.dataFim, dataFim: proj.dataFim, responsavelId: funcionarios[0]?.id, percentualExecutado: 0, status: 'Não Iniciado' }
    ];
    defaultStages.forEach(handleAddEtapa);
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
        clearSelectedProject={() => setSelectedProjectId(null)}
        counts={countsObj}
        profile={profile}
        onSignOut={signOut}
        modoInterface={modoInterface}
        onToggleModoInterface={() => {
          const nextModo = modoInterface === 'Simplificado' ? 'Avançado' : 'Simplificado';
          setModoInterface(nextModo);
          toast.success(
            `Modo ${nextModo} Ativado`, 
            nextModo === 'Simplificado' 
              ? 'Navegação compacta e simplificada para operação rápida.' 
              : 'Navegação expandida com indicadores detalhados.'
          );
          // Redirect to home dashboard upon toggling layout to ensure smooth transition
          setActiveTab('dashboard');
        }}
      />

      {/* Main Workspace Frame */}
      <main id="main-content-area" className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        
        {/* Upper Top Navbar Context */}
        <header id="top-navbar" className="bg-white border-b border-slate-100 h-14 shrink-0 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            {/* Breadcrumbs dinâmicos */}
            <nav className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-400">Painel Principal</span>
              {activeTab !== 'dashboard' && (
                <>
                  <ChevronRight size={13} className="text-slate-300" />
                  <span className="font-semibold text-slate-700 capitalize">
                    {activeTab === 'equipe' 
                      ? 'Gestão de Equipe' 
                      : activeTab === 'projetos' 
                        ? 'Projetos (Obras)' 
                        : activeTab === 'documentos' 
                          ? 'Gestão Documental' 
                          : activeTab === 'catalogo' 
                            ? 'Catálogo de Insumos' 
                            : activeTab === 'pessoas' 
                              ? 'Gestão de Pessoas' 
                              : activeTab === 'empresa'
                                ? 'Gestão da Empresa'
                                : activeTab}
                  </span>
                </>
              )}
              {activeProject && (
                <>
                  <ChevronRight size={13} className="text-slate-300" />
                  <span className="font-medium text-slate-450">Projeto</span>
                  <span className="font-extrabold text-blue-600">{activeProject.nome}</span>
                </>
              )}
            </nav>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Busca global */}
            <div className="relative hidden md:block">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar... (Ctrl+K)"
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs w-64 focus:border-blue-600 outline-none transition"
              />
            </div>
            
            {/* Notificações */}
            <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition" title="Notificações">
              <Bell size={16} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
            </button>
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
              onNavigate={navigateTab}
            />
          )}

          {activeTab === 'clientes' && (
            <ClientesTab 
              clientes={clientes}
              projetos={projetos}
              propostas={propostas}
              onAddCliente={handleAddCliente}
              onDeleteCliente={handleDeleteCliente}
            />
          )}

          {activeTab === 'propostas' && (
            <PropostasTab 
              propostas={propostas}
              clientes={clientes}
              onAddProposta={handleAddProposta}
              onUpdateStatus={handleUpdateStatusProposta}
              onAddRevision={handleAddRevision}
              onConvertToProject={handleConvertToProject}
            />
          )}

          {activeTab === 'fornecedores' && (
            <FornecedoresTab 
              fornecedores={fornecedores}
              onAddFornecedor={handleAddFornecedor}
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
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              onAddProjeto={handleAddProjeto}
              onDeleteProjeto={handleDeleteProjeto}
              onUpdateProjetoSituacao={handleUpdateProjetoSituacao}
              onAddOrcamentoItem={handleAddOrcamentoItem}
              onAddAlteracaoOrcamento={handleAddAlteracaoOrcamento}
              onAddVinculo={handleAddVinculo}
              onRemoveVinculo={handleRemoveVinculo}
              onAddMedicao={handleAddMedicao}
              onAddDocumento={handleAddDocumento}
              onDownloadDocumento={handleDownloadDocumento}
            />
          )}

          {activeTab === 'equipe' && (
            <EquipeTab 
              funcionarios={funcionarios}
              projetos={projetos}
              cronograma={cronograma}
              onAddFuncionario={handleAddFuncionario}
              onUpdateStatusFuncionario={handleUpdateStatusFuncionario}
              onDeleteFuncionario={handleDeleteFuncionario}
            />
          )}

          {activeTab === 'documentos' && (
            <DocumentosTab 
              documentos={documentos}
              projetos={projetos}
              onAddDocumento={handleAddDocumento}
              onAddVersion={handleAddVersion}
              onDeleteDocumento={handleDeleteDocumento}
              onDownloadDocumento={handleDownloadDocumento}
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
              onAddConta={handleAddConta}
              lancamentos={lancamentos}
              onAddLancamento={handleAddLancamento}
              onToggleLancamentoPago={handleToggleLancamentoPago}
              onDeleteLancamento={handleDeleteLancamento}
            />
          )}

          {activeTab === 'pessoas' && (
            <PessoasTab 
              clientes={clientes}
              projetos={projetos}
              propostas={propostas}
              fornecedores={fornecedores}
              funcionarios={funcionarios}
              cronograma={cronograma}
              onAddCliente={handleAddCliente}
              onDeleteCliente={handleDeleteCliente}
              onAddFornecedor={handleAddFornecedor}
              onDeleteFornecedor={handleDeleteFornecedor}
              onAddFuncionario={handleAddFuncionario}
              onUpdateStatusFuncionario={handleUpdateStatusFuncionario}
              onDeleteFuncionario={handleDeleteFuncionario}
              onAddCompra={handleAddCompra}
              onTogglePago={handleTogglePago}
            />
          )}
        </div>
      </main>
    </div>
  );
}
