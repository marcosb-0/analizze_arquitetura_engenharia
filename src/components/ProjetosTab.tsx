import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  Briefcase, 
  MapPin, 
  Calendar, 
  ArrowRight,
  Trash2,
  FolderPlus
} from 'lucide-react';
import { Projeto, Cliente, Proposta, ItemOrcamento, EtapaCronograma, EtapaOrcamentoVinculo, MedicaoObra, Documento, AlteracaoOrcamento, Funcionario, Fornecedor, Acesso, ProjetoEquipeMembro, InsumoProjeto, InsumoCatalogo, AjustePreco } from '../types';
import type { Role } from '../lib/database.types';
import ProjetoConsole from './ProjetoConsole';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

interface ProjetosTabProps {
  projetos: Projeto[];
  clientes: Cliente[];
  propostas: Proposta[];
  funcionarios: Funcionario[];
  fornecedores: Fornecedor[];
  orcamentos: ItemOrcamento[];
  alteracoesOrcamento: AlteracaoOrcamento[];
  insumosProjeto: InsumoProjeto[];
  catalogo: InsumoCatalogo[];
  cronograma: EtapaCronograma[];
  vinculos: EtapaOrcamentoVinculo[];
  medicoes: MedicaoObra[];
  documentos: Documento[];
  projetoEquipe: ProjetoEquipeMembro[];
  perfisCampo: Acesso[];
  selectedProjectId: string | null;
  role?: Role;
  onSelectProject: (id: string | null) => void;
  onAddProjeto: (proj: Projeto) => Promise<string | null>;
  onDeleteProjeto: (id: string) => void;
  onUpdateProjetoSituacao: (projId: string, situacao: Projeto['situacao']) => void;
  onAddOrcamentoItem: (item: ItemOrcamento) => void | Promise<ItemOrcamento | null>;
  onAjustarPrecoInsumo: (id: string, ajuste: AjustePreco) => Promise<InsumoProjeto | null>;
  onAjustarQuantidadeInsumo: (id: string, quantidade: number) => Promise<InsumoProjeto | null>;
  onRessincronizarBaseInsumo: (id: string, novaBase: number) => Promise<InsumoProjeto | null>;
  onRemoveInsumoProjeto: (id: string) => Promise<boolean>;
  onAddVinculo: (vinculo: EtapaOrcamentoVinculo) => void;
  onRemoveVinculo: (id: string) => void;
  onAddMedicao: (med: { projetoId: string; etapaId: string; percentualMedido: number; observacoes: string }, fotos: File[]) => void;
  onAprovarMedicao: (medicaoId: string, permitirOverrun?: boolean) => Promise<'ok' | 'overrun' | 'error'>;
  onRejeitarMedicao: (medicaoId: string) => Promise<boolean>;
  onAddDocumento: (doc: Documento, file?: File) => void;
  onDownloadDocumento: (doc: Documento) => void;
  onAddMembroEquipe: (projetoId: string, profileId: string, papel: string) => void;
  onRemoveMembroEquipe: (id: string) => void;
}

