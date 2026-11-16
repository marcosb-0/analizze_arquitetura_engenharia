import React, { memo, useMemo, useState } from 'react';
import { atrasoEntrada } from '../lib/animacao';
import {
  Truck,
  Search,
  Plus,
  Star,
  ShoppingBag,
  FileCheck,
  Building2,
  Trash2,
  Pencil,
  MessageCircle,
  Copy,
  EyeOff,
  RotateCcw
} from 'lucide-react';
import {
  CentroCusto,
  Fornecedor,
  CompraFornecedor,
  CategoriaFornecedor,
  ContaFinanceira,
  InsumoCatalogo,
  TipoPessoa
} from '../types';
import SeletorCentroCusto from './financeiro/SeletorCentroCusto';
import { useFeedback } from './FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import EstadoDaLista from './EstadoDaLista';
import SemSelecao from './SemSelecao';
import { Avatar, CabecalhoPagina, FOCO, Button, COLUNA_ANCORADA, CONTROLE_ALTURA, Card, CardHeader, Chip, FileiraPilulas, LINHA_SELECIONADA, CarregarMais, Field, IconButton, Input, Modal, PaginaAba, Pilula, Select, SeletorOrdenacao, Textarea, type TomChip } from './ui';
import { useValidacao } from '../hooks/useValidacao';
import { naoEhNumero, naoEhPositivo, naoEscolhido, vazio } from '../lib/validacao';
import { useListaOrdenada, compararTexto, type OpcaoOrdenacao } from '../hooks/useListaOrdenada';
import Spinner from './Spinner';
import { maskDocumento, maskTelefone, onlyDigits } from '../utils/format';
import { formatarDataBR } from '../lib/data';
import { formatBRL } from '../lib/preco';

const CATEGORIAS: CategoriaFornecedor[] = ['Material', 'Mão de Obra', 'Equipamentos', 'Serviços Terceirizados'];

/**
 * O tom de cada categoria de fornecedor.
 *
 * Era um mapa de classes escritas à mão, e o quarto tom era `purple` — um matiz
 * que não existe na paleta do app (o roxo do sistema é `violet`, e mora em
 * `PREENCHIMENTO`/`CHIP` como `destaque`). Uma cor inteira entrou pela porta de
 * um `Record<string,string>` sem passar por medição nenhuma.
 */
const TOM_CATEGORIA: Record<CategoriaFornecedor, TomChip> = {
  'Material': 'informativo',
  'Mão de Obra': 'positivo',
  'Equipamentos': 'alternativo',
  'Serviços Terceirizados': 'destaque',
};

