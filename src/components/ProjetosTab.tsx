import React, { memo, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Search,
  Briefcase,
  MapPin,
  Calendar,
  ArrowRight,
  Trash2,
  FolderPlus,
  AlertTriangle,
  Clock3,
  TrendingUp,
  CalendarX
} from 'lucide-react';
import { Projeto, Cliente, Proposta, ResumoObra, Documento, Funcionario } from '../types';
import type { Role } from '../lib/database.types';
import { formatarPrazo } from '../lib/prazo';
import { dataLocal, formatarDataBR } from '../lib/data';
import { avaliarRiscoObra } from '../lib/avanco';
import { podeGerenciarObra } from '../constants/tabAccess';
import { StatusBadge } from '../constants/status';
import { Button, CarregarMais, Input, Modal, Select, SeletorOrdenacao } from './ui';
import { useListaOrdenada, compararTexto, compararData, type OpcaoOrdenacao } from '../hooks/useListaOrdenada';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

/**
 * A LISTA de obras.
 *
 * O console da obra era renderizado AQUI DENTRO, por um `return` antecipado, e
 * era isso que fazia esta aba receber 49 props para repassar 44 — um
 * intermediário de prop-drilling, não um componente com responsabilidade
 * própria (§1.2). Hoje os dois são irmãos: quem escolhe entre lista e console é
 * `abas/ProjetosConectado`, e cada um assina os contextos de que precisa.
 */
interface ProjetosTabProps {
  projetos: Projeto[];
  clientes: Cliente[];
  propostas: Proposta[];
  funcionarios: Funcionario[];
  /**
   * O agregado por obra (§4.2, item 23). Substituiu `orcamentos`, `cronograma`,
   * `vinculos` e `medicoes`, que eram recebidos INTEIROS — de todas as obras —
   * para calcular a barra de avanço, os distintivos de risco e as contagens do
   * diálogo de exclusão. A lista nunca precisou das linhas, só dos números.
   */
  resumos: ResumoObra[];
  documentos: Documento[];
  role?: Role;
  loading?: boolean;
  onSelectProject: (id: string | null) => void;
  onAddProjeto: (proj: Projeto) => Promise<string | null>;
  /** Devolve se a escrita chegou ao banco — a tela só confirma depois disso. */
  onDeleteProjeto: (id: string) => Promise<boolean>;
}

