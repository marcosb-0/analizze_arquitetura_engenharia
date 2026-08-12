import React, { memo, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Search,
  User,
  Phone,
  Mail,
  MapPin,
  FileCheck,
  FolderGit2,
  MessageSquareCode,
  UserPlus,
  Trash2,
  Pencil,
  Users,
  Building2,
  Upload,
  Download,
  Image as ImageIcon,
  FileText
} from 'lucide-react';
import { Cliente, ClienteDocumento, Projeto, Proposta, TipoPessoa } from '../types';
import { Button, CarregarMais, Field, IconButton, Input, Modal, ModalForm, SeletorOrdenacao, Textarea } from './ui';
import { useValidacao } from '../hooks/useValidacao';
import { vazio } from '../lib/validacao';
import { useListaOrdenada, compararTexto, type OpcaoOrdenacao } from '../hooks/useListaOrdenada';
import { useFeedback } from './FeedbackContext';
import EstadoDaLista from './EstadoDaLista';
import Spinner from './Spinner';
import { maskDocumento, maskCep, maskTelefone, composeEndereco } from '../utils/format';
import { formatarDataBR } from '../lib/data';

interface ClientesTabProps {
  clientes: Cliente[];
  loading: boolean;
  projetos: Projeto[];
  propostas: Proposta[];
  clienteDocumentos: ClienteDocumento[];
  onAddCliente: (cliente: Cliente) => void;
  onUpdateCliente: (cliente: Cliente) => Promise<Cliente | null>;
  onDeleteCliente: (id: string) => void;
  onUploadClienteDocumento: (clienteId: string, file: File) => Promise<void>;
  onDeleteClienteDocumento: (id: string) => void;
  onDownloadClienteDocumento: (doc: ClienteDocumento) => void;
}

