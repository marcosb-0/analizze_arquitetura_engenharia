import React, { memo, useMemo, useState } from 'react';
import { atrasoEntrada } from '../lib/animacao';
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
import EstadoDaLista from './EstadoDaLista';
import { ALVO, Button, COLUNA_ANCORADA, CONTROLE_ALTURA, Card, FaixaKpis, Kpi, PREENCHIMENTO, CarregarMais, Field, IconButton, Input, Modal, PaginaAba, Secao, Select, SeletorOrdenacao, Textarea } from './ui';
import { useValidacao } from '../hooks/useValidacao';
import { naoEhNumero, naoEhPositivo, naoEscolhido, vazio } from '../lib/validacao';
import { useListaOrdenada, compararTexto, type OpcaoOrdenacao } from '../hooks/useListaOrdenada';
import Spinner from './Spinner';
import { maskDocumento, maskTelefone, onlyDigits } from '../utils/format';
import { formatarDataBR } from '../lib/data';

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

function FornecedoresTab({
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
  const { erros, validar, limparErro, areaRef } = useValidacao<'empresa' | 'contato'>();
  // Validação própria: o diálogo de compra é outro formulário, e um hook só
  // faria o erro de um aparecer no outro. Destrinchado em vez de guardado num
  // objeto porque `areaRef` é um ref — ler `compra.erros` no meio do JSX cai na
  // regra `react-hooks/refs`.
  const {
    erros: errosCompra,
    validar: validarCompra,
    limparErro: limparErroCompra,
    areaRef: areaRefCompra,
  } = useValidacao<'item' | 'valor' | 'conta'>();
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

  const ORDENS_FORNECEDOR = useMemo<OpcaoOrdenacao<Fornecedor>[]>(() => [
    { id: 'empresa', label: 'Empresa (A–Z)', comparar: (a, b) => compararTexto(a.empresa, b.empresa) },
    { id: 'cidade', label: 'Cidade (A–Z)', comparar: (a, b) => compararTexto(a.cidade, b.cidade) },
    { id: 'categoria', label: 'Categoria (A–Z)', comparar: (a, b) => compararTexto(a.categoria, b.categoria) },
  ], []);

  const lista = useListaOrdenada({ itens: filteredFornecedores, opcoes: ORDENS_FORNECEDOR });

  // Resolved against the *visible* list so the detail panel always matches
  // something on screen — filtering out (or inactivating) the current selection
  // slides to the next entry instead of stranding an invisible one.
  const selectedFornecedor =
    lista.visiveis.find((f) => f.id === selectedId) ?? lista.visiveis[0] ?? null;

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
    if (
      !validar([
        { campo: 'empresa', invalido: vazio(formEmpresa), erro: 'Informe o nome ou a razão social.' },
        {
          campo: 'contato',
          invalido: vazio(formTelefone) && vazio(formEmail),
          erro: 'Informe telefone ou e-mail — um dos dois basta.',
        },
      ])
    ) return;

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
    if (!selectedFornecedor) return;
    if (
      !validarCompra([
        { campo: 'item', invalido: vazio(purchaseItem), erro: 'Descreva o que foi pedido.' },
        { campo: 'valor', invalido: vazio(purchaseValor), erro: 'Informe o valor do pedido.' },
        { campo: 'valor', invalido: naoEhNumero(purchaseValor), erro: 'O valor precisa ser um número (use ponto decimal).' },
        { campo: 'valor', invalido: naoEhPositivo(purchaseValor), erro: 'O valor deve ser maior que zero.' },
        { campo: 'conta', invalido: naoEscolhido(purchaseContaId), erro: 'Escolha a conta que vai pagar o pedido.' },
      ])
    ) return;

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
          className={i < avaliacao ? 'text-blue-600 shrink-0' : 'text-slate-500 shrink-0'}
        />
      ))}
    </div>
  );

  return (
    <PaginaAba
      largura="painel"
      id="fornecedores-tab-container"
      fluxo="livre"
      /* Só a lista fica ancorada; a ficha do fornecedor rola com a página.
         Ver o cabeçalho de `COLUNA_ANCORADA`. */
      className="grid grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr] 2xl:grid-cols-[minmax(360px,440px)_1fr] gap-4 items-start"
    >
      {/* Left list block */}
      <Card semPadding id="fornecedores-list-col" className={`lg:col-span-1 flex flex-col overflow-hidden ${COLUNA_ANCORADA}`}>

        {/* Filter bar */}
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">
              Fornecedores
              {!loading && <span className="ml-1.5 text-xs font-medium text-slate-500">({lista.total})</span>}
            </h3>
            <Button
              id="add-fornecedor-btn"
              onClick={() => { resetForm(); setShowAddModal(true); }}
            >
              <Plus size={14} />
              <span>Novo Fornecedor</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
              <Input
                id="fornecedor-search-input"
                type="text"
                placeholder="Buscar por nome, contato, telefone, cidade ou item..."
                value={search}
                onChange={(e) => setSearch(e.target.value)} className="pl-8 pr-3"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select
                id="fornecedor-category-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)} className="flex-1"
              >
                <option value="Todas">Categoria: Todas</option>
                {CATEGORIAS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </Select>
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
          {lista.total > 0 && (
            <SeletorOrdenacao
              opcoes={lista.opcoes}
              valor={lista.ordemId}
              onChange={lista.setOrdemId}
              mostrando={lista.mostrando}
              total={lista.total}
            />
          )}


        {/* List scroll */}
        <div id="fornecedores-scroll-area" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          <EstadoDaLista
            loading={loading}
            total={lista.total}
            totalSemFiltro={fornecedores.length}
            carregandoLabel="Carregando fornecedores..."
            className="p-4"
            vazio={{
              icon: Truck,
              title: 'Nenhum fornecedor cadastrado',
              description: 'Monte sua agenda de fornecedores: basta o nome e um telefone para começar.',
              actionLabel: 'Novo Fornecedor',
              onAction: () => { resetForm(); setShowAddModal(true); },
            }}
            semResultado={{
              title: 'Nenhum fornecedor encontrado',
              description: 'Nenhum resultado para esta busca ou para o filtro de categoria. Fornecedores desativados só aparecem com "mostrar inativos".',
            }}
            onLimparFiltros={() => { setSearch(''); setCategoryFilter('Todas'); setShowInativos(false); }}
          >
            {lista.visiveis.map((forn, index) => {
              const isSelected = selectedFornecedor?.id === forn.id;

              return (
                <div
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
                  style={{ animationDelay: atrasoEntrada(index) }}
                  className={`anim-lista p-3 cursor-pointer transition text-left space-y-1.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                    isSelected ? 'bg-blue-50/40 border-l-2 border-blue-600 font-medium' : 'hover:bg-slate-50'
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
                          <Phone size={12} className="text-slate-500 shrink-0" />
                          <span className="truncate font-mono">{forn.telefone}</span>
                        </>
                      ) : (
                        <>
                          <Mail size={12} className="text-slate-500 shrink-0" />
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
                    <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
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
                </div>
              );
            })}
          </EstadoDaLista>
          <CarregarMais temMais={lista.temMais} restantes={lista.restantes} onCarregarMais={lista.carregarMais} />
        </div>
      </Card>

      {/* Right Column: Supplier Details */}
      <div id="fornecedor-detail-col">
        {selectedFornecedor ? (
          <div id="fornecedor-detail-view" className="space-y-4 text-left">

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
                      <MapPin size={12} className="text-slate-500" />
                      {selectedFornecedor.cidade}
                    </span>
                  )}
                  {selectedFornecedor.avaliacao > 0 && (
                    <span className="text-blue-600">{renderStars(selectedFornecedor.avaliacao)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <IconButton
                  rotulo="Editar Fornecedor"
                  tom="acao"
                  id={`edit-fornecedor-btn-${selectedFornecedor.id}`}
                  onClick={() => openEditModal(selectedFornecedor)}
                >
                  <Pencil size={16} />
                </IconButton>

                {selectedFornecedor.ativo ? (
                  <button
                    id={`inativar-fornecedor-btn-${selectedFornecedor.id}`}
                    onClick={() => {
                      confirm({
                        title: 'Inativar fornecedor',
                        message: `Ocultar ${selectedFornecedor.empresa} da agenda? O histórico é preservado e você pode reativá-lo a qualquer momento.`,
                        // A própria mensagem diz que é reversível: o vermelho
                        // de "Excluir" contradizia o texto do diálogo.
                        tone: 'normal',
                        confirmLabel: 'Inativar',
                        onConfirm: () => {
                          onSetAtivoFornecedor(selectedFornecedor.id, false);
                          toast.success('Fornecedor inativado.');
                        }
                      });
                    }}
                    className={`inline-flex items-center justify-center text-slate-500 hover:text-amber-600 p-1.5 rounded hover:bg-amber-50 transition active:scale-95 ${ALVO.md}`}
                    aria-label="Inativar Fornecedor"
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
                    className={`inline-flex items-center justify-center text-slate-500 hover:text-emerald-600 p-1.5 rounded hover:bg-emerald-50 transition active:scale-95 ${ALVO.md}`}
                    aria-label="Reativar Fornecedor"
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
                  <IconButton
                    rotulo="Excluir Fornecedor"
                    tom="perigo"
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
                  >
                    <Trash2 size={16} />
                  </IconButton>
                )}
              </div>
            </div>

            {/* Contact block — the reason this tab exists. Every channel is actionable. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <Secao titulo="Falar com" className="text-left">
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <User size={13} className="text-slate-500 shrink-0" />
                  <span className="font-semibold truncate">{selectedFornecedor.contato || 'Contato não informado'}</span>
                </p>

                {selectedFornecedor.telefone ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <a
                      href={`tel:${onlyDigits(selectedFornecedor.telefone)}`}
                      className="text-xs font-mono font-medium text-slate-800 flex items-center gap-1.5 hover:text-blue-600 transition"
                    >
                      <Phone size={13} className="text-slate-500 shrink-0" />
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
                    <IconButton
                      rotulo="Copiar telefone"
                      tom="acao"
                      onClick={() => copyToClipboard(selectedFornecedor.telefone, 'Telefone')}
                      className="p-0.5"
                    >
                      <Copy size={12} />
                    </IconButton>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 flex items-center gap-2">
                    <Phone size={13} className="shrink-0" />
                    <span>Telefone não informado</span>
                  </p>
                )}
              </Secao>

              <Secao titulo="E-mail" className="text-left">
                {selectedFornecedor.email ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <a
                      href={`mailto:${selectedFornecedor.email}`}
                      className="text-xs font-medium text-slate-800 flex items-center gap-2 hover:text-blue-600 transition min-w-0"
                    >
                      <Mail size={13} className="text-slate-500 shrink-0" />
                      <span className="truncate">{selectedFornecedor.email}</span>
                    </a>
                    <IconButton
                      rotulo="Copiar e-mail"
                      tom="acao"
                      onClick={() => copyToClipboard(selectedFornecedor.email, 'E-mail')}
                      className="p-0.5"
                    >
                      <Copy size={12} />
                    </IconButton>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 flex items-center gap-2">
                    <Mail size={13} className="shrink-0" />
                    <span>E-mail não informado</span>
                  </p>
                )}
              </Secao>
            </div>

            {/* O que fornece */}
            <div className="space-y-2 text-left">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Package size={15} className="text-blue-600" />
                <span>O que fornece</span>
              </h4>
              {selectedFornecedor.fornece.length === 0 && insumosVinculados.length === 0 ? (
                <p className="text-xs text-slate-500 pl-1">
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
                      <span className="text-xs text-slate-500 font-medium">
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
                          <span className="text-xs text-slate-500 self-center">+{insumosVinculados.length - 12} outros</span>
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
                  <p className="text-xs text-slate-500 pl-1">Nenhum documento registrado.</p>
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
                    <Button
                      id="add-purchase-btn"
                      onClick={() => { setPurchaseContaId(contas[0]?.id || ''); setShowPurchaseModal(true); }} tamanho="sm" className="shrink-0"
                    >
                      <Plus size={12} />
                      <span>Registrar Pedido</span>
                    </Button>
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
                      <FaixaKpis colunas={2}>
                        <Kpi
                          rotulo="Total faturado / gasto"
                          valor={totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          detalhe={`Em ${compras.length} compras registradas`}
                        />
                        <Kpi
                          rotulo="Adimplemento financeiro"
                          valor={
                            <span className="inline-flex items-center gap-1.5">
                              {percentualAdimplemento.toFixed(0)}%
                              <span className={`text-2xs font-bold px-1.5 rounded-full ${
                                percentualAdimplemento >= 100 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                percentualAdimplemento >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {comprasPagasCount}/{compras.length} quitados
                              </span>
                            </span>
                          }
                          detalhe={
                            <span className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1 flex">
                              <span
                                className={`h-full rounded-full transition-all duration-350 ${
                                  percentualAdimplemento >= 100 ? PREENCHIMENTO.positivo :
                                  percentualAdimplemento >= 50 ? PREENCHIMENTO.atencao : PREENCHIMENTO.negativo
                                }`}
                                style={{ width: `${percentualAdimplemento}%` }}
                              />
                            </span>
                          }
                        />
                      </FaixaKpis>

                      {compras.length === 0 ? (
                        <p className="text-xs text-slate-500 italic pl-1">Nenhum pedido faturado para este fornecedor.</p>
                      ) : (
                        <div className="divide-y divide-slate-200">
                          {compras.map((compra) => (
                            <div key={compra.id} className="p-2.5 flex justify-between items-center hover:bg-slate-50/50 transition">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-semibold text-slate-500">
                                    {formatarDataBR(compra.data)}
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
          <div className="flex flex-col items-center justify-center text-slate-500 py-24">
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
      <Modal
        id="add-fornecedor-modal"
        open={showAddModal}
        onClose={() => { setShowAddModal(false); resetForm(); }}
        title={editingId ? 'Editar Fornecedor' : 'Novo Fornecedor'}
        size="md"
        bloqueado={isSaving}
      >
              <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={handleSubmitFornecedor} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
                <Field id="add-forn-empresa" label="Nome / Razão Social" erro={erros.empresa} required>
                  {(props) => (
                    <Input
                      {...props}
                      type="text"
                      disabled={isSaving}
                      placeholder="Ex: Cimento Forte do Brasil S/A"
                      value={formEmpresa}
                      onChange={(e) => { setFormEmpresa(e.target.value); limparErro('empresa'); }}
                    />
                  )}
                </Field>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo de Pessoa</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['CNPJ', 'CPF'] as TipoPessoa[]).map((tipo) => (
                      <button
                        key={tipo}
                        id={`add-forn-tipo-${tipo.toLowerCase()}`}
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleTipoPessoaChange(tipo)}
                        className={`${CONTROLE_ALTURA.md} rounded text-xs font-bold border transition active:scale-95 disabled:opacity-50 ${
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
                  <Field id="add-forn-documento" label={formTipoPessoa}>
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        inputMode="numeric"
                        disabled={isSaving}
                        placeholder={formTipoPessoa === 'CNPJ' ? '00.000.000/0001-00' : '000.000.000-00'}
                        value={formCpfCnpj}
                        onChange={(e) => setFormCpfCnpj(maskDocumento(e.target.value, formTipoPessoa))} mono
                      />
                    )}
                  </Field>
                  <Field id="add-forn-categoria" label="Categoria">
                    {(props) => (
                      <Select
                        {...props}
                        disabled={isSaving}
                        value={formCategoria}
                        onChange={(e) => setFormCategoria(e.target.value as CategoriaFornecedor)} className="font-medium"
                      >
                        {CATEGORIAS.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* O erro do contato mora no TELEFONE por ser o primeiro dos
                      dois na tela — a regra é "um dos dois", e o asterisco em
                      cada um prometia que ambos eram obrigatórios. */}
                  <Field id="add-forn-tel" label="Telefone" erro={erros.contato}>
                    {(props) => (
                      <Input
                        {...props}
                        type="tel"
                        inputMode="numeric"
                        disabled={isSaving}
                        placeholder="(00) 00000-0000"
                        value={formTelefone}
                        onChange={(e) => { setFormTelefone(maskTelefone(e.target.value)); limparErro('contato'); }} mono
                      />
                    )}
                  </Field>
                  <Field id="add-forn-contato" label="Nome do Contato">
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        disabled={isSaving}
                        placeholder="Ex: Marcos (vendas)"
                        value={formContato}
                        onChange={(e) => setFormContato(e.target.value)}
                      />
                    )}
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field id="add-forn-email" label="E-mail">
                    {(props) => (
                      <Input
                        {...props}
                        type="email"
                        disabled={isSaving}
                        placeholder="vendas@empresa.com"
                        value={formEmail}
                        onChange={(e) => { setFormEmail(e.target.value); limparErro('contato'); }}
                      />
                    )}
                  </Field>
                  <Field id="add-forn-cidade" label="Cidade">
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        disabled={isSaving}
                        placeholder="Ex: Belo Horizonte"
                        value={formCidade}
                        onChange={(e) => setFormCidade(e.target.value)}
                      />
                    )}
                  </Field>
                </div>

                <p className="text-xs text-slate-500 -mt-1">* Telefone ou e-mail — ao menos um dos dois.</p>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">O que fornece</label>
                  <div className="flex gap-2">
                    <Input
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
                      }} className="flex-1"
                    />
                    <Button
                      type="button"
                      disabled={isSaving}
                      onClick={handleAddForneceTag}
                    >
                      Adicionar
                    </Button>
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
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observações</label>
                  <Textarea
                    id="add-forn-observacoes"
                    rows={3}
                    disabled={isSaving}
                    placeholder="Ex: só aceita PIX, entrega em 3 dias, falar com o João depois das 14h..."
                    value={formObservacoes}
                    onChange={(e) => setFormObservacoes(e.target.value)} className="resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Avaliação</label>
                  <Select
                    id="add-forn-rating"
                    disabled={isSaving}
                    value={formAvaliacao}
                    onChange={(e) => setFormAvaliacao(parseInt(e.target.value))}
                  >
                    <option value={0}>Sem avaliação</option>
                    <option value={5}>⭐⭐⭐⭐⭐ (5 Estrelas - Excelente)</option>
                    <option value={4}>⭐⭐⭐⭐ (4 Estrelas - Bom)</option>
                    <option value={3}>⭐⭐⭐ (3 Estrelas - Regular)</option>
                    <option value={2}>⭐⭐ (2 Estrelas - Requer supervisão)</option>
                    <option value={1}>⭐ (1 Estrela - Crítico)</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Documentos de Homologação</label>
                  <div className="flex gap-2">
                    <Input
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
                      }} className="flex-1"
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
                        <button type="button" disabled={isSaving} onClick={() => handleRemoveFormDoc(idx)} className="text-slate-500 hover:text-rose-600 font-bold transition">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <Button
                    variante="fantasma"
                    disabled={isSaving}
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    id="submit-add-fornecedor-btn"
                    type="submit"
                    disabled={isSaving}
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
                  </Button>
                </div>
              </form>
      </Modal>

      {/* Add Purchase (Registrar Pedido) Modal Overlay */}
      <Modal
        id="add-purchase-modal"
        open={showPurchaseModal && !!selectedFornecedor}
        onClose={() => setShowPurchaseModal(false)}
        title="Registrar Novo Pedido"
        size="sm"
        bloqueado={isSavingPurchase}
      >
        {selectedFornecedor && (
              <form ref={areaRefCompra as React.RefObject<HTMLFormElement>} onSubmit={handleCreatePurchase} className="p-4 space-y-4 text-left">
                <div>
                  <span className="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Fornecedor Vinculado</span>
                  <p className="text-xs font-bold text-slate-900">{selectedFornecedor.empresa}</p>
                </div>

                <Field id="add-purchase-item" label="Item / Descrição do Pedido" erro={errosCompra.item} required>
                  {(props) => (
                    <Input
                      {...props}
                      type="text"
                      disabled={isSavingPurchase}
                      placeholder="Ex: 150 sacos de areia fina lavada"
                      value={purchaseItem}
                      onChange={(e) => { setPurchaseItem(e.target.value); limparErroCompra('item'); }}
                    />
                  )}
                </Field>

                <Field id="add-purchase-valor" label="Valor do Pedido (R$)" erro={errosCompra.valor} required>
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      step="0.01"
                      disabled={isSavingPurchase}
                      placeholder="Ex: 4500.00"
                      value={purchaseValor}
                      onChange={(e) => { setPurchaseValor(e.target.value); limparErroCompra('valor'); }}
                    />
                  )}
                </Field>

                <Field id="add-purchase-conta" label="Conta Financeira de Saída" erro={errosCompra.conta} required>
                  {(props) => (
                    <Select
                      {...props}
                      disabled={isSavingPurchase}
                      value={purchaseContaId}
                      onChange={(e) => { setPurchaseContaId(e.target.value); limparErroCompra('conta'); }} className="font-medium"
                    >
                      <option value="">Selecione a conta...</option>
                      {contas.map((acc) => (
                        <option key={acc.id} value={acc.id}>{acc.nome} (Sald: R$ {acc.saldoAtual.toLocaleString('pt-BR')})</option>
                      ))}
                    </Select>
                  )}
                </Field>

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
                  <Button
                    variante="fantasma"
                    disabled={isSavingPurchase}
                    onClick={() => setShowPurchaseModal(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    id="submit-purchase-btn"
                    type="submit"
                    disabled={isSavingPurchase}
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
                  </Button>
                </div>
              </form>
        )}
      </Modal>
    </PaginaAba>
  );
}

/**
 * `memo` porque o conector acima é assinante de contexto: ele re-renderiza a
 * cada mudança de navegação (abrir a gaveta do menu, selecionar uma obra) mesmo
 * quando nenhuma prop desta tela mudou. Só vale porque os handlers vêm de
 * `useCallback` nos hooks de domínio — com uma prop instável o `memo` seria
 * custo de leitura com ganho zero, que é o que a auditoria previa no item 30.
 */
export default memo(FornecedoresTab);
