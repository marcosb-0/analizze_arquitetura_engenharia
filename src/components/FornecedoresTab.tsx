import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Truck,
  Search,
  Plus,
  Star,
  Phone,
  Mail,
  User,
  ShieldCheck,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Building2,
  Trash2,
  Pencil,
  MapPin,
  MessageCircle,
  Copy,
  Package,
  StickyNote,
  ChevronDown,
  EyeOff,
  RotateCcw
} from 'lucide-react';
import {
  Fornecedor,
  CompraFornecedor,
  CategoriaFornecedor,
  ContaFinanceira,
  InsumoCatalogo,
  TipoPessoa
} from '../types';
import { useFeedback } from './FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';
import { maskDocumento, maskTelefone, onlyDigits } from '../utils/format';

const CATEGORIAS: CategoriaFornecedor[] = ['Material', 'Mão de Obra', 'Equipamentos', 'Serviços Terceirizados'];

const CAT_COLORS: Record<CategoriaFornecedor, string> = {
  'Material': 'bg-blue-50 text-blue-800 border-blue-200/50',
  'Mão de Obra': 'bg-emerald-50 text-emerald-800 border-emerald-200/50',
  'Equipamentos': 'bg-sky-50 text-sky-800 border-sky-200/50',
  'Serviços Terceirizados': 'bg-purple-50 text-purple-800 border-purple-200/50'
};

interface FornecedoresTabProps {
  fornecedores: Fornecedor[];
  loading: boolean;
  contas: ContaFinanceira[];
  catalogo: InsumoCatalogo[];
  onAddFornecedor: (forn: Fornecedor) => Promise<Fornecedor | null>;
  onUpdateFornecedor: (forn: Fornecedor) => Promise<Fornecedor | null>;
  onSetAtivoFornecedor: (id: string, ativo: boolean) => void;
  onDeleteFornecedor: (id: string) => void;
  onAddCompra: (fornId: string, compra: CompraFornecedor) => Promise<void>;
  onTogglePago: (fornId: string, compraId: string) => void;
}

