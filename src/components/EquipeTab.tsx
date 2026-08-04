import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Users,
  Search,
  Plus,
  Upload,
  Download,
  Image as ImageIcon,
  Calendar,
  Phone,
  Mail,
  Briefcase,
  ShieldCheck,
  HardHat,
  UserCheck,
  UserX,
  Trash2,
  FileText,
  AlertCircle,
  AlertTriangle,
  Pencil,
  Wallet,
  CreditCard,
  Check,
  X
} from 'lucide-react';
import { Funcionario, FuncionarioDocumento, Projeto, EtapaCronograma, TipoChavePix, TipoConta, InsumoCatalogo } from '../types';
import { catalogoService } from '../services/catalogoService';
import { onlyDigits, maskCpf, maskTelefone, isValidCpf } from '../utils/format';
import { situacaoValidade, rotuloValidade, resumirDocumentos } from '../lib/validadeDocumento';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import { Modal, ModalForm, Button, SeletorOrdenacao, CarregarMais } from './ui';
import { useListaOrdenada, compararTexto, compararData, type OpcaoOrdenacao } from '../hooks/useListaOrdenada';
import Spinner from './Spinner';

/** Mesmas opções dos checks de funcionarios.pix_tipo e tipo_conta. */
const TIPOS_CHAVE_PIX: TipoChavePix[] = ['CPF', 'CNPJ', 'E-mail', 'Telefone', 'Aleatória'];
const TIPOS_CONTA: TipoConta[] = ['Corrente', 'Poupança', 'Pagamento'];

interface EquipeTabProps {
  funcionarios: Funcionario[];
  projetos: Projeto[];
  cronograma: EtapaCronograma[];
  loading: boolean;
  funcionarioDocumentos: FuncionarioDocumento[];
  onAddFuncionario: (func: Funcionario) => Promise<Funcionario | null>;
  onUpdateFuncionario: (func: Funcionario) => Promise<Funcionario | null>;
  onUpdateStatusFuncionario: (id: string, status: Funcionario['status']) => Promise<boolean>;
  onUpdateSalarioFuncionario: (id: string, salarioBase: number | null) => Promise<boolean>;
  onUploadFuncionarioDocumento: (funcionarioId: string, file: File, validade: string | null) => Promise<boolean>;
  onUpdateValidadeDocumento: (id: string, validade: string | null) => Promise<boolean>;
  onDeleteFuncionarioDocumento: (id: string) => void;
  onDownloadFuncionarioDocumento: (doc: FuncionarioDocumento) => void;
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

function EquipeTab({
  funcionarios,
  projetos,
  cronograma,
  loading,
  funcionarioDocumentos,
  onAddFuncionario,
  onUpdateFuncionario,
  onUpdateStatusFuncionario,
  onUpdateSalarioFuncionario,
  onUploadFuncionarioDocumento,
  onUpdateValidadeDocumento,
  onDeleteFuncionarioDocumento,
  onDownloadFuncionarioDocumento
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
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docValidade, setDocValidade] = useState('');
  const [editingValidadeId, setEditingValidadeId] = useState<string | null>(null);
  const [validadeDraft, setValidadeDraft] = useState('');
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // Employee Form State (shared by create and edit)
  const [formNome, setFormNome] = useState('');
  const [formCargo, setFormCargo] = useState('');
  // Qual insumo de mão de obra do catálogo este cargo representa. `cargo` é
  // texto livre e não cruza com nada; é este vínculo que liga o colaborador ao
  // coeficiente da composição (HH) e ao custo/hora derivado da folha.
  const [formMaoDeObraId, setFormMaoDeObraId] = useState('');
  const [insumosMaoDeObra, setInsumosMaoDeObra] = useState<InsumoCatalogo[]>([]);
  const [formCpf, setFormCpf] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAdmissao, setFormAdmissao] = useState('');
  const [formSalarioBase, setFormSalarioBase] = useState('');
  const [formObs, setFormObs] = useState('');

