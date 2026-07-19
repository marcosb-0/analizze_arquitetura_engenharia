import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Plus, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  FileCheck, 
  FolderGit2, 
  MessageSquareCode, 
  UserPlus,
  Briefcase,
  ExternalLink,
  Trash2,
  Users
} from 'lucide-react';
import { Cliente, Projeto, Proposta } from '../types';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

interface ClientesTabProps {
  clientes: Cliente[];
  projetos: Projeto[];
  propostas: Proposta[];
  onAddCliente: (cliente: Cliente) => void;
  onDeleteCliente: (id: string) => void;
}

export default function ClientesTab({
  clientes,
  projetos,
  propostas,
  onAddCliente,
  onDeleteCliente
}: ClientesTabProps) {
  const { toast, confirm } = useFeedback();
  const [search, setSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(clientes[0] || null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New Client Form State
  const [formNome, setFormNome] = useState('');
  const [formCpfCnpj, setFormCpfCnpj] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formEndereco, setFormEndereco] = useState('');
  const [formResponsavel, setFormResponsavel] = useState('');
  const [formObservacoes, setFormObservacoes] = useState('');
  const [formDocs, setFormDocs] = useState<string[]>([]);
  const [newDocName, setNewDocName] = useState('');

  // Search Filter
  const filteredClientes = clientes.filter(c => 
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.responsavel.toLowerCase().includes(search.toLowerCase()) ||
    c.cpfCnpj.includes(search)
  );

  const handleAddDoc = () => {
    if (newDocName.trim()) {
      setFormDocs([...formDocs, newDocName.trim()]);
      setNewDocName('');
    }
  };

  const handleRemoveFormDoc = (index: number) => {
    setFormDocs(formDocs.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome || !formCpfCnpj || !formEmail) {
      toast.error("Preencha os campos obrigatórios: Nome, CPF/CNPJ e E-mail.");
      return;
    }

    setIsSaving(true);
    
    // Simulate short network delay for modern user feedback (Task 5)
    setTimeout(() => {
      const newCliente: Cliente = {
        id: crypto.randomUUID(),
        nome: formNome,
        cpfCnpj: formCpfCnpj,
        telefone: formTelefone,
        email: formEmail,
        endereco: formEndereco,
        responsavel: formResponsavel || formNome,
        observacoes: formObservacoes,
        documentos: formDocs
      };

      onAddCliente(newCliente);
      setSelectedCliente(newCliente);
      setIsSaving(false);
      setShowAddModal(false);
      toast.success("Cliente cadastrado com sucesso.", `O cliente ${newCliente.nome} foi adicionado.`);

      // Reset Form
      setFormNome('');
      setFormCpfCnpj('');
      setFormTelefone('');
      setFormEmail('');
      setFormEndereco('');
      setFormResponsavel('');
      setFormObservacoes('');
      setFormDocs([]);
    }, 600);
  };

  // Linked items
  const getClienteProjects = (clientId: string) => {
    return projetos.filter(p => p.clienteId === clientId);
  };

  const getClienteProposals = (clientId: string) => {
    return propostas.filter(p => p.clienteId === clientId);
  };

  return (
    <div id="clientes-tab-container" className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-120px)]">
      {/* Left Column: List and Search */}
      <div id="clientes-list-col" className="lg:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* List Header */}
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">Fichário de Clientes</h3>
            <button
              id="add-cliente-btn"
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition shadow-sm"
            >
              <UserPlus size={14} />
              <span>Novo Cliente</span>
            </button>
          </div>
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
            <input
              id="cliente-search-input"
              type="text"
              placeholder="Pesquisar por nome, doc ou contato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:border-blue-600 outline-none text-slate-800"
            />
          </div>
        </div>

        {/* List Content */}
        <div id="clientes-scroll-area" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredClientes.length === 0 ? (
            <div className="p-4">
              <EmptyState 
                icon={Users}
                title="Nenhum cliente cadastrado"
                description="Adicione seu primeiro cliente para começar a gerenciar obras."
                actionLabel="Novo Cliente"
                onAction={() => setShowAddModal(true)}
              />
            </div>
          ) : (
            filteredClientes.map((cli, index) => {
              const isSelected = selectedCliente?.id === cli.id;
              const cliProjs = getClienteProjects(cli.id);
              
              return (
                <motion.div
                  key={cli.id}
                  id={`cliente-item-${cli.id}`}
                  onClick={() => setSelectedCliente(cli)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.4) }}
                  className={`p-3 cursor-pointer transition text-left flex flex-col justify-between ${
                    isSelected ? 'bg-blue-50/40 border-l-4 border-blue-600 font-medium' : 'hover:bg-slate-50'
                  }`}
                >
                  <h4 className="font-bold text-xs text-slate-900 truncate">{cli.nome}</h4>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    <User size={12} className="text-slate-400 shrink-0" />
                    <span className="truncate">{cli.responsavel}</span>
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-mono text-slate-400">{cli.cpfCnpj}</span>
                    <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {cliProjs.length} Obra(s)
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Detailed View */}
      <div id="cliente-detail-col" className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {selectedCliente ? (
          <div id="cliente-detail-view" className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Detail Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div className="text-left">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider font-mono">ID: {selectedCliente.id}</span>
                <h3 className="text-lg font-bold text-slate-950 mt-1 leading-tight">{selectedCliente.nome}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                  <User size={13} className="text-blue-500" />
                  <span>Representante: <strong>{selectedCliente.responsavel}</strong></span>
                </p>
              </div>
              <button
                id={`delete-cliente-btn-${selectedCliente.id}`}
                onClick={() => {
                  confirm({
                    title: 'Confirmar exclusão de cliente',
                    message: `Tem certeza de que deseja remover o cliente ${selectedCliente.nome}? Esta operação não pode ser desfeita.`,
                    onConfirm: () => {
                      onDeleteCliente(selectedCliente.id);
                      setSelectedCliente(clientes.find(c => c.id !== selectedCliente.id) || null);
                      toast.success('Cliente removido com sucesso.');
                    }
                  });
                }}
                className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition active:scale-95"
                title="Excluir Cliente"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* General Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-left">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Contato Direto</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <Phone size={13} className="text-slate-400 shrink-0" />
                  <span className="font-medium">{selectedCliente.telefone || 'Não informado'}</span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2 truncate">
                  <Mail size={13} className="text-slate-400 shrink-0" />
                  <span className="font-medium">{selectedCliente.email}</span>
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-left">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Localização / Faturamento</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <MapPin size={13} className="text-slate-400 shrink-0" />
                  <span className="font-medium truncate">{selectedCliente.endereco || 'Não informado'}</span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase shrink-0 mr-1">CNPJ/CPF:</span>
                  <span className="font-mono font-medium">{selectedCliente.cpfCnpj}</span>
                </p>
              </div>
            </div>

            {/* Observations Box */}
            <div className="p-3 bg-blue-50/10 rounded-lg border border-blue-200/50 text-left">
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <MessageSquareCode size={13} />
                <span>Observações Internas</span>
              </span>
              <p className="text-xs text-slate-700 leading-relaxed italic">
                {selectedCliente.observacoes || 'Sem observações cadastradas para este cliente.'}
              </p>
            </div>

            {/* Projects History */}
            <div className="space-y-2.5 text-left">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <FolderGit2 size={15} className="text-slate-500" />
                <span>Histórico de Projetos / Obras ({getClienteProjects(selectedCliente.id).length})</span>
              </h4>
              {getClienteProjects(selectedCliente.id).length === 0 ? (
                <p className="text-xs text-slate-400 pl-1">Nenhuma obra cadastrada para este cliente.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {getClienteProjects(selectedCliente.id).map(proj => (
                    <div key={proj.id} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-blue-300 hover:shadow-md transition duration-200">
                      <div className="flex justify-between items-start">
                        <h5 className="font-bold text-xs text-slate-900 truncate max-w-[180px]">{proj.nome}</h5>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          proj.situacao === 'Em Execução' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>{proj.situacao}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate">Resp: {proj.responsavelInterno}</p>
                      <p className="text-xs text-slate-400 mt-1 font-mono">Início: {new Date(proj.dataInicio).toLocaleDateString('pt-BR')}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Proposals History */}
            <div className="space-y-2.5 text-left">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck size={15} className="text-slate-500" />
                <span>Propostas Vinculadas ({getClienteProposals(selectedCliente.id).length})</span>
              </h4>
              {getClienteProposals(selectedCliente.id).length === 0 ? (
                <p className="text-xs text-slate-400 pl-1">Nenhuma proposta vinculada a este cliente.</p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 shadow-sm bg-white">
                  {getClienteProposals(selectedCliente.id).map(prop => (
                    <div key={prop.id} className="p-2.5 flex justify-between items-center hover:bg-slate-50/50 transition">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {prop.numero}
                          </span>
                          <h5 className="font-semibold text-xs text-slate-800 truncate max-w-[220px]">{prop.descricao}</h5>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Validade: {new Date(prop.dataValidade).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-slate-900 font-mono block">
                          {prop.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${
                          prop.status === 'Aprovada' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          prop.status === 'Enviada' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-600'
                        }`}>{prop.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Document checklist */}
            <div className="space-y-2 text-left">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Documentos Cadastrais</h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedCliente.documentos.length === 0 ? (
                  <p className="text-xs text-slate-400 pl-1">Nenhum documento anexado.</p>
                ) : (
                  selectedCliente.documentos.map((doc, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-1 text-xs font-mono text-slate-700 transition">
                      <FileCheck size={12} className="text-emerald-600 shrink-0" />
                      <span>{doc}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <User size={48} className="stroke-1 mb-2 animate-pulse" />
            <p className="text-xs">Selecione um cliente para visualizar os detalhes.</p>
          </div>
        )}
      </div>

      {/* Add Cliente Modal Overlay */}
      <AnimatePresence>
        {showAddModal && (
          <div id="add-cliente-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
              className="relative bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">Adicionar Novo Cliente</h3>
                <button 
                  id="close-cliente-modal"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSaving}
                  className="text-slate-400 hover:text-slate-600 font-bold transition disabled:opacity-40"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nome / Razão Social *</label>
                    <input
                      id="add-cli-nome"
                      type="text"
                      required
                      disabled={isSaving}
                      placeholder="Ex: Construtora Alfa Ltda"
                      value={formNome}
                      onChange={(e) => setFormNome(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none transition disabled:bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">CPF / CNPJ *</label>
                    <input
                      id="add-cli-doc"
                      type="text"
                      required
                      disabled={isSaving}
                      placeholder="00.000.000/0001-00"
                      value={formCpfCnpj}
                      onChange={(e) => setFormCpfCnpj(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none transition disabled:bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Responsável Principal</label>
                    <input
                      id="add-cli-resp"
                      type="text"
                      disabled={isSaving}
                      placeholder="Nome do contato principal"
                      value={formResponsavel}
                      onChange={(e) => setFormResponsavel(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none transition disabled:bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Telefone</label>
                    <input
                      id="add-cli-tel"
                      type="text"
                      disabled={isSaving}
                      placeholder="(00) 00000-0000"
                      value={formTelefone}
                      onChange={(e) => setFormTelefone(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none transition disabled:bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">E-mail *</label>
                    <input
                      id="add-cli-email"
                      type="email"
                      required
                      disabled={isSaving}
                      placeholder="email@empresa.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none transition disabled:bg-slate-50"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Endereço Completo</label>
                    <input
                      id="add-cli-end"
                      type="text"
                      disabled={isSaving}
                      placeholder="Rua, Número, Bairro, Cidade - UF"
                      value={formEndereco}
                      onChange={(e) => setFormEndereco(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none transition disabled:bg-slate-50"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Observações Internas</label>
                    <textarea
                      id="add-cli-obs"
                      disabled={isSaving}
                      placeholder="Instruções comerciais ou particularidades..."
                      value={formObservacoes}
                      onChange={(e) => setFormObservacoes(e.target.value)}
                      rows={2}
                      className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none transition disabled:bg-slate-50"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Documentos Cadastrais Anexos</label>
                    <div className="flex gap-2">
                      <input
                        id="add-cli-doc-input"
                        type="text"
                        disabled={isSaving}
                        placeholder="Nome do arquivo (ex: Contrato_Social.pdf)"
                        value={newDocName}
                        onChange={(e) => setNewDocName(e.target.value)}
                        className="flex-1 border border-slate-200 rounded p-2 text-xs outline-none focus:border-blue-600 transition"
                      />
                      <button
                        id="add-cli-doc-btn"
                        type="button"
                        disabled={isSaving}
                        onClick={handleAddDoc}
                        className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded transition active:scale-95 disabled:opacity-50"
                      >
                        Anexar
                      </button>
                    </div>
                    {/* Attached List */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {formDocs.map((doc, idx) => (
                        <span key={idx} className="bg-slate-100 text-slate-700 text-xs font-mono px-2 py-1 rounded border border-slate-200 flex items-center gap-1.5">
                          <span>{doc}</span>
                          <button type="button" disabled={isSaving} onClick={() => handleRemoveFormDoc(idx)} className="text-slate-400 hover:text-rose-600 font-bold transition">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    id="cancel-add-cliente-btn"
                    type="button"
                    disabled={isSaving}
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-add-cliente-btn"
                    type="submit"
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
                  >
                    {isSaving ? (
                      <>
                        <Spinner size={14} />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <FileCheck size={14} />
                        <span>Salvar Cliente</span>
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
