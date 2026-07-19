import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Plus, 
  Filter, 
  Database, 
  Briefcase, 
  Tag, 
  Clock, 
  Building2, 
  Settings, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  TrendingUp, 
  Layers, 
  HelpCircle, 
  FileSpreadsheet, 
  Wrench, 
  Coins,
  ChevronRight,
  PlusCircle,
  FileCheck2,
  Calendar
} from 'lucide-react';
import { InsumoCatalogo, Projeto, Fornecedor, ItemOrcamento, CategoriaCusto, CotacaoFornecedor } from '../types';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

interface CatalogoTabProps {
  catalogo: InsumoCatalogo[];
  projetos: Projeto[];
  fornecedores: Fornecedor[];
  onAddCatalogoItem: (item: InsumoCatalogo) => void;
  onUpdateCatalogoItem: (item: InsumoCatalogo) => void;
  onDeleteCatalogoItem: (id: string) => void;
  onAddOrcamentoItem: (item: ItemOrcamento) => void;
  onAddCotacao: (insumoId: string, quote: CotacaoFornecedor) => void;
  onRemoveCotacao: (cotacaoId: string) => void;
}

export default function CatalogoTab({
  catalogo,
  projetos,
  fornecedores,
  onAddCatalogoItem,
  onUpdateCatalogoItem,
  onDeleteCatalogoItem,
  onAddOrcamentoItem,
  onAddCotacao,
  onRemoveCotacao
}: CatalogoTabProps) {
  const { toast, confirm } = useFeedback();

  // Navigation / Filter States
  const [search, setSearch] = useState('');
  const [selectedCategoria, setSelectedCategoria] = useState<string>('Todas');
  const [selectedTipo, setSelectedTipo] = useState<string>('Todos'); // 'Todos' | 'SINAPI' | 'Proprio'
  const [selectedStatus, setSelectedStatus] = useState<string>('Ativos'); // 'Ativos' | 'Todos'

  // Modal / Form States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBindModal, setShowBindModal] = useState(false);
  const [selectedInsumoForBind, setSelectedInsumoForBind] = useState<InsumoCatalogo | null>(null);
  const [selectedDetailInsumo, setSelectedDetailInsumo] = useState<InsumoCatalogo | null>(null);

  // Form State - Add New Quote in Drawer
  const [showAddCotacaoForm, setShowAddCotacaoForm] = useState(false);
  const [newCotFornecedorId, setNewCotFornecedorId] = useState('');
  const [newCotPreco, setNewCotPreco] = useState('');
  const [newCotPrazo, setNewCotPrazo] = useState('');
  const [newCotObs, setNewCotObs] = useState('');

  // Form State - Add New Item
  const [formDescricao, setFormDescricao] = useState('');
  const [formCodigoSINAPI, setFormCodigoSINAPI] = useState('');
  const [formUnidade, setFormUnidade] = useState('un');
  const [formPrecoRef, setFormPrecoRef] = useState('');
  const [formCategoria, setFormCategoria] = useState<InsumoCatalogo['categoria']>('Material');
  const [formTipo, setFormTipo] = useState<InsumoCatalogo['tipo']>('Proprio');
  const [formFornecedorPadrao, setFormFornecedorPadrao] = useState('');
  const [formComposicao, setFormComposicao] = useState('');
  const [formAplicacao, setFormAplicacao] = useState('');

  // Form State - Bind to Budget
  const [bindProjetoId, setBindProjetoId] = useState(projetos[0]?.id || '');
  const [bindQuantidade, setBindQuantidade] = useState('1');
  const [bindPrecoUnitario, setBindPrecoUnitario] = useState('');
  const [bindCategoriaCusto, setBindCategoriaCusto] = useState<CategoriaCusto>('Materiais');
  const [bindFornecedorId, setBindFornecedorId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Categories translation/styling map
  const getCategoryColor = (cat: InsumoCatalogo['categoria']) => {
    switch (cat) {
      case 'Material':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Mão de Obra':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'Equipamento':
        return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Serviço':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Taxa':
        return 'bg-rose-50 text-rose-700 border-rose-100';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getCategoryIcon = (cat: InsumoCatalogo['categoria']) => {
    switch (cat) {
      case 'Material':
        return <Layers size={13} />;
      case 'Mão de Obra':
        return <Wrench size={13} />;
      case 'Equipamento':
        return <Settings size={13} />;
      case 'Serviço':
        return <FileCheck2 size={13} />;
      case 'Taxa':
        return <Coins size={13} />;
    }
  };

  // Filter Catalog Items
  const filteredItems = catalogo.filter(item => {
    const matchesSearch = item.descricao.toLowerCase().includes(search.toLowerCase()) || 
                          (item.codigoSINAPI && item.codigoSINAPI.includes(search));
    const matchesCategory = selectedCategoria === 'Todas' || item.categoria === selectedCategoria;
    const matchesTipo = selectedTipo === 'Todos' || item.tipo === selectedTipo;
    const matchesStatus = selectedStatus === 'Todos' || (selectedStatus === 'Ativos' ? item.ativo : !item.ativo);
    
    return matchesSearch && matchesCategory && matchesTipo && matchesStatus;
  });

  const getFornecedorName = (id?: string) => {
    return fornecedores.find(f => f.id === id)?.empresa || 'Não especificado';
  };

  // Submit new item
  const handleCreateInsumo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDescricao || !formUnidade || !formPrecoRef) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    const priceNum = parseFloat(formPrecoRef);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error('O preço de referência deve ser um número válido maior que zero.');
      return;
    }

    const newItem: InsumoCatalogo = {
      id: crypto.randomUUID(),
      codigoSINAPI: formTipo === 'SINAPI' ? formCodigoSINAPI : undefined,
      descricao: formDescricao,
      unidade: formUnidade,
      precoReferencia: priceNum,
      categoria: formCategoria,
      tipo: formTipo,
      fornecedorPadraoId: formFornecedorPadrao || undefined,
      composicao: formComposicao || undefined,
      aplicacao: formAplicacao || undefined,
      ativo: true,
      dataAtualizacaoPreco: new Date().toISOString().split('T')[0],
      historicoPrecos: [
        {
          data: new Date().toISOString().split('T')[0],
          preco: priceNum,
          fonte: formTipo === 'SINAPI' ? 'SINAPI' : 'Manual'
        }
      ]
    };

    onAddCatalogoItem(newItem);
    toast.success('Insumo cadastrado no catálogo!', `"${newItem.descricao}" já pode ser utilizado.`);
    
    // Clear state
    setFormDescricao('');
    setFormCodigoSINAPI('');
    setFormUnidade('un');
    setFormPrecoRef('');
    setFormCategoria('Material');
    setFormTipo('Proprio');
    setFormFornecedorPadrao('');
    setFormComposicao('');
    setFormAplicacao('');
    setShowAddModal(false);
  };

  // Toggle Item Active state
  const handleToggleActive = (item: InsumoCatalogo) => {
    const updated = { ...item, ativo: !item.ativo };
    onUpdateCatalogoItem(updated);
    toast.info(
      item.ativo ? 'Insumo desativado' : 'Insumo ativado',
      `O item "${item.descricao}" foi atualizado no catálogo.`
    );
  };

  // Trigger bind modal
  const openBindModal = (item: InsumoCatalogo) => {
    setSelectedInsumoForBind(item);
    
    const quotes = item.cotacoesFornecedores || [];
    if (quotes.length > 0) {
      // Find cheapest active quote
      const cheapest = [...quotes].sort((a, b) => a.precoUnitario - b.precoUnitario)[0];
      setBindPrecoUnitario(cheapest.precoUnitario.toString());
      setBindFornecedorId(cheapest.fornecedorId);
    } else {
      setBindPrecoUnitario(item.precoReferencia.toString());
      setBindFornecedorId(item.fornecedorPadraoId || '');
    }
    
    setBindQuantidade('10');
    
    // Auto map category
    if (item.categoria === 'Material') setBindCategoriaCusto('Materiais');
    else if (item.categoria === 'Mão de Obra') setBindCategoriaCusto('Mão de Obra');
    else if (item.categoria === 'Equipamento') setBindCategoriaCusto('Equipamentos');
    else if (item.categoria === 'Serviço') setBindCategoriaCusto('Terceiros');
    else setBindCategoriaCusto('Administração');

    setShowBindModal(true);
  };

  // Submit Bind to project budget
  const handleBindToProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInsumoForBind || !bindProjetoId || !bindQuantidade || !bindPrecoUnitario) return;

    const qty = parseFloat(bindQuantidade);
    const price = parseFloat(bindPrecoUnitario);

    if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
      toast.error('Quantidade e preço devem ser maiores que zero.');
      return;
    }

    setIsSaving(true);

    setTimeout(() => {
      // Add supplier tag/info in description if a supplier was selected
      const supplierObj = fornecedores.find(f => f.id === bindFornecedorId);
      const supplierSuffix = supplierObj ? ` via ${supplierObj.empresa}` : '';

      const budgetItem: ItemOrcamento = {
        id: `orc-item-${Date.now()}`,
        projetoId: bindProjetoId,
        categoria: bindCategoriaCusto,
        descricao: `${selectedInsumoForBind.descricao} (${qty} ${selectedInsumoForBind.unidade})${supplierSuffix}`,
        valorOrcado: qty * price,
        valorContratado: qty * price,
        valorExecutado: 0,
        fornecedorId: bindFornecedorId || undefined
      };

      onAddOrcamentoItem(budgetItem);
      setIsSaving(false);
      setShowBindModal(false);
      
      const targetProj = projetos.find(p => p.id === bindProjetoId);
      toast.success(
        'Item vinculado ao orçamento!',
        `Adicionado R$ ${(qty * price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em "${targetProj?.nome}"`
      );
    }, 600);
  };

  // Draw simple elegant inline historical price chart
  const renderSimpleChart = (item: InsumoCatalogo) => {
    const history = item.historicoPrecos || [];
    if (history.length < 2) {
      return (
        <div className="h-16 flex items-center justify-center bg-slate-50 border border-slate-100 rounded text-[10px] text-slate-400 font-medium">
          Nenhuma variação histórica registrada.
        </div>
      );
    }

    const prices = history.map(h => h.preco);
    const max = Math.max(...prices);
    const min = Math.min(...prices);
    const diff = max - min === 0 ? 1 : max - min;

    // Draw lines inside SVG
    const width = 300;
    const height = 60;
    const points = history.map((h, i) => {
      const x = (i / (history.length - 1)) * (width - 40) + 20;
      const y = height - 10 - ((h.preco - min) / diff) * (height - 20);
      return { x, y, ...h };
    });

    const pathD = points.reduce((acc, p, i) => {
      return acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
    }, '');

    return (
      <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 space-y-1.5 text-left">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Histórico de Preço</span>
          <span className="text-[9px] font-mono font-semibold text-blue-600">
            Min: R$ {min.toFixed(2)} | Max: R$ {max.toFixed(2)}
          </span>
        </div>
        <div className="relative">
          <svg className="w-full h-16 overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            {/* Draw Path */}
            <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            
            {/* Draw Dots and Labels */}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="3" fill="#2563eb" className="hover:scale-150 transition" />
                <text x={p.x} y={p.y - 6} fill="#1e293b" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  R${p.preco.toFixed(0)}
                </text>
                <text x={p.x} y={height - 2} fill="#94a3b8" fontSize="7" fontFamily="sans-serif" textAnchor="middle">
                  {new Date(p.data).toLocaleDateString('pt-BR', { month: 'short' })}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div id="catalogo-tab-root" className="space-y-5 text-left flex flex-col xl:flex-row items-stretch min-h-[calc(100vh-140px)]">
      
      {/* SIDEBAR: Filters & Stats */}
      <div id="catalogo-sidebar" className="w-full xl:w-64 shrink-0 flex flex-col gap-4 self-start">
        
        {/* Quick Database Stat */}
        <div id="db-stats-card" className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs text-left space-y-3">
          <div className="flex items-center gap-2 text-slate-900 font-extrabold text-xs">
            <Database size={16} className="text-blue-600" />
            <span>Banco de Custos Global</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="text-[10px] text-slate-400 font-bold block">SINAPI</span>
              <p className="text-lg font-extrabold text-slate-800 font-mono">{catalogo.filter(i => i.tipo === 'SINAPI').length}</p>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="text-[10px] text-slate-400 font-bold block">Próprios</span>
              <p className="text-lg font-extrabold text-slate-800 font-mono">{catalogo.filter(i => i.tipo === 'Proprio').length}</p>
            </div>
          </div>
          
          <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
            Reutilize itens homologados e a tabela oficial SINAPI para orçar obras em poucos cliques sem redigitação de insumos.
          </p>
        </div>

        {/* Filter Categories */}
        <div id="catalogo-categories-card" className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs text-left">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block px-2 mb-2">Filtros de Categoria</span>
          <div className="space-y-0.5">
            <button
              onClick={() => setSelectedCategoria('Todas')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg transition ${
                selectedCategoria === 'Todas'
                  ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers size={14} />
                <span>Todas Categorias</span>
              </div>
              <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {catalogo.length}
              </span>
            </button>

            {['Material', 'Mão de Obra', 'Equipamento', 'Serviço', 'Taxa'].map(cat => {
              const count = catalogo.filter(i => i.categoria === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategoria(cat)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg transition ${
                    selectedCategoria === cat
                      ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(cat as any)}
                    <span>{cat}s</span>
                  </div>
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div id="catalogo-main-container" className="flex-1 space-y-4">
        
        {/* UPPER ACTION BAR */}
        <div id="catalogo-action-bar" className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-left">
          
          {/* Search bar */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="Buscar por descrição ou código SINAPI..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200/70 rounded-lg text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
            />
          </div>

          {/* Type filters & add action */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
            
            {/* Origin Type select */}
            <select
              value={selectedTipo}
              onChange={(e) => setSelectedTipo(e.target.value)}
              className="border border-slate-200/70 rounded-lg py-1.5 px-2.5 text-xs outline-none bg-white text-slate-600 font-semibold cursor-pointer"
            >
              <option value="Todos">Todas as Origens</option>
              <option value="SINAPI">Tabela SINAPI Oficial</option>
              <option value="Proprio">Itens Próprios</option>
            </select>

            {/* Status select (Active / Inactive) */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="border border-slate-200/70 rounded-lg py-1.5 px-2.5 text-xs outline-none bg-white text-slate-600 font-semibold cursor-pointer"
            >
              <option value="Ativos">Apenas Ativos</option>
              <option value="Todos">Mostrar Todos</option>
            </select>

            {/* Create Button */}
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm active:scale-95"
            >
              <Plus size={14} />
              <span>Novo Insumo</span>
            </button>
          </div>
        </div>

        {/* ITEMS CARDS GRID */}
        <div id="catalogo-content-wrapper" className="flex-1">
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 p-8 shadow-xs text-center">
              <EmptyState 
                icon={Database}
                title="Nenhum insumo encontrado"
                description="Não há itens correspondentes aos filtros selecionados. Crie um novo item do catálogo próprio!"
                actionLabel="Cadastrar Novo Insumo"
                onAction={() => setShowAddModal(true)}
              />
            </div>
          ) : (
            <div id="catalogo-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredItems.map((item, index) => {
                const isSinapi = item.tipo === 'SINAPI';
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
                    className={`bg-white p-4 rounded-xl border shadow-xs hover:shadow hover:border-blue-200 transition cursor-pointer flex flex-col justify-between relative h-40 ${
                      !item.ativo ? 'opacity-60 bg-slate-50' : 'border-slate-150/70'
                    }`}
                    onClick={() => setSelectedDetailInsumo(item)}
                  >
                    <div>
                      {/* Badge category & Type */}
                      <div className="flex justify-between items-start gap-1">
                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 border rounded-full flex items-center gap-1 ${getCategoryColor(item.categoria)}`}>
                          {getCategoryIcon(item.categoria)}
                          {item.categoria}
                        </span>
                        
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          isSinapi ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {isSinapi ? `SINAPI #${item.codigoSINAPI}` : 'PRÓPRIO'}
                        </span>
                      </div>

                      {/* Info body */}
                      <div className="mt-3 text-left">
                        <h4 className="font-extrabold text-xs text-slate-900 leading-snug hover:text-blue-600 line-clamp-2" title={item.descricao}>
                          {item.descricao}
                        </h4>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-slate-400 font-bold block">
                            Unidade: <span className="text-slate-600 font-mono font-bold uppercase">{item.unidade}</span>
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-[10px] text-slate-400 font-bold block">
                            Forn: <span className="text-slate-600 truncate max-w-[100px] inline-block align-bottom">{getFornecedorName(item.fornecedorPadraoId)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom strip price */}
                    <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                      <div className="text-left">
                        <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wide">Preço Ref</span>
                        <span className="text-sm font-extrabold text-slate-900 font-mono">
                          R$ {item.precoReferencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openBindModal(item)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 font-extrabold text-[10px] px-2 py-1 rounded-md transition flex items-center gap-1"
                          title="Vincular Orçamento Obra"
                        >
                          <Briefcase size={11} />
                          <span>Vincular</span>
                        </button>

                        <button
                          onClick={() => handleToggleActive(item)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition"
                          title={item.ativo ? 'Desativar Insumo' : 'Ativar Insumo'}
                        >
                          {item.ativo ? <ToggleRight size={18} className="text-blue-600" /> : <ToggleLeft size={18} className="text-slate-400" />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* DETAIL DRAWER / SLIDE OVER */}
      <AnimatePresence>
        {selectedDetailInsumo && (
          <div id="catalogo-detail-drawer" className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDetailInsumo(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="relative w-full max-w-md bg-white h-screen shadow-2xl border-l border-slate-100 flex flex-col justify-between"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-left">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                    {getCategoryIcon(selectedDetailInsumo.categoria)}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-950 text-xs truncate max-w-[220px]">{selectedDetailInsumo.descricao}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{selectedDetailInsumo.categoria}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedDetailInsumo(null)}
                  className="w-7 h-7 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-500 font-bold transition text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
                {/* Visual statistics */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Metadados Técnicos</span>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Unidade de Medida</span>
                      <p className="font-extrabold text-slate-800 font-mono mt-0.5 uppercase">{selectedDetailInsumo.unidade}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Preço de Referência</span>
                      <p className="font-extrabold text-slate-800 font-mono mt-0.5">
                        R$ {selectedDetailInsumo.precoReferencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Origem do Custo</span>
                      <p className="font-bold text-slate-800 mt-0.5">
                        {selectedDetailInsumo.tipo === 'SINAPI' ? 'SINAPI Oficial' : 'Insumo Próprio Construtora'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Última Atualização</span>
                      <p className="font-bold text-slate-600 mt-0.5 flex items-center gap-1">
                        <Calendar size={11} />
                        {new Date(selectedDetailInsumo.dataAtualizacaoPreco).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Composição / Aplicação */}
                {selectedDetailInsumo.composicao && (
                  <div className="space-y-1 bg-blue-50/20 p-3 rounded-lg border border-blue-50">
                    <span className="text-[10px] font-bold text-blue-800 block uppercase tracking-wide">Composição / Descrição Detalhada</span>
                    <p className="text-xs text-slate-650 leading-relaxed italic">
                      "{selectedDetailInsumo.composicao}"
                    </p>
                  </div>
                )}

                {selectedDetailInsumo.aplicacao && (
                  <div className="space-y-1 bg-amber-50/20 p-3 rounded-lg border border-amber-50">
                    <span className="text-[10px] font-bold text-amber-800 block uppercase tracking-wide">Aplicações Recomendadas</span>
                    <p className="text-xs text-slate-650 leading-relaxed">
                      {selectedDetailInsumo.aplicacao}
                    </p>
                  </div>
                )}

                {/* Draw Price history line chart */}
                <div className="space-y-2">
                  {renderSimpleChart(selectedDetailInsumo)}
                </div>

                {/* Supplier Quotes Panel */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mapa de Cotações</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddCotacaoForm(!showAddCotacaoForm);
                        setNewCotFornecedorId(fornecedores[0]?.id || '');
                        setNewCotPreco('');
                        setNewCotPrazo('');
                        setNewCotObs('');
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1"
                    >
                      {showAddCotacaoForm ? 'Cancelar' : '+ Nova Cotação'}
                    </button>
                  </div>

                  {/* Add New Quote inline Form */}
                  {showAddCotacaoForm && (
                    <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2.5 text-xs">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Registrar Nova Cotação</span>
                      
                      <div className="space-y-1">
                        <label className="text-[9px] font-semibold text-slate-500">Fornecedor</label>
                        <select
                          value={newCotFornecedorId}
                          onChange={(e) => setNewCotFornecedorId(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none"
                        >
                          {fornecedores.map(f => (
                            <option key={f.id} value={f.id}>{f.empresa} ({f.categoria})</option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-semibold text-slate-500">Preço Unitário (R$)</label>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            required
                            placeholder="0.00"
                            value={newCotPreco}
                            onChange={(e) => setNewCotPreco(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none font-mono font-bold"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-semibold text-slate-500">Prazo Entrega (dias)</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Ex: 3"
                            value={newCotPrazo}
                            onChange={(e) => setNewCotPrazo(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-semibold text-slate-500">Observações / Condição Comercial</label>
                        <input
                          type="text"
                          placeholder="Ex: Preço especial lote mínimo"
                          value={newCotObs}
                          onChange={(e) => setNewCotObs(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (!newCotPreco || !newCotFornecedorId) {
                            toast.error('Preencha pelo menos o Fornecedor e o Preço Unitário.');
                            return;
                          }
                          const preco = parseFloat(newCotPreco);
                          if (isNaN(preco) || preco <= 0) {
                            toast.error('O preço unitário deve ser maior que zero.');
                            return;
                          }

                          const newQuote: CotacaoFornecedor = {
                            id: crypto.randomUUID(),
                            fornecedorId: newCotFornecedorId,
                            precoUnitario: preco,
                            dataCotacao: new Date().toISOString().split('T')[0],
                            prazoEntregaDias: newCotPrazo ? parseInt(newCotPrazo) : undefined,
                            observacao: newCotObs || undefined
                          };

                          // Keep full quote history in the backend (fix #5); the
                          // detail panel here only needs to show the latest per
                          // supplier, so we still replace client-side for display.
                          const existingQuotes = selectedDetailInsumo.cotacoesFornecedores || [];
                          const updatedQuotes = [
                            ...existingQuotes.filter(q => q.fornecedorId !== newCotFornecedorId),
                            newQuote
                          ];

                          const updatedInsumo = {
                            ...selectedDetailInsumo,
                            cotacoesFornecedores: updatedQuotes,
                          };

                          onAddCotacao(selectedDetailInsumo.id, newQuote);
                          setSelectedDetailInsumo(updatedInsumo);
                          setShowAddCotacaoForm(false);
                          toast.success('Cotação do fornecedor registrada com sucesso.');
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 rounded text-xs transition"
                      >
                        Salvar Cotação
                      </button>
                    </div>
                  )}

                  {/* List of quotes */}
                  <div className="space-y-2">
                    {/* Reference Price from SINAPI / Catalog */}
                    <div className="p-2.5 bg-white border border-slate-150 rounded-lg flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[8px] text-slate-400 font-bold block uppercase tracking-wider">Preço Base SINAPI / Catálogo</span>
                        <p className="font-bold text-slate-800">Referência Nacional</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-800">R$ {selectedDetailInsumo.precoReferencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <span className="text-[8px] text-slate-400 block">{selectedDetailInsumo.unidade}</span>
                      </div>
                    </div>

                    {(!selectedDetailInsumo.cotacoesFornecedores || selectedDetailInsumo.cotacoesFornecedores.length === 0) ? (
                      <div className="p-4 text-center border border-dashed border-slate-200 rounded-lg text-[10px] text-slate-400">
                        Nenhuma cotação de fornecedor registrada para este insumo.
                        Clique em "+ Nova Cotação" para cotar preços.
                      </div>
                    ) : (
                      (() => {
                        const quotes = selectedDetailInsumo.cotacoesFornecedores || [];
                        const minPrice = Math.min(...quotes.map(q => q.precoUnitario));
                        
                        return quotes.map((q, idx) => {
                          const isCheapest = q.precoUnitario === minPrice;
                          const forn = fornecedores.find(f => f.id === q.fornecedorId);
                          
                          return (
                            <div key={idx} className={`p-2.5 bg-white border rounded-lg flex items-center justify-between text-xs transition-all ${isCheapest ? 'border-emerald-200 shadow-2xs bg-emerald-50/10' : 'border-slate-150'}`}>
                              <div className="space-y-0.5 text-left pr-2 truncate">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-slate-800 truncate">{forn ? forn.empresa : 'Fornecedor desconhecido'}</span>
                                  {isCheapest && (
                                    <span className="bg-emerald-50 text-emerald-700 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border border-emerald-100 flex items-center gap-0.5 shrink-0">
                                      ★ Menor Preço
                                    </span>
                                  )}
                                </div>
                                <div className="text-[9px] text-slate-400 font-medium space-x-2">
                                  <span>Prazo: {q.prazoEntregaDias !== undefined ? `${q.prazoEntregaDias}d` : 'Sob consulta'}</span>
                                  <span>•</span>
                                  <span>Cotado: {new Date(q.dataCotacao).toLocaleDateString('pt-BR')}</span>
                                </div>
                                {q.observacao && (
                                  <p className="text-[9px] text-slate-500 italic mt-0.5">"{q.observacao}"</p>
                                )}
                              </div>
                              
                              <div className="text-right shrink-0 flex items-center gap-2">
                                <div>
                                  <span className={`font-mono font-extrabold block ${isCheapest ? 'text-emerald-600' : 'text-slate-800'}`}>
                                    R$ {q.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[8px] text-slate-400 block">por {selectedDetailInsumo.unidade}</span>
                                </div>
                                
                                <button
                                  type="button"
                                  onClick={() => {
                                    confirm({
                                      title: 'Remover Cotação',
                                      message: `Excluir a cotação de R$ ${q.precoUnitario.toFixed(2)} do fornecedor "${forn?.empresa}"?`,
                                      onConfirm: () => {
                                        const updatedQuotes = quotes.filter(itemQuote => itemQuote.fornecedorId !== q.fornecedorId);
                                        const updatedInsumo = {
                                          ...selectedDetailInsumo,
                                          cotacoesFornecedores: updatedQuotes
                                        };
                                        if (q.id) onRemoveCotacao(q.id);
                                        setSelectedDetailInsumo(updatedInsumo);
                                        toast.success('Cotação removida.');
                                      }
                                    });
                                  }}
                                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-rose-600 rounded transition"
                                  title="Remover Cotação"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2.5">
                <button
                  onClick={() => {
                    setSelectedDetailInsumo(null);
                    openBindModal(selectedDetailInsumo);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  <Briefcase size={13} />
                  <span>Vincular a Obra</span>
                </button>
                <button
                  onClick={() => {
                    confirm({
                      title: 'Remover Insumo',
                      message: `Tem certeza que deseja remover "${selectedDetailInsumo.descricao}" do catálogo global de insumos?`,
                      onConfirm: () => {
                        onDeleteCatalogoItem(selectedDetailInsumo.id);
                        setSelectedDetailInsumo(null);
                        toast.success('Insumo removido do catálogo.');
                      }
                    });
                  }}
                  className="bg-rose-50 border border-rose-100 hover:bg-rose-100 active:scale-95 text-rose-700 font-bold px-3 rounded-lg text-xs flex items-center gap-1.5 transition"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QUICK BIND MODAL OVERLAY */}
      <AnimatePresence>
        {showBindModal && selectedInsumoForBind && (
          <div id="bind-insumo-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBindModal(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200"
            >
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Briefcase size={16} className="text-blue-600" />
                  <span>Vincular ao Orçamento da Obra</span>
                </h3>
                <button 
                  onClick={() => setShowBindModal(false)}
                  className="w-6 h-6 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 font-bold flex items-center justify-center transition text-xs"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleBindToProject} className="p-4 space-y-4 text-left">
                {/* Brief info */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Insumo Selecionado</span>
                  <p className="font-extrabold text-slate-800 mt-1">{selectedInsumoForBind.descricao}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Preço referência: R$ {selectedInsumoForBind.precoReferencia.toFixed(2)} / {selectedInsumoForBind.unidade}</p>
                </div>

                {/* Choose project */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Obra de Destino</label>
                  <select
                    value={bindProjetoId}
                    onChange={(e) => setBindProjetoId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
                    required
                  >
                    {projetos.map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>

                {/* Choose Supplier / Quote */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Fornecedor / Cotação Comercial</label>
                  <select
                    value={bindFornecedorId}
                    onChange={(e) => {
                      const selectedFornId = e.target.value;
                      setBindFornecedorId(selectedFornId);
                      
                      // Auto-fill price with the selected supplier's quote if exists!
                      const quote = selectedInsumoForBind.cotacoesFornecedores?.find(q => q.fornecedorId === selectedFornId);
                      if (quote) {
                        setBindPrecoUnitario(quote.precoUnitario.toString());
                      } else {
                        // Reset to default reference price
                        setBindPrecoUnitario(selectedInsumoForBind.precoReferencia.toString());
                      }
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
                  >
                    <option value="">Preço de Referência Global: R$ {selectedInsumoForBind.precoReferencia.toFixed(2)} (Sem fornecedor)</option>
                    {fornecedores.map(f => {
                      const quote = selectedInsumoForBind.cotacoesFornecedores?.find(q => q.fornecedorId === f.id);
                      return (
                        <option key={f.id} value={f.id}>
                          {f.empresa} {quote ? `(R$ ${quote.precoUnitario.toFixed(2)} - Cotação Ativa)` : '(Sem cotação cadastrada - usará Preço de Referência)'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Active Quotes Comparison inside Bind Modal */}
                {selectedInsumoForBind.cotacoesFornecedores && selectedInsumoForBind.cotacoesFornecedores.length > 0 && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-150 text-[11px] space-y-1.5 text-left">
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider block">Cotações Disponíveis para este Item</span>
                    <div className="space-y-1.5">
                      {selectedInsumoForBind.cotacoesFornecedores.map(q => {
                        const fObj = fornecedores.find(f => f.id === q.fornecedorId);
                        const isCheapest = q.precoUnitario === Math.min(...(selectedInsumoForBind.cotacoesFornecedores || []).map(itemQuote => itemQuote.precoUnitario));
                        return (
                          <div key={q.fornecedorId} className="flex justify-between items-center text-xs">
                            <span className="text-slate-600 font-medium flex items-center gap-1 truncate max-w-[200px]">
                              {isCheapest && <span className="text-emerald-600 font-extrabold text-[10px]">★</span>}
                              {fObj?.empresa || 'Desconhecido'}
                            </span>
                            <span className={`font-mono font-bold ${isCheapest ? 'text-emerald-600' : 'text-slate-700'}`}>
                              R$ {q.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {isCheapest && '(Menor!)'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {/* Quantity */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Quantidade ({selectedInsumoForBind.unidade})</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      placeholder="10"
                      value={bindQuantidade}
                      onChange={(e) => setBindQuantidade(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
                    />
                  </div>

                  {/* Negociated Price */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Preço Unitário (R$)</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      placeholder="29.00"
                      value={bindPrecoUnitario}
                      onChange={(e) => setBindPrecoUnitario(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
                    />
                  </div>
                </div>

                {/* Category in the budget */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase font-sans">Categoria no Orçamento</label>
                  <select
                    value={bindCategoriaCusto}
                    onChange={(e) => setBindCategoriaCusto(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
                  >
                    <option value="Materiais">Materiais</option>
                    <option value="Mão de Obra">Mão de Obra</option>
                    <option value="Equipamentos">Equipamentos</option>
                    <option value="Terceiros">Terceiros (Serviços Terceirizados)</option>
                    <option value="Deslocamentos">Deslocamentos</option>
                    <option value="Administração">Administração</option>
                    <option value="Contingências">Reserva de Contingências</option>
                  </select>
                </div>

                {/* Subtotal Calculation */}
                <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex justify-between items-center text-xs">
                  <span className="font-bold text-blue-800 uppercase">Valor Total Estimado</span>
                  <span className="font-mono font-extrabold text-blue-900 text-sm">
                    R$ {((parseFloat(bindQuantidade) || 0) * (parseFloat(bindPrecoUnitario) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Form buttons */}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowBindModal(false)}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2 px-4 rounded-lg text-xs transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition flex items-center gap-1.5"
                  >
                    {isSaving ? <Spinner size={12} /> : <FileCheck2 size={13} />}
                    <span>Vincular Orçamento</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATE NEW ITEM MODAL OVERLAY */}
      <AnimatePresence>
        {showAddModal && (
          <div id="add-insumo-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200"
            >
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <PlusCircle size={16} className="text-blue-600" />
                  <span>Cadastrar Novo Insumo no Catálogo</span>
                </h3>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="w-6 h-6 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 font-bold flex items-center justify-center transition text-xs"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateInsumo} className="p-4 space-y-3.5 text-left overflow-y-auto max-h-[80vh]">
                <div className="grid grid-cols-2 gap-3">
                  {/* Origin */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Origem do Custo</label>
                    <select
                      value={formTipo}
                      onChange={(e) => setFormTipo(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
                    >
                      <option value="Proprio">Item Próprio (Customizado)</option>
                      <option value="SINAPI">Tabela Oficial SINAPI</option>
                    </select>
                  </div>

                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Categoria</label>
                    <select
                      value={formCategoria}
                      onChange={(e) => setFormCategoria(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
                    >
                      <option value="Material">Material</option>
                      <option value="Mão de Obra">Mão de Obra</option>
                      <option value="Equipamento">Equipamento</option>
                      <option value="Serviço">Serviço</option>
                      <option value="Taxa">Taxa</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Descrição do Insumo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Cimento CP-II Itaú, Areia lavada, Cabos elétricos 2.5mm²"
                    value={formDescricao}
                    onChange={(e) => setFormDescricao(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {/* SINAPI Code (Conditional) */}
                  <div className={`space-y-1 col-span-1 ${formTipo !== 'SINAPI' && 'opacity-40'}`}>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Cód. SINAPI</label>
                    <input
                      type="text"
                      disabled={formTipo !== 'SINAPI'}
                      placeholder="Ex: 462230"
                      value={formCodigoSINAPI}
                      onChange={(e) => setFormCodigoSINAPI(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 font-mono font-bold"
                    />
                  </div>

                  {/* Unit */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Unidade *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: saco, m², m³, kg, h, un"
                      value={formUnidade}
                      onChange={(e) => setFormUnidade(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium uppercase font-mono"
                    />
                  </div>

                  {/* Reference Price */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Preço Ref (R$) *</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      placeholder="29.00"
                      value={formPrecoRef}
                      onChange={(e) => setFormPrecoRef(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
                    />
                  </div>
                </div>

                {/* Default supplier */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Fornecedor Recomendado</label>
                  <select
                    value={formFornecedorPadrao}
                    onChange={(e) => setFormFornecedorPadrao(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
                  >
                    <option value="">Nenhum fornecedor padrão</option>
                    {fornecedores.map(f => (
                      <option key={f.id} value={f.id}>{f.empresa} ({f.categoria})</option>
                    ))}
                  </select>
                </div>

                {/* Detail Technical specs */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Composição Técnica / Ficha Comercial</label>
                  <textarea
                    rows={2}
                    placeholder="Especifique características como marca preferencial, aditivos químicos, etc..."
                    value={formComposicao}
                    onChange={(e) => setFormComposicao(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 placeholder-slate-400"
                  />
                </div>

                {/* Applications */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Aplicações e Usabilidade Recomendadas</label>
                  <input
                    type="text"
                    placeholder="Ex: Assentamento de blocos de vedação, pintura acrílica fosca, etc..."
                    value={formAplicacao}
                    onChange={(e) => setFormAplicacao(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 placeholder-slate-400"
                  />
                </div>

                {/* Buttons */}
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2 px-4 rounded-lg text-xs transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg text-xs transition"
                  >
                    Cadastrar Insumo
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