export default function FornecedoresTab({
  fornecedores,
  loading,
  contas,
  catalogo,
  onAddFornecedor,
  onUpdateFornecedor,
  onSetAtivoFornecedor,
  onDeleteFornecedor,
  onAddCompra,
  onTogglePago
}: FornecedoresTabProps) {
  const { toast, confirm } = useFeedback();
  const { role } = useAuth();
  // RLS grants 'gestao' zero access to contas_financeiras/lancamentos_financeiros,
  // so purchase registration and financial summaries must stay hidden for that role
  // instead of surfacing confusing empty/error states.
  const canViewFinance = role !== 'gestao';
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('Todas');
  const [showInativos, setShowInativos] = useState(false);
  // Only the id is held in state — the fornecedor itself is always derived from
  // props, so edits/reloads never leave a stale copy on screen (and the first
  // entry auto-selects once the async load lands).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [financeOpen, setFinanceOpen] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  // Non-null = the modal is editing this fornecedor instead of creating a new one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);

  // New Supplier Form State
  const [formEmpresa, setFormEmpresa] = useState('');
  const [formTipoPessoa, setFormTipoPessoa] = useState<TipoPessoa>('CNPJ');
  const [formCpfCnpj, setFormCpfCnpj] = useState('');
  const [formContato, setFormContato] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCategoria, setFormCategoria] = useState<CategoriaFornecedor>('Material');
  const [formCidade, setFormCidade] = useState('');
  const [formObservacoes, setFormObservacoes] = useState('');
  const [formFornece, setFormFornece] = useState<string[]>([]);
  const [newForneceTag, setNewForneceTag] = useState('');
  const [formAvaliacao, setFormAvaliacao] = useState(0);
  const [formDocs, setFormDocs] = useState<string[]>([]);
  const [newDocName, setNewDocName] = useState('');

  // New Purchase Form State
  const [purchaseItem, setPurchaseItem] = useState('');
  const [purchaseValor, setPurchaseValor] = useState('');
  const [purchasePago, setPurchasePago] = useState(false);
  const [purchaseContaId, setPurchaseContaId] = useState('');

  const filteredFornecedores = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const digitosBusca = onlyDigits(search);

    return fornecedores.filter((f) => {
      if (!f.ativo && !showInativos) return false;

      // An agenda gets searched by whatever the user remembers: name, contact,
      // city, what they sell, or — very often — a phone number.
      const matchesSearch =
        !termo ||
        f.empresa.toLowerCase().includes(termo) ||
        f.contato.toLowerCase().includes(termo) ||
        f.cidade.toLowerCase().includes(termo) ||
        f.email.toLowerCase().includes(termo) ||
        f.fornece.some((tag) => tag.toLowerCase().includes(termo)) ||
        (digitosBusca.length > 0 &&
          (onlyDigits(f.telefone).includes(digitosBusca) || onlyDigits(f.cpfCnpj).includes(digitosBusca)));

      const matchesCat = categoryFilter === 'Todas' || f.categoria === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [fornecedores, search, categoryFilter, showInativos]);

  // Resolved against the *visible* list so the detail panel always matches
  // something on screen — filtering out (or inactivating) the current selection
  // slides to the next entry instead of stranding an invisible one.
  const selectedFornecedor =
    filteredFornecedores.find((f) => f.id === selectedId) ?? filteredFornecedores[0] ?? null;

  const inativosCount = fornecedores.filter((f) => !f.ativo).length;

  // Catálogo entries this supplier is the default for, or has quoted — the
  // closest thing to "o que ele fornece" that the system already knows.
  const insumosVinculados = useMemo(() => {
    if (!selectedFornecedor) return [];
    return catalogo.filter(
      (item) =>
        item.fornecedorPadraoId === selectedFornecedor.id ||
        item.cotacoesFornecedores?.some((c) => c.fornecedorId === selectedFornecedor.id)
    );
  }, [catalogo, selectedFornecedor]);

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error(`Não foi possível copiar o ${label.toLowerCase()}.`);
    }
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

  const handleAddForneceTag = () => {
    const tag = newForneceTag.trim();
    if (!tag) return;
    if (formFornece.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setNewForneceTag('');
      return;
    }
    setFormFornece([...formFornece, tag]);
    setNewForneceTag('');
  };

  const handleRemoveForneceTag = (index: number) => {
    setFormFornece(formFornece.filter((_, i) => i !== index));
  };

  // Re-mask the document whenever the person type changes.
  const handleTipoPessoaChange = (tipo: TipoPessoa) => {
    setFormTipoPessoa(tipo);
    setFormCpfCnpj((prev) => maskDocumento(prev, tipo));
  };

  const resetForm = () => {
    setFormEmpresa('');
    setFormTipoPessoa('CNPJ');
    setFormCpfCnpj('');
    setFormContato('');
    setFormTelefone('');
    setFormEmail('');
    setFormCategoria('Material');
    setFormCidade('');
    setFormObservacoes('');
    setFormFornece([]);
    setNewForneceTag('');
    setFormAvaliacao(0);
    setFormDocs([]);
    setNewDocName('');
    setEditingId(null);
  };

  const openEditModal = (forn: Fornecedor) => {
    setEditingId(forn.id);
    setFormEmpresa(forn.empresa);
    setFormTipoPessoa(forn.tipoPessoa);
    setFormCpfCnpj(maskDocumento(forn.cpfCnpj, forn.tipoPessoa));
    setFormContato(forn.contato);
    setFormTelefone(maskTelefone(forn.telefone));
    setFormEmail(forn.email);
    setFormCategoria(forn.categoria);
    setFormCidade(forn.cidade);
    setFormObservacoes(forn.observacoes);
    setFormFornece(forn.fornece);
    setNewForneceTag('');
    setFormAvaliacao(forn.avaliacao);
    setFormDocs(forn.documentos);
    setNewDocName('');
    setShowAddModal(true);
  };

  const handleSubmitFornecedor = async (e: React.FormEvent) => {
    e.preventDefault();

    // Deliberately permissive: an agenda entry is worth having with just a name
    // and one way to reach them. CNPJ/e-mail used to be mandatory, which made it
    // impossible to register the pedreiro who only has a WhatsApp number.
    if (!formEmpresa.trim()) {
      toast.error('Informe o nome ou razão social do fornecedor.');
      return;
    }
    if (!formTelefone.trim() && !formEmail.trim()) {
      toast.error('Informe ao menos um contato.', 'Telefone ou e-mail — um dos dois é necessário.');
      return;
    }

    setIsSaving(true);

    // Pending tag/doc text the user typed but never confirmed shouldn't be lost.
    const forneceFinal = newForneceTag.trim() && !formFornece.includes(newForneceTag.trim())
      ? [...formFornece, newForneceTag.trim()]
      : formFornece;

    const fornecedor: Fornecedor = {
      id: editingId ?? crypto.randomUUID(),
      empresa: formEmpresa.trim(),
      tipoPessoa: formTipoPessoa,
      cpfCnpj: formCpfCnpj.trim(),
      contato: formContato.trim(),
      telefone: formTelefone.trim(),
      email: formEmail.trim(),
      categoria: formCategoria,
      cidade: formCidade.trim(),
      observacoes: formObservacoes.trim(),
      fornece: forneceFinal,
      documentos: formDocs,
      avaliacao: formAvaliacao,
      ativo: editingId ? (fornecedores.find((f) => f.id === editingId)?.ativo ?? true) : true,
      historicoCompras: editingId
        ? fornecedores.find((f) => f.id === editingId)?.historicoCompras ?? []
        : []
    };

    const saved = editingId ? await onUpdateFornecedor(fornecedor) : await onAddFornecedor(fornecedor);
    setIsSaving(false);
    // The hook already surfaced the reason; keep the modal open so nothing typed is lost.
    if (!saved) return;

    setSelectedId(saved.id);
    setShowAddModal(false);
    toast.success(
      editingId ? 'Fornecedor atualizado com sucesso.' : 'Fornecedor cadastrado com sucesso.',
      `Os dados de ${saved.empresa} foram salvos.`
    );
    resetForm();
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFornecedor || !purchaseItem || !purchaseValor) {
      toast.error('Por favor, preencha a descrição do item e o valor.');
      return;
    }
    if (!purchaseContaId) {
      toast.error('Selecione a conta financeira que vai pagar este pedido.');
      return;
    }

    setIsSavingPurchase(true);

    const newCompra: CompraFornecedor = {
      id: crypto.randomUUID(),
      data: new Date().toISOString().split('T')[0],
      item: purchaseItem,
      valor: parseFloat(purchaseValor),
      pago: purchasePago,
      contaId: purchaseContaId
    };

    try {
      await onAddCompra(selectedFornecedor.id, newCompra);
    } catch {
      setIsSavingPurchase(false);
      return; // hook already rolled back and toasted; keep the modal open
    }

    setIsSavingPurchase(false);
    setShowPurchaseModal(false);
    setFinanceOpen(true);
    toast.success('Pedido de compra registrado.', `Lançamento de ${newCompra.item} faturado com sucesso.`);

    setPurchaseItem('');
    setPurchaseValor('');
    setPurchasePago(false);
    setPurchaseContaId('');
  };

  const renderStars = (avaliacao: number) => (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          fill={i < avaliacao ? 'currentColor' : 'none'}
          className={i < avaliacao ? 'text-blue-600 shrink-0' : 'text-slate-300 shrink-0'}
        />
      ))}
    </div>
  );

  return (
    <div id="fornecedores-tab-container" className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-120px)]">
      {/* Left list block */}
      <div id="fornecedores-list-col" className="lg:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">

        {/* Filter bar */}
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">
              Fornecedores
              {!loading && <span className="ml-1.5 text-xs font-medium text-slate-400">({filteredFornecedores.length})</span>}
            </h3>
            <button
              id="add-fornecedor-btn"
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition shadow-sm active:scale-95"
            >
              <Plus size={14} />
              <span>Novo Fornecedor</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
              <input
                id="fornecedor-search-input"
                type="text"
                placeholder="Buscar por nome, contato, telefone, cidade ou item..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:border-blue-600 outline-none text-slate-800"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                id="fornecedor-category-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="flex-1 border border-slate-200 rounded p-1.5 text-xs outline-none text-slate-600 bg-white"
              >
                <option value="Todas">Categoria: Todas</option>
                {CATEGORIAS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {inativosCount > 0 && (
                <button
                  id="toggle-inativos-btn"
                  onClick={() => setShowInativos((v) => !v)}
                  className={`text-xs font-semibold px-2 py-1.5 rounded border transition active:scale-95 shrink-0 ${
                    showInativos
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                  title={showInativos ? 'Ocultar fornecedores inativos' : 'Mostrar fornecedores inativos'}
                >
                  Inativos ({inativosCount})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* List scroll */}
        <div id="fornecedores-scroll-area" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
              <Spinner size={20} />
              <p className="text-xs">Carregando fornecedores...</p>
            </div>
          ) : filteredFornecedores.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Truck}
                title={fornecedores.length === 0 ? 'Nenhum fornecedor cadastrado' : 'Nenhum fornecedor encontrado'}
                description={
                  fornecedores.length === 0
                    ? 'Monte sua agenda de fornecedores: basta o nome e um telefone para começar.'
                    : 'Nenhum resultado para esta busca. Tente outro termo ou limpe os filtros.'
                }
                actionLabel="Novo Fornecedor"
                onAction={() => { resetForm(); setShowAddModal(true); }}
              />
            </div>
          ) : (
            filteredFornecedores.map((forn, index) => {
              const isSelected = selectedFornecedor?.id === forn.id;

              return (
                <motion.div
                  key={forn.id}
                  id={`fornecedor-item-${forn.id}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedId(forn.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(forn.id);
                    }
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                  className={`p-3 cursor-pointer transition text-left space-y-1.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                    isSelected ? 'bg-blue-50/40 border-l-4 border-blue-600 font-medium' : 'hover:bg-slate-50'
                  } ${!forn.ativo ? 'opacity-60' : ''}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-bold text-xs text-slate-900 truncate">{forn.empresa}</h4>
                    <span className={`text-xs font-bold px-1.5 py-0.5 border rounded shrink-0 ${CAT_COLORS[forn.categoria]}`}>
                      {forn.categoria}
                    </span>
                  </div>

                  {/* Phone is the field an agenda is actually opened for — show it. */}
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs text-slate-500 flex items-center gap-1 min-w-0">
                      {forn.telefone ? (
                        <>
                          <Phone size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate font-mono">{forn.telefone}</span>
                        </>
                      ) : (
                        <>
                          <Mail size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate">{forn.email || 'Sem contato'}</span>
                        </>
                      )}
                    </span>
                    {forn.avaliacao > 0 && (
                      <div className="flex gap-0.5 text-blue-600 shrink-0">
                        {Array.from({ length: forn.avaliacao }).map((_, i) => (
                          <Star key={i} size={11} fill="currentColor" />
                        ))}
                      </div>
                    )}
                  </div>

                  {(forn.contato || forn.cidade || !forn.ativo) && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
                      {forn.contato && (
                        <span className="flex items-center gap-1 min-w-0">
                          <User size={11} className="shrink-0" />
                          <span className="truncate">{forn.contato}</span>
                        </span>
                      )}
                      {forn.cidade && (
                        <span className="flex items-center gap-1 min-w-0">
                          <MapPin size={11} className="shrink-0" />
                          <span className="truncate">{forn.cidade}</span>
                        </span>
                      )}
                      {!forn.ativo && (
                        <span className="ml-auto shrink-0 bg-slate-100 border border-slate-200 text-slate-500 font-bold px-1.5 rounded">
                          Inativo
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Supplier Details */}
      <div id="fornecedor-detail-col" className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {selectedFornecedor ? (
          <div id="fornecedor-detail-view" className="flex-1 overflow-y-auto p-4 space-y-4 text-left">

            {/* Header detail */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3 gap-3">
              <div className="text-left min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 border rounded ${CAT_COLORS[selectedFornecedor.categoria]}`}>
                    {selectedFornecedor.categoria}
                  </span>
                  {!selectedFornecedor.ativo && (
                    <span className="bg-slate-100 border border-slate-200 text-slate-500 text-xs font-bold px-2 py-0.5 rounded">
                      Inativo
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-950 mt-1.5 flex items-center gap-2">
                  <Building2 size={18} className="text-slate-700 shrink-0" />
                  <span className="truncate">{selectedFornecedor.empresa}</span>
                </h3>
                <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
                  {selectedFornecedor.cpfCnpj && (
                    <button
                      onClick={() => copyToClipboard(selectedFornecedor.cpfCnpj, selectedFornecedor.tipoPessoa)}
                      className="text-slate-500 font-mono hover:text-blue-600 flex items-center gap-1 transition group"
                      title={`Copiar ${selectedFornecedor.tipoPessoa}`}
                    >
                      <span>{selectedFornecedor.tipoPessoa}: {maskDocumento(selectedFornecedor.cpfCnpj, selectedFornecedor.tipoPessoa)}</span>
                      <Copy size={11} className="opacity-0 group-hover:opacity-100 transition" />
                    </button>
                  )}
                  {selectedFornecedor.cidade && (
                    <span className="text-slate-500 flex items-center gap-1">
                      <MapPin size={12} className="text-slate-400" />
                      {selectedFornecedor.cidade}
                    </span>
                  )}
                  {selectedFornecedor.avaliacao > 0 && (
                    <span className="text-blue-600">{renderStars(selectedFornecedor.avaliacao)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  id={`edit-fornecedor-btn-${selectedFornecedor.id}`}
                  onClick={() => openEditModal(selectedFornecedor)}
                  className="text-slate-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition active:scale-95"
                  title="Editar Fornecedor"
                >
                  <Pencil size={16} />
                </button>

                {selectedFornecedor.ativo ? (
                  <button
                    id={`inativar-fornecedor-btn-${selectedFornecedor.id}`}
                    onClick={() => {
                      confirm({
                        title: 'Inativar fornecedor',
                        message: `Ocultar ${selectedFornecedor.empresa} da agenda? O histórico é preservado e você pode reativá-lo a qualquer momento.`,
                        onConfirm: () => {
                          onSetAtivoFornecedor(selectedFornecedor.id, false);
                          toast.success('Fornecedor inativado.');
                        }
                      });
                    }}
                    className="text-slate-400 hover:text-amber-600 p-1.5 rounded hover:bg-amber-50 transition active:scale-95"
                    title="Inativar Fornecedor"
                  >
                    <EyeOff size={16} />
                  </button>
                ) : (
                  <button
                    id={`reativar-fornecedor-btn-${selectedFornecedor.id}`}
                    onClick={() => {
                      onSetAtivoFornecedor(selectedFornecedor.id, true);
                      toast.success('Fornecedor reativado.');
                    }}
                    className="text-slate-400 hover:text-emerald-600 p-1.5 rounded hover:bg-emerald-50 transition active:scale-95"
                    title="Reativar Fornecedor"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}

                {/* Hard delete only when nothing would be orphaned: the ledger FK is
                    ON DELETE SET NULL, so removing a supplier with purchases would
                    silently detach them. 'gestao' can't read the ledger at all (RLS),
                    so for that role the count is always 0 and delete stays hidden. */}
                {canViewFinance && selectedFornecedor.historicoCompras.length === 0 && (
                  <button
                    id={`delete-fornecedor-btn-${selectedFornecedor.id}`}
                    onClick={() => {
                      confirm({
                        title: 'Excluir fornecedor',
                        message: `Excluir permanentemente ${selectedFornecedor.empresa}? Este fornecedor não possui pedidos registrados, então nada do financeiro será afetado.`,
                        onConfirm: () => {
                          onDeleteFornecedor(selectedFornecedor.id);
                          setSelectedId(null);
                          toast.success('Fornecedor excluído.');
                        }
                      });
                    }}
                    className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition active:scale-95"
                    title="Excluir Fornecedor"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Contact block — the reason this tab exists. Every channel is actionable. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-left space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Falar com</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <User size={13} className="text-slate-400 shrink-0" />
                  <span className="font-semibold truncate">{selectedFornecedor.contato || 'Contato não informado'}</span>
                </p>

                {selectedFornecedor.telefone ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <a
                      href={`tel:${onlyDigits(selectedFornecedor.telefone)}`}
                      className="text-xs font-mono font-medium text-slate-800 flex items-center gap-1.5 hover:text-blue-600 transition"
                    >
                      <Phone size={13} className="text-slate-400 shrink-0" />
                      <span>{maskTelefone(selectedFornecedor.telefone)}</span>
                    </a>
                    <a
                      href={`https://wa.me/55${onlyDigits(selectedFornecedor.telefone)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 flex items-center gap-1 hover:bg-emerald-100 transition active:scale-95"
                      title="Abrir conversa no WhatsApp"
                    >
                      <MessageCircle size={11} />
                      <span>WhatsApp</span>
                    </a>
                    <button
                      onClick={() => copyToClipboard(selectedFornecedor.telefone, 'Telefone')}
                      className="text-slate-400 hover:text-blue-600 p-0.5 rounded transition active:scale-95"
                      title="Copiar telefone"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 flex items-center gap-2">
                    <Phone size={13} className="shrink-0" />
                    <span>Telefone não informado</span>
                  </p>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-left space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">E-mail</span>
                {selectedFornecedor.email ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <a
                      href={`mailto:${selectedFornecedor.email}`}
                      className="text-xs font-medium text-slate-800 flex items-center gap-2 hover:text-blue-600 transition min-w-0"
                    >
                      <Mail size={13} className="text-slate-400 shrink-0" />
                      <span className="truncate">{selectedFornecedor.email}</span>
                    </a>
                    <button
                      onClick={() => copyToClipboard(selectedFornecedor.email, 'E-mail')}
                      className="text-slate-400 hover:text-blue-600 p-0.5 rounded transition active:scale-95 shrink-0"
                      title="Copiar e-mail"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 flex items-center gap-2">
                    <Mail size={13} className="shrink-0" />
                    <span>E-mail não informado</span>
                  </p>
                )}
              </div>
            </div>

            {/* O que fornece */}
            <div className="space-y-2 text-left">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Package size={15} className="text-blue-600" />
                <span>O que fornece</span>
              </h4>
              {selectedFornecedor.fornece.length === 0 && insumosVinculados.length === 0 ? (
                <p className="text-xs text-slate-400 pl-1">
                  Nada informado ainda. Edite o fornecedor e adicione itens como "areia", "brita" ou "locação de andaimes" para encontrá-lo pela busca.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedFornecedor.fornece.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedFornecedor.fornece.map((tag, i) => (
                        <span key={i} className="bg-blue-50 border border-blue-200 text-blue-800 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {insumosVinculados.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400 font-medium">
                        Itens do catálogo vinculados a este fornecedor ({insumosVinculados.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {insumosVinculados.slice(0, 12).map((item) => {
                          const cotacao = item.cotacoesFornecedores?.find((c) => c.fornecedorId === selectedFornecedor.id);
                          return (
                            <span
                              key={item.id}
                              className="bg-slate-100 border border-slate-200 text-slate-700 rounded px-2 py-0.5 text-xs flex items-center gap-1.5"
                              title={item.descricao}
                            >
                              <span className="truncate max-w-[200px]">{item.descricao}</span>
                              {cotacao && (
                                <span className="font-mono font-bold text-slate-500">
                                  {cotacao.precoUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/{item.unidade}
                                </span>
                              )}
                            </span>
                          );
                        })}
                        {insumosVinculados.length > 12 && (
                          <span className="text-xs text-slate-400 self-center">+{insumosVinculados.length - 12} outros</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Observações */}
            {selectedFornecedor.observacoes && (
              <div className="space-y-2 text-left">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <StickyNote size={15} className="text-amber-500" />
                  <span>Observações</span>
                </h4>
                <p className="text-xs text-slate-700 bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 whitespace-pre-wrap">
                  {selectedFornecedor.observacoes}
                </p>
              </div>
            )}

            {/* Documentos */}
            <div className="space-y-2 text-left">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-emerald-600" />
                <span>Documentações Homologadas</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedFornecedor.documentos.length === 0 ? (
                  <p className="text-xs text-slate-400 pl-1">Nenhum documento registrado.</p>
                ) : (
                  selectedFornecedor.documentos.map((doc, i) => (
                    <div key={i} className="bg-slate-100 border border-slate-200 rounded px-2.5 py-1 text-xs font-mono text-slate-700 flex items-center gap-1.5">
                      <FileCheck size={12} className="text-emerald-600 shrink-0" />
                      <span>{doc}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Financeiro — secondary now: this tab is an agenda first. Collapsed by default. */}
            {canViewFinance && (() => {
              const compras = selectedFornecedor.historicoCompras;
              const totalGasto = compras.reduce((sum, c) => sum + c.valor, 0);
              const comprasPagasCount = compras.filter((c) => c.pago).length;
              const percentualAdimplemento = compras.length > 0 ? (comprasPagasCount / compras.length) * 100 : 100;

              return (
                <div className="border-t border-slate-200 pt-3 text-left">
                  <div className="flex justify-between items-center gap-2">
                    <button
                      id="toggle-finance-section"
                      onClick={() => setFinanceOpen((v) => !v)}
                      aria-expanded={financeOpen}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase tracking-wider hover:text-blue-600 transition"
                    >
                      <ShoppingBag size={15} className="text-slate-500" />
                      <span>Pedidos e Pagamentos ({compras.length})</span>
                      <ChevronDown size={14} className={`transition-transform ${financeOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                      id="add-purchase-btn"
                      onClick={() => { setPurchaseContaId(contas[0]?.id || ''); setShowPurchaseModal(true); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 text-xs rounded transition flex items-center gap-1 active:scale-95 shadow-sm shrink-0"
                    >
                      <Plus size={12} />
                      <span>Registrar Pedido</span>
                    </button>
                  </div>

                  {!financeOpen ? (
                    compras.length > 0 && (
                      <p className="text-xs text-slate-500 mt-2 pl-1">
                        <span className="font-mono font-bold text-slate-800">
                          {totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>{' '}
                        em {compras.length} pedidos · {comprasPagasCount} quitados
                      </p>
                    )
                  ) : (
                    <div className="space-y-3 mt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Faturado / Gasto</span>
                          <span className="text-sm font-bold text-slate-900 font-mono mt-0.5 block">
                            {totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5 block">Em {compras.length} compras registradas</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Adimplemento Financeiro</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-sm font-bold text-slate-900 font-mono">{percentualAdimplemento.toFixed(0)}%</span>
                            <span className={`text-[10px] font-bold px-1.5 rounded-full ${
                              percentualAdimplemento >= 100 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              percentualAdimplemento >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {comprasPagasCount}/{compras.length} quitados
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5 flex">
                            <div
                              className={`h-full rounded-full transition-all duration-350 ${
                                percentualAdimplemento >= 100 ? 'bg-emerald-500' :
                                percentualAdimplemento >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${percentualAdimplemento}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {compras.length === 0 ? (
                        <p className="text-xs text-slate-400 italic pl-1">Nenhum pedido faturado para este fornecedor.</p>
                      ) : (
                        <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 shadow-sm bg-white">
                          {compras.map((compra) => (
                            <div key={compra.id} className="p-2.5 flex justify-between items-center hover:bg-slate-50/50 transition">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-semibold text-slate-400">
                                    {new Date(compra.data).toLocaleDateString('pt-BR')}
                                  </span>
                                  <h5 className="font-semibold text-xs text-slate-800 truncate">{compra.item}</h5>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 ml-4 shrink-0">
                                <span className="text-xs font-bold font-mono text-slate-900">
                                  {compra.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                                <button
                                  id={`toggle-payment-btn-${compra.id}`}
                                  onClick={() => onTogglePago(selectedFornecedor.id, compra.id)}
                                  className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border transition active:scale-95 ${
                                    compra.pago
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                  }`}
                                  title="Clique para alterar status de pagamento"
                                >
                                  {compra.pago ? (
                                    <>
                                      <CheckCircle2 size={11} className="text-emerald-600" />
                                      <span>Quitado</span>
                                    </>
                                  ) : (
                                    <>
                                      <AlertCircle size={11} className="text-blue-600" />
                                      <span>Pendente</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            {loading ? (
              <>
                <Spinner size={24} />
                <p className="text-xs mt-2">Carregando fornecedores...</p>
              </>
            ) : (
              <>
                <Truck size={48} className="stroke-1 mb-2" />
                <p className="text-xs">Selecione um fornecedor para ver os contatos.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Fornecedor Modal Overlay */}
      <AnimatePresence>
        {showAddModal && (
          <div id="add-fornecedor-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSaving) { setShowAddModal(false); resetForm(); } }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">{editingId ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
                <button
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  disabled={isSaving}
                  className="text-slate-400 hover:text-slate-600 font-bold transition disabled:opacity-40"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitFornecedor} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nome / Razão Social *</label>
                  <input
                    id="add-forn-empresa"
                    type="text"
                    required
                    disabled={isSaving}
                    placeholder="Ex: Cimento Forte do Brasil S/A"
                    value={formEmpresa}
                    onChange={(e) => setFormEmpresa(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tipo de Pessoa</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['CNPJ', 'CPF'] as TipoPessoa[]).map((tipo) => (
                      <button
                        key={tipo}
                        id={`add-forn-tipo-${tipo.toLowerCase()}`}
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleTipoPessoaChange(tipo)}
                        className={`py-2 rounded text-xs font-bold border transition active:scale-95 disabled:opacity-50 ${
                          formTipoPessoa === tipo
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {tipo === 'CNPJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{formTipoPessoa}</label>
                    <input
                      id="add-forn-documento"
                      type="text"
                      inputMode="numeric"
                      disabled={isSaving}
                      placeholder={formTipoPessoa === 'CNPJ' ? '00.000.000/0001-00' : '000.000.000-00'}
                      value={formCpfCnpj}
                      onChange={(e) => setFormCpfCnpj(maskDocumento(e.target.value, formTipoPessoa))}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none text-slate-800 font-mono disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Categoria</label>
                    <select
                      id="add-forn-categoria"
                      disabled={isSaving}
                      value={formCategoria}
                      onChange={(e) => setFormCategoria(e.target.value as CategoriaFornecedor)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none bg-white text-slate-700 font-medium disabled:bg-slate-50"
                    >
                      {CATEGORIAS.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Telefone *</label>
                    <input
                      id="add-forn-tel"
                      type="tel"
                      inputMode="numeric"
                      disabled={isSaving}
                      placeholder="(00) 00000-0000"
                      value={formTelefone}
                      onChange={(e) => setFormTelefone(maskTelefone(e.target.value))}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 font-mono disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nome do Contato</label>
                    <input
                      id="add-forn-contato"
                      type="text"
                      disabled={isSaving}
                      placeholder="Ex: Marcos (vendas)"
                      value={formContato}
                      onChange={(e) => setFormContato(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">E-mail *</label>
                    <input
                      id="add-forn-email"
                      type="email"
                      disabled={isSaving}
                      placeholder="vendas@empresa.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cidade</label>
                    <input
                      id="add-forn-cidade"
                      type="text"
                      disabled={isSaving}
                      placeholder="Ex: Belo Horizonte"
                      value={formCidade}
                      onChange={(e) => setFormCidade(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-400 -mt-1">* Telefone ou e-mail — ao menos um dos dois.</p>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">O que fornece</label>
                  <div className="flex gap-2">
                    <input
                      id="add-forn-fornece-input"
                      type="text"
                      disabled={isSaving}
                      placeholder="Ex: areia, brita, andaimes..."
                      value={newForneceTag}
                      onChange={(e) => setNewForneceTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddForneceTag();
                        }
                      }}
                      className="flex-1 border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleAddForneceTag}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded transition active:scale-95 disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formFornece.map((tag, idx) => (
                      <span key={idx} className="bg-blue-50 text-blue-800 border border-blue-200 text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1.5">
                        <span>{tag}</span>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleRemoveForneceTag(idx)}
                          className="text-blue-400 hover:text-rose-600 font-bold transition"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Observações</label>
                  <textarea
                    id="add-forn-observacoes"
                    rows={3}
                    disabled={isSaving}
                    placeholder="Ex: só aceita PIX, entrega em 3 dias, falar com o João depois das 14h..."
                    value={formObservacoes}
                    onChange={(e) => setFormObservacoes(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 text-slate-800 disabled:bg-slate-50 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Avaliação</label>
                  <select
                    id="add-forn-rating"
                    disabled={isSaving}
                    value={formAvaliacao}
                    onChange={(e) => setFormAvaliacao(parseInt(e.target.value))}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none bg-white text-slate-700 disabled:bg-slate-50"
                  >
                    <option value={0}>Sem avaliação</option>
                    <option value={5}>⭐⭐⭐⭐⭐ (5 Estrelas - Excelente)</option>
                    <option value={4}>⭐⭐⭐⭐ (4 Estrelas - Bom)</option>
                    <option value={3}>⭐⭐⭐ (3 Estrelas - Regular)</option>
                    <option value={2}>⭐⭐ (2 Estrelas - Requer supervisão)</option>
                    <option value={1}>⭐ (1 Estrela - Crítico)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Documentos de Homologação</label>
                  <div className="flex gap-2">
                    <input
                      id="add-forn-doc-input"
                      type="text"
                      disabled={isSaving}
                      placeholder="Ex: ISO_9001.pdf"
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
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-add-fornecedor-btn"
                    type="submit"
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {isSaving ? (
                      <>
                        <Spinner size={14} />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Building2 size={14} />
                        <span>{editingId ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Purchase (Registrar Pedido) Modal Overlay */}
      <AnimatePresence>
        {showPurchaseModal && selectedFornecedor && (
          <div id="add-purchase-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSavingPurchase) setShowPurchaseModal(false); }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-slate-200"
            >
              <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">Registrar Novo Pedido</h3>
                <button
                  onClick={() => setShowPurchaseModal(false)}
                  disabled={isSavingPurchase}
                  className="text-slate-400 hover:text-slate-600 font-bold transition disabled:opacity-45"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleCreatePurchase} className="p-4 space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Fornecedor Vinculado</label>
                  <p className="text-xs font-bold text-slate-900">{selectedFornecedor.empresa}</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Item / Descrição do Pedido *</label>
                  <input
                    id="add-purchase-item"
                    type="text"
                    required
                    disabled={isSavingPurchase}
                    placeholder="Ex: 150 sacos de areia fina lavada"
                    value={purchaseItem}
                    onChange={(e) => setPurchaseItem(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valor do Pedido (R$) *</label>
                  <input
                    id="add-purchase-valor"
                    type="number"
                    step="0.01"
                    required
                    disabled={isSavingPurchase}
                    placeholder="Ex: 4500.00"
                    value={purchaseValor}
                    onChange={(e) => setPurchaseValor(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Conta Financeira de Saída *</label>
                  <select
                    id="add-purchase-conta"
                    required
                    disabled={isSavingPurchase}
                    value={purchaseContaId}
                    onChange={(e) => setPurchaseContaId(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none bg-white text-slate-700 font-medium disabled:bg-slate-50"
                  >
                    <option value="">Selecione a conta...</option>
                    {contas.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.nome} (Sald: R$ {acc.saldoAtual.toLocaleString('pt-BR')})</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="add-purchase-pago"
                    type="checkbox"
                    disabled={isSavingPurchase}
                    checked={purchasePago}
                    onChange={(e) => setPurchasePago(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 disabled:opacity-50"
                  />
                  <label htmlFor="add-purchase-pago" className="text-xs font-semibold text-slate-700">Fatura quitada no ato da entrega</label>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingPurchase}
                    onClick={() => setShowPurchaseModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-purchase-btn"
                    type="submit"
                    disabled={isSavingPurchase}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {isSavingPurchase ? (
                      <>
                        <Spinner size={14} />
                        <span>Faturando...</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag size={14} />
                        <span>Faturar Lançamento</span>
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