  // Para onde o salário é transferido. A folha já calculava o valor e gerava o
  // lançamento, mas o dado que executa o pagamento vivia numa planilha à parte.
  const [formPixTipo, setFormPixTipo] = useState<TipoChavePix | ''>('');
  const [formPixChave, setFormPixChave] = useState('');
  const [formBanco, setFormBanco] = useState('');
  const [formAgencia, setFormAgencia] = useState('');
  const [formConta, setFormConta] = useState('');
  const [formTipoConta, setFormTipoConta] = useState<TipoConta | ''>('');
  const [formTitular, setFormTitular] = useState('');

  /**
   * Insumos de mão de obra do catálogo, para o seletor da ficha.
   *
   * Lista curta e estável (algumas dezenas), buscada uma vez ao montar a aba.
   * Não usa o hook paginado do catálogo de propósito: aquele filtro é estado
   * compartilhado da aba Catálogo e mexer nele daqui mudaria a outra tela.
   */
  useEffect(() => {
    let vivo = true;
    catalogoService
      .listarMaoDeObra()
      .then((itens) => { if (vivo) setInsumosMaoDeObra(itens); })
      // Falhar aqui não pode derrubar a ficha: o seletor some e o resto do
      // cadastro continua funcionando.
      .catch(() => { if (vivo) setInsumosMaoDeObra([]); });
    return () => { vivo = false; };
  }, []);

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

  const documentosByFuncionario = useMemo(() => {
    const map = new Map<string, FuncionarioDocumento[]>();
    funcionarioDocumentos.forEach((doc) => {
      const list = map.get(doc.funcionarioId) ?? [];
      list.push(doc);
      map.set(doc.funcionarioId, list);
    });
    return map;
  }, [funcionarioDocumentos]);

  const getDocumentos = (funcId: string): FuncionarioDocumento[] => documentosByFuncionario.get(funcId) ?? [];