function ProjetosTab({
  projetos,
  clientes,
  propostas,
  funcionarios,
  resumos,
  documentos,
  role,
  loading = false,
  onSelectProject,
  onAddProjeto,
  onDeleteProjeto,
}: ProjetosTabProps) {
  const { toast } = useFeedback();
  // Escrita em obra é de admin/gestão; financeiro e campo têm a aba em leitura
  // (a RLS é a barreira real — isto evita oferecer o que vai falhar).
  const podeGerenciar = podeGerenciarObra(role);
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
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Calculations
  const resumoPorProjeto = useMemo(
    () => new Map(resumos.map((r) => [r.projetoId, r])),
    [resumos]
  );

  const filteredProjetos = useMemo(() => projetos.filter(p => {
    const cli = clientes.find(c => c.id === p.clienteId);
    const matchesSearch = 
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.responsavelInterno.toLowerCase().includes(search.toLowerCase()) ||
      (cli && cli.nome.toLowerCase().includes(search.toLowerCase()));
    
    const matchesStatus = statusFilter === 'Todas' || p.situacao === statusFilter;
    return matchesSearch && matchesStatus;
  }), [projetos, clientes, search, statusFilter]);

  // Prazo primeiro: a pergunta mais frequente aqui é "o que vence antes".
  const ORDENS_OBRA = useMemo<OpcaoOrdenacao<Projeto>[]>(() => [
    { id: 'prazo', label: 'Entrega mais próxima', comparar: (a, b) => (a.dataFim ?? '').localeCompare(b.dataFim ?? '') },
    { id: 'recentes', label: 'Início mais recente', comparar: (a, b) => compararData(a.dataInicio, b.dataInicio) },
    { id: 'nome', label: 'Nome (A–Z)', comparar: (a, b) => compararTexto(a.nome, b.nome) },
    { id: 'avanco', label: 'Menor avanço físico', comparar: (a, b) => getProjectProgress(a.id) - getProjectProgress(b.id) },
  ], [resumoPorProjeto]);

  const lista = useListaOrdenada({ itens: filteredProjetos, opcoes: ORDENS_OBRA, porPagina: 24 });

  // Mesmo número do console (ponderado pelo orçamento vinculado a cada etapa),
  // agora vindo de `v_resumo_obra`. Aqui já foi uma média simples, e a mesma
  // obra mostrava um número na lista e outro ao entrar.
  const getProjectProgress = (projId: string) => resumoPorProjeto.get(projId)?.avancoFisico ?? 0;

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
    const start = dataLocal(formInicio);
    const end = dataLocal(formFim);
    if (!start || !end) return [];
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (totalDays < 0) return [];
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

  // Fechar o assistente volta para o passo 1 — antes o passo sobrevivia ao
  // fechamento e reabrir caía direto no passo 3.
  const closeWizard = () => {
    if (isSaving) return;
    setShowAddModal(false);
    setWizardStep(1);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome || !formClienteId || !formResponsavel || !formEndereco || !formInicio || !formFim) {
      toast.error("Por favor, preencha todos os campos obrigatórios: Título, Cliente, Responsável, Endereço, Início e Entrega.");
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

  return (
    <div id="projetos-tab-content" className="space-y-6">
      
      {/* Title block */}
      <div id="projetos-title" className="flex items-center justify-between">
        <div className="text-left">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Obras e Projetos Ativos</h2>
          <p className="text-xs text-slate-500">Módulo central de acompanhamento, orçamento integrado, medições de campo e cronograma de obra.</p>
        </div>
        {podeGerenciar && (
          <Button
            id="add-projeto-trigger-btn"
            onClick={() => setShowAddModal(true)}
          >
            <FolderPlus size={15} />
            <span>Iniciar Obra</span>
          </Button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div id="projetos-filters" className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
          <Input
            id="proj-search-text-input"
            type="text"
            placeholder="Buscar por nome da obra, gerente responsável ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-4"
          />
        </div>

        <div>
          <Select
            id="proj-status-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)} className="font-medium cursor-pointer"
          >
            <option value="Todas">Situação: Todas</option>
            <option value="Planejamento">Situação: Planejamento</option>
            <option value="Em Execução">Situação: Em Execução</option>
            <option value="Pausado">Situação: Pausado</option>
            <option value="Finalizado">Situação: Finalizado</option>
          </Select>
        </div>
      </div>

      {!loading && filteredProjetos.length > 0 && (
        <SeletorOrdenacao
          opcoes={lista.opcoes}
          valor={lista.ordemId}
          onChange={lista.setOrdemId}
          mostrando={lista.mostrando}
          total={lista.total}
        />
      )}

      {/* Grid List of Projects */}
      <div id="projetos-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          /* Sem isto a tela mostrava "Nenhum projeto cadastrado" com o CTA de
             criar enquanto o fetch estava em curso — convite a duplicar obra. */
          <div className="col-span-full flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
            <Spinner size={22} />
            <span className="text-xs font-semibold">Carregando obras...</span>
          </div>
        ) : lista.total === 0 ? (
          <div className="col-span-full">
            {projetos.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="Nenhum projeto cadastrado"
                description={
                  podeGerenciar
                    ? 'Inicie um planejamento de obra a partir de propostas aprovadas ou do zero.'
                    : 'Nenhuma obra foi atribuída ao seu perfil ainda.'
                }
                actionLabel={podeGerenciar ? 'Iniciar Obra' : undefined}
                onAction={podeGerenciar ? () => setShowAddModal(true) : undefined}
              />
            ) : (
              <EmptyState
                icon={Search}
                title="Nenhuma obra encontrada"
                description="Nenhuma obra corresponde à busca ou ao filtro de situação aplicados."
              />
            )}
          </div>
        ) : (
          lista.visiveis.map((proj, index) => {
            const progress = getProjectProgress(proj.id);
            const risco = avaliarRiscoObra(proj, resumoPorProjeto.get(proj.id));

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
                    <StatusBadge type="projeto" status={proj.situacao} />
                    {podeGerenciar && (
                      <button
                        id={`delete-project-btn-${proj.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(proj);
                        }}
                        className="text-slate-500 hover:text-rose-600 p-1 rounded transition active:scale-95 shrink-0"
                        aria-label="Excluir Obra"
                        title="Excluir Obra"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
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
                      <MapPin size={12} className="text-slate-500 shrink-0" />
                      <span>{proj.enderecoObra}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-500 shrink-0" />
                      <span>Término: {formatarDataBR(proj.dataFim)}</span>
                    </p>
                  </div>

                  {/* Sinais de atenção — atraso, boletim parado e estouro de
                      orçamento eram visíveis só no dashboard, nunca aqui. */}
                  {risco.temRisco && (
                    <div className="flex flex-wrap gap-1.5">
                      {risco.entregaVencida && (
                        <span
                          className="inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/60"
                          title="A previsão de entrega já venceu e a obra não foi finalizada."
                        >
                          <CalendarX size={10} /> Prazo vencido
                        </span>
                      )}
                      {risco.etapasAtrasadas > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60"
                          title="Etapas com prazo vencido sem conclusão."
                        >
                          <AlertTriangle size={10} />
                          {risco.etapasAtrasadas} {risco.etapasAtrasadas === 1 ? 'etapa atrasada' : 'etapas atrasadas'}
                        </span>
                      )}
                      {risco.medicoesPendentes > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200/60"
                          title="Boletins de medição aguardando aprovação."
                        >
                          <Clock3 size={10} />
                          {risco.medicoesPendentes} {risco.medicoesPendentes === 1 ? 'medição pendente' : 'medições pendentes'}
                        </span>
                      )}
                      {risco.estouroOrcamento > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/60"
                          title="Valor executado acima do orçado."
                        >
                          <TrendingUp size={10} />
                          {risco.estouroOrcamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} acima
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Progress bar section */}
                <div className="px-3.5 pb-3.5 space-y-1.5 text-left">
                  <div className="flex justify-between text-xs font-mono text-slate-500">
                    <span>Avanço Físico</span>
                    <span className="font-bold text-slate-800">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200 flex">
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
                  className="w-full bg-slate-50 hover:bg-blue-600 text-slate-700 hover:text-white font-bold py-2 text-xs border-t border-slate-200 flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <span>Gerenciar Obra</span>
                  <ArrowRight size={13} />
                </button>
              </motion.div>
            );
          })
        )}
      </div>

      <CarregarMais temMais={lista.temMais} restantes={lista.restantes} onCarregarMais={lista.carregarMais} />

      {/* Add Project Modal Overlay */}
      <Modal
        id="add-project-modal"
        open={showAddModal}
        onClose={closeWizard}
        title="Assistente de Nova Obra"
        description={`Passo ${wizardStep} de 3`}
        size="lg"
        bloqueado={isSaving}
      >
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
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Título / Nome do Projeto *</label>
                      <Input
                        id="add-proj-nome"
                        type="text"
                        required
                        placeholder="Ex: Reforma de Cobertura Residencial"
                        value={formNome}
                        onChange={(e) => setFormNome(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Gerente de Obra Responsável *</label>
                      <Select
                        id="add-proj-responsavel"
                        required
                        value={formResponsavel}
                        onChange={(e) => setFormResponsavel(e.target.value)}
                      >
                        <option value="">Selecione um responsável...</option>
                        {funcionarios.map(f => (
                          <option key={f.id} value={f.id}>{f.nome} ({f.cargo})</option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Endereço do Canteiro *</label>
                      <Input
                        id="add-proj-endereco"
                        type="text"
                        required
                        placeholder="Rua, Número, Bairro, Cidade - UF"
                        value={formEndereco}
                        onChange={(e) => setFormEndereco(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Data Início Mobilização *</label>
                        <Input
                          id="add-proj-inicio"
                          type="date"
                          required
                          value={formInicio}
                          onChange={(e) => setFormInicio(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Data Previsão Entrega *</label>
                        <Input
                          id="add-proj-fim"
                          type="date"
                          required
                          value={formFim}
                          onChange={(e) => setFormFim(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={closeWizard}
                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <Button
                        type="button"
                        onClick={() => {
                          if (!formNome || !formResponsavel || !formEndereco || !formInicio || !formFim) {
                            toast.error("Por favor, preencha todos os campos obrigatórios do Passo 1.");
                            return;
                          }
                          setWizardStep(2);
                        }}
                      >
                        Próximo: Proposta →
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 2: Vinculação de Proposta</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cliente Vinculado *</label>
                        <Select
                          id="add-proj-cliente"
                          required
                          value={formClienteId}
                          onChange={(e) => {
                            setFormClienteId(e.target.value);
                            setFormPropostaId('');
                          }} className="font-medium"
                        >
                          <option value="">Selecione um cliente...</option>
                          {clientes.map(c => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Proposta Aprovada (Opcional)</label>
                        <Select
                          id="add-proj-proposta"
                          value={formPropostaId}
                          onChange={(e) => setFormPropostaId(e.target.value)}
                          disabled={!formClienteId}
                        >
                          <option value="">Nenhuma proposta vinculada</option>
                          {getApprovedProposalsForClient(formClienteId).map(p => (
                            <option key={p.id} value={p.id}>{p.numero} - {p.descricao}</option>
                          ))}
                        </Select>
                      </div>

                      {formPropostaId && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
                          <span className="font-bold block text-2xs uppercase tracking-wider text-blue-400">Resumo da Proposta Comercial</span>
                          <p><strong>Descrição:</strong> {propostas.find(p => p.id === formPropostaId)?.descricao}</p>
                          <p><strong>Investimento:</strong> {propostas.find(p => p.id === formPropostaId)?.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                          <p><strong>Prazo:</strong> {formatarPrazo(propostas.find(p => p.id === formPropostaId)?.prazoExecucaoDias)}</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setWizardStep(1)}
                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition cursor-pointer"
                      >
                        ← Voltar
                      </button>
                      <Button
                        type="button"
                        onClick={() => {
                          if (!formClienteId) {
                            toast.error("Por favor, selecione o cliente vinculado.");
                            return;
                          }
                          setWizardStep(3);
                        }}
                      >
                        Próximo: Cronograma →
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 3: Cronograma Inicial Sugerido</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Com base no prazo do projeto (<strong className="text-slate-700">{formatarDataBR(formInicio)}</strong> a <strong className="text-slate-700">{formatarDataBR(formFim)}</strong>), estas frentes de trabalho serão criadas automaticamente, escalonadas ao longo do prazo e sob responsabilidade de <strong className="text-slate-700">{responsavelNome}</strong>:
                    </p>

                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-200 shadow-xs bg-slate-50/50">
                      {previewStages.map((stage, i) => (
                        <div key={stage.nome} className="p-2.5 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-bold text-slate-900">{i + 1}. {stage.nome}</p>
                            <p className="text-2xs text-slate-500 font-medium">Responsável: {responsavelNome}</p>
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
                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition cursor-pointer"
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
      </Modal>

      {/* Cascading Delete Impact Modal */}
      <Modal
        id="delete-impact-modal"
        open={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        title="Aviso de Impacto de Exclusão"
        size="md"
        bloqueado={isDeleting}
      >
        {projectToDelete && (
              <div className="p-4 space-y-4 text-left">
                <p className="text-xs text-slate-700 leading-relaxed">
                  A exclusão do projeto <strong className="text-slate-900">"{projectToDelete.nome}"</strong> é uma ação irreversível. Todos os dados vinculados nos módulos do Analizze serão removidos permanentemente em cascata:
                </p>

                <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 space-y-2 text-xs font-semibold text-rose-950">
                  <div className="flex justify-between">
                    <span>Itens de orçamento associados:</span>
                    <span className="font-mono text-rose-700">{resumoPorProjeto.get(projectToDelete.id)?.itensTotal ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Atividades do cronograma:</span>
                    <span className="font-mono text-rose-700">{resumoPorProjeto.get(projectToDelete.id)?.etapasTotal ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Boletins de medição lançados:</span>
                    <span className="font-mono text-rose-700">{resumoPorProjeto.get(projectToDelete.id)?.medicoesTotal ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Documentações anexadas:</span>
                    <span className="font-mono text-rose-700">{documentos.filter(d => d.projetoId === projectToDelete.id).length}</span>
                  </div>
                </div>

                <p className="text-2xs text-rose-600 font-medium">
                  Confirma que deseja prosseguir e excluir este projeto juntamente com todos os seus registros de histórico financeiro e de campo?
                </p>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <Button variante="fantasma" disabled={isDeleting} onClick={() => setProjectToDelete(null)}>
                    Cancelar
                  </Button>
                  <Button
                    id="confirm-delete-project-btn"
                    variante="perigo"
                    carregando={isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      // Só fecha o modal e comemora depois que o banco confirma:
                      // em erro (ou perfil sem permissão) o hook já mostrou o
                      // motivo e restaurou a obra na lista.
                      const ok = await onDeleteProjeto(projectToDelete.id);
                      setIsDeleting(false);
                      if (!ok) return;
                      setProjectToDelete(null);
                      toast.success('Projeto e dados vinculados removidos com sucesso.');
                    }}
                  >
                    {isDeleting ? 'Excluindo...' : 'Excluir Obra e Vínculos'}
                  </Button>
                </div>
              </div>
        )}
      </Modal>

    </div>
  );
}

/**
 * `memo` porque o conector acima é assinante de contexto: ele re-renderiza a
 * cada mudança de navegação (abrir a gaveta do menu, selecionar uma obra) mesmo
 * quando nenhuma prop desta tela mudou. Só vale porque os handlers vêm de
 * `useCallback` nos hooks de domínio — com uma prop instável o `memo` seria
 * custo de leitura com ganho zero, que é o que a auditoria previa no item 30.
 */
export default memo(ProjetosTab);