function ClientesTab({
  clientes,
  loading,
  projetos,
  propostas,
  clienteDocumentos,
  onAddCliente,
  onUpdateCliente,
  onDeleteCliente,
  onUploadClienteDocumento,
  onDeleteClienteDocumento,
  onDownloadClienteDocumento
}: ClientesTabProps) {
  const { toast, confirm } = useFeedback();
  const { erros, validar, limparErro, limparTudo, areaRef } = useValidacao<'nome' | 'documento'>();
  const [search, setSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(clientes[0] || null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Non-null = the modal is editing this cliente instead of creating a new one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // New Client Form State
  const [formTipoPessoa, setFormTipoPessoa] = useState<TipoPessoa>('CNPJ');
  const [formNome, setFormNome] = useState('');
  const [formCpfCnpj, setFormCpfCnpj] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formLogradouro, setFormLogradouro] = useState('');
  const [formNumero, setFormNumero] = useState('');
  const [formBairro, setFormBairro] = useState('');
  const [formCidade, setFormCidade] = useState('');
  const [formCep, setFormCep] = useState('');
  const [formResponsavel, setFormResponsavel] = useState('');
  const [formObservacoes, setFormObservacoes] = useState('');

  const isCnpj = formTipoPessoa === 'CNPJ';

  // Re-mask the document whenever the person type changes.
  const handleTipoPessoaChange = (tipo: TipoPessoa) => {
    setFormTipoPessoa(tipo);
    setFormCpfCnpj((prev) => maskDocumento(prev, tipo));
    if (tipo === 'CPF') setFormResponsavel('');
  };

  // Search Filter
  const filteredClientes = useMemo(() => clientes.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.responsavel.toLowerCase().includes(search.toLowerCase()) ||
    c.cpfCnpj.includes(search)
  ), [clientes, search]);

  const ORDENS_CLIENTE = useMemo<OpcaoOrdenacao<Cliente>[]>(() => [
    { id: 'nome', label: 'Nome (A–Z)', comparar: (a, b) => compararTexto(a.nome, b.nome) },
    { id: 'obras', label: 'Mais obras', comparar: (a, b) =>
        projetos.filter(p => p.clienteId === b.id).length - projetos.filter(p => p.clienteId === a.id).length },
    { id: 'propostas', label: 'Mais propostas', comparar: (a, b) =>
        propostas.filter(p => p.clienteId === b.id).length - propostas.filter(p => p.clienteId === a.id).length },
  ], [projetos, propostas]);

  const lista = useListaOrdenada({ itens: filteredClientes, opcoes: ORDENS_CLIENTE });

  const getClienteDocumentos = (clientId: string) => {
    return clienteDocumentos.filter((d) => d.clienteId === clientId);
  };

  const triggerDocUpload = () => docFileInputRef.current?.click();

  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedCliente) return;
    setIsUploadingDoc(true);
    try {
      await onUploadClienteDocumento(selectedCliente.id, file);
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const resetForm = () => {
    setFormTipoPessoa('CNPJ');
    setFormNome('');
    setFormCpfCnpj('');
    setFormTelefone('');
    setFormEmail('');
    setFormLogradouro('');
    setFormNumero('');
    setFormBairro('');
    setFormCidade('');
    setFormCep('');
    setFormResponsavel('');
    setFormObservacoes('');
    setEditingId(null);
    limparTudo();
  };

  const openEditModal = (cli: Cliente) => {
    setEditingId(cli.id);
    setFormTipoPessoa(cli.tipoPessoa);
    setFormNome(cli.nome);
    setFormCpfCnpj(maskDocumento(cli.cpfCnpj, cli.tipoPessoa));
    setFormTelefone(cli.telefone);
    setFormEmail(cli.email);
    setFormLogradouro(cli.logradouro);
    setFormNumero(cli.numero);
    setFormBairro(cli.bairro);
    setFormCidade(cli.cidade);
    setFormCep(cli.cep);
    setFormResponsavel(cli.responsavel);
    setFormObservacoes(cli.observacoes);
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // E-mail saiu dos obrigatórios: boa parte dos clientes pessoa física é
    // atendida só por telefone ou WhatsApp, e exigi-lo levava ao pior
    // resultado possível — endereço inventado no cadastro para o formulário
    // aceitar. O que identifica o cliente é nome + documento.
    if (
      !validar([
        { campo: 'nome', invalido: vazio(formNome), erro: isCnpj ? 'Informe a razão social.' : 'Informe o nome completo.' },
        { campo: 'documento', invalido: vazio(formCpfCnpj), erro: `Informe o ${isCnpj ? 'CNPJ' : 'CPF'}.` },
      ])
    ) return;

    setIsSaving(true);

    const enderecoPartes = {
      logradouro: formLogradouro,
      numero: formNumero,
      bairro: formBairro,
      cidade: formCidade,
      cep: formCep,
    };

    const cliente: Cliente = {
      id: editingId ?? crypto.randomUUID(),
      nome: formNome,
      tipoPessoa: formTipoPessoa,
      cpfCnpj: formCpfCnpj,
      telefone: formTelefone,
      email: formEmail,
      ...enderecoPartes,
      endereco: composeEndereco(enderecoPartes),
      // Responsável principal só se aplica a pessoa jurídica (CNPJ).
      responsavel: isCnpj ? (formResponsavel || formNome) : formNome,
      observacoes: formObservacoes,
    };

    if (editingId) {
      const updated = await onUpdateCliente(cliente);
      setIsSaving(false);
      if (!updated) return; // hook already showed the error toast; keep modal open
      setSelectedCliente(updated);
      setShowAddModal(false);
      toast.success("Cliente atualizado com sucesso.", `Os dados de ${updated.nome} foram salvos.`);
      resetForm();
      return;
    }

    // Simulate short network delay for modern user feedback (Task 5)
    setTimeout(() => {
      onAddCliente(cliente);
      setSelectedCliente(cliente);
      setIsSaving(false);
      setShowAddModal(false);
      toast.success("Cliente cadastrado com sucesso.", `O cliente ${cliente.nome} foi adicionado.`);
      resetForm();
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
    <div id="clientes-tab-container" className="grid grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr] gap-4 lg:h-[calc(100vh-120px)]">
      {/* Left Column: List and Search */}
      <div id="clientes-list-col" className="lg:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* List Header */}
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">Fichário de Clientes</h3>
            <Button
              id="add-cliente-btn"
              onClick={() => { resetForm(); setShowAddModal(true); }}
            >
              <UserPlus size={14} />
              <span>Novo Cliente</span>
            </Button>
          </div>
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
            <Input
              id="cliente-search-input"
              type="text"
              placeholder="Pesquisar por nome, doc ou contato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-8 pr-3"
            />
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

        </div>

        {/* List Content */}
        <div id="clientes-scroll-area" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          <EstadoDaLista
            loading={loading}
            total={lista.total}
            totalSemFiltro={clientes.length}
            carregandoLabel="Carregando clientes..."
            className="p-4"
            vazio={{
              icon: Users,
              title: 'Nenhum cliente cadastrado',
              description: 'Adicione seu primeiro cliente para começar a gerenciar obras.',
              actionLabel: 'Novo Cliente',
              onAction: () => { resetForm(); setShowAddModal(true); },
            }}
            semResultado={{
              title: 'Nenhum cliente encontrado',
              description: 'Nenhum cliente corresponde à busca por nome, documento ou contato.',
            }}
            onLimparFiltros={() => setSearch('')}
          >
            {lista.visiveis.map((cli, index) => {
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
                    {cli.tipoPessoa === 'CNPJ' ? (
                      <>
                        <User size={12} className="text-slate-500 shrink-0" />
                        <span className="truncate">{cli.responsavel || 'Sem responsável'}</span>
                      </>
                    ) : (
                      <>
                        <User size={12} className="text-slate-500 shrink-0" />
                        <span className="truncate">Pessoa Física</span>
                      </>
                    )}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-mono text-slate-500">{cli.cpfCnpj}</span>
                    <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {cliProjs.length} Obra(s)
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </EstadoDaLista>
          <CarregarMais temMais={lista.temMais} restantes={lista.restantes} onCarregarMais={lista.carregarMais} />
        </div>
      </div>

      {/* Right Column: Detailed View */}
      <div id="cliente-detail-col" className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {selectedCliente ? (
          <div id="cliente-detail-view" className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Detail Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div className="text-left">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider font-mono">ID: {selectedCliente.id}</span>
                <h3 className="text-lg font-bold text-slate-950 mt-1 leading-tight">{selectedCliente.nome}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                  {selectedCliente.tipoPessoa === 'CNPJ' ? (
                    <>
                      <Building2 size={13} className="text-blue-500" />
                      <span>Pessoa Jurídica · Representante: <strong>{selectedCliente.responsavel || 'Não informado'}</strong></span>
                    </>
                  ) : (
                    <>
                      <User size={13} className="text-blue-500" />
                      <span>Pessoa Física</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
              <IconButton
                rotulo="Editar Cliente"
                tom="acao"
                id={`edit-cliente-btn-${selectedCliente.id}`}
                onClick={() => openEditModal(selectedCliente)}
              >
                <Pencil size={16} />
              </IconButton>
              <IconButton
                rotulo="Excluir Cliente"
                tom="perigo"
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
              >
                <Trash2 size={16} />
              </IconButton>
              </div>
            </div>

            {/* General Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Contato Direto</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <Phone size={13} className="text-slate-500 shrink-0" />
                  <span className="font-medium">{selectedCliente.telefone || 'Não informado'}</span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2 truncate">
                  <Mail size={13} className="text-slate-500 shrink-0" />
                  <span className={`font-medium ${selectedCliente.email ? '' : 'text-slate-500'}`}>
                    {selectedCliente.email || 'Não informado'}
                  </span>
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Localização / Faturamento</span>
                <p className="text-xs text-slate-800 flex items-start gap-2">
                  <MapPin size={13} className="text-slate-500 shrink-0 mt-0.5" />
                  <span className="font-medium">{selectedCliente.endereco || 'Não informado'}</span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase shrink-0 mr-1">{selectedCliente.tipoPessoa}:</span>
                  <span className="font-mono font-medium">{maskDocumento(selectedCliente.cpfCnpj, selectedCliente.tipoPessoa)}</span>
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
                <p className="text-xs text-slate-500 pl-1">Nenhuma obra cadastrada para este cliente.</p>
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
                      <p className="text-xs text-slate-500 mt-1 font-mono">Início: {formatarDataBR(proj.dataInicio)}</p>
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
                <p className="text-xs text-slate-500 pl-1">Nenhuma proposta vinculada a este cliente.</p>
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
                        <p className="text-xs text-slate-500 mt-1">Validade: {formatarDataBR(prop.dataValidade)}</p>
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

            {/* Real documentos (Storage-backed): images or PDFs attached to this cliente */}
            <div className="space-y-2 text-left">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Documentos Cadastrais</h4>
                <button
                  id="upload-cliente-doc-btn"
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
              <div className="flex flex-wrap gap-1.5">
                {getClienteDocumentos(selectedCliente.id).length === 0 ? (
                  <p className="text-xs text-slate-500 pl-1">Nenhum documento anexado.</p>
                ) : (
                  getClienteDocumentos(selectedCliente.id).map((doc) => {
                    const Icon = doc.contentType === 'application/pdf' ? FileText : ImageIcon;
                    return (
                      <div key={doc.id} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-1 text-xs font-mono text-slate-700 transition">
                        <Icon size={12} className="text-emerald-600 shrink-0" />
                        <span className="truncate max-w-[160px]">{doc.nome}</span>
                        <span className="text-slate-500">({doc.tamanho})</span>
                        <IconButton
                          rotulo="Baixar"
                          tom="acao"
                          onClick={() => onDownloadClienteDocumento(doc)}
                        >
                          <Download size={12} />
                        </IconButton>
                        <IconButton
                          rotulo="Excluir"
                          tom="perigo"
                          onClick={() => {
                            confirm({
                              title: 'Confirmar exclusão de documento',
                              message: `Remover o documento "${doc.nome}"? Esta operação não pode ser desfeita.`,
                              onConfirm: () => onDeleteClienteDocumento(doc.id),
                            });
                          }}
                        >
                          <Trash2 size={12} />
                        </IconButton>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
            <User size={48} className="stroke-1 mb-2 animate-pulse" />
            <p className="text-xs">Selecione um cliente para visualizar os detalhes.</p>
          </div>
        )}
      </div>

      {/* Add Cliente Modal Overlay */}
      <Modal
        id="add-cliente-modal"
        open={showAddModal}
        onClose={() => { setShowAddModal(false); resetForm(); }}
        title={editingId ? 'Editar Cliente' : 'Adicionar Novo Cliente'}
        size="lg"
        bloqueado={isSaving}
      >
        <ModalForm
          ref={areaRef as React.RefObject<HTMLFormElement>}
          onSubmit={handleSubmit}
          className="space-y-4"
          footer={
            <>
              <Button
                id="cancel-add-cliente-btn"
                variante="fantasma"
                disabled={isSaving}
                onClick={() => { setShowAddModal(false); resetForm(); }}
              >
                Cancelar
              </Button>
              <Button id="submit-add-cliente-btn" type="submit" carregando={isSaving}>
                {!isSaving && <FileCheck size={14} />}
                {isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Salvar Cliente'}
              </Button>
            </>
          }
        >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tipo de pessoa: CPF (física) ou CNPJ (jurídica) */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tipo de Cliente *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['CNPJ', 'CPF'] as const).map((tipo) => {
                        const active = formTipoPessoa === tipo;
                        const Icon = tipo === 'CNPJ' ? Building2 : User;
                        return (
                          <button
                            key={tipo}
                            id={`add-cli-tipo-${tipo.toLowerCase()}`}
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleTipoPessoaChange(tipo)}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-xs font-bold transition active:scale-95 disabled:opacity-50 ${
                              active
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            <Icon size={14} />
                            <span>{tipo === 'CNPJ' ? 'Pessoa Jurídica (CNPJ)' : 'Pessoa Física (CPF)'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Field
                    className="md:col-span-2"
                    id="add-cli-nome"
                    label={isCnpj ? 'Razão Social' : 'Nome Completo'}
                    erro={erros.nome}
                    required
                  >
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        disabled={isSaving}
                        placeholder={isCnpj ? 'Ex: Construtora Alfa Ltda' : 'Ex: João da Silva'}
                        value={formNome}
                        onChange={(e) => { setFormNome(e.target.value); limparErro('nome'); }}
                      />
                    )}
                  </Field>

                  <Field
                    className={isCnpj ? '' : 'md:col-span-2'}
                    id="add-cli-doc"
                    label={isCnpj ? 'CNPJ' : 'CPF'}
                    erro={erros.documento}
                    required
                  >
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        inputMode="numeric"
                        disabled={isSaving}
                        placeholder={isCnpj ? '00.000.000/0001-00' : '000.000.000-00'}
                        value={formCpfCnpj}
                        onChange={(e) => { setFormCpfCnpj(maskDocumento(e.target.value, formTipoPessoa)); limparErro('documento'); }} mono
                      />
                    )}
                  </Field>

                  {/* Responsável principal existe apenas para pessoa jurídica (CNPJ). */}
                  {isCnpj && (
                    <Field id="add-cli-resp" label="Responsável Principal">
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          disabled={isSaving}
                          placeholder="Nome do contato principal"
                          value={formResponsavel}
                          onChange={(e) => setFormResponsavel(e.target.value)}
                        />
                      )}
                    </Field>
                  )}

                  <Field id="add-cli-tel" label="Telefone">
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        inputMode="numeric"
                        disabled={isSaving}
                        placeholder="(00) 00000-0000"
                        value={formTelefone}
                        onChange={(e) => setFormTelefone(maskTelefone(e.target.value))}
                      />
                    )}
                  </Field>

                  <Field id="add-cli-email" label="E-mail">
                    {(props) => (
                      <Input
                        {...props}
                        type="email"
                        disabled={isSaving}
                        placeholder="email@empresa.com"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                      />
                    )}
                  </Field>

                  {/* Endereço estruturado */}
                  <div className="md:col-span-2 pt-1">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin size={13} />
                      <span>Endereço</span>
                    </span>
                  </div>

                  <div className="md:col-span-2 grid grid-cols-3 gap-4">
                    <Field className="col-span-2" id="add-cli-logradouro" label="Logradouro">
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          disabled={isSaving}
                          placeholder="Rua / Avenida"
                          value={formLogradouro}
                          onChange={(e) => setFormLogradouro(e.target.value)}
                        />
                      )}
                    </Field>
                    <Field id="add-cli-numero" label="Nº">
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          disabled={isSaving}
                          placeholder="123"
                          value={formNumero}
                          onChange={(e) => setFormNumero(e.target.value)}
                        />
                      )}
                    </Field>
                  </div>

                  <Field id="add-cli-bairro" label="Bairro">
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        disabled={isSaving}
                        placeholder="Centro"
                        value={formBairro}
                        onChange={(e) => setFormBairro(e.target.value)}
                      />
                    )}
                  </Field>

                  <Field id="add-cli-cidade" label="Cidade">
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        disabled={isSaving}
                        placeholder="São Paulo - SP"
                        value={formCidade}
                        onChange={(e) => setFormCidade(e.target.value)}
                      />
                    )}
                  </Field>

                  <Field id="add-cli-cep" label="CEP">
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        inputMode="numeric"
                        disabled={isSaving}
                        placeholder="00000-000"
                        value={formCep}
                        onChange={(e) => setFormCep(maskCep(e.target.value))} mono
                      />
                    )}
                  </Field>

                  <Field className="md:col-span-2" id="add-cli-obs" label="Observações Internas">
                    {(props) => (
                      <Textarea
                        {...props}
                        disabled={isSaving}
                        placeholder="Instruções comerciais ou particularidades..."
                        value={formObservacoes}
                        onChange={(e) => setFormObservacoes(e.target.value)}
                        rows={2}
                      />
                    )}
                  </Field>

                  {editingId && (
                    <div className="md:col-span-2">
                      <p className="text-xs text-slate-500 pl-1">
                        Documentos (imagens/PDF) são anexados na tela de detalhes do cliente, após salvar.
                      </p>
                    </div>
                  )}
                </div>

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
export default memo(ClientesTab);