interface FornecedoresTabProps {
  fornecedores: Fornecedor[];
  loading: boolean;
  contas: ContaFinanceira[];
  /** A compra vira lançamento no razão, então carrega a dimensão obrigatória dele. */
  centrosCusto: CentroCusto[];
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
  centrosCusto,
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
  } = useValidacao<'item' | 'valor' | 'conta' | 'centro'>();
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
  const [purchaseCentroId, setPurchaseCentroId] = useState('');

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
        { campo: 'centro', invalido: naoEscolhido(purchaseCentroId), erro: 'Escolha o centro de custo do pedido.' },
      ])
    ) return;

    setIsSavingPurchase(true);

    const newCompra: CompraFornecedor = {
      id: crypto.randomUUID(),
      data: new Date().toISOString().split('T')[0],
      item: purchaseItem,
      valor: parseFloat(purchaseValor),
      pago: purchasePago,
      contaId: purchaseContaId,
      centroCustoId: purchaseCentroId
    };

    try {
      await onAddCompra(selectedFornecedor.id, newCompra);
    } catch {
      setIsSavingPurchase(false);
      return; // hook already rolled back and toasted; keep the modal open
    }

    setIsSavingPurchase(false);
    setShowPurchaseModal(false);
    toast.success('Pedido de compra registrado.', `Lançamento de ${newCompra.item} faturado com sucesso.`);

    setPurchaseItem('');
    setPurchaseValor('');
    setPurchasePago(false);
    setPurchaseContaId('');
    setPurchaseCentroId('');
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
      <CabecalhoPagina
        className="col-span-full mb-2"
        titulo="Fornecedores"
        descricao="Agenda de fornecedores e as cotações que alimentam o banco de custos."
        acoes={
          <Button id="add-fornecedor-btn" onClick={() => { resetForm(); setShowAddModal(true); }}>
            <Plus size={14} />
            <span>Novo fornecedor</span>
          </Button>
        }
      />
      {/* Left list block */}
      <Card semPadding id="fornecedores-list-col" className={`lg:col-span-1 flex flex-col overflow-hidden ${COLUNA_ANCORADA}`}>

        {/* A ação "Novo fornecedor" subiu para o cabeçalho da página: aqui só
            se procura, recorta e ordena. */}
        <div className="p-4 border-b border-slate-200 space-y-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
            <Input
              id="fornecedor-search-input"
              type="text"
              aria-label="Buscar fornecedores"
              placeholder="Buscar por nome, contato, telefone, cidade ou item"
              value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-8 pr-3"
            />
          </div>

          {/* Categoria virou pílula, como no Catálogo: são quatro valores fixos
              e a pergunta que se faz nesta agenda é "quem eu tenho de material?".
              "Inativos" fica na mesma fileira porque é o mesmo gesto de recortar. */}
          <FileiraPilulas rotulo="Categoria do fornecedor">
            <Pilula ativo={categoryFilter === 'Todas'} onClick={() => setCategoryFilter('Todas')}>
              Todas
            </Pilula>
            {CATEGORIAS.map((cat) => (
              <Pilula key={cat} ativo={categoryFilter === cat} onClick={() => setCategoryFilter(cat)}>
                {cat}
              </Pilula>
            ))}
            {inativosCount > 0 && (
              <Pilula
                id="toggle-inativos-btn"
                ativo={showInativos}
                onClick={() => setShowInativos((v) => !v)}
                title={showInativos ? 'Ocultar fornecedores inativos' : 'Mostrar fornecedores inativos'}
              >
                Inativos ({inativosCount})
              </Pilula>
            )}
          </FileiraPilulas>

          {lista.total > 0 && (
            <SeletorOrdenacao
              opcoes={lista.opcoes}
              valor={lista.ordemId}
              onChange={lista.setOrdemId}
              mostrando={lista.mostrando}
              total={lista.total}
            />
          )}
        </div>

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
              actionLabel: 'Novo fornecedor',
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
                  className={`anim-lista p-3 cursor-pointer transition text-left flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                    isSelected ? LINHA_SELECIONADA.ativa : LINHA_SELECIONADA.inativa
                  } ${!forn.ativo ? 'opacity-60' : ''}`}
                >
                  <Avatar nome={forn.empresa} tamanho="md" tom={isSelected ? 'solido' : 'suave'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-center gap-2">
                      <h3 className="font-semibold text-xs text-slate-900 truncate">{forn.empresa}</h3>
                      <Chip tom={forn.ativo ? TOM_CATEGORIA[forn.categoria] : 'neutro'} className="shrink-0">
                        {forn.ativo ? forn.categoria : 'Inativo'}
                      </Chip>
                    </div>
                    {/* Telefone é o campo para o qual se abre uma agenda. */}
                    <p className="text-2xs text-slate-500 mt-0.5 truncate">
                      {forn.telefone
                        ? <span className="font-mono">{maskTelefone(forn.telefone)}</span>
                        : forn.email || 'Sem contato'}
                      {forn.cidade && <> · {forn.cidade}</>}
                    </p>
                  </div>
                </div>
              );
            })}
          </EstadoDaLista>
          <CarregarMais temMais={lista.temMais} restantes={lista.restantes} onCarregarMais={lista.carregarMais} />
        </div>
      </Card>

      {/* Ficha: identificação num cartão próprio, os dados em cartões e, para
          quem lê o financeiro, os pedidos num cartão no fim. */}
      <div id="fornecedor-detail-col">
        {selectedFornecedor ? (() => {
          const forn = selectedFornecedor;
          return (
          <article id="fornecedor-detail-view" aria-labelledby="fornecedor-nome" className="space-y-4 text-left">

            {/* Identificação */}
            <Card className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar nome={forn.empresa} tamanho="lg" tom="solido" />
                <div className="min-w-0">
                  <h2 id="fornecedor-nome" className="text-lg font-semibold leading-tight text-slate-900 break-words">{forn.empresa}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <Chip tom={TOM_CATEGORIA[forn.categoria]}>{forn.categoria}</Chip>
                    {!forn.ativo && <Chip tom="neutro">Inativo</Chip>}
                    {forn.cpfCnpj && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(forn.cpfCnpj, forn.tipoPessoa)}
                        className={`font-mono inline-flex items-center gap-1 rounded-lg hover:text-blue-600 transition group ${FOCO}`}
                        title={`Copiar ${forn.tipoPessoa}`}
                      >
                        {forn.tipoPessoa} {maskDocumento(forn.cpfCnpj, forn.tipoPessoa)}
                        <Copy size={12} className="opacity-50 group-hover:opacity-100 transition" aria-hidden="true" />
                      </button>
                    )}
                    {forn.cidade && <span>· {forn.cidade}</span>}
                    {forn.avaliacao > 0 && (
                      <span className="text-blue-600" title={`Avaliação ${forn.avaliacao} de 5`}>{renderStars(forn.avaliacao)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  id={`edit-fornecedor-btn-${forn.id}`}
                  variante="secundario"
                  onClick={() => openEditModal(forn)}
                >
                  <Pencil size={14} />
                  Editar
                </Button>

                {forn.ativo ? (
                  <Button
                    id={`inativar-fornecedor-btn-${forn.id}`}
                    variante="fantasma"
                    onClick={() => {
                      confirm({
                        title: 'Inativar fornecedor',
                        message: `Ocultar ${forn.empresa} da agenda? O histórico é preservado e você pode reativá-lo a qualquer momento.`,
                        // A própria mensagem diz que é reversível: o vermelho
                        // de "Excluir" contradizia o texto do diálogo.
                        tone: 'normal',
                        confirmLabel: 'Inativar',
                        onConfirm: () => {
                          onSetAtivoFornecedor(forn.id, false);
                          toast.success('Fornecedor inativado.');
                        }
                      });
                    }}
                  >
                    <EyeOff size={14} />
                    Inativar
                  </Button>
                ) : (
                  <Button
                    id={`reativar-fornecedor-btn-${forn.id}`}
                    variante="secundario"
                    onClick={() => {
                      onSetAtivoFornecedor(forn.id, true);
                      toast.success('Fornecedor reativado.');
                    }}
                  >
                    <RotateCcw size={14} />
                    Reativar
                  </Button>
                )}

                {/* Hard delete only when nothing would be orphaned: the ledger FK is
                    ON DELETE SET NULL, so removing a supplier with purchases would
                    silently detach them. 'gestao' can't read the ledger at all (RLS),
                    so for that role the count is always 0 and delete stays hidden. */}
                {canViewFinance && forn.historicoCompras.length === 0 && (
                  <IconButton
                    rotulo="Excluir fornecedor"
                    tom="perigo"
                    id={`delete-fornecedor-btn-${forn.id}`}
                    onClick={() => {
                      confirm({
                        title: 'Excluir fornecedor',
                        message: `Excluir permanentemente ${forn.empresa}? Este fornecedor não possui pedidos registrados, então nada do financeiro será afetado.`,
                        onConfirm: () => {
                          onDeleteFornecedor(forn.id);
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
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Contato — o motivo de a aba existir. Todo canal é acionável. */}
              <Card>
                <CardHeader className="mb-3" title="Contato" />
                <dl className="space-y-3">
                  <div>
                    <dt className="text-2xs font-medium text-slate-500">Falar com</dt>
                    <dd className="mt-0.5 text-xs font-medium text-slate-800">
                      {forn.contato || <span className="font-normal text-slate-500">Não informado</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs font-medium text-slate-500">Telefone</dt>
                    <dd className="mt-0.5 text-xs">
                      {forn.telefone ? (
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <a href={`tel:${onlyDigits(forn.telefone)}`} className={`font-mono font-medium text-blue-600 hover:underline rounded-lg ${FOCO}`}>
                            {maskTelefone(forn.telefone)}
                          </a>
                          <a
                            href={`https://wa.me/55${onlyDigits(forn.telefone)}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`text-2xs font-semibold text-blue-700 bg-blue-50 rounded-lg px-2 py-1 inline-flex items-center gap-1 hover:bg-blue-100 transition ${FOCO}`}
                            title="Abrir conversa no WhatsApp"
                          >
                            <MessageCircle size={12} aria-hidden="true" />
                            WhatsApp
                          </a>
                          <IconButton rotulo="Copiar telefone" tom="acao" onClick={() => copyToClipboard(forn.telefone, 'Telefone')}>
                            <Copy size={14} />
                          </IconButton>
                        </span>
                      ) : <span className="text-slate-500">Não informado</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs font-medium text-slate-500">E-mail</dt>
                    <dd className="mt-0.5 text-xs min-w-0">
                      {forn.email ? (
                        <span className="flex items-center gap-1.5 min-w-0">
                          <a href={`mailto:${forn.email}`} className={`truncate font-medium text-blue-600 hover:underline rounded-lg ${FOCO}`}>{forn.email}</a>
                          <IconButton rotulo="Copiar e-mail" tom="acao" onClick={() => copyToClipboard(forn.email, 'E-mail')}>
                            <Copy size={14} />
                          </IconButton>
                        </span>
                      ) : <span className="text-slate-500">Não informado</span>}
                    </dd>
                  </div>
                </dl>
              </Card>

              {/* O que fornece */}
              <Card>
                <CardHeader className="mb-3" title="O que fornece" />
                {forn.fornece.length === 0 && insumosVinculados.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nada informado ainda. Edite o fornecedor e adicione itens como "areia", "brita" ou "locação de andaimes" para encontrá-lo pela busca.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {forn.fornece.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {forn.fornece.map((tag, i) => (
                          <Chip key={i} tom="neutro">{tag}</Chip>
                        ))}
                      </div>
                    )}
                    {insumosVinculados.length > 0 && (
                      <div>
                        <p className="text-2xs font-medium text-slate-500 mb-1">
                          No catálogo ({insumosVinculados.length})
                        </p>
                        <ul className="divide-y divide-slate-100">
                          {insumosVinculados.slice(0, 8).map((item) => {
                            const cotacao = item.cotacoesFornecedores?.find((c) => c.fornecedorId === forn.id);
                            return (
                              <li key={item.id} className="py-1.5 flex items-baseline justify-between gap-3 text-xs">
                                <span className="truncate text-slate-800" title={item.descricao}>{item.descricao}</span>
                                {cotacao && (
                                  <span className="font-mono text-slate-500 shrink-0">
                                    {formatBRL(cotacao.precoUnitario)}/{item.unidade}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {insumosVinculados.length > 8 && (
                          <p className="text-2xs text-slate-500 mt-1">e mais {insumosVinculados.length - 8}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader className="mb-3" title="Observações" />
                <p className={`text-xs leading-relaxed max-w-prose ${forn.observacoes ? 'text-slate-800 whitespace-pre-wrap' : 'text-slate-500'}`}>
                  {forn.observacoes || 'Sem observações para este fornecedor.'}
                </p>
              </Card>

              <Card>
                <CardHeader className="mb-3" title="Documentos homologados" />
                {forn.documentos.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum documento registrado.</p>
                ) : (
                  <ul className="-my-1.5 divide-y divide-slate-100">
                    {forn.documentos.map((doc, i) => (
                      <li key={i} className="py-1.5 flex items-center gap-2 text-xs text-slate-800">
                        <FileCheck size={14} className="text-emerald-700 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">{doc}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Pedidos e pagamentos — só para quem lê o financeiro. */}
            {canViewFinance && (() => {
              const compras = [...forn.historicoCompras].sort((a, b) => b.data.localeCompare(a.data));
              const totalGasto = compras.reduce((sum, c) => sum + c.valor, 0);
              const comprasPagasCount = compras.filter((c) => c.pago).length;

              return (
                <Card semPadding>
                  <CardHeader
                    className="px-5 pt-4 pb-3"
                    title={`Pedidos e pagamentos${compras.length > 0 ? ` (${compras.length})` : ''}`}
                    description={compras.length > 0
                      ? `${formatBRL(totalGasto)} no total · ${comprasPagasCount} de ${compras.length} quitados`
                      : undefined}
                    actions={
                      <Button
                        id="add-purchase-btn"
                        variante="fantasma"
                        tamanho="sm"
                        onClick={() => { setPurchaseContaId(contas[0]?.id || ''); setShowPurchaseModal(true); }}
                      >
                        <Plus size={12} />
                        <span>Registrar pedido</span>
                      </Button>
                    }
                  />
                  {compras.length === 0 ? (
                    <p className="px-5 pb-5 text-xs text-slate-500">Nenhum pedido registrado para este fornecedor.</p>
                  ) : (
                    <ul className="border-t border-slate-100 divide-y divide-slate-100">
                      {compras.map((compra) => (
                        <li key={compra.id} className="px-5 py-3 flex justify-between items-center gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-xs text-slate-900 truncate">{compra.item}</p>
                            <p className="text-2xs text-slate-500 mt-0.5 font-mono">{formatarDataBR(compra.data)}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs font-semibold font-mono text-slate-900">{formatBRL(compra.valor)}</span>
                            <button
                              id={`toggle-payment-btn-${compra.id}`}
                              type="button"
                              onClick={() => onTogglePago(forn.id, compra.id)}
                              className={`rounded-full ${FOCO}`}
                              title="Alterar situação do pagamento"
                              aria-label={`${compra.pago ? 'Quitado' : 'Pendente'} — alterar situação de ${compra.item}`}
                            >
                              <Chip tom={compra.pago ? 'positivo' : 'atencao'} ponto className="hover:brightness-95">
                                {compra.pago ? 'Quitado' : 'Pendente'}
                              </Chip>
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })()}

          </article>
          );
        })() : (
          <div className="flex flex-col items-center justify-center text-slate-500 py-24">
            {loading ? (
              <>
                <Spinner size={20} />
                <p className="text-xs mt-2">Carregando fornecedores...</p>
              </>
            ) : (
              <SemSelecao icone={Truck}>
                Escolha um fornecedor na lista para ver contatos, o que ele fornece e o histórico
                de pedidos.
              </SemSelecao>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Fornecedor Modal Overlay */}
      <Modal
        id="add-fornecedor-modal"
        open={showAddModal}
        onClose={() => { setShowAddModal(false); resetForm(); }}
        title={editingId ? 'Editar fornecedor' : 'Novo fornecedor'}
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
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo de Pessoa</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['CNPJ', 'CPF'] as TipoPessoa[]).map((tipo) => (
                      <button
                        key={tipo}
                        id={`add-forn-tipo-${tipo.toLowerCase()}`}
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleTipoPessoaChange(tipo)}
                        className={`${CONTROLE_ALTURA.md} rounded-lg text-xs font-semibold border transition active:scale-95 disabled:opacity-50 ${
                          formTipoPessoa === tipo
                            ? 'bg-acao border-acao text-acao-texto shadow-cartao'
                            : 'bg-superficie border-slate-200 text-slate-500 hover:bg-slate-50'
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
                  <label className="block text-xs font-semibold text-slate-500 mb-1">O que fornece</label>
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
                      <span key={idx} className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1.5">
                        <span>{tag}</span>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleRemoveForneceTag(idx)}
                          className="text-blue-600 hover:text-rose-700 font-semibold transition"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Observações</label>
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
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Avaliação</label>
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
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Documentos de Homologação</label>
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
                      className="bg-slate-800 hover:bg-slate-900 text-superficie text-xs font-semibold px-3 py-2 rounded-lg transition active:scale-95 disabled:opacity-50"
                    >
                      Anexar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formDocs.map((doc, idx) => (
                      <span key={idx} className="bg-slate-100 text-slate-800 text-xs font-mono px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5">
                        <span>{doc}</span>
                        <button type="button" disabled={isSaving} onClick={() => handleRemoveFormDoc(idx)} className="text-slate-500 hover:text-rose-700 font-semibold transition">×</button>
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
                        <span>{editingId ? 'Salvar alterações' : 'Cadastrar fornecedor'}</span>
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
        title="Registrar pedido"
        size="sm"
        bloqueado={isSavingPurchase}
      >
        {selectedFornecedor && (
              <form ref={areaRefCompra as React.RefObject<HTMLFormElement>} onSubmit={handleCreatePurchase} className="p-4 space-y-4 text-left">
                <div>
                  <span className="block text-2xs font-semibold text-slate-500 mb-1">Fornecedor Vinculado</span>
                  <p className="text-xs font-semibold text-slate-900">{selectedFornecedor.empresa}</p>
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

                <Field id="add-purchase-conta" label="Conta financeira de saída" erro={errosCompra.conta} required>
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

                <Field id="add-purchase-centro" label="Centro de Custo" erro={errosCompra.centro} required>
                  {(props) => (
                    <SeletorCentroCusto
                      {...props}
                      centros={centrosCusto}
                      valor={purchaseCentroId}
                      disabled={isSavingPurchase}
                      rotuloVazio="Selecione o centro..."
                      onChange={(id) => { setPurchaseCentroId(id); limparErroCompra('centro'); }}
                      className="font-medium"
                    />
                  )}
                </Field>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="add-purchase-pago"
                    type="checkbox"
                    disabled={isSavingPurchase}
                    checked={purchasePago}
                    onChange={(e) => setPurchasePago(e.target.checked)}
                    className="rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 disabled:opacity-50"
                  />
                  <label htmlFor="add-purchase-pago" className="text-xs font-semibold text-slate-800">Fatura quitada no ato da entrega</label>
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
