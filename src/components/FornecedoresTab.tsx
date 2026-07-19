import React, { useState } from 'react';
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
  FileText
} from 'lucide-react';
import { Fornecedor, CompraFornecedor, CategoriaFornecedor } from '../types';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

interface FornecedoresTabProps {
  fornecedores: Fornecedor[];
  onAddFornecedor: (forn: Fornecedor) => void;
  onDeleteFornecedor: (id: string) => void;
  onAddCompra: (fornId: string, compra: CompraFornecedor) => void;
  onTogglePago: (fornId: string, compraId: string) => void;
}

export default function FornecedoresTab({
  fornecedores,
  onAddFornecedor,
  onDeleteFornecedor,
  onAddCompra,
  onTogglePago
}: FornecedoresTabProps) {
  const { toast, confirm } = useFeedback();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('Todas');
  const [selectedFornecedor, setSelectedFornecedor] = useState<Fornecedor | null>(fornecedores[0] || null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);

  // New Supplier Form State
  const [formEmpresa, setFormEmpresa] = useState('');
  const [formCnpj, setFormCnpj] = useState('');
  const [formContato, setFormContato] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCategoria, setFormCategoria] = useState<CategoriaFornecedor>('Material');
  const [formAvaliacao, setFormAvaliacao] = useState(5);
  const [formDocs, setFormDocs] = useState<string[]>([]);
  const [newDocName, setNewDocName] = useState('');

  // New Purchase Form State
  const [purchaseItem, setPurchaseItem] = useState('');
  const [purchaseValor, setPurchaseValor] = useState('');
  const [purchasePago, setPurchasePago] = useState(false);

  // Filter
  const filteredFornecedores = fornecedores.filter(f => {
    const matchesSearch = 
      f.empresa.toLowerCase().includes(search.toLowerCase()) ||
      f.cnpj.includes(search) ||
      f.contato.toLowerCase().includes(search.toLowerCase());
    
    const matchesCat = categoryFilter === 'Todas' || f.categoria === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleAddDoc = () => {
    if (newDocName.trim()) {
      setFormDocs([...formDocs, newDocName.trim()]);
      setNewDocName('');
    }
  };

  const handleRemoveFormDoc = (index: number) => {
    setFormDocs(formDocs.filter((_, i) => i !== index));
  };

  const handleCreateFornecedor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmpresa || !formCnpj || !formEmail) {
      toast.error("Por favor, preencha os campos obrigatórios: Empresa, CNPJ e E-mail.");
      return;
    }

    setIsSaving(true);

    setTimeout(() => {
      const newForn: Fornecedor = {
        id: crypto.randomUUID(),
        empresa: formEmpresa,
        cnpj: formCnpj,
        contato: formContato,
        telefone: formTelefone,
        email: formEmail,
        categoria: formCategoria,
        documentos: formDocs,
        avaliacao: formAvaliacao,
        historicoCompras: []
      };

      onAddFornecedor(newForn);
      setSelectedFornecedor(newForn);
      setIsSaving(false);
      setShowAddModal(false);
      toast.success("Fornecedor homologado com sucesso.", `A empresa ${newForn.empresa} foi adicionada.`);

      // Reset
      setFormEmpresa('');
      setFormCnpj('');
      setFormContato('');
      setFormTelefone('');
      setFormEmail('');
      setFormCategoria('Material');
      setFormAvaliacao(5);
      setFormDocs([]);
    }, 600);
  };

  const handleCreatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFornecedor || !purchaseItem || !purchaseValor) {
      toast.error("Por favor, preencha a descrição do item e o valor.");
      return;
    }

    setIsSavingPurchase(true);

    setTimeout(() => {
      const newCompra: CompraFornecedor = {
        id: crypto.randomUUID(),
        data: new Date().toISOString().split('T')[0],
        item: purchaseItem,
        valor: parseFloat(purchaseValor),
        pago: purchasePago
      };

      onAddCompra(selectedFornecedor.id, newCompra);
      setIsSavingPurchase(false);
      setShowPurchaseModal(false);

      // Update locally selected context
      setSelectedFornecedor(prev => {
        if (!prev) return null;
        return {
          ...prev,
          historicoCompras: [newCompra, ...prev.historicoCompras]
        };
      });

      toast.success("Pedido de compra registrado.", `Lançamento de ${newCompra.item} faturado com sucesso.`);

      setPurchaseItem('');
      setPurchaseValor('');
      setPurchasePago(false);
    }, 600);
  };

  const handleLocalTogglePago = (compraId: string) => {
    if (!selectedFornecedor) return;
    onTogglePago(selectedFornecedor.id, compraId);

    setSelectedFornecedor(prev => {
      if (!prev) return null;
      return {
        ...prev,
        historicoCompras: prev.historicoCompras.map(c => 
          c.id === compraId ? { ...c, pago: !c.pago } : c
        )
      };
    });

    toast.info("Status de pagamento atualizado.");
  };

  return (
    <div id="fornecedores-tab-container" className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-120px)]">
      {/* Left list block */}
      <div id="fornecedores-list-col" className="lg:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        
        {/* Filter bar */}
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">Fornecedores</h3>
            <button
              id="add-fornecedor-btn"
              onClick={() => setShowAddModal(true)}
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
                placeholder="Buscar por empresa, CNPJ ou contato..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:border-blue-600 outline-none text-slate-800"
              />
            </div>
            <div>
              <select
                id="fornecedor-category-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full border border-slate-200 rounded p-1.5 text-xs outline-none text-slate-600 bg-white"
              >
                <option value="Todas">Categoria: Todas</option>
                <option value="Material">Material</option>
                <option value="Mão de Obra">Mão de Obra</option>
                <option value="Equipamentos">Equipamentos</option>
                <option value="Serviços Terceirizados">Serviços Terceirizados</option>
              </select>
            </div>
          </div>
        </div>

        {/* List scroll */}
        <div id="fornecedores-scroll-area" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredFornecedores.length === 0 ? (
            <div className="p-4">
              <EmptyState 
                icon={Truck}
                title="Nenhum fornecedor encontrado"
                description="Homologue fornecedores de materiais, equipamentos ou prestadores de serviço."
                actionLabel="Novo Fornecedor"
                onAction={() => setShowAddModal(true)}
              />
            </div>
          ) : (
            filteredFornecedores.map((forn, index) => {
              const isSelected = selectedFornecedor?.id === forn.id;
              
              const catColors = {
                'Material': 'bg-blue-50 text-blue-800 border-blue-200/50',
                'Mão de Obra': 'bg-emerald-50 text-emerald-800 border-emerald-200/50',
                'Equipamentos': 'bg-sky-50 text-sky-800 border-sky-200/50',
                'Serviços Terceirizados': 'bg-purple-50 text-purple-800 border-purple-200/50'
              };

              return (
                <motion.div
                  key={forn.id}
                  id={`fornecedor-item-${forn.id}`}
                  onClick={() => setSelectedFornecedor(forn)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                  className={`p-3 cursor-pointer transition text-left space-y-1.5 ${
                    isSelected ? 'bg-blue-50/40 border-l-4 border-blue-600 font-medium' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-xs text-slate-900 truncate max-w-[160px]">{forn.empresa}</h4>
                    <span className={`text-xs font-bold px-1.5 py-0.5 border rounded ${catColors[forn.categoria]}`}>
                      {forn.categoria}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <User size={12} className="text-slate-400 shrink-0" />
                      <span className="truncate">{forn.contato}</span>
                    </span>
                    <div className="flex gap-0.5 text-blue-600 shrink-0">
                      {Array.from({ length: forn.avaliacao }).map((_, i) => (
                        <Star key={i} size={11} fill="currentColor" />
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Supplier Details & Purchases */}
      <div id="fornecedor-detail-col" className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {selectedFornecedor ? (
          <div id="fornecedor-detail-view" className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
            
            {/* Header detail */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">ID: {selectedFornecedor.id}</span>
                  <span className="bg-blue-50 border border-blue-250 text-blue-800 text-xs font-bold px-2 py-0.5 rounded">
                    {selectedFornecedor.categoria}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-950 mt-1.5 flex items-center gap-2">
                  <Building2 size={18} className="text-slate-700" />
                  <span>{selectedFornecedor.empresa}</span>
                </h3>
                <div className="flex items-center gap-1.5 mt-1 text-xs">
                  <span className="text-slate-500 font-medium">Avaliação de Fornecimento:</span>
                  <div className="flex gap-0.5 text-blue-600">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star 
                        key={i} 
                        size={12} 
                        fill={i < selectedFornecedor.avaliacao ? 'currentColor' : 'none'} 
                        className={i < selectedFornecedor.avaliacao ? 'text-blue-600 shrink-0' : 'text-slate-300 shrink-0'} 
                      />
                    ))}
                  </div>
                </div>
              </div>

              <button
                id={`delete-fornecedor-btn-${selectedFornecedor.id}`}
                onClick={() => {
                  confirm({
                    title: 'Confirmar descredenciamento de fornecedor',
                    message: `Tem certeza de que deseja remover o fornecedor ${selectedFornecedor.empresa}? Todas as faturas serão removidas.`,
                    onConfirm: () => {
                      onDeleteFornecedor(selectedFornecedor.id);
                      setSelectedFornecedor(fornecedores.find(f => f.id !== selectedFornecedor.id) || null);
                      toast.success('Fornecedor descredenciado com sucesso.');
                    }
                  });
                }}
                className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition active:scale-95 shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* General contact data */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-left space-y-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Contato de Faturamento</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <User size={13} className="text-slate-400 shrink-0" />
                  <span className="font-semibold">{selectedFornecedor.contato}</span>
                </p>
                <p className="text-xs text-slate-500 font-mono">CNPJ: {selectedFornecedor.cnpj}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-left space-y-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Canais de Atendimento</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <Phone size={13} className="text-slate-400 shrink-0" />
                  <span className="font-medium">{selectedFornecedor.telefone}</span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2 truncate">
                  <Mail size={13} className="text-slate-400 shrink-0" />
                  <span className="font-medium">{selectedFornecedor.email}</span>
                </p>
              </div>
            </div>

            {/* Resumo Financeiro do Fornecedor */}
            {(() => {
              const totalGasto = selectedFornecedor.historicoCompras.reduce((sum, c) => sum + c.valor, 0);
              const totalComprasCount = selectedFornecedor.historicoCompras.length;
              const comprasPagasCount = selectedFornecedor.historicoCompras.filter(c => c.pago).length;
              const percentualAdimplemento = totalComprasCount > 0 ? (comprasPagasCount / totalComprasCount) * 100 : 100;

              return (
                <div className="grid grid-cols-2 gap-3 border-t border-b border-slate-150 py-3">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Faturado / Gasto</span>
                    <span className="text-sm font-bold text-slate-900 font-mono mt-0.5 block">
                      {totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Em {totalComprasCount} compras registradas</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Adimplemento Financeiro</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-sm font-bold text-slate-900 font-mono">
                        {percentualAdimplemento.toFixed(0)}%
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                        percentualAdimplemento >= 100 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        percentualAdimplemento >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {comprasPagasCount}/{totalComprasCount} quitados
                      </span>
                    </div>
                    {/* Tiny Progress bar */}
                    <div className="w-full bg-slate-250 h-1.5 rounded-full overflow-hidden mt-1.5 flex">
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
              );
            })()}

            {/* Document collection list */}
            <div className="space-y-2 text-left">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-emerald-600" />
                <span>Documentações Homologadas</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedFornecedor.documentos.length === 0 ? (
                  <p className="text-xs text-slate-400 pl-1">Nenhum documento anexado para validação técnica.</p>
                ) : (
                  selectedFornecedor.documentos.map((doc, i) => (
                    <div key={i} className="bg-slate-100 border border-slate-200 rounded px-2.5 py-1 text-xs font-mono text-slate-700 flex items-center gap-1.5 hover:bg-slate-200 transition">
                      <FileCheck size={12} className="text-emerald-600 shrink-0" />
                      <span>{doc}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Procurement and Payments Registry (Histórico de Compras) */}
            <div className="space-y-3 border-t border-slate-200 pt-4 text-left">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag size={15} className="text-slate-500" />
                  <span>Histórico de Pedidos e Pagamentos ({selectedFornecedor.historicoCompras.length})</span>
                </h4>
                <button
                  id="add-purchase-btn"
                  onClick={() => setShowPurchaseModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 text-xs rounded transition flex items-center gap-1 active:scale-95 shadow-sm"
                >
                  <Plus size={12} />
                  <span>Registrar Pedido</span>
                </button>
              </div>

              {selectedFornecedor.historicoCompras.length === 0 ? (
                <p className="text-xs text-slate-400 italic pl-1">Nenhum pedido faturado para este fornecedor.</p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 shadow-sm bg-white">
                  {selectedFornecedor.historicoCompras.map(compra => (
                    <div key={compra.id} className="p-2.5 flex justify-between items-center hover:bg-slate-50/50 transition">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-slate-400">
                            {new Date(compra.data).toLocaleDateString('pt-BR')}
                          </span>
                          <h5 className="font-semibold text-xs text-slate-800 truncate">{compra.item}</h5>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-mono">ID Compra: {compra.id}</p>
                      </div>
                      
                      <div className="flex items-center gap-3 ml-4 shrink-0">
                        <span className="text-xs font-bold font-mono text-slate-900">
                          {compra.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        
                        {/* Toggle Payment State Button */}
                        <button
                          id={`toggle-payment-btn-${compra.id}`}
                          onClick={() => handleLocalTogglePago(compra.id)}
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

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <Truck size={48} className="stroke-1 mb-2 animate-pulse" />
            <p className="text-xs">Selecione um fornecedor para visualizar as faturas.</p>
          </div>
        )}
      </div>

      {/* Add Fornecedor Modal Overlay */}
      <AnimatePresence>
        {showAddModal && (
          <div id="add-fornecedor-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSaving) setShowAddModal(false); }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">Cadastrar Fornecedor</h3>
                <button 
                  onClick={() => setShowAddModal(false)}
                  disabled={isSaving}
                  className="text-slate-400 hover:text-slate-600 font-bold transition disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleCreateFornecedor} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Razão Social / Empresa *</label>
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">CNPJ *</label>
                    <input
                      id="add-forn-cnpj"
                      type="text"
                      required
                      disabled={isSaving}
                      placeholder="00.000.000/0001-00"
                      value={formCnpj}
                      onChange={(e) => setFormCnpj(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none text-slate-800 disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Categoria Insumo *</label>
                    <select
                      id="add-forn-categoria"
                      disabled={isSaving}
                      value={formCategoria}
                      onChange={(e) => setFormCategoria(e.target.value as CategoriaFornecedor)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none bg-white text-slate-700 font-medium disabled:bg-slate-50"
                    >
                      <option value="Material">Material</option>
                      <option value="Mão de Obra">Mão de Obra</option>
                      <option value="Equipamentos">Equipamentos</option>
                      <option value="Serviços Terceirizados">Serviços Terceirizados</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nome Contato</label>
                    <input
                      id="add-forn-contato"
                      type="text"
                      disabled={isSaving}
                      placeholder="Ex: Representante Marcos"
                      value={formContato}
                      onChange={(e) => setFormContato(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Telefone</label>
                    <input
                      id="add-forn-tel"
                      type="text"
                      disabled={isSaving}
                      placeholder="(00) 00000-0000"
                      value={formTelefone}
                      onChange={(e) => setFormTelefone(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">E-mail Comercial *</label>
                  <input
                    id="add-forn-email"
                    type="email"
                    required
                    disabled={isSaving}
                    placeholder="vendas@empresa.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Avaliação Técnica de Entrada</label>
                  <select
                    id="add-forn-rating"
                    disabled={isSaving}
                    value={formAvaliacao}
                    onChange={(e) => setFormAvaliacao(parseInt(e.target.value))}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none bg-white text-slate-700 disabled:bg-slate-50"
                  >
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
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-add-fornecedor-btn"
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
                        <Building2 size={14} />
                        <span>Homologar Fornecedor</span>
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
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSavingPurchase) setShowPurchaseModal(false); }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
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
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
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