export default function ProjetosTab({
  projetos,
  clientes,
  propostas,
  funcionarios,
  fornecedores,
  orcamentos,
  alteracoesOrcamento,
  insumosProjeto,
  catalogo,
  cronograma,
  vinculos,
  medicoes,
  documentos,
  projetoEquipe,
  perfisCampo,
  selectedProjectId,
  role,
  onSelectProject,
  onAddProjeto,
  onDeleteProjeto,
  onUpdateProjetoSituacao,
  onAddOrcamentoItem,
  onAjustarPrecoInsumo,
  onAjustarQuantidadeInsumo,
  onRessincronizarBaseInsumo,
  onRemoveInsumoProjeto,
  onAddVinculo,
  onRemoveVinculo,
  onAddMedicao,
  onAprovarMedicao,
  onRejeitarMedicao,
  onAddDocumento,
  onDownloadDocumento,
  onAddMembroEquipe,
  onRemoveMembroEquipe
}: ProjetosTabProps) {
  const { toast, confirm } = useFeedback();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todas');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New Project Form State
  const [formNome, setFormNome] = useState('');
  const [formClienteId, setFormClienteId] = useState(clientes[0]?.id || '');
  const [formPropostaId, setFormPropostaId] = useState('');
  const [formResponsavel, setFormResponsavel] = useState('');
  const [formEndereco, setFormEndereco] = useState('');
  const [formInicio, setFormInicio] = useState('');
  const [formFim, setFormFim] = useState('');

  // Wizard & Delete Modals States
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [projectToDelete, setProjectToDelete] = useState<Projeto | null>(null);

  // 1. Calculations
  const filteredProjetos = projetos.filter(p => {
    const cli = clientes.find(c => c.id === p.clienteId);
    const matchesSearch = 
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.responsavelInterno.toLowerCase().includes(search.toLowerCase()) ||
      (cli && cli.nome.toLowerCase().includes(search.toLowerCase()));
    
    const matchesStatus = statusFilter === 'Todas' || p.situacao === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getProjectProgress = (projId: string) => {
    const steps = cronograma.filter(c => c.projetoId === projId);
    if (steps.length === 0) return 0;
    const total = steps.reduce((sum, s) => sum + s.percentualExecutado, 0);
    return Math.round(total / steps.length);
  };

  const getClientName = (clientId: string) => {
    return clientes.find(c => c.id === clientId)?.nome || 'Cliente não encontrado';
  };

  const getApprovedProposalsForClient = (clientId: string) => {
    return propostas.filter(p => p.clienteId === clientId && p.status === 'Aprovada');
  };

  // Mirrors fn_criar_projeto_manual's stage schedule (15/30/25/20/10% of the
  // span) so the wizard preview shows what will actually be created — not the
  // old hardcoded rows with fake dates and fake per-stage role names.
  const previewStages = (() => {
    if (!formInicio || !formFim) return [];
    const start = new Date(formInicio + 'T00:00:00');
    const end = new Date(formFim + 'T00:00:00');
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (isNaN(totalDays) || totalDays < 0) return [];
    const fracs = [0, 0.15, 0.45, 0.7, 0.9, 1];
    const nomes = ['Fundação / Terraplanagem', 'Estrutura / Alvenaria', 'Instalações', 'Acabamentos', 'Entrega'];
    const dateAt = (frac: number) => {
      const d = new Date(start.getTime());
      d.setDate(d.getDate() + Math.floor(totalDays * frac));
      return d.toLocaleDateString('pt-BR');
    };
    return nomes.map((nome, i) => ({ nome, ini: dateAt(fracs[i]), fim: dateAt(fracs[i + 1]) }));
  })();
  const responsavelNome = funcionarios.find(f => f.id === formResponsavel)?.nome || 'A definir';

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome || !formClienteId || !formResponsavel || !formInicio || !formFim) {
      toast.error("Por favor, preencha todos os campos obrigatórios: Título, Cliente, Responsável, Início e Entrega.");
      return;
    }
    if (formFim < formInicio) {
      toast.error("A data de entrega não pode ser anterior à data de início.");
      return;
    }

    setIsSaving(true);

    const responsavel = funcionarios.find(f => f.id === formResponsavel);
    const newProj: Projeto = {
      id: crypto.randomUUID(),
      nome: formNome,
      clienteId: formClienteId,
      propostaId: formPropostaId || undefined,
      responsavelInterno: responsavel?.nome || formResponsavel,
      responsavelInternoId: formResponsavel,
      enderecoObra: formEndereco || 'Não informado',
      dataInicio: formInicio,
      dataFim: formFim,
      situacao: 'Planejamento'
    };

    // The DB (fn_criar_projeto_manual) generates the real id + stages atomically;
    // only confirm success once it lands. On failure the hook already toasted.
    const createdId = await onAddProjeto(newProj);
    setIsSaving(false);
    if (!createdId) return;

    setShowAddModal(false);
    toast.success("Planejamento de obra inicializado.", `O projeto "${newProj.nome}" foi registrado.`);

    // Reset Form + wizard
    setFormNome('');
    setFormPropostaId('');
    setFormResponsavel('');
    setFormEndereco('');
    setFormInicio('');
    setFormFim('');
    setWizardStep(1);
  };

  // If a project is selected, render the IMMERSIVE PROJECT CONSOLE immediately!
  const selectedProject = projetos.find(p => p.id === selectedProjectId);
  if (selectedProject) {
    return (
      <ProjetoConsole
        projeto={selectedProject}
        clientes={clientes}
        funcionarios={funcionarios.filter(f => f.status === 'Ativo')}
        fornecedores={fornecedores}
        orcamentos={orcamentos}
        alteracoesOrcamento={alteracoesOrcamento}
        cronogramas={cronograma}
        vinculos={vinculos}
        medicoes={medicoes}
        documentos={documentos}
        projetoEquipe={projetoEquipe}
        perfisCampo={perfisCampo}
        role={role}
        onClose={() => onSelectProject(null)}
        onUpdateProjetoSituacao={onUpdateProjetoSituacao}
        insumosProjeto={insumosProjeto}
        catalogo={catalogo}
        onAddOrcamentoItem={onAddOrcamentoItem}
        onAjustarPrecoInsumo={onAjustarPrecoInsumo}
        onAjustarQuantidadeInsumo={onAjustarQuantidadeInsumo}
        onRessincronizarBaseInsumo={onRessincronizarBaseInsumo}
        onRemoveInsumoProjeto={onRemoveInsumoProjeto}
        onAddVinculo={onAddVinculo}
        onRemoveVinculo={onRemoveVinculo}
        onAddMedicao={onAddMedicao}
        onAprovarMedicao={onAprovarMedicao}
        onRejeitarMedicao={onRejeitarMedicao}
        onAddDocumento={onAddDocumento}
        onDownloadDocumento={onDownloadDocumento}
        onAddMembroEquipe={onAddMembroEquipe}
        onRemoveMembroEquipe={onRemoveMembroEquipe}
      />
    );
  }

  return (
    <div id="projetos-tab-content" className="space-y-6">
      
      {/* Title block */}
      <div id="projetos-title" className="flex items-center justify-between">
        <div className="text-left">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Obras e Projetos Ativos</h2>
          <p className="text-xs text-slate-500">Módulo central de acompanhamento, orçamento integrado, medições de campo e cronograma de obra.</p>
        </div>
        <button
          id="add-projeto-trigger-btn"
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm"
        >
          <FolderPlus size={15} />
          <span>Iniciar Obra</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div id="projetos-filters" className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
          <input
            id="proj-search-text-input"
            type="text"
            placeholder="Buscar por nome da obra, gerente responsável ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-800"
          />
        </div>

        <div>
          <select
            id="proj-status-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-2.5 text-xs outline-none bg-white text-slate-600 font-medium cursor-pointer"
          >
            <option value="Todas">Situação: Todas</option>
            <option value="Planejamento">Situação: Planejamento</option>
            <option value="Em Execução">Situação: Em Execução</option>
            <option value="Pausado">Situação: Pausado</option>
            <option value="Finalizado">Situação: Finalizado</option>
          </select>
        </div>
      </div>

      {/* Grid List of Projects */}
      <div id="projetos-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProjetos.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={Briefcase}
              title="Nenhum projeto cadastrado"
              description="Inicie um planejamento de obra a partir de propostas aprovadas ou do zero."
              actionLabel="Iniciar Obra"
              onAction={() => setShowAddModal(true)}
            />
          </div>
        ) : (
          filteredProjetos.map((proj, index) => {
            const progress = getProjectProgress(proj.id);
            
            const situationColors = {
              'Planejamento': 'bg-slate-100 text-slate-700 border border-slate-200/50',
              'Em Execução': 'bg-blue-50 text-blue-700 border border-blue-200/50',
              'Pausado': 'bg-rose-50 text-rose-700 border border-rose-200/50',
              'Finalizado': 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
            };

            return (
              <motion.div
                key={proj.id}
                id={`project-card-${proj.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.35) }}
                className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden group"
              >
                {/* Upper info block */}
                <div className="p-3.5 space-y-2.5 text-left">
                  <div className="flex justify-between items-start">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${situationColors[proj.situacao]}`}>
                      {proj.situacao}
                    </span>
                    <button
                      id={`delete-project-btn-${proj.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(proj);
                      }}
                      className="text-slate-300 hover:text-rose-600 p-1 rounded transition active:scale-95 shrink-0"
                      title="Excluir Obra"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div>
                    <h3 className="font-bold text-xs text-slate-900 group-hover:text-blue-600 transition truncate" title={proj.nome}>
                      {proj.nome}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      Cliente: <strong>{getClientName(proj.clienteId)}</strong>
                    </p>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2 rounded-md">
                    <p className="flex items-center gap-1.5 truncate">
                      <MapPin size={12} className="text-slate-400 shrink-0" />
                      <span>{proj.enderecoObra}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-400 shrink-0" />
                      <span>Término: {new Date(proj.dataFim).toLocaleDateString('pt-BR')}</span>
                    </p>
                  </div>
                </div>

                {/* Progress bar section */}
                <div className="px-3.5 pb-3.5 space-y-1.5 text-left">
                  <div className="flex justify-between text-xs font-mono text-slate-400">
                    <span>Avanço Físico</span>
                    <span className="font-bold text-slate-800">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-150 flex">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        proj.situacao === 'Em Execução' ? 'bg-blue-500' :
                        proj.situacao === 'Finalizado' ? 'bg-emerald-500' : 'bg-slate-400'
                      }`} 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>

                {/* Card footer action link */}
                <button
                  id={`enter-project-btn-${proj.id}`}
                  onClick={() => onSelectProject(proj.id)}
                  className="w-full bg-slate-50 hover:bg-blue-600 text-slate-700 hover:text-white font-bold py-2 text-xs border-t border-slate-150 flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <span>Gerenciar Obra</span>
                  <ArrowRight size={13} />
                </button>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Add Project Modal Overlay */}
      <AnimatePresence>
        {showAddModal && (
          <div id="add-project-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSaving) setShowAddModal(false); }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <div className="text-left">
                  <h3 className="font-bold text-slate-900 text-sm">Assistente de Nova Obra</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Passo {wizardStep} de 3</p>
                </div>
                <button 
                  onClick={() => setShowAddModal(false)}
                  disabled={isSaving}
                  className="text-slate-400 hover:text-slate-600 font-bold transition disabled:opacity-40 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Progress Indicator Dots */}
              <div className="flex justify-center gap-2 py-2 bg-slate-100/50 border-b border-slate-200/50">
                <span className={`h-2 w-2 rounded-full transition-all duration-300 ${wizardStep === 1 ? 'bg-blue-600 w-4' : 'bg-slate-300'}`}></span>
                <span className={`h-2 w-2 rounded-full transition-all duration-300 ${wizardStep === 2 ? 'bg-blue-600 w-4' : 'bg-slate-300'}`}></span>
                <span className={`h-2 w-2 rounded-full transition-all duration-300 ${wizardStep === 3 ? 'bg-blue-600 w-4' : 'bg-slate-300'}`}></span>
              </div>

              {/* Form Content */}
              <div className="p-4 space-y-4 text-left overflow-y-auto max-h-[70vh]">
                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 1: Dados básicos do projeto</h4>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Título / Nome do Projeto *</label>
                      <input
                        id="add-proj-nome"
                        type="text"
                        required
                        placeholder="Ex: Reforma de Cobertura Residencial"
                        value={formNome}
                        onChange={(e) => setFormNome(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:border-blue-600 outline-none text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Gerente de Obra Responsável *</label>
                      <select
                        id="add-proj-responsavel"
                        required
                        value={formResponsavel}
                        onChange={(e) => setFormResponsavel(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white focus:border-blue-600 text-slate-800"
                      >
                        <option value="">Selecione um responsável...</option>
                        {funcionarios.map(f => (
                          <option key={f.id} value={f.id}>{f.nome} ({f.cargo})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Endereço do Canteiro *</label>
                      <input
                        id="add-proj-endereco"
                        type="text"
                        required
                        placeholder="Rua, Número, Bairro, Cidade - UF"
                        value={formEndereco}
                        onChange={(e) => setFormEndereco(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Data Início Mobilização *</label>
                        <input
                          id="add-proj-inicio"
                          type="date"
                          required
                          value={formInicio}
                          onChange={(e) => setFormInicio(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Data Previsão Entrega *</label>
                        <input
                          id="add-proj-fim"
                          type="date"
                          required
                          value={formFim}
                          onChange={(e) => setFormFim(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowAddModal(false)}
                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!formNome || !formResponsavel || !formEndereco || !formInicio || !formFim) {
                            toast.error("Por favor, preencha todos os campos obrigatórios do Passo 1.");
                            return;
                          }
                          setWizardStep(2);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm cursor-pointer border-none"
                      >
                        Próximo: Proposta →
                      </button>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 2: Vinculação de Proposta</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente Vinculado *</label>
                        <select
                          id="add-proj-cliente"
                          required
                          value={formClienteId}
                          onChange={(e) => {
                            setFormClienteId(e.target.value);
                            setFormPropostaId('');
                          }}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700 font-medium"
                        >
                          <option value="">Selecione um cliente...</option>
                          {clientes.map(c => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Proposta Aprovada (Opcional)</label>
                        <select
                          id="add-proj-proposta"
                          value={formPropostaId}
                          onChange={(e) => setFormPropostaId(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700"
                          disabled={!formClienteId}
                        >
                          <option value="">Nenhuma proposta vinculada</option>
                          {getApprovedProposalsForClient(formClienteId).map(p => (
                            <option key={p.id} value={p.id}>{p.numero} - {p.descricao}</option>
                          ))}
                        </select>
                      </div>

                      {formPropostaId && (
                        <div className="p-3 bg-blue-50 border border-blue-150 rounded-lg text-xs text-blue-800 space-y-1">
                          <span className="font-bold block text-[10px] uppercase tracking-wider text-blue-400">Resumo da Proposta Comercial</span>
                          <p><strong>Descrição:</strong> {propostas.find(p => p.id === formPropostaId)?.descricao}</p>
                          <p><strong>Investimento:</strong> {propostas.find(p => p.id === formPropostaId)?.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                          <p><strong>Prazo:</strong> {propostas.find(p => p.id === formPropostaId)?.prazoExecucao}</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setWizardStep(1)}
                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-750 hover:bg-slate-100 rounded transition cursor-pointer"
                      >
                        ← Voltar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!formClienteId) {
                            toast.error("Por favor, selecione o cliente vinculado.");
                            return;
                          }
                          setWizardStep(3);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm cursor-pointer border-none"
                      >
                        Próximo: Cronograma →
                      </button>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 3: Cronograma Inicial Sugerido</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Com base no prazo do projeto (<strong className="text-slate-700">{new Date(formInicio + 'T00:00:00').toLocaleDateString('pt-BR')}</strong> a <strong className="text-slate-700">{new Date(formFim + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>), estas frentes de trabalho serão criadas automaticamente, escalonadas ao longo do prazo e sob responsabilidade de <strong className="text-slate-700">{responsavelNome}</strong>:
                    </p>

                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-150 shadow-xs bg-slate-50/50">
                      {previewStages.map((stage, i) => (
                        <div key={stage.nome} className="p-2.5 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-bold text-slate-900">{i + 1}. {stage.nome}</p>
                            <p className="text-[10px] text-slate-400 font-medium">Responsável: {responsavelNome}</p>
                          </div>
                          <span className="font-mono font-semibold text-slate-600">
                            {stage.ini} a {stage.fim}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setWizardStep(2)}
                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-750 hover:bg-slate-100 rounded transition cursor-pointer"
                      >
                        ← Voltar
                      </button>
                      <button
                        id="submit-add-project-btn"
                        type="button"
                        disabled={isSaving}
                        onClick={handleCreateProject}
                        className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 cursor-pointer border-none"
                      >
                        {isSaving ? (
                          <>
                            <Spinner size={14} />
                            <span>Iniciando...</span>
                          </>
                        ) : (
                          <>
                            <FolderPlus size={14} />
                            <span>Planejar Obra</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cascading Delete Impact Modal */}
      <AnimatePresence>
        {projectToDelete && (
          <div id="delete-impact-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setProjectToDelete(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-rose-200"
            >
              <div className="p-4 border-b border-rose-200 bg-rose-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-rose-800 text-sm">Aviso de Impacto de Exclusão</h3>
                <button 
                  onClick={() => setProjectToDelete(null)}
                  className="text-rose-400 hover:text-rose-600 font-bold transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-4 text-left">
                <p className="text-xs text-slate-650 leading-relaxed">
                  A exclusão do projeto <strong className="text-slate-900">"{projectToDelete.nome}"</strong> é uma ação irreversível. Todos os dados vinculados nos módulos do Analizze serão removidos permanentemente em cascata:
                </p>

                <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 space-y-2 text-xs font-semibold text-rose-950">
                  <div className="flex justify-between">
                    <span>Itens de orçamento associados:</span>
                    <span className="font-mono text-rose-700">{orcamentos.filter(o => o.projetoId === projectToDelete.id).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Atividades do cronograma:</span>
                    <span className="font-mono text-rose-700">{cronograma.filter(c => c.projetoId === projectToDelete.id).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Boletins de medição lançados:</span>
                    <span className="font-mono text-rose-700">{medicoes.filter(m => m.projetoId === projectToDelete.id).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Documentações anexadas:</span>
                    <span className="font-mono text-rose-700">{documentos.filter(d => d.projetoId === projectToDelete.id).length}</span>
                  </div>
                </div>

                <p className="text-[11px] text-rose-600 font-medium">
                  Confirma que deseja prosseguir e excluir este projeto juntamente com todos os seus registros de histórico financeiro e de campo?
                </p>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setProjectToDelete(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-750 hover:bg-slate-100 rounded transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    id="confirm-delete-project-btn"
                    type="button"
                    onClick={() => {
                      onDeleteProjeto(projectToDelete.id);
                      setProjectToDelete(null);
                      toast.success('Projeto e dados vinculados removidos com sucesso.');
                    }}
                    className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm cursor-pointer border-none"
                  >
                    Excluir Obra e Vínculos
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
