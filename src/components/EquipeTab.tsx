import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Search,
  Plus,
  Calendar,
  Phone,
  Mail,
  Briefcase,
  ShieldCheck,
  FileCheck,
  HardHat,
  UserCheck,
  UserX,
  Trash2,
  FileText,
  AlertCircle,
  AlertTriangle,
  Pencil,
  Wallet,
  Check,
  X
} from 'lucide-react';
import { Funcionario, Projeto, EtapaCronograma } from '../types';
import { onlyDigits } from '../utils/format';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

interface EquipeTabProps {
  funcionarios: Funcionario[];
  projetos: Projeto[];
  cronograma: EtapaCronograma[];
  loading: boolean;
  onAddFuncionario: (func: Funcionario) => Promise<Funcionario | null>;
  onUpdateFuncionario: (func: Funcionario) => Promise<Funcionario | null>;
  onUpdateDocumentosFuncionario: (id: string, documentos: string[]) => Promise<boolean>;
  onUpdateStatusFuncionario: (id: string, status: Funcionario['status']) => Promise<boolean>;
  onUpdateSalarioFuncionario: (id: string, salarioBase: number | null) => Promise<boolean>;
  onDeleteFuncionario: (id: string) => Promise<boolean>;
}

interface Assignment {
  projetoNome: string;
  etapaNome: string;
  progresso: number;
  status: EtapaCronograma['status'];
}

/**
 * Date-only columns come back as 'YYYY-MM-DD'. Parsing that directly yields UTC
 * midnight, which renders as the previous day in BRT — so anchor it to local
 * midnight, same convention used across the schedule screens.
 */
function formatDataAdmissao(iso: string): string {
  if (!iso) return 'Não informada';
  const parsed = new Date(`${iso}T00:00:00`);
  return isNaN(parsed.getTime()) ? 'Não informada' : parsed.toLocaleDateString('pt-BR');
}

