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

import { CATALOGO_INICIAL } from './initialCatalogo';

import { 
  CLIENTES_INICIAIS, 
  PROPOSTAS_INICIAIS, 
  FORNECEDORES_INICIAIS, 
  FUNCIONARIOS_INICIAIS, 
  PROJETOS_INICIAIS, 
  ORCAMENTOS_INICIAIS, 
  ALTERACOES_ORCAMENTO_INICIAIS, 
  ETAPAS_INICIAIS, 
  MEDICOES_INICIAIS, 
  DOCUMENTOS_INICIAIS,
  CONTAS_INICIAIS,
  LANCAMENTOS_INICIAIS
} from './initialData';

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

export default function App() {
  const { toast, confirm } = useFeedback();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // --- STATE WITH LOCAL STORAGE PERSISTENCE ---
  const [clientes, setClientes] = useState<Cliente[]>(() => {
    const saved = localStorage.getItem('constru_clientes');
    return saved ? JSON.parse(saved) : CLIENTES_INICIAIS;
  });

  const [propostas, setPropostas] = useState<Proposta[]>(() => {
    const saved = localStorage.getItem('constru_propostas');
    return saved ? JSON.parse(saved) : PROPOSTAS_INICIAIS;
  });

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>(() => {
    const saved = localStorage.getItem('constru_fornecedores');
    return saved ? JSON.parse(saved) : FORNECEDORES_INICIAIS;
  });

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>(() => {
    const saved = localStorage.getItem('constru_funcionarios');
    return saved ? JSON.parse(saved) : FUNCIONARIOS_INICIAIS;
  });

  const [projetos, setProjetos] = useState<Projeto[]>(() => {
    const saved = localStorage.getItem('constru_projetos');
    return saved ? JSON.parse(saved) : PROJETOS_INICIAIS;
  });

  const [orcamentos, setOrcamentos] = useState<ItemOrcamento[]>(() => {
    const saved = localStorage.getItem('constru_orcamentos');
    return saved ? JSON.parse(saved) : ORCAMENTOS_INICIAIS;
  });

  const [alteracoesOrcamento, setAlteracoesOrcamento] = useState<AlteracaoOrcamento[]>(() => {
    const saved = localStorage.getItem('constru_alteracoes');
    return saved ? JSON.parse(saved) : ALTERACOES_ORCAMENTO_INICIAIS;
  });

  const [cronograma, setCronograma] = useState<EtapaCronograma[]>(() => {
    const saved = localStorage.getItem('constru_cronograma');
    return saved ? JSON.parse(saved) : ETAPAS_INICIAIS;
  });

  const [medicoes, setMedicoes] = useState<MedicaoObra[]>(() => {
    const saved = localStorage.getItem('constru_medicoes');
    return saved ? JSON.parse(saved) : MEDICOES_INICIAIS;
  });

  const [documentos, setDocumentos] = useState<Documento[]>(() => {
    const saved = localStorage.getItem('constru_documentos');
    return saved ? JSON.parse(saved) : DOCUMENTOS_INICIAIS;
  });

  const [catalogo, setCatalogo] = useState<InsumoCatalogo[]>(() => {
    const saved = localStorage.getItem('constru_catalogo');
    return saved ? JSON.parse(saved) : CATALOGO_INICIAL;
  });

  const [contas, setContas] = useState<ContaFinanceira[]>(() => {
    const saved = localStorage.getItem('constru_contas');
    return saved ? JSON.parse(saved) : CONTAS_INICIAIS;
  });

  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[]>(() => {
    const saved = localStorage.getItem('constru_lancamentos');
    return saved ? JSON.parse(saved) : LANCAMENTOS_INICIAIS;
  });

  const [modoInterface, setModoInterface] = useState<'Avançado' | 'Simplificado'>(() => {
    const saved = localStorage.getItem('constru_modo_interface');
    return (saved === 'Simplificado' || saved === 'Avançado') ? (saved as any) : 'Avançado';
  });

  // --- EFFECT PERSISTENCE SYNCHRONIZER ---
  useEffect(() => {
    localStorage.setItem('constru_clientes', JSON.stringify(clientes));
  }, [clientes]);

  useEffect(() => {
    localStorage.setItem('constru_propostas', JSON.stringify(propostas));
  }, [propostas]);

  useEffect(() => {
    localStorage.setItem('constru_fornecedores', JSON.stringify(fornecedores));
  }, [fornecedores]);

  useEffect(() => {
    localStorage.setItem('constru_funcionarios', JSON.stringify(funcionarios));
  }, [funcionarios]);

  useEffect(() => {
    localStorage.setItem('constru_projetos', JSON.stringify(projetos));
  }, [projetos]);

  useEffect(() => {
    localStorage.setItem('constru_orcamentos', JSON.stringify(orcamentos));
  }, [orcamentos]);

  useEffect(() => {
    localStorage.setItem('constru_alteracoes', JSON.stringify(alteracoesOrcamento));
  }, [alteracoesOrcamento]);

  useEffect(() => {
    localStorage.setItem('constru_cronograma', JSON.stringify(cronograma));
  }, [cronograma]);

  useEffect(() => {
    localStorage.setItem('constru_medicoes', JSON.stringify(medicoes));
  }, [medicoes]);

  useEffect(() => {
    localStorage.setItem('constru_documentos', JSON.stringify(documentos));
  }, [documentos]);

  useEffect(() => {
    localStorage.setItem('constru_catalogo', JSON.stringify(catalogo));
  }, [catalogo]);

  useEffect(() => {
    localStorage.setItem('constru_contas', JSON.stringify(contas));
  }, [contas]);

  useEffect(() => {
    localStorage.setItem('constru_lancamentos', JSON.stringify(lancamentos));
  }, [lancamentos]);

  useEffect(() => {
    localStorage.setItem('constru_modo_interface', modoInterface);
  }, [modoInterface]);


  // --- HANDLERS: CLIENTES ---
  const handleAddCliente = (cliente: Cliente) => {
    setClientes([cliente, ...clientes]);
  };

  const handleDeleteCliente = (id: string) => {
    setClientes(clientes.filter(c => c.id !== id));
  };


  // --- HANDLERS: PROPOSTAS ---
  const handleAddProposta = (prop: Proposta) => {
    setPropostas([prop, ...propostas]);
  };

  const handleUpdateStatusProposta = (id: string, status: Proposta['status']) => {
    setPropostas(propostas.map(p => p.id === id ? { ...p, status } : p));
  };

  const handleAddRevision = (id: string, revision: RevisaoProposta) => {
    setPropostas(propostas.map(p => {
      if (p.id === id) {
        return {
          ...p,
          valorEstimado: revision.valor,
          revisoes: [...p.revisoes, revision]
        };
      }
      return p;
    }));
  };

  // AUTOMATIC ACTION: Convert Approved Proposal to central Project
  const handleConvertToProject = (prop: Proposta) => {
    const projectCount = projetos.length + 1;
    const newProjId = 'proj-' + Date.now();
    
    // Create new Project
    const newProject: Projeto = {
      id: newProjId,
      nome: `Obra: ${prop.descricao}`,
      clienteId: prop.clienteId,
      propostaId: prop.id,
      responsavelInterno: 'Eng. Roberto Albuquerque',
      enderecoObra: 'Endereço a cadastrar canteiro',
      dataInicio: new Date().toISOString().split('T')[0],
      dataFim: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // +6 months
      situacao: 'Planejamento'
    };

    // Auto-generate proportional budget breakdown based on overall proposal value
    const v = prop.valorEstimado;
    const defaultBudgets: ItemOrcamento[] = [
      { id: `orc-${Date.now()}-1`, projetoId: newProjId, categoria: 'Materiais', descricao: 'Insumos básicos de Alvenaria e Fechamento', valorOrcado: v * 0.35, valorContratado: v * 0.35, valorExecutado: 0 },
      { id: `orc-${Date.now()}-2`, projetoId: newProjId, categoria: 'Mão de Obra', descricao: 'Lançamento fundações e alvenarias estruturais', valorOrcado: v * 0.30, valorContratado: v * 0.30, valorExecutado: 0 },
      { id: `orc-${Date.now()}-3`, projetoId: newProjId, categoria: 'Equipamentos', descricao: 'Locações auxiliares e caçambas', valorOrcado: v * 0.10, valorContratado: v * 0.10, valorExecutado: 0 },
      { id: `orc-${Date.now()}-4`, projetoId: newProjId, categoria: 'Terceiros', descricao: 'Instalações complementares e Climatização', valorOrcado: v * 0.15, valorContratado: v * 0.15, valorExecutado: 0 },
      { id: `orc-${Date.now()}-5`, projetoId: newProjId, categoria: 'Administração', descricao: 'Segurança NR18 e EPIs gerais', valorOrcado: v * 0.05, valorContratado: v * 0.05, valorExecutado: 0 },
      { id: `orc-${Date.now()}-6`, projetoId: newProjId, categoria: 'Contingências', descricao: 'Fundo reserva', valorOrcado: v * 0.05, valorContratado: 0, valorExecutado: 0 }
    ];

    // Auto-generate standard schedule stages for the project timeline
    const activeStaff = funcionarios.filter(f => f.status === 'Ativo');
    const defaultManager = activeStaff[0]?.id || 'fun-1';
    const defaultMestre = activeStaff[1]?.id || 'fun-2';

    const defaultStages: EtapaCronograma[] = [
      { id: `eta-${Date.now()}-1`, projetoId: newProjId, nome: 'Fundação / Terraplanagem', dataInicio: new Date().toISOString().split('T')[0], dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], responsavelId: defaultMestre, percentualExecutado: 0, status: 'Não Iniciado' },
      { id: `eta-${Date.now()}-2`, projetoId: newProjId, nome: 'Estrutura / Superestrutura', dataInicio: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], dataFim: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], responsavelId: defaultMestre, percentualExecutado: 0, status: 'Não Iniciado' },
      { id: `eta-${Date.now()}-3`, projetoId: newProjId, nome: 'Instalações Hidro/Elétricas', dataInicio: new Date(Date.now() + 76 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], dataFim: new Date(Date.now() + 115 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], responsavelId: activeStaff[3]?.id || defaultMestre, percentualExecutado: 0, status: 'Não Iniciado' },
      { id: `eta-${Date.now()}-4`, projetoId: newProjId, nome: 'Acabamentos e Revestimentos', dataInicio: new Date(Date.now() + 116 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], dataFim: new Date(Date.now() + 165 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], responsavelId: activeStaff[2]?.id || defaultMestre, percentualExecutado: 0, status: 'Não Iniciado' },
      { id: `eta-${Date.now()}-5`, projetoId: newProjId, nome: 'Entrega e Vistoria', dataInicio: new Date(Date.now() + 166 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], dataFim: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], responsavelId: defaultManager, percentualExecutado: 0, status: 'Não Iniciado' }
    ];

    // Auto-generate standard contract placeholder document
    const defaultContract: Documento = {
      id: `doc-${Date.now()}`,
      nome: `Contrato_Execucao_${prop.numero}.pdf`,
      tipo: 'Contrato',
      projetoId: newProjId,
      dataCriacao: new Date().toISOString().split('T')[0],
      versao: '1.0',
      tamanho: '2.5 MB'
    };

    // Save altogether
    setProjetos([newProject, ...projetos]);
    setOrcamentos([...defaultBudgets, ...orcamentos]);
    setCronograma([...defaultStages, ...cronograma]);
    setDocumentos([defaultContract, ...documentos]);

    toast.success('Obra iniciada com sucesso.', `A proposta ${prop.numero} foi convertida em projeto.`);

    // Force redirect to Projects module and open the newly created project console!
    setSelectedProjectId(newProjId);
    setActiveTab('projetos');
  };


  // --- HANDLERS: FORNECEDORES ---
  const handleAddFornecedor = (forn: Fornecedor) => {
    setFornecedores([forn, ...fornecedores]);
  };

  const handleDeleteFornecedor = (id: string) => {
    setFornecedores(fornecedores.filter(f => f.id !== id));
  };

  const handleAddCompra = (fornId: string, compra: CompraFornecedor) => {
    setFornecedores(fornecedores.map(f => {
      if (f.id === fornId) {
        return {
          ...f,
          historicoCompras: [compra, ...f.historicoCompras]
        };
      }
      return f;
    }));
  };

  const handleTogglePago = (fornId: string, compraId: string) => {
    setFornecedores(fornecedores.map(f => {
      if (f.id === fornId) {
        return {
          ...f,
          historicoCompras: f.historicoCompras.map(c => 
            c.id === compraId ? { ...c, pago: !c.pago } : c
          )
        };
      }
      return f;
    }));
  };


  // --- HANDLERS: GESTÃO FINANCEIRA DA EMPRESA ---
  const handleAddConta = (conta: ContaFinanceira) => {
    setContas([conta, ...contas]);
  };

  const handleAddLancamento = (lan: LancamentoFinanceiro) => {
    setLancamentos([lan, ...lancamentos]);
    
    // Update account balance if paid
    if (lan.pago) {
      setContas(prevContas => prevContas.map(c => {
        if (c.id === lan.contaId) {
          const delta = lan.tipo === 'Receita' ? lan.valor : -lan.valor;
          return { ...c, saldoAtual: c.saldoAtual + delta };
        }
        return c;
      }));
    }
  };

  const handleToggleLancamentoPago = (id: string) => {
    setLancamentos(prevLancamentos => prevLancamentos.map(l => {
      if (l.id === id) {
        const nextPago = !l.pago;
        
        // Update account balance based on toggle
        setContas(prevContas => prevContas.map(c => {
          if (c.id === l.contaId) {
            let delta = 0;
            if (nextPago) {
              // Became paid: add if income, subtract if expense
              delta = l.tipo === 'Receita' ? l.valor : -l.valor;
            } else {
              // Became unpaid: subtract if income, add if expense
              delta = l.tipo === 'Receita' ? -l.valor : l.valor;
            }
            return { ...c, saldoAtual: c.saldoAtual + delta };
          }
          return c;
        }));

        return { ...l, pago: nextPago };
      }
      return l;
    }));
  };

  const handleDeleteLancamento = (id: string) => {
    const lan = lancamentos.find(l => l.id === id);
    if (!lan) return;

    setLancamentos(prevLancamentos => prevLancamentos.filter(l => l.id !== id));

    // Revert account balance if it was paid
    if (lan.pago) {
      setContas(prevContas => prevContas.map(c => {
        if (c.id === lan.contaId) {
          const delta = lan.tipo === 'Receita' ? -lan.valor : lan.valor;
          return { ...c, saldoAtual: c.saldoAtual + delta };
        }
        return c;
      }));
    }
  };


  // --- HANDLERS: EQUIPE / FUNCIONÁRIOS ---
  const handleAddFuncionario = (func: Funcionario) => {
    setFuncionarios([func, ...funcionarios]);
  };

  const handleUpdateStatusFuncionario = (id: string, status: Funcionario['status']) => {
    setFuncionarios(funcionarios.map(f => f.id === id ? { ...f, status } : f));
  };

  const handleDeleteFuncionario = (id: string) => {
    setFuncionarios(funcionarios.filter(f => f.id !== id));
  };


  // --- HANDLERS: PROJETOS (CENTRAL HUB) ---
  const handleAddProjeto = (proj: Projeto) => {
    setProjetos([proj, ...projetos]);

    // When starting a project manually, append standard chronogram stages automatically
    const defaultStages: EtapaCronograma[] = [
      { id: `eta-${Date.now()}-1`, projetoId: proj.id, nome: 'Fundação / Terraplanagem', dataInicio: proj.dataInicio, dataFim: proj.dataInicio, responsavelId: funcionarios[1]?.id || 'fun-2', percentualExecutado: 0, status: 'Não Iniciado' },
      { id: `eta-${Date.now()}-2`, projetoId: proj.id, nome: 'Estrutura / Alvenaria', dataInicio: proj.dataInicio, dataFim: proj.dataFim, responsavelId: funcionarios[1]?.id || 'fun-2', percentualExecutado: 0, status: 'Não Iniciado' },
      { id: `eta-${Date.now()}-3`, projetoId: proj.id, nome: 'Instalações', dataInicio: proj.dataInicio, dataFim: proj.dataFim, responsavelId: funcionarios[3]?.id || 'fun-4', percentualExecutado: 0, status: 'Não Iniciado' },
      { id: `eta-${Date.now()}-4`, projetoId: proj.id, nome: 'Acabamentos', dataInicio: proj.dataInicio, dataFim: proj.dataFim, responsavelId: funcionarios[2]?.id || 'fun-3', percentualExecutado: 0, status: 'Não Iniciado' },
      { id: `eta-${Date.now()}-5`, projetoId: proj.id, nome: 'Entrega', dataInicio: proj.dataFim, dataFim: proj.dataFim, responsavelId: funcionarios[0]?.id || 'fun-1', percentualExecutado: 0, status: 'Não Iniciado' }
    ];
    setCronograma([...defaultStages, ...cronograma]);
  };

  const handleDeleteProjeto = (id: string) => {
    setProjetos(projetos.filter(p => p.id !== id));
    // Clean cascading budget items, stages, documents, measurements associated with this project
    setOrcamentos(orcamentos.filter(o => o.projetoId !== id));
    setCronograma(cronograma.filter(c => c.projetoId !== id));
    setMedicoes(medicoes.filter(m => m.projetoId !== id));
    setDocumentos(documentos.filter(d => d.projetoId !== id));
  };

  const handleUpdateProjetoSituacao = (projId: string, situacao: Projeto['situacao']) => {
    setProjetos(projetos.map(p => p.id === projId ? { ...p, situacao } : p));
  };


  // --- HANDLERS: BUDGET (ORÇAMENTO) ---
  const handleAddOrcamentoItem = (item: ItemOrcamento) => {
    setOrcamentos([item, ...orcamentos]);
  };

  const handleAddAlteracaoOrcamento = (alt: AlteracaoOrcamento) => {
    setAlteracoesOrcamento([alt, ...alteracoesOrcamento]);
  };

  const handleUpdateOrcamentoExecutado = (itemId: string, valorExecutado: number) => {
    setOrcamentos(prev => prev.map(item => item.id === itemId ? { ...item, valorExecutado } : item));
  };


  // --- HANDLERS: CHRONOGRAM (CRONOGRAMA) ---
  const handleUpdateCronogramaStep = (stepId: string, updates: Partial<EtapaCronograma>) => {
    setCronograma(cronograma.map(step => step.id === stepId ? { ...step, ...updates } : step));
  };


  // --- HANDLERS: MEASUREMENTS (MEDIÇÕES) ---
  const handleAddMedicao = (med: MedicaoObra) => {
    setMedicoes([med, ...medicoes]);
  };


  // --- HANDLERS: GESTÃO DOCUMENTAL ---
  const handleAddDocumento = (doc: Documento) => {
    setDocumentos([doc, ...documentos]);
  };

  const handleDeleteDocumento = (id: string) => {
    setDocumentos(documentos.filter(d => d.id !== id));
  };


  // --- HANDLERS: GESTÃO DE CATÁLOGO ---
  const handleAddCatalogoItem = (item: InsumoCatalogo) => {
    setCatalogo([item, ...catalogo]);
  };

  const handleUpdateCatalogoItem = (updated: InsumoCatalogo) => {
    setCatalogo(catalogo.map(item => item.id === updated.id ? updated : item));
  };

  const handleDeleteCatalogoItem = (id: string) => {
    setCatalogo(catalogo.filter(item => item.id !== id));
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

  return (
    <div id="app-root-container" className="flex h-screen bg-[#F8FAFC] overflow-hidden font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white">
      
      {/* Sidebar navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        selectedProjectId={selectedProjectId}
        clearSelectedProject={() => setSelectedProjectId(null)}
        counts={countsObj}
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
              medicoes={medicoes}
              documentos={documentos}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              onAddProjeto={handleAddProjeto}
              onDeleteProjeto={handleDeleteProjeto}
              onUpdateProjetoSituacao={handleUpdateProjetoSituacao}
              onAddOrcamentoItem={handleAddOrcamentoItem}
              onAddAlteracaoOrcamento={handleAddAlteracaoOrcamento}
              onUpdateCronogramaStep={handleUpdateCronogramaStep}
              onAddMedicao={handleAddMedicao}
              onAddDocumento={handleAddDocumento}
              onUpdateOrcamentoExecutado={handleUpdateOrcamentoExecutado}
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
              onDeleteDocumento={handleDeleteDocumento}
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
