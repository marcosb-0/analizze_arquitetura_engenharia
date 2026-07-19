import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Search, 
  Plus, 
  Calendar, 
  Clock, 
  DollarSign, 
  Printer, 
  Sparkles, 
  History,
  Trash2,
  AlertCircle,
  Eye
} from 'lucide-react';
import { Proposta, Cliente, RevisaoProposta } from '../types';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

interface PropostasTabProps {
  propostas: Proposta[];
  clientes: Cliente[];
  onAddProposta: (prop: Proposta) => void;
  onUpdateStatus: (id: string, status: Proposta['status']) => void | Promise<void>;
  onAddRevision: (id: string, rev: RevisaoProposta) => void;
  onConvertToProject: (prop: Proposta) => void;
}

export default function PropostasTab({
  propostas,
  clientes,
  onAddProposta,
  onUpdateStatus,
  onAddRevision,
  onConvertToProject
}: PropostasTabProps) {
  const { toast, confirm } = useFeedback();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todas');
  const [selectedProposta, setSelectedProposta] = useState<Proposta | null>(propostas[0] || null);
  
  // Modals / Overlays
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPdfOverlay, setShowPdfOverlay] = useState(false);
  const [showRevModal, setShowRevModal] = useState(false);
  
  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingRevision, setIsSavingRevision] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // New Proposal Form State
  const [formClienteId, setFormClienteId] = useState(clientes[0]?.id || '');
  const [formDescricao, setFormDescricao] = useState('');
  const [formValor, setFormValor] = useState('');
  const [formPrazo, setFormPrazo] = useState('');
  const [formValidade, setFormValidade] = useState('');

  // New Revision Form State
  const [revValor, setRevValor] = useState('');
  const [revAlteracoes, setRevAlteracoes] = useState('');

  // Version Comparison State
  const [compRevAId, setCompRevAId] = useState<number | ''>('');
  const [compRevBId, setCompRevBId] = useState<number | ''>('');

  // Filter
  const filteredPropostas = propostas.filter(p => {
    const cli = clientes.find(c => c.id === p.clienteId);
    const matchesSearch = 
      p.numero.toLowerCase().includes(search.toLowerCase()) ||
      p.descricao.toLowerCase().includes(search.toLowerCase()) ||
      (cli && cli.nome.toLowerCase().includes(search.toLowerCase()));
    
    const matchesStatus = statusFilter === 'Todas' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getClientName = (clientId: string) => {
    return clientes.find(c => c.id === clientId)?.nome || 'Cliente não encontrado';
  };

  const getClientObj = (clientId: string) => {
    return clientes.find(c => c.id === clientId);
  };

  const handleCreateProposta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClienteId || !formDescricao || !formValor || !formValidade) {
      toast.error("Por favor, preencha os campos obrigatórios: Cliente, Descrição, Valor e Data Limite.");
      return;
    }

    setIsSaving(true);

    setTimeout(() => {
      const year = new Date().getFullYear();
      const sequence = String(propostas.length + 1).padStart(3, '0');
      const newNum = `PROP-${year}-${sequence}`;

      const newProp: Proposta = {
        id: crypto.randomUUID(),
        numero: newNum,
        clienteId: formClienteId,
        descricao: formDescricao,
        valorEstimado: parseFloat(formValor),
        prazoExecucao: formPrazo || 'A definir',
        dataValidade: formValidade,
        status: 'Elaboração',
        revisoes: []
      };

      onAddProposta(newProp);
      setSelectedProposta(newProp);
      setIsSaving(false);
      setShowAddModal(false);
      toast.success("Proposta comercial criada.", `A proposta ${newProp.numero} está em elaboração.`);

      // Reset
      setFormDescricao('');
      setFormValor('');
      setFormPrazo('');
      setFormValidade('');
    }, 600);
  };

  const handleCreateRevision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposta || !revValor || !revAlteracoes) {
      toast.error("Preencha todos os campos da revisão.");
      return;
    }

    setIsSavingRevision(true);

    setTimeout(() => {
      const nextVersao = selectedProposta.revisoes.length + 1;
      const newRev: RevisaoProposta = {
        versao: nextVersao,
        data: new Date().toISOString().split('T')[0],
        valor: parseFloat(revValor),
        alteracoes: revAlteracoes
      };

      onAddRevision(selectedProposta.id, newRev);
      setIsSavingRevision(false);
      setShowRevModal(false);

      // Update selected proposal context
      setSelectedProposta(prev => {
        if (!prev) return null;
        return {
          ...prev,
          valorEstimado: parseFloat(revValor),
          revisoes: [...prev.revisoes, newRev]
        };
      });

      toast.success("Nova revisão homologada.", `A proposta passou para a versão v${nextVersao}.`);

      setRevValor('');
      setRevAlteracoes('');
    }, 600);
  };

  const handleGeneratePdf = () => {
    setIsGeneratingPdf(true);
    
    // Simulate generation loading state (Task 5)
    setTimeout(() => {
      setIsGeneratingPdf(false);
      setShowPdfOverlay(true);
      toast.success("PDF da proposta comercial estruturado.");
    }, 850);
  };

  const [proposalToApprove, setProposalToApprove] = useState<Proposta | null>(null);

  const handleStatusChange = (status: Proposta['status']) => {
    if (!selectedProposta) return;
    if (status === 'Aprovada') {
      setProposalToApprove(selectedProposta);
      return;
    }
    onUpdateStatus(selectedProposta.id, status);
    setSelectedProposta(prev => prev ? { ...prev, status } : null);
    toast.success(`Proposta atualizada para "${status}".`);
  };

  return (
    <div id="propostas-tab-container" className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-120px)]">
      {/* Left Column: Proposals List */}
      <div id="propostas-list-col" className="lg:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">Propostas de Orçamento</h3>
            <button
              id="add-proposta-btn"
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition shadow-sm active:scale-95"
            >
              <Plus size={14} />
              <span>Nova Proposta</span>
            </button>
          </div>

          {/* Filters Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="relative col-span-2">
              <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
              <input
                id="proposta-search-input"
                type="text"
                placeholder="Buscar por descrição, número ou cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:border-blue-600 outline-none text-slate-800"
              />
            </div>
            
            <div className="col-span-2">
              <select
                id="proposta-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full border border-slate-200 rounded p-1.5 text-xs outline-none text-slate-600 bg-white"
              >
                <option value="Todas">Status: Todos</option>
                <option value="Elaboração">Elaboração</option>
                <option value="Enviada">Enviada</option>
                <option value="Aprovada">Aprovada</option>
                <option value="Rejeitada">Rejeitada</option>
              </select>
            </div>
          </div>
        </div>

        {/* List scroll */}
        <div id="propostas-scroll-area" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredPropostas.length === 0 ? (
            <div className="p-4">
              <EmptyState 
                icon={FileText}
                title="Nenhuma proposta encontrada"
                description="Cadastre orçamentos comerciais para as obras de seus clientes."
                actionLabel="Nova Proposta"
                onAction={() => setShowAddModal(true)}
              />
            </div>
          ) : (
            filteredPropostas.map((prop, index) => {
              const isSelected = selectedProposta?.id === prop.id;
              const cliName = getClientName(prop.clienteId);
              
              const statusColors = {
                'Elaboração': 'bg-slate-100 text-slate-700',
                'Enviada': 'bg-sky-50 text-sky-700 border border-sky-200',
                'Aprovada': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                'Rejeitada': 'bg-rose-50 text-rose-700 border border-rose-200'
              };

              return (
                <motion.div
                  key={prop.id}
                  id={`proposta-item-${prop.id}`}
                  onClick={() => setSelectedProposta(prop)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                  className={`p-3 cursor-pointer transition text-left space-y-1.5 ${
                    isSelected ? 'bg-blue-50/40 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {prop.numero}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColors[prop.status]}`}>
                      {prop.status}
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 truncate">{prop.descricao}</h4>
                  <p className="text-xs text-slate-500 truncate">Cliente: {cliName}</p>
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                    <span className="text-xs text-slate-400 font-mono">Validade: {new Date(prop.dataValidade).toLocaleDateString('pt-BR')}</span>
                    <span className="font-mono text-xs font-bold text-slate-950">
                      {prop.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Detailed Context and Features */}
      <div id="proposta-detail-col" className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {selectedProposta ? (
          <div id="proposta-detail-view" className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
            
            {/* Upper Info Row */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div className="text-left">
                <span className="text-xs font-mono bg-blue-50 border border-blue-200 text-blue-800 font-bold px-2 py-0.5 rounded">
                  CÓDIGO: {selectedProposta.numero}
                </span>
                <h3 className="text-base font-bold text-slate-950 mt-1.5 leading-snug">{selectedProposta.descricao}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Cliente Solicitante: <strong className="text-slate-800">{getClientName(selectedProposta.clienteId)}</strong>
                </p>
              </div>

              {/* Status Action Buttons */}
              <div className="flex flex-col gap-1 items-end">
                <select
                  id="proposta-detail-status-select"
                  value={selectedProposta.status}
                  onChange={(e) => handleStatusChange(e.target.value as Proposta['status'])}
                  className="border border-slate-200 rounded p-1.5 text-xs outline-none text-slate-700 font-semibold bg-slate-50 hover:bg-slate-100 transition cursor-pointer"
                >
                  <option value="Elaboração">Status: Elaboração</option>
                  <option value="Enviada">Status: Enviada</option>
                  <option value="Aprovada">Status: Aprovada</option>
                  <option value="Rejeitada">Status: Rejeitada</option>
                </select>
                <span className="text-xs text-slate-400">Clique para alterar status</span>
              </div>
            </div>

            {/* Quick KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-left space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Investimento Estimado</span>
                <div className="flex items-center gap-1">
                  <DollarSign size={15} className="text-emerald-500" />
                  <span className="font-mono text-xs font-bold text-slate-950">
                    {selectedProposta.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-left space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Prazo de Execução</span>
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-800">{selectedProposta.prazoExecucao}</span>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-left space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Data Limite Validade</span>
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-800 font-mono">
                    {new Date(selectedProposta.dataValidade).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Conversion Trigger Section */}
            {selectedProposta.status === 'Aprovada' && (
              <div id="proposal-conversion-banner" className="p-3 bg-emerald-50/55 border border-emerald-200 rounded-lg flex flex-col md:flex-row justify-between items-center gap-3 text-left">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wide">
                    <Sparkles size={14} className="text-emerald-500" />
                    <span>Pronto para Conversão</span>
                  </h4>
                  <p className="text-xs text-emerald-700 leading-relaxed max-w-lg">
                    Esta proposta de orçamento foi aprovada pelo cliente. Com apenas 1 clique, gere o contrato e inicialize o projeto central correspondente com o escopo pré-definido.
                  </p>
                </div>
                <button
                  id={`convert-proposal-btn-${selectedProposta.id}`}
                  onClick={() => onConvertToProject(selectedProposta)}
                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition shadow-sm"
                >
                  <span>Gerar Obra</span>
                </button>
              </div>
            )}

            {/* Print & PDF Automation Drawer */}
            <div className="p-3 bg-slate-900 text-slate-100 rounded-lg flex items-center justify-between text-left shadow-md">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Printer size={14} className="text-blue-400" />
                  <span>Emissão de Proposta Técnica</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Gere o documento oficial formatado para impressão ou download em PDF para entrega ao cliente.
                </p>
              </div>
              <button
                id="generate-proposal-pdf-btn"
                disabled={isGeneratingPdf}
                onClick={handleGeneratePdf}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition shrink-0 disabled:opacity-50"
              >
                {isGeneratingPdf ? (
                  <>
                    <Spinner size={14} />
                    <span>Estruturando...</span>
                  </>
                ) : (
                  <>
                    <FileText size={13} />
                    <span>Gerar PDF</span>
                  </>
                )}
              </button>
            </div>

            {/* Revision History Section */}
            <div className="space-y-3.5 border-t border-slate-200 pt-4 text-left">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <History size={15} className="text-slate-500" />
                  <span>Histórico de Revisões ({selectedProposta.revisoes.length})</span>
                </h4>
                <button
                  id="add-revision-btn"
                  onClick={() => setShowRevModal(true)}
                  className="text-xs text-blue-600 font-bold hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded transition active:scale-95"
                >
                  + Nova Revisão
                </button>
              </div>

              {/* Comparison side-by-side tool */}
              {selectedProposta.revisoes.length >= 2 && (
                <div id="revisoes-comparison-widget" className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-left">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Comparador de Versões Lado a Lado</span>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Revisão Base (A)</label>
                      <select
                        value={compRevAId}
                        onChange={(e) => setCompRevAId(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full border border-slate-200 bg-white p-1.5 rounded text-xs outline-none font-medium text-slate-700 cursor-pointer"
                      >
                        <option value="">Selecione...</option>
                        {selectedProposta.revisoes.map(r => (
                          <option key={r.versao} value={r.versao}>Versão v{r.versao}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Revisão Comparada (B)</label>
                      <select
                        value={compRevBId}
                        onChange={(e) => setCompRevBId(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full border border-slate-200 bg-white p-1.5 rounded text-xs outline-none font-medium text-slate-700 cursor-pointer"
                      >
                        <option value="">Selecione...</option>
                        {selectedProposta.revisoes.map(r => (
                          <option key={r.versao} value={r.versao}>Versão v{r.versao}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(() => {
                    if (compRevAId === '' || compRevBId === '') return null;
                    if (compRevAId === compRevBId) {
                      return <p className="text-[10px] text-slate-400 italic">Selecione duas revisões diferentes para ver as diferenças.</p>;
                    }

                    const revA = selectedProposta.revisoes.find(r => r.versao === compRevAId);
                    const revB = selectedProposta.revisoes.find(r => r.versao === compRevBId);

                    if (!revA || !revB) return null;

                    const deltaVal = revB.valor - revA.valor;
                    const deltaPct = revA.valor > 0 ? (deltaVal / revA.valor) * 100 : 0;

                    return (
                      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shadow-xs">
                        <div className="grid grid-cols-2 gap-3 divide-x divide-slate-100">
                          {/* Rev A info */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Versão v{revA.versao}</span>
                            <p className="font-mono text-xs font-bold text-slate-800">
                              {revA.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono">Em: {new Date(revA.data).toLocaleDateString('pt-BR')}</p>
                            <p className="text-[10px] text-slate-600 italic mt-1 leading-relaxed">"{revA.alteracoes}"</p>
                          </div>

                          {/* Rev B info */}
                          <div className="pl-3 space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Versão v{revB.versao}</span>
                            <p className="font-mono text-xs font-bold text-slate-800">
                              {revB.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono">Em: {new Date(revB.data).toLocaleDateString('pt-BR')}</p>
                            <p className="text-[10px] text-slate-600 italic mt-1 leading-relaxed">"{revB.alteracoes}"</p>
                          </div>
                        </div>

                        {/* Comparativo de diferença */}
                        <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-600">Diferença Financeira:</span>
                          <div className="text-right">
                            <span className={`font-mono font-bold ${deltaVal >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {deltaVal >= 0 ? '+' : ''}{deltaVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                            <span className={`text-[10px] font-bold font-mono ml-1.5 px-1 rounded ${
                              deltaVal >= 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {deltaVal >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {selectedProposta.revisoes.length === 0 ? (
                <p className="text-xs text-slate-400 italic pl-1">Esta proposta de obra ainda está em sua versão de partida original.</p>
              ) : (
                <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                  {selectedProposta.revisoes.map((rev, index) => (
                    <div key={index} className="flex gap-3 relative">
                      <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center font-bold text-xs text-slate-500 shrink-0 z-10 shadow-sm">
                        v{rev.versao}
                      </div>
                      <div className="flex-1 bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs space-y-1">
                        <div className="flex justify-between items-center text-slate-500">
                          <span className="font-mono">Revisado em: {new Date(rev.data).toLocaleDateString('pt-BR')}</span>
                          <span className="font-mono font-bold text-slate-800">
                            {rev.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed italic">
                          " {rev.alteracoes} "
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <FileText size={48} className="stroke-1 mb-2 animate-pulse" />
            <p className="text-xs">Selecione uma proposta para visualizar as opções.</p>
          </div>
        )}
      </div>

      {/* PDF PRINT LAYOUT OVERLAY (MODAL) */}
      <AnimatePresence>
        {showPdfOverlay && selectedProposta && (
          <div id="pdf-print-overlay" className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-lg shadow-2xl w-full max-w-4xl flex flex-col h-[90vh]"
            >
              {/* Header toolbar */}
              <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <Printer size={18} className="text-blue-600" />
                  <h3 className="font-bold text-slate-800 text-sm">Visualização de Impressão Comercial</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    id="print-proposal-action-btn"
                    onClick={() => window.print()}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition active:scale-95"
                  >
                    <Printer size={12} />
                    <span>Imprimir</span>
                  </button>
                  <button
                    id="close-pdf-btn"
                    onClick={() => setShowPdfOverlay(false)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-3 py-1.5 rounded text-xs transition active:scale-95"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {/* Document body simulating technical print layout */}
              <div id="pdf-document-body" className="flex-1 p-10 bg-white overflow-y-auto font-sans text-slate-800 print:p-0">
                <div className="max-w-3xl mx-auto space-y-6 text-left">
                  {/* PDF Header logo block */}
                  <div className="flex justify-between items-start border-b-2 border-blue-650 pb-4">
                    <div>
                      <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Analizze Arquitetura e Engenharia</h1>
                      <p className="text-xs text-slate-500 font-mono">CNPJ: 10.234.567/0001-99 | CREA: 2045938</p>
                      <p className="text-xs text-slate-500">Rua Gomes de Carvalho, 1500 - Vila Olímpia, São Paulo - SP</p>
                    </div>
                    <div className="text-right">
                      <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">PROPOSTA DE ORÇAMENTO</h2>
                      <span className="text-xs font-mono font-bold text-blue-605 block">{selectedProposta.numero}</span>
                      <p className="text-xs text-slate-400 mt-1 font-mono">Emissão: {new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>

                  {/* Client Box */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dados do Cliente Solicitante</h4>
                    <p className="text-xs font-bold text-slate-900">{getClientName(selectedProposta.clienteId)}</p>
                    {getClientObj(selectedProposta.clienteId) && (
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mt-2">
                        <p>CNPJ/CPF: <strong className="text-slate-800 font-mono">{getClientObj(selectedProposta.clienteId)?.cpfCnpj}</strong></p>
                        <p>Contato: <strong className="text-slate-800">{getClientObj(selectedProposta.clienteId)?.responsavel}</strong></p>
                        <p className="col-span-2">Endereço: <strong className="text-slate-800">{getClientObj(selectedProposta.clienteId)?.endereco}</strong></p>
                      </div>
                    )}
                  </div>

                  {/* Scope */}
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">1. Escopo Técnico e Detalhes</h3>
                    <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                      {selectedProposta.descricao}
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed font-light">
                      A presente proposta comercial contempla o fornecimento global de insumos, coordenação de equipe residente, recolhimento de impostos, locação de ferramental auxiliar e supervisão técnica por engenheiro habilitado cadastrado no CREA da Analizze Arquitetura e Engenharia. O memorial descritivo dos materiais e o cronograma final de execução de cada uma das subetapas serão fixados em contrato anexo.
                    </p>
                  </div>

                  {/* Commercial specs */}
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">2. Valores e Prazos</h3>
                    
                    <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                      <thead className="bg-slate-50 text-slate-750 uppercase font-bold text-xs">
                        <tr>
                          <th className="p-2.5 border-b border-slate-200">Descrição do Escopo do Serviço</th>
                          <th className="p-2.5 border-b border-slate-200">Prazo Estimado</th>
                          <th className="p-2.5 border-b border-slate-200 text-right">Valor Global</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        <tr>
                          <td className="p-2.5 font-medium">{selectedProposta.descricao}</td>
                          <td className="p-2.5">{selectedProposta.prazoExecucao}</td>
                          <td className="p-2.5 font-mono font-bold text-right">
                            {selectedProposta.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>
                        <tr className="bg-slate-50 font-bold text-xs">
                          <td colSpan={2} className="p-2.5 text-right uppercase">Investimento Global Totalizador:</td>
                          <td className="p-2.5 font-mono text-right text-emerald-700">
                            {selectedProposta.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* General clauses */}
                  <div className="space-y-1 text-slate-500 text-xs leading-relaxed">
                    <h3 className="text-xs font-bold text-slate-800 uppercase">Observações Legais e Condições</h3>
                    <p>• Impostos incidentes incluídos de acordo com o regime tributário Simples Nacional / Lucro Presumido para obras de engenharia civil.</p>
                    <p>• Validade dos preços expressos: <strong>Esta proposta expira impreterivelmente em {new Date(selectedProposta.dataValidade).toLocaleDateString('pt-BR')}</strong>.</p>
                    <p>• Forma de pagamento: Medições periódicas a cada 30 dias de execução, faturadas via boleto bancário com vencimento para 15 dias subsequentes.</p>
                  </div>

                  {/* Signature blocks */}
                  <div className="grid grid-cols-2 gap-10 pt-10">
                    <div className="text-center space-y-1.5 border-t border-slate-300 pt-2.5">
                      <p className="text-xs font-bold text-slate-800">ANALIZZE ARQUITETURA E ENGENHARIA</p>
                      <p className="text-xs text-slate-500">Eng. Responsável Técnico • CREA SP</p>
                    </div>
                    <div className="text-center space-y-1.5 border-t border-slate-300 pt-2.5">
                      <p className="text-xs font-bold text-slate-800">CLIENTE SOLICITANTE</p>
                      <p className="text-xs text-slate-500">Assinatura de Aceite e Aprovação</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Proposta Modal Overlay */}
      <AnimatePresence>
        {showAddModal && (
          <div id="add-proposta-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
              className="relative bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">Adicionar Nova Proposta</h3>
                <button 
                  onClick={() => setShowAddModal(false)}
                  disabled={isSaving}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleCreateProposta} className="p-4 space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente Solicitante *</label>
                  <select
                    id="add-prop-cliente-select"
                    required
                    disabled={isSaving}
                    value={formClienteId}
                    onChange={(e) => setFormClienteId(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none bg-white text-slate-700 disabled:bg-slate-50"
                  >
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição Técnico / Escopo da Obra *</label>
                  <textarea
                    id="add-prop-desc"
                    required
                    disabled={isSaving}
                    placeholder="Ex: Execução de drywall acústico, fiação de 220V e pintura geral"
                    value={formDescricao}
                    onChange={(e) => setFormDescricao(e.target.value)}
                    rows={3}
                    className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Estimado (R$) *</label>
                    <input
                      id="add-prop-valor"
                      type="number"
                      step="0.01"
                      required
                      disabled={isSaving}
                      placeholder="Ex: 120000.00"
                      value={formValor}
                      onChange={(e) => setFormValor(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Prazo Execução *</label>
                    <input
                      id="add-prop-prazo"
                      type="text"
                      required
                      disabled={isSaving}
                      placeholder="Ex: 90 dias / 12 meses"
                      value={formPrazo}
                      onChange={(e) => setFormPrazo(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Data Limite Validade *</label>
                  <input
                    id="add-prop-validade"
                    type="date"
                    required
                    disabled={isSaving}
                    value={formValidade}
                    onChange={(e) => setFormValidade(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                  />
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
                    id="submit-add-proposta-btn"
                    type="submit"
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
                  >
                    {isSaving ? (
                      <>
                        <Spinner size={14} />
                        <span>Criando...</span>
                      </>
                    ) : (
                      <>
                        <FileText size={14} />
                        <span>Salvar Proposta</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Revision Modal Overlay */}
      <AnimatePresence>
        {showRevModal && selectedProposta && (
          <div id="add-revision-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSavingRevision) setShowRevModal(false); }}
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
              <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">Criar Reajuste Revisional</h3>
                <button 
                  onClick={() => setShowRevModal(false)}
                  disabled={isSavingRevision}
                  className="text-slate-400 hover:text-slate-600 font-bold disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleCreateRevision} className="p-4 space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Proposta Alvo</label>
                  <p className="text-xs font-semibold text-slate-900">{selectedProposta.numero} - {selectedProposta.descricao}</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Novo Valor Proposto (R$) *</label>
                  <input
                    id="add-rev-valor"
                    type="number"
                    step="0.01"
                    required
                    disabled={isSavingRevision}
                    placeholder="Ex: 145000"
                    value={revValor}
                    onChange={(e) => setRevValor(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição das Modificações *</label>
                  <textarea
                    id="add-rev-alteracoes"
                    required
                    disabled={isSavingRevision}
                    placeholder="Ex: Negociamos substituição do revestimento cerâmico e reduzimos mão de obra civil."
                    value={revAlteracoes}
                    onChange={(e) => setRevAlteracoes(e.target.value)}
                    rows={3}
                    className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingRevision}
                    onClick={() => setShowRevModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-add-rev-btn"
                    type="submit"
                    disabled={isSavingRevision}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
                  >
                    {isSavingRevision ? (
                      <>
                        <Spinner size={14} />
                        <span>Reajustando...</span>
                      </>
                    ) : (
                      <>
                        <History size={14} />
                        <span>Registrar v{selectedProposta.revisoes.length + 1}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Conversion Proposal Approval Suggestions Modal */}
      <AnimatePresence>
        {proposalToApprove && (
          <div id="proposal-conversion-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setProposalToApprove(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-600 animate-pulse" />
                  <span>Criação Automática de Obra</span>
                </h3>
                <button 
                  onClick={() => setProposalToApprove(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold transition"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-3 text-left">
                <p className="text-xs text-slate-600 leading-relaxed">
                  A proposta <strong className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">{proposalToApprove.numero}</strong> foi marcada como <strong>Aprovada</strong>! 
                </p>
                <div className="p-3 bg-blue-50 border border-blue-200/50 rounded-lg space-y-1.5">
                  <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <FileText size={14} className="text-blue-600" />
                    <span>Deseja inicializar o Projeto/Obra automaticamente?</span>
                  </p>
                  <p className="text-[11px] text-blue-800 leading-normal">
                    O sistema criará o escopo de obra, distribuirá o orçamento faturado proporcionalmente em todas as categorias de custo e montará um cronograma básico de frentes de trabalho.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  id="btn-close-proposal-conv"
                  type="button"
                  onClick={() => setProposalToApprove(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded transition active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  id="btn-approve-only"
                  type="button"
                  onClick={() => {
                    onUpdateStatus(proposalToApprove.id, 'Aprovada');
                    setSelectedProposta(prev => prev ? { ...prev, status: 'Aprovada' } : null);
                    setProposalToApprove(null);
                    toast.success('Proposta aprovada com sucesso.');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-755 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-300 rounded transition active:scale-95"
                >
                  Apenas Aprovar
                </button>
                <button
                  id="btn-convert-fully"
                  type="button"
                  onClick={async () => {
                    // Wait for the status write to actually land before converting —
                    // fn_criar_projeto_padrao checks the persisted status server-side,
                    // so firing both calls unawaited races the RPC against the update.
                    await onUpdateStatus(proposalToApprove.id, 'Aprovada');
                    setSelectedProposta(prev => prev ? { ...prev, status: 'Aprovada' } : null);
                    onConvertToProject(proposalToApprove);
                    setProposalToApprove(null);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition shadow-sm active:scale-95"
                >
                  Criar Projeto e Obra
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