export default function EquipeTab({
  funcionarios,
  projetos,
  cronograma,
  loading,
  onAddFuncionario,
  onUpdateFuncionario,
  onUpdateDocumentosFuncionario,
  onUpdateStatusFuncionario,
  onUpdateSalarioFuncionario,
  onDeleteFuncionario
}: EquipeTabProps) {
  const { toast, confirm } = useFeedback();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  // Only the id is held in state: the record itself is always read from the
  // list, so edits elsewhere never leave a stale copy on screen.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isEditingSalario, setIsEditingSalario] = useState(false);
  const [isSavingSalario, setIsSavingSalario] = useState(false);
  const [salarioDraft, setSalarioDraft] = useState('');
  const [isSavingDocs, setIsSavingDocs] = useState(false);
  const [detailDocName, setDetailDocName] = useState('');

  // Employee Form State (shared by create and edit)
  const [formNome, setFormNome] = useState('');
  const [formCargo, setFormCargo] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAdmissao, setFormAdmissao] = useState('');
  const [formSalarioBase, setFormSalarioBase] = useState('');
  const [formObs, setFormObs] = useState('');
  const [formDocs, setFormDocs] = useState<string[]>([]);
  const [newDocName, setNewDocName] = useState('');

  const selectedFunc = funcionarios.find((f) => f.id === selectedId) ?? null;

  // Single source of truth for workload: active stages only, indexed by owner.
  const assignmentsByFuncionario = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    cronograma
      .filter((c) => c.status !== 'Concluído')
      .forEach((step) => {
        const proj = projetos.find((p) => p.id === step.projetoId);
        const list = map.get(step.responsavelId) ?? [];
        list.push({
          projetoNome: proj ? proj.nome : 'Obra Desconhecida',
          etapaNome: step.nome,
          progresso: step.percentualExecutado,
          status: step.status
        });
        map.set(step.responsavelId, list);
      });
    return map;
  }, [cronograma, projetos]);

  const getAssignments = (funcId: string): Assignment[] => assignmentsByFuncionario.get(funcId) ?? [];

  // Filter
  const term = search.trim().toLowerCase();
  const searchDigits = onlyDigits(search);
  const filteredFuncionarios = funcionarios.filter(f => {
    const matchesSearch =
      !term ||
      f.nome.toLowerCase().includes(term) ||
      f.cargo.toLowerCase().includes(term) ||
      (searchDigits.length > 0 && onlyDigits(f.cpf).includes(searchDigits));

    const matchesStatus = statusFilter === 'Todos' || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const resetForm = () => {
    setFormNome('');
    setFormCargo('');
    setFormCpf('');
    setFormTelefone('');
    setFormEmail('');
    setFormAdmissao('');
    setFormSalarioBase('');
    setFormObs('');
    setFormDocs([]);
    setNewDocName('');
  };

  const openCreateModal = () => {
    resetForm();
    setEditingId(null);
    setShowFormModal(true);
  };

  const openEditModal = (func: Funcionario) => {
    setFormNome(func.nome);
    setFormCargo(func.cargo);
    setFormCpf(func.cpf);
    setFormTelefone(func.telefone);
    setFormEmail(func.email);
    setFormAdmissao(func.dataAdmissao);
    setFormSalarioBase(func.salarioBase != null ? String(func.salarioBase) : '');
    setFormObs(func.observacoes);
    setFormDocs(func.documentos);
    setNewDocName('');
    setEditingId(func.id);
    setShowFormModal(true);
  };

  const closeFormModal = () => {
    if (isSaving) return;
    setShowFormModal(false);
    setEditingId(null);
  };

  const handleAddDoc = () => {
    if (newDocName.trim()) {
      setFormDocs([...formDocs, newDocName.trim()]);
      setNewDocName('');
    }
  };

  const handleRemoveFormDoc = (index: number) => {
    setFormDocs(formDocs.filter((_, i) => i !== index));
  };

  const handleSubmitFuncionario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim() || !formCargo.trim() || !formCpf.trim()) {
      toast.error("Por favor, preencha os campos obrigatórios: Nome, Cargo e CPF.");
      return;
    }

    const parsedSalario = formSalarioBase.trim() ? parseFloat(formSalarioBase) : NaN;
    if (formSalarioBase.trim() && (isNaN(parsedSalario) || parsedSalario < 0)) {
      toast.error('Informe um valor de salário base válido.');
      return;
    }

    setIsSaving(true);
    const editing = editingId ? funcionarios.find((f) => f.id === editingId) : null;
    const func: Funcionario = {
      id: editingId ?? crypto.randomUUID(),
      nome: formNome.trim(),
      cargo: formCargo.trim(),
      cpf: formCpf.trim(),
      telefone: formTelefone.trim(),
      email: formEmail.trim(),
      dataAdmissao: formAdmissao || new Date().toISOString().split('T')[0],
      documentos: formDocs,
      status: editing?.status ?? 'Ativo',
      observacoes: formObs,
      salarioBase: isNaN(parsedSalario) ? undefined : parsedSalario
    };

    const saved = editingId ? await onUpdateFuncionario(func) : await onAddFuncionario(func);
    setIsSaving(false);
    // The hook already surfaced the failure — keep the form open so nothing is lost.
    if (!saved) return;

    setSelectedId(saved.id);
    setShowFormModal(false);
    setEditingId(null);
    resetForm();
    toast.success(
      editingId ? 'Ficha atualizada com sucesso.' : 'Colaborador cadastrado com sucesso.',
      editingId ? `Os dados de ${saved.nome} foram salvos.` : `Ficha funcional criada para ${saved.nome}.`
    );
  };

  const handleStartEditSalario = () => {
    setSalarioDraft(selectedFunc?.salarioBase != null ? String(selectedFunc.salarioBase) : '');
    setIsEditingSalario(true);
  };

  const handleSaveSalario = async () => {
    if (!selectedFunc) return;
    const trimmed = salarioDraft.trim();
    const parsed = trimmed ? parseFloat(trimmed) : null;
    if (trimmed && (isNaN(parsed as number) || (parsed as number) < 0)) {
      toast.error('Informe um valor de salário válido.');
      return;
    }
    setIsSavingSalario(true);
    const ok = await onUpdateSalarioFuncionario(selectedFunc.id, parsed);
    setIsSavingSalario(false);
    if (!ok) return;
    setIsEditingSalario(false);
    toast.success('Salário base atualizado.');
  };

  const handleAddDetailDoc = async () => {
    if (!selectedFunc || !detailDocName.trim()) return;
    const nome = detailDocName.trim();
    setIsSavingDocs(true);
    const ok = await onUpdateDocumentosFuncionario(selectedFunc.id, [...selectedFunc.documentos, nome]);
    setIsSavingDocs(false);
    if (!ok) return;
    setDetailDocName('');
    toast.success('Documento anexado à ficha.');
  };

  const handleRemoveDetailDoc = async (index: number) => {
    if (!selectedFunc) return;
    setIsSavingDocs(true);
    const ok = await onUpdateDocumentosFuncionario(
      selectedFunc.id,
      selectedFunc.documentos.filter((_, i) => i !== index)
    );
    setIsSavingDocs(false);
    if (ok) toast.success('Documento removido da ficha.');
  };

  const handleToggleStatus = async (selected: Funcionario) => {
    setIsUpdatingStatus(true);
    const nextStatus = selected.status === 'Ativo' ? 'Inativo' : 'Ativo';
    const ok = await onUpdateStatusFuncionario(selected.id, nextStatus);
    setIsUpdatingStatus(false);
    if (ok) toast.success(`Colaborador alterado para ${nextStatus}.`);
  };

  const handleDelete = (selected: Funcionario) => {
    confirm({
      title: 'Confirmar exclusão de colaborador',
      message: `Excluir permanentemente o colaborador ${selected.nome}?`,
      onConfirm: async () => {
        // Fall back to the neighbour in the visible list, not an arbitrary row.
        const index = filteredFuncionarios.findIndex((f) => f.id === selected.id);
        const neighbour = filteredFuncionarios[index + 1] ?? filteredFuncionarios[index - 1] ?? null;
        const ok = await onDeleteFuncionario(selected.id);
        if (!ok) return;
        setSelectedId(neighbour?.id ?? null);
        setIsEditingSalario(false);
        toast.success('Ficha excluída com sucesso.');
      }
    });
  };

  return (
    <div id="equipe-tab-container" className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-120px)]">

      {/* Left Column: List & Filters */}
      <div id="equipe-list-col" className="lg:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">
              Quadro de Colaboradores
              {!loading && <span className="ml-1.5 text-xs font-medium text-slate-400">({filteredFuncionarios.length})</span>}
            </h3>
            <button
              id="add-func-btn"
              onClick={openCreateModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition shadow-sm active:scale-95"
            >
              <Plus size={14} />
              <span>Novo Integrante</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
              <input
                id="func-search-input"
                type="text"
                placeholder="Pesquisar por nome, cargo ou CPF..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:border-blue-600 outline-none text-slate-800"
              />
            </div>

            <div>
              <select
                id="func-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full border border-slate-200 rounded p-1.5 text-xs outline-none text-slate-600 bg-white"
              >
                <option value="Todos">Status: Todos</option>
                <option value="Ativo">Status: Ativos</option>
                <option value="Inativo">Status: Inativos</option>
              </select>
            </div>
          </div>
        </div>

        {/* List Content Scrollable */}
        <div id="equipe-scroll-area" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
              <Spinner size={20} />
              <p className="text-xs">Carregando colaboradores...</p>
            </div>
          ) : filteredFuncionarios.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Users}
                title="Nenhum colaborador encontrado"
                description="Cadastre profissionais de engenharia, arquitetura e campo."
                actionLabel="Novo Integrante"
                onAction={openCreateModal}
              />
            </div>
          ) : (
            filteredFuncionarios.map((func, index) => {
              const isSelected = selectedId === func.id;
              const frentesAtivas = getAssignments(func.id).length;
              const isSobrecarregado = frentesAtivas > 2;

              return (
                <motion.div
                  key={func.id}
                  id={`func-item-${func.id}`}
                  role="button"
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => { setSelectedId(func.id); setIsEditingSalario(false); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(func.id);
                      setIsEditingSalario(false);
                    }
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                  className={`p-3 cursor-pointer transition text-left space-y-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                    isSelected ? 'bg-blue-50/40 border-l-4 border-blue-600 font-medium' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-xs text-slate-900 truncate max-w-[160px]">{func.nome}</h4>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      func.status === 'Ativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {func.status}
                    </span>
                  </div>
                  <p className="text-xs text-blue-600 font-semibold truncate flex items-center gap-1">
                    <HardHat size={11} />
                    <span>{func.cargo}</span>
                  </p>
                  <div className="flex justify-between items-center text-[10px] mt-1 text-slate-500 font-semibold">
                    <span>Frentes: {frentesAtivas} ativas</span>
                    {isSobrecarregado && (
                      <span className="text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 text-[9px] uppercase tracking-wider font-extrabold flex items-center gap-0.5">
                        <AlertCircle size={10} className="shrink-0 text-rose-500" />
                        Sobrecarregado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-1">{func.cpf}</p>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Detailed Employee View & Onsite Assignments */}
      <div id="equipe-detail-col" className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {selectedFunc ? (
          <div id="equipe-detail-view" className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Header detail */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div className="text-left">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">ID Registro: {selectedFunc.id}</span>
                <h3 className="text-lg font-bold text-slate-950 mt-1 leading-tight flex items-center gap-2">
                  <HardHat size={18} className="text-slate-700 shrink-0" />
                  <span>{selectedFunc.nome}</span>
                </h3>
                <p className="text-xs text-blue-600 font-bold mt-1 uppercase tracking-wide">
                  {selectedFunc.cargo}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    id={`edit-func-btn-${selectedFunc.id}`}
                    onClick={() => openEditModal(selectedFunc)}
                    className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition active:scale-95"
                    title="Editar ficha funcional"
                  >
                    <Pencil size={13} />
                    <span>Editar Ficha</span>
                  </button>
                  <button
                    id={`toggle-func-status-btn-${selectedFunc.id}`}
                    disabled={isUpdatingStatus}
                    onClick={() => handleToggleStatus(selectedFunc)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded border transition active:scale-95 disabled:opacity-50 ${
                      selectedFunc.status === 'Ativo'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                    title="Alterar Status de Atividade"
                  >
                    {isUpdatingStatus ? (
                      <Spinner size={14} />
                    ) : selectedFunc.status === 'Ativo' ? (
                      <>
                        <UserCheck size={14} />
                        <span>Ativo</span>
                      </>
                    ) : (
                      <>
                        <UserX size={14} />
                        <span>Inativo</span>
                      </>
                    )}
                  </button>
                </div>
                <button
                  id={`delete-func-btn-${selectedFunc.id}`}
                  onClick={() => handleDelete(selectedFunc)}
                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 text-xs flex items-center gap-1 transition active:scale-95"
                >
                  <Trash2 size={12} />
                  <span>Excluir Ficha</span>
                </button>
              </div>
            </div>

            {/* Carga de Trabalho e Indicador de Sobrecarga */}
            {(() => {
              const frentesAtivas = getAssignments(selectedFunc.id).length;
              const isSobrecarregado = frentesAtivas > 2;

              return (
                <div className={`p-3.5 rounded-lg border flex items-center justify-between text-left ${
                  isSobrecarregado
                    ? 'bg-rose-50 border-rose-200 text-rose-950'
                    : frentesAtivas > 0
                      ? 'bg-blue-50/50 border-blue-200 text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Distribuição de Carga de Trabalho</span>
                    <p className="text-xs">
                      Atualmente encarregado por <strong className="text-sm font-bold font-mono text-slate-900">{frentesAtivas}</strong> {frentesAtivas === 1 ? 'frente' : 'frentes'} de obra {frentesAtivas === 1 ? 'ativa' : 'ativas'}.
                    </p>
                  </div>
                  {isSobrecarregado ? (
                    <span className="bg-rose-600 text-white font-extrabold text-[10px] px-2.5 py-1 rounded shadow-sm flex items-center gap-1 shrink-0">
                      <AlertTriangle size={13} />
                      <span>SOBRECARREGADO</span>
                    </span>
                  ) : (
                    <span className={`font-bold text-[10px] px-2.5 py-1 rounded border shadow-xs shrink-0 ${
                      frentesAtivas > 0 ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {frentesAtivas === 0 ? 'DISPONÍVEL' : 'DISTRIBUIÇÃO SAUDÁVEL'}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Quick stats grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-left">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Canais de Contato</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <Phone size={13} className="text-slate-400 shrink-0" />
                  <span className="font-semibold">{selectedFunc.telefone || 'Não informado'}</span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2 truncate">
                  <Mail size={13} className="text-slate-400 shrink-0" />
                  <span className="font-semibold">{selectedFunc.email || 'Não informado'}</span>
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-left">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Documentos & Admissão</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <Calendar size={13} className="text-slate-400 shrink-0" />
                  <span>Admitido em: <strong className="text-slate-900">{formatDataAdmissao(selectedFunc.dataAdmissao)}</strong></span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase shrink-0 mr-1">CPF:</span>
                  <span className="font-mono font-semibold">{selectedFunc.cpf}</span>
                </p>
              </div>
            </div>

            {/* Dados Financeiros — Salário Base (usado na Folha em Gestão Financeira) */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-left">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={13} className="text-slate-400" />
                  <span>Salário Base</span>
                </span>
                {!isEditingSalario && (
                  <button
                    id={`edit-salario-btn-${selectedFunc.id}`}
                    onClick={handleStartEditSalario}
                    className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition"
                    title="Editar salário base"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
              {isEditingSalario ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">R$</span>
                  <input
                    id={`salario-input-${selectedFunc.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    autoFocus
                    disabled={isSavingSalario}
                    placeholder="0,00"
                    value={salarioDraft}
                    onChange={(e) => setSalarioDraft(e.target.value)}
                    className="flex-1 border border-slate-200 rounded p-1.5 text-xs font-mono outline-none focus:border-blue-600 disabled:bg-slate-50"
                  />
                  <button
                    onClick={handleSaveSalario}
                    disabled={isSavingSalario}
                    className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded hover:bg-emerald-50 transition disabled:opacity-50"
                    title="Salvar"
                  >
                    {isSavingSalario ? <Spinner size={15} /> : <Check size={15} />}
                  </button>
                  <button
                    onClick={() => setIsEditingSalario(false)}
                    disabled={isSavingSalario}
                    className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition disabled:opacity-50"
                    title="Cancelar"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : selectedFunc.salarioBase != null ? (
                <p className="text-sm font-bold text-slate-900 font-mono">
                  R$ {selectedFunc.salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              ) : (
                <p className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                  <AlertCircle size={12} />
                  <span>Não cadastrado — necessário para liberar pagamento na Folha</span>
                </p>
              )}
            </div>

            {/* Onsite Active Work (Etapas Vinculadas) */}
            {(() => {
              const assignments = getAssignments(selectedFunc.id);
              return (
                <div className="space-y-2 text-left">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Briefcase size={15} className="text-slate-500" />
                    <span>Atividades de Obra em Andamento ({assignments.length})</span>
                  </h4>

                  {assignments.length === 0 ? (
                    <p className="text-xs text-slate-400 pl-1">Este profissional não está liderando nenhuma atividade no cronograma ativo atualmente.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {assignments.map((work, idx) => (
                        <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition">
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-bold text-slate-400 uppercase truncate max-w-[120px]">{work.projetoNome}</span>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/50">{work.status}</span>
                          </div>
                          <h5 className="font-bold text-xs text-slate-900 mt-1 truncate">{work.etapaNome}</h5>

                          <div className="mt-3 space-y-1">
                            <div className="flex justify-between text-xs text-slate-400">
                              <span>Execução Física</span>
                              <span>{work.progresso}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded overflow-hidden">
                              <div className="bg-blue-600 h-full rounded transition-all duration-300" style={{ width: `${work.progresso}%` }}></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Delivered Documents Checklist */}
            <div className="space-y-2 text-left">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <ShieldCheck size={15} className="text-emerald-600" />
                <span>Documentações e Treinamentos Entregues</span>
              </h4>

              <div className="flex gap-2">
                <input
                  id={`detail-doc-input-${selectedFunc.id}`}
                  type="text"
                  disabled={isSavingDocs}
                  placeholder="Ex: Treinamento_NR35.pdf"
                  value={detailDocName}
                  onChange={(e) => setDetailDocName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDetailDoc();
                    }
                  }}
                  className="flex-1 border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                />
                <button
                  id={`detail-doc-add-btn-${selectedFunc.id}`}
                  type="button"
                  disabled={isSavingDocs || !detailDocName.trim()}
                  onClick={handleAddDetailDoc}
                  className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingDocs ? <Spinner size={13} /> : <Plus size={13} />}
                  <span>Anexar</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {selectedFunc.documentos.length === 0 ? (
                  <p className="text-xs text-slate-400 pl-1">Nenhuma documentação entregue pelo colaborador.</p>
                ) : (
                  selectedFunc.documentos.map((doc, idx) => (
                    <div key={idx} className="bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded px-2.5 py-1 text-xs font-mono text-slate-700 flex items-center gap-1.5 transition">
                      <FileCheck size={12} className="text-emerald-600 shrink-0" />
                      <span>{doc}</span>
                      <button
                        type="button"
                        disabled={isSavingDocs}
                        onClick={() => handleRemoveDetailDoc(idx)}
                        className="text-slate-400 hover:text-rose-600 font-bold transition disabled:opacity-40"
                        title="Remover documento"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Observations / Technical Memo */}
            <div className="p-3 bg-blue-50/20 rounded-lg border border-blue-100 text-left">
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 font-mono">
                <FileText size={13} />
                <span>Observações de Ficha Funcional</span>
              </span>
              <p className="text-xs text-slate-700 italic font-medium leading-relaxed">
                {selectedFunc.observacoes || 'Sem observações ou advertências anotadas.'}
              </p>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            {loading ? (
              <>
                <Spinner size={24} />
                <p className="text-xs mt-2">Carregando colaboradores...</p>
              </>
            ) : (
              <>
                <Users size={48} className="stroke-1 mb-2" />
                <p className="text-xs">Selecione um profissional para ver a ficha.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Employee Modal Overlay */}
      <AnimatePresence>
        {showFormModal && (
          <div id="employee-form-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeFormModal}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">
                  {editingId ? 'Editar Ficha Funcional' : 'Adicionar Novo Integrante'}
                </h3>
                <button
                  onClick={closeFormModal}
                  disabled={isSaving}
                  className="text-slate-400 hover:text-slate-600 font-bold transition disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleSubmitFuncionario} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nome Completo *</label>
                  <input
                    id="add-func-nome"
                    type="text"
                    required
                    disabled={isSaving}
                    placeholder="Ex: Carlos Roberto Albuquerque"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Função / Cargo *</label>
                    <input
                      id="add-func-cargo"
                      type="text"
                      required
                      disabled={isSaving}
                      list="func-cargo-options"
                      placeholder="Ex: Engenheiro Júnior"
                      value={formCargo}
                      onChange={(e) => setFormCargo(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none text-slate-800 disabled:bg-slate-50"
                    />
                    <datalist id="func-cargo-options">
                      {Array.from(new Set(funcionarios.map((f) => f.cargo).filter(Boolean))).map((cargo) => (
                        <option key={cargo} value={cargo} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">CPF *</label>
                    <input
                      id="add-func-cpf"
                      type="text"
                      required
                      disabled={isSaving}
                      placeholder="000.000.000-00"
                      value={formCpf}
                      onChange={(e) => setFormCpf(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none text-slate-800 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Telefone</label>
                    <input
                      id="add-func-tel"
                      type="text"
                      disabled={isSaving}
                      placeholder="(11) 90000-0000"
                      value={formTelefone}
                      onChange={(e) => setFormTelefone(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">E-mail</label>
                    <input
                      id="add-func-email"
                      type="email"
                      disabled={isSaving}
                      placeholder="email@empresa.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Data de Admissão</label>
                    <input
                      id="add-func-admissao"
                      type="date"
                      disabled={isSaving}
                      value={formAdmissao}
                      onChange={(e) => setFormAdmissao(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 text-slate-600 disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Salário Base (R$)</label>
                    <input
                      id="add-func-salario"
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={isSaving}
                      placeholder="Ex: 3500.00"
                      value={formSalarioBase}
                      onChange={(e) => setFormSalarioBase(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 text-slate-600 disabled:bg-slate-50 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Observações / Capacitações</label>
                  <textarea
                    id="add-func-obs"
                    disabled={isSaving}
                    placeholder="Informações adicionais de saúde ocupacional, treinamentos especiais..."
                    value={formObs}
                    onChange={(e) => setFormObs(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Documentos Homologados</label>
                  <div className="flex gap-2">
                    <input
                      id="add-func-doc-input"
                      type="text"
                      disabled={isSaving}
                      placeholder="Ex: Treinamento_NR10.pdf"
                      value={newDocName}
                      onChange={(e) => setNewDocName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddDoc();
                        }
                      }}
                      className="flex-1 border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleAddDoc}
                      className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded transition active:scale-95 disabled:opacity-50"
                    >
                      Anexar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formDocs.map((doc, idx) => (
                      <span key={idx} className="bg-slate-100 text-slate-700 text-xs font-mono px-2 py-1 rounded border border-slate-200 flex items-center gap-1.5">
                        <span>{doc}</span>
                        <button type="button" disabled={isSaving} onClick={() => handleRemoveFormDoc(idx)} className="text-slate-400 hover:text-rose-600 font-bold transition">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={closeFormModal}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-add-employee-btn"
                    type="submit"
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
                  >
                    {isSaving ? (
                      <>
                        <Spinner size={14} />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck size={14} />
                        <span>{editingId ? 'Salvar Alterações' : 'Salvar Colaborador'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