  // Filter
  const term = search.trim().toLowerCase();
  const searchDigits = onlyDigits(search);
  const filteredFuncionarios = useMemo(() => funcionarios.filter(f => {
    const matchesSearch =
      !term ||
      f.nome.toLowerCase().includes(term) ||
      f.cargo.toLowerCase().includes(term) ||
      (searchDigits.length > 0 && onlyDigits(f.cpf).includes(searchDigits));

    const matchesStatus = statusFilter === 'Todos' || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [funcionarios, term, searchDigits, statusFilter]);

  const ORDENS_EQUIPE = useMemo<OpcaoOrdenacao<Funcionario>[]>(() => [
    { id: 'nome', label: 'Nome (A–Z)', comparar: (a, b) => compararTexto(a.nome, b.nome) },
    { id: 'cargo', label: 'Cargo (A–Z)', comparar: (a, b) => compararTexto(a.cargo, b.cargo) },
    { id: 'admissao', label: 'Admissão mais recente', comparar: (a, b) => compararData(a.dataAdmissao, b.dataAdmissao) },
  ], []);

  const lista = useListaOrdenada({ itens: filteredFuncionarios, opcoes: ORDENS_EQUIPE });

  const resetForm = () => {
    setFormNome('');
    setFormCargo('');
    setFormMaoDeObraId('');
    setFormCpf('');
    setFormTelefone('');
    setFormEmail('');
    setFormAdmissao('');
    setFormSalarioBase('');
    setFormObs('');
    setFormPixTipo('');
    setFormPixChave('');
    setFormBanco('');
    setFormAgencia('');
    setFormConta('');
    setFormTipoConta('');
    setFormTitular('');
  };

  const openCreateModal = () => {
    resetForm();
    setEditingId(null);
    setShowFormModal(true);
  };

  const openEditModal = (func: Funcionario) => {
    setFormNome(func.nome);
    setFormCargo(func.cargo);
    setFormMaoDeObraId(func.catalogoMaoDeObraId ?? '');
    setFormCpf(func.cpf);
    setFormTelefone(func.telefone);
    setFormEmail(func.email);
    setFormAdmissao(func.dataAdmissao);
    setFormSalarioBase(func.salarioBase != null ? String(func.salarioBase) : '');
    setFormObs(func.observacoes);
    setFormPixTipo(func.dadosPagamento?.pixTipo ?? '');
    setFormPixChave(func.dadosPagamento?.pixChave ?? '');
    setFormBanco(func.dadosPagamento?.banco ?? '');
    setFormAgencia(func.dadosPagamento?.agencia ?? '');
    setFormConta(func.dadosPagamento?.conta ?? '');
    setFormTipoConta(func.dadosPagamento?.tipoConta ?? '');
    setFormTitular(func.dadosPagamento?.titular ?? '');
    setEditingId(func.id);
    setShowFormModal(true);
  };

  const closeFormModal = () => {
    if (isSaving) return;
    setShowFormModal(false);
    setEditingId(null);
  };

  const handleSubmitFuncionario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim() || !formCargo.trim() || !formCpf.trim()) {
      toast.error("Por favor, preencha os campos obrigatórios: Nome, Cargo e CPF.");
      return;
    }

    if (!isValidCpf(formCpf)) {
      toast.error('CPF inválido.', 'Confira os dígitos informados.');
      return;
    }

    // O índice único do banco compara só os dígitos, então a checagem local
    // precisa fazer o mesmo para avisar antes de o insert estourar.
    const cpfDigitos = onlyDigits(formCpf);
    const duplicado = funcionarios.find((f) => f.id !== editingId && onlyDigits(f.cpf) === cpfDigitos);
    if (duplicado) {
      toast.error('CPF já cadastrado.', `Pertence à ficha de ${duplicado.nome}.`);
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
      catalogoMaoDeObraId: formMaoDeObraId || undefined,
      cpf: formCpf.trim(),
      telefone: formTelefone.trim(),
      email: formEmail.trim(),
      dataAdmissao: formAdmissao || new Date().toISOString().split('T')[0],
      status: editing?.status ?? 'Ativo',
      observacoes: formObs,
      salarioBase: isNaN(parsedSalario) ? undefined : parsedSalario,
      dadosPagamento: {
        pixTipo: formPixTipo || undefined,
        pixChave: formPixChave.trim() || undefined,
        banco: formBanco.trim() || undefined,
        agencia: formAgencia.trim() || undefined,
        conta: formConta.trim() || undefined,
        tipoConta: formTipoConta || undefined,
        titular: formTitular.trim() || undefined,
      }
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

  const triggerDocUpload = () => docFileInputRef.current?.click();

  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpa o input já: sem isso, reenviar o mesmo arquivo não dispara change.
    e.target.value = '';
    if (!file || !selectedFunc) return;

    setIsUploadingDoc(true);
    const ok = await onUploadFuncionarioDocumento(selectedFunc.id, file, docValidade || null);
    setIsUploadingDoc(false);
    if (!ok) return;
    setDocValidade('');
    toast.success('Documento anexado à ficha.', file.name);
  };

  const handleStartEditValidade = (doc: FuncionarioDocumento) => {
    setValidadeDraft(doc.validade ?? '');
    setEditingValidadeId(doc.id);
  };

  const handleSaveValidade = async (docId: string) => {
    const ok = await onUpdateValidadeDocumento(docId, validadeDraft || null);
    if (!ok) return;
    setEditingValidadeId(null);
    toast.success('Validade atualizada.');
  };

  const handleToggleStatus = async (selected: Funcionario) => {
    setIsUpdatingStatus(true);
    const nextStatus = selected.status === 'Ativo' ? 'Inativo' : 'Ativo';
    const ok = await onUpdateStatusFuncionario(selected.id, nextStatus);
    setIsUpdatingStatus(false);
    if (ok) toast.success(`Colaborador alterado para ${nextStatus}.`);
  };

  /**
   * Desligar substitui a antiga exclusão: o DELETE está revogado no banco
   * porque apagar a ficha zerava a autoria em etapas, obras e folha.
   */
  const handleToggleStatusComAviso = (selected: Funcionario) => {
    if (selected.status === 'Inativo') {
      handleToggleStatus(selected);
      return;
    }

    const frentes = getAssignments(selected.id).length;
    const obras = projetos.filter((p) => p.responsavelInternoId === selected.id).length;
    const vinculos = [
      frentes > 0 ? `${frentes} ${frentes === 1 ? 'frente de obra ativa' : 'frentes de obra ativas'}` : null,
      obras > 0 ? `${obras} ${obras === 1 ? 'obra sob responsabilidade' : 'obras sob responsabilidade'}` : null,
    ].filter(Boolean);

    confirm({
      title: 'Confirmar desligamento de colaborador',
      message: vinculos.length
        ? `${selected.nome} tem ${vinculos.join(' e ')}. O histórico é preservado, mas a ficha sai do quadro ativo e deixa de aparecer para novas atribuições — redistribua o que estiver em aberto.`
        : `Desligar ${selected.nome}? A ficha sai do quadro ativo, com todo o histórico preservado, e pode ser reativada depois.`,
      onConfirm: () => handleToggleStatus(selected),
    });
  };

  return (
    <div id="equipe-tab-container" className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[calc(100vh-120px)]">

      {/* Left Column: List & Filters */}
      <div id="equipe-list-col" className="lg:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">
              Quadro de Colaboradores
              {!loading && <span className="ml-1.5 text-xs font-medium text-slate-500">({lista.total})</span>}
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
              <Search className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
              <input
                id="func-search-input"
                type="text"
                placeholder="Pesquisar por nome, cargo ou CPF..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800"
              />
            </div>

            <div>
              <select
                id="func-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-600 bg-white"
              >
                <option value="Todos">Status: Todos</option>
                <option value="Ativo">Status: Ativos</option>
                <option value="Inativo">Status: Inativos</option>
              </select>
            </div>
          </div>
        </div>
          {lista.total > 0 && (
            <SeletorOrdenacao
              opcoes={lista.opcoes}
              valor={lista.ordemId}
              onChange={lista.setOrdemId}
              mostrando={lista.mostrando}
              total={lista.total}
            />
          )}


        {/* List Content Scrollable */}
        <div id="equipe-scroll-area" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
              <Spinner size={20} />
              <p className="text-xs">Carregando colaboradores...</p>
            </div>
          ) : lista.total === 0 ? (
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
            lista.visiveis.map((func, index) => {
              const isSelected = selectedId === func.id;
              const frentesAtivas = getAssignments(func.id).length;
              const isSobrecarregado = frentesAtivas > 2;
              const resumoDocs = resumirDocumentos(getDocumentos(func.id));

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
                  <div className="flex justify-between items-center text-2xs mt-1 text-slate-500 font-semibold">
                    <span>Frentes: {frentesAtivas} ativas</span>
                    {isSobrecarregado && (
                      <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 text-2xs uppercase tracking-wider font-extrabold flex items-center gap-0.5">
                        <AlertCircle size={10} className="shrink-0 text-rose-500" />
                        Sobrecarregado
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center gap-1 mt-1">
                    <p className="text-xs text-slate-500 font-mono">{func.cpf}</p>
                    {resumoDocs.vencidos > 0 ? (
                      <span className="text-rose-600 bg-rose-50 px-1.5 rounded border border-rose-200 text-2xs uppercase tracking-wider font-extrabold flex items-center gap-0.5 shrink-0">
                        <AlertTriangle size={9} className="shrink-0" />
                        Doc vencido
                      </span>
                    ) : resumoDocs.aVencer > 0 ? (
                      <span className="text-amber-700 bg-amber-50 px-1.5 rounded border border-amber-200 text-2xs uppercase tracking-wider font-extrabold flex items-center gap-0.5 shrink-0">
                        <AlertCircle size={9} className="shrink-0" />
                        Doc a vencer
                      </span>
                    ) : null}
                  </div>
                </motion.div>
              );
            })
          )}
          <CarregarMais temMais={lista.temMais} restantes={lista.restantes} onCarregarMais={lista.carregarMais} />
        </div>
      </div>

      {/* Right Column: Detailed Employee View & Onsite Assignments */}
      <div id="equipe-detail-col" className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {selectedFunc ? (
          <div id="equipe-detail-view" className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Header detail */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div className="text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">ID Registro: {selectedFunc.id}</span>
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
                    onClick={() => handleToggleStatusComAviso(selectedFunc)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded border transition active:scale-95 disabled:opacity-50 ${
                      selectedFunc.status === 'Ativo'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                    title={selectedFunc.status === 'Ativo' ? 'Desligar colaborador' : 'Reativar colaborador'}
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
                <span className="text-2xs text-slate-500">
                  {selectedFunc.status === 'Ativo' ? 'Clique para desligar' : 'Clique para reativar'}
                </span>
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
                    <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">Distribuição de Carga de Trabalho</span>
                    <p className="text-xs">
                      Atualmente encarregado por <strong className="text-sm font-bold font-mono text-slate-900">{frentesAtivas}</strong> {frentesAtivas === 1 ? 'frente' : 'frentes'} de obra {frentesAtivas === 1 ? 'ativa' : 'ativas'}.
                    </p>
                  </div>
                  {isSobrecarregado ? (
                    <span className="bg-rose-600 text-white font-extrabold text-2xs px-2.5 py-1 rounded shadow-sm flex items-center gap-1 shrink-0">
                      <AlertTriangle size={13} />
                      <span>SOBRECARREGADO</span>
                    </span>
                  ) : (
                    <span className={`font-bold text-2xs px-2.5 py-1 rounded border shadow-xs shrink-0 ${
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
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Canais de Contato</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <Phone size={13} className="text-slate-500 shrink-0" />
                  <span className="font-semibold">{selectedFunc.telefone || 'Não informado'}</span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2 truncate">
                  <Mail size={13} className="text-slate-500 shrink-0" />
                  <span className="font-semibold">{selectedFunc.email || 'Não informado'}</span>
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Documentos & Admissão</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <Calendar size={13} className="text-slate-500 shrink-0" />
                  <span>Admitido em: <strong className="text-slate-900">{formatDataAdmissao(selectedFunc.dataAdmissao)}</strong></span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase shrink-0 mr-1">CPF:</span>
                  <span className="font-mono font-semibold">{selectedFunc.cpf}</span>
                </p>
              </div>
            </div>

            {/* Dados Financeiros — Salário Base (usado na Folha em Gestão Financeira) */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-left">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={13} className="text-slate-500" />
                  <span>Salário Base</span>
                </span>
                {!isEditingSalario && (
                  <button
                    id={`edit-salario-btn-${selectedFunc.id}`}
                    onClick={handleStartEditSalario}
                    className="text-slate-500 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition"
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
                    className="flex-1 border border-slate-200 rounded p-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50"
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
                    className="text-slate-500 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition disabled:opacity-50"
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

              {/* Para onde o dinheiro vai. Fica colado no salário porque é a
                  informação que a pessoa que paga procura junto com ele. */}
              {(() => {
                const pg = selectedFunc.dadosPagamento ?? {};
                const temPix = !!pg.pixChave;
                const temConta = !!(pg.banco || pg.agencia || pg.conta);
                if (!temPix && !temConta) {
                  return (
                    <p className="text-2xs text-slate-500 mt-2.5 pt-2.5 border-t border-slate-200 flex items-center gap-1">
                      <CreditCard size={12} />
                      <span>Sem PIX ou conta cadastrados — edite a ficha para informar.</span>
                    </p>
                  );
                }
                return (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-200 space-y-1.5">
                    {temPix && (
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider w-14 shrink-0">PIX</span>
                        <span className="font-mono font-bold text-slate-800 break-all">{pg.pixChave}</span>
                        {pg.pixTipo && (
                          <span className="text-2xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {pg.pixTipo}
                          </span>
                        )}
                      </div>
                    )}
                    {temConta && (
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider w-14 shrink-0">Conta</span>
                        <span className="text-slate-700">
                          {[
                            pg.banco,
                            pg.agencia && `Ag. ${pg.agencia}`,
                            pg.conta && `C/C ${pg.conta}`,
                            pg.tipoConta,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                    {pg.titular && (
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider w-14 shrink-0">Titular</span>
                        <span className="text-slate-700">{pg.titular}</span>
                        <span className="text-2xs text-amber-600 font-semibold">conta de terceiro</span>
                      </div>
                    )}
                  </div>
                );
              })()}
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
                    <p className="text-xs text-slate-500 pl-1">Este profissional não está liderando nenhuma atividade no cronograma ativo atualmente.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {assignments.map((work, idx) => (
                        <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition">
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-bold text-slate-500 uppercase truncate max-w-[120px]">{work.projetoNome}</span>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/50">{work.status}</span>
                          </div>
                          <h5 className="font-bold text-xs text-slate-900 mt-1 truncate">{work.etapaNome}</h5>

                          <div className="mt-3 space-y-1">
                            <div className="flex justify-between text-xs text-slate-500">
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

            {/* Documentos reais (Storage), com validade de ASO/NR */}
            {(() => {
              const docs = getDocumentos(selectedFunc.id);
              const resumo = resumirDocumentos(docs);

              return (
                <div className="space-y-2 text-left">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <ShieldCheck size={15} className="text-emerald-600" />
                      <span>Documentações e Treinamentos ({docs.length})</span>
                    </h4>
                    <div className="flex items-center gap-2">
                      <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider" htmlFor={`doc-validade-${selectedFunc.id}`}>
                        Validade
                      </label>
                      <input
                        id={`doc-validade-${selectedFunc.id}`}
                        type="date"
                        disabled={isUploadingDoc}
                        value={docValidade}
                        onChange={(e) => setDocValidade(e.target.value)}
                        title="Opcional — preencha antes de anexar um ASO ou treinamento de NR"
                        className="border border-slate-200 rounded p-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-600 disabled:bg-slate-50"
                      />
                      <button
                        id={`upload-func-doc-btn-${selectedFunc.id}`}
                        type="button"
                        disabled={isUploadingDoc}
                        onClick={triggerDocUpload}
                        className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50 transition"
                      >
                        {isUploadingDoc ? <Spinner size={12} /> : <Upload size={12} />}
                        <span>Anexar</span>
                      </button>
                      <input
                        ref={docFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                        className="hidden"
                        onChange={handleDocFileChange}
                      />
                    </div>
                  </div>

                  {(resumo.vencidos > 0 || resumo.aVencer > 0) && (
                    <div className={`p-2.5 rounded-lg border flex items-center gap-2 text-xs font-semibold ${
                      resumo.vencidos > 0
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>
                        {resumo.vencidos > 0 && `${resumo.vencidos} ${resumo.vencidos === 1 ? 'documento vencido' : 'documentos vencidos'}`}
                        {resumo.vencidos > 0 && resumo.aVencer > 0 && ' e '}
                        {resumo.aVencer > 0 && `${resumo.aVencer} a vencer em 30 dias`}
                        {' — regularize antes de escalar este profissional para campo.'}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {docs.length === 0 ? (
                      <p className="text-xs text-slate-500 pl-1">Nenhum documento anexado. Envie ASO, treinamentos de NR e contrato em imagem ou PDF.</p>
                    ) : (
                      docs.map((doc) => {
                        const situacao = situacaoValidade(doc.validade);
                        const Icon = doc.contentType === 'application/pdf' ? FileText : ImageIcon;
                        const corValidade =
                          situacao === 'vencido' ? 'bg-rose-100 text-rose-700 border-rose-200'
                          : situacao === 'a-vencer' ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : situacao === 'vigente' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200';

                        return (
                          <div
                            key={doc.id}
                            className={`flex items-center gap-1.5 border rounded px-2 py-1 text-xs font-mono transition ${
                              situacao === 'vencido'
                                ? 'bg-rose-50 border-rose-200 text-rose-900'
                                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                            }`}
                          >
                            <Icon size={12} className={situacao === 'vencido' ? 'text-rose-600 shrink-0' : 'text-emerald-600 shrink-0'} />
                            <span className="truncate max-w-[160px]" title={doc.nome}>{doc.nome}</span>
                            <span className="text-slate-500">({doc.tamanho})</span>

                            {editingValidadeId === doc.id ? (
                              <>
                                <input
                                  type="date"
                                  autoFocus
                                  value={validadeDraft}
                                  onChange={(e) => setValidadeDraft(e.target.value)}
                                  className="border border-slate-300 rounded px-1 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
                                />
                                <button
                                  type="button"
                                  title="Salvar validade"
                                  onClick={() => handleSaveValidade(doc.id)}
                                  className="text-emerald-600 hover:text-emerald-700 transition"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  type="button"
                                  title="Cancelar"
                                  onClick={() => setEditingValidadeId(null)}
                                  className="text-slate-500 hover:text-rose-600 transition"
                                >
                                  <X size={12} />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                title="Definir validade (ASO, NR)"
                                onClick={() => handleStartEditValidade(doc)}
                                className={`px-1.5 py-0.5 rounded border text-2xs font-bold uppercase tracking-wider transition hover:brightness-95 ${corValidade}`}
                              >
                                {rotuloValidade(doc.validade)}
                              </button>
                            )}

                            <button
                              type="button"
                              title="Baixar"
                              onClick={() => onDownloadFuncionarioDocumento(doc)}
                              className="text-slate-500 hover:text-blue-600 transition"
                            >
                              <Download size={12} />
                            </button>
                            <button
                              type="button"
                              title="Excluir"
                              onClick={() => {
                                confirm({
                                  title: 'Confirmar exclusão de documento',
                                  message: `Remover o documento "${doc.nome}"? Esta operação não pode ser desfeita.`,
                                  onConfirm: () => onDeleteFuncionarioDocumento(doc.id),
                                });
                              }}
                              className="text-slate-500 hover:text-rose-600 transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })()}

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
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
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
      <Modal
        id="employee-form-modal"
        open={showFormModal}
        onClose={closeFormModal}
        title={editingId ? 'Editar Ficha Funcional' : 'Adicionar Novo Integrante'}
        size="md"
        bloqueado={isSaving}
      >
              <ModalForm
                onSubmit={handleSubmitFuncionario}
                className="space-y-4"
                footer={
                  <>
                    <Button variante="fantasma" disabled={isSaving} onClick={closeFormModal}>
                      Cancelar
                    </Button>
                    <Button id="submit-add-employee-btn" type="submit" carregando={isSaving}>
                      {!isSaving && <UserCheck size={14} />}
                      {isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Salvar Colaborador'}
                    </Button>
                  </>
                }
              >
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome Completo *</label>
                  <input
                    id="add-func-nome"
                    type="text"
                    required
                    disabled={isSaving}
                    placeholder="Ex: Carlos Roberto Albuquerque"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Função / Cargo *</label>
                    <input
                      id="add-func-cargo"
                      type="text"
                      required
                      disabled={isSaving}
                      list="func-cargo-options"
                      placeholder="Ex: Engenheiro Júnior"
                      value={formCargo}
                      onChange={(e) => setFormCargo(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800 disabled:bg-slate-50"
                    />
                    <datalist id="func-cargo-options">
                      {Array.from(new Set(funcionarios.map((f) => f.cargo).filter(Boolean))).map((cargo) => (
                        <option key={cargo} value={cargo} />
                      ))}
                    </datalist>
                  </div>
                  {/* Some quando não há insumo de mão de obra no catálogo: sem
                      base adotada o seletor seria uma caixa vazia sem explicação. */}
                  {insumosMaoDeObra.length > 0 && (
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Cargo no catálogo
                      </label>
                      <select
                        id="add-func-mao-de-obra"
                        disabled={isSaving}
                        value={formMaoDeObraId}
                        onChange={(e) => setFormMaoDeObraId(e.target.value)}
                        className="w-full border border-slate-200 rounded p-2 text-xs bg-white outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                      >
                        <option value="">Não é mão de obra direta</option>
                        {insumosMaoDeObra.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.descricao} ({i.unidade})
                          </option>
                        ))}
                      </select>
                      <p className="text-2xs text-slate-500 mt-1 leading-snug">
                        Liga este colaborador ao insumo de mão de obra do catálogo. É o que permite
                        comparar as horas apontadas com o coeficiente da composição e derivar o
                        custo/hora a partir da folha. Deixe em branco para administrativo e engenharia.
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">CPF *</label>
                    <input
                      id="add-func-cpf"
                      type="text"
                      required
                      disabled={isSaving}
                      placeholder="000.000.000-00"
                      value={formCpf}
                      onChange={(e) => setFormCpf(maskCpf(e.target.value))}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Telefone</label>
                    <input
                      id="add-func-tel"
                      type="text"
                      disabled={isSaving}
                      placeholder="(11) 90000-0000"
                      value={formTelefone}
                      onChange={(e) => setFormTelefone(maskTelefone(e.target.value))}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">E-mail</label>
                    <input
                      id="add-func-email"
                      type="email"
                      disabled={isSaving}
                      placeholder="email@empresa.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Data de Admissão</label>
                    <input
                      id="add-func-admissao"
                      type="date"
                      disabled={isSaving}
                      value={formAdmissao}
                      onChange={(e) => setFormAdmissao(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-600 disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Salário Base (R$)</label>
                    <input
                      id="add-func-salario"
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={isSaving}
                      placeholder="Ex: 3500.00"
                      value={formSalarioBase}
                      onChange={(e) => setFormSalarioBase(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-600 disabled:bg-slate-50 font-mono"
                    />
                  </div>
                </div>

                {/* Dados de pagamento. Ficam na ficha, e não na folha, porque
                    são cadastro do colaborador: a folha só os consome na hora
                    de transferir. Tudo opcional — quem é pago em espécie ou
                    ainda não informou a conta não fica travado no cadastro. */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <CreditCard size={13} className="text-slate-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Dados para pagamento
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="add-func-pix-tipo" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo da chave PIX</label>
                      <select
                        id="add-func-pix-tipo"
                        disabled={isSaving}
                        value={formPixTipo}
                        onChange={(e) => setFormPixTipo(e.target.value as TipoChavePix | '')}
                        className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-600 bg-white disabled:bg-slate-50"
                      >
                        <option value="">Não informado</option>
                        {TIPOS_CHAVE_PIX.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="add-func-pix-chave" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Chave PIX</label>
                      <input
                        id="add-func-pix-chave"
                        type="text"
                        disabled={isSaving}
                        placeholder={
                          formPixTipo === 'CPF' ? '000.000.000-00'
                          : formPixTipo === 'CNPJ' ? '00.000.000/0001-00'
                          : formPixTipo === 'Telefone' ? '(11) 90000-0000'
                          : formPixTipo === 'E-mail' ? 'nome@email.com'
                          : formPixTipo === 'Aleatória' ? 'Chave gerada pelo banco'
                          : 'Selecione o tipo ao lado'
                        }
                        value={formPixChave}
                        onChange={(e) => setFormPixChave(e.target.value)}
                        className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <label htmlFor="add-func-banco" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Banco</label>
                      <input
                        id="add-func-banco"
                        type="text"
                        disabled={isSaving}
                        placeholder="Ex: 341 - Itaú"
                        value={formBanco}
                        onChange={(e) => setFormBanco(e.target.value)}
                        className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label htmlFor="add-func-agencia" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Agência</label>
                      <input
                        id="add-func-agencia"
                        type="text"
                        disabled={isSaving}
                        placeholder="0000"
                        value={formAgencia}
                        onChange={(e) => setFormAgencia(e.target.value)}
                        className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50 font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="add-func-conta" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Conta</label>
                      <input
                        id="add-func-conta"
                        type="text"
                        disabled={isSaving}
                        placeholder="00000-0"
                        value={formConta}
                        onChange={(e) => setFormConta(e.target.value)}
                        className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="add-func-tipo-conta" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo de conta</label>
                      <select
                        id="add-func-tipo-conta"
                        disabled={isSaving}
                        value={formTipoConta}
                        onChange={(e) => setFormTipoConta(e.target.value as TipoConta | '')}
                        className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-600 bg-white disabled:bg-slate-50"
                      >
                        <option value="">Não informado</option>
                        {TIPOS_CONTA.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="add-func-titular" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Titular da conta</label>
                      <input
                        id="add-func-titular"
                        type="text"
                        disabled={isSaving}
                        placeholder="Preencha só se não for o próprio colaborador"
                        value={formTitular}
                        onChange={(e) => setFormTitular(e.target.value)}
                        className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observações / Capacitações</label>
                  <textarea
                    id="add-func-obs"
                    disabled={isSaving}
                    placeholder="Informações adicionais de saúde ocupacional, treinamentos especiais..."
                    value={formObs}
                    onChange={(e) => setFormObs(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <p className="text-2xs text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
                  Documentos (ASO, treinamentos de NR, contrato) são anexados como arquivo
                  na ficha, depois de salvar — com data de validade para o aviso de vencimento.
                </p>

              </ModalForm>
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
export default memo(EquipeTab);
