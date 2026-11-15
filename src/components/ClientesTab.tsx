import React, { memo, useMemo, useRef, useState } from 'react';
import { atrasoEntrada } from '../lib/animacao';
import {
  Search,
  User,
  MapPin,
  FileCheck,
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
import { Abas, Avatar, CabecalhoPagina, Button, COLUNA_ANCORADA, CONTROLE_ALTURA, Card, CardHeader, Chip, FOCO, LINHA_SELECIONADA, CarregarMais, Field, IconButton, Input, Modal, ModalForm, PaginaAba, PainelAba, SeletorOrdenacao, Textarea } from './ui';
import { useValidacao } from '../hooks/useValidacao';
import { vazio } from '../lib/validacao';
import { useListaOrdenada, compararTexto, type OpcaoOrdenacao } from '../hooks/useListaOrdenada';
import { useFeedback } from './FeedbackContext';
import EstadoDaLista from './EstadoDaLista';
import SemSelecao from './SemSelecao';
import { StatusBadge } from '../constants/status';
import { maskDocumento, maskCep, maskTelefone, composeEndereco } from '../utils/format';
import { formatarDataBR } from '../lib/data';
import { formatBRL } from '../lib/preco';

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
  const { erros, validar, limparErro, limparTudo, areaRef } = useValidacao<'nome'>();
  const [search, setSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(clientes[0] || null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Non-null = the modal is editing this cliente instead of creating a new one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [abaHistorico, setAbaHistorico] = useState<'obras' | 'propostas'>('obras');
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
    // aceitar. O mesmo vale para CPF/CNPJ: muitas vezes só chega depois,
    // no fechamento do contrato — obrigatório, ele virava número inventado.
    if (
      !validar([
        { campo: 'nome', invalido: vazio(formNome), erro: isCnpj ? 'Informe a razão social.' : 'Informe o nome completo.' },
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
    <PaginaAba
      largura="painel"
      id="clientes-tab-container"
      /* A raiz travava em `lg:h-[calc(100vh-120px)]` e as duas colunas rolavam
         por dentro. Agora só a LISTA fica ancorada (`COLUNA_ANCORADA`) e a ficha
         rola com a página — ela pode ter dez obras e vinte documentos sem
         encolher para caber numa altura fixa. */
      fluxo="livre"
      className="grid grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr] 2xl:grid-cols-[minmax(360px,440px)_1fr] gap-4 items-start"
    >
      <CabecalhoPagina
        className="col-span-full mb-2"
        titulo="Clientes"
        descricao="Quem contrata a construtora: contato, obras, propostas e documentos."
        acoes={
          <Button id="add-cliente-btn" onClick={() => { resetForm(); setShowAddModal(true); }}>
            <UserPlus size={14} />
            <span>Novo cliente</span>
          </Button>
        }
      />
      {/* Left Column: List and Search */}
      <Card
        semPadding
        id="clientes-list-col"
        className={`lg:col-span-1 flex flex-col overflow-hidden ${COLUNA_ANCORADA}`}
      >
        {/* A ação "Novo cliente" subiu para o cabeçalho da página: aqui só
            se procura e se ordena. */}
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
            <Input
              id="cliente-search-input"
              type="text"
              aria-label="Pesquisar clientes"
              placeholder="Pesquisar por nome, documento ou contato"
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
              actionLabel: 'Novo cliente',
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
              const nObras = getClienteProjects(cli.id).length;

              return (
                <div
                  key={cli.id}
                  id={`cliente-item-${cli.id}`}
                  onClick={() => setSelectedCliente(cli)}
                  style={{ animationDelay: atrasoEntrada(index) }}
                  className={`anim-lista p-3 cursor-pointer transition text-left flex items-center gap-3 ${
                    isSelected ? LINHA_SELECIONADA.ativa : LINHA_SELECIONADA.inativa
                  }`}
                >
                  <Avatar nome={cli.nome} tamanho="md" tom={isSelected ? 'solido' : 'suave'} />
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-xs text-slate-900 truncate">{cli.nome}</h4>
                    <p className="text-2xs text-slate-500 mt-0.5 truncate">
                      {cli.tipoPessoa === 'CNPJ' ? (cli.responsavel || 'Sem responsável') : 'Pessoa física'}
                    </p>
                  </div>
                  {nObras > 0 && (
                    <span className="text-2xs text-slate-500 shrink-0 data-font">
                      {nObras} {nObras === 1 ? 'obra' : 'obras'}
                    </span>
                  )}
                </div>
              );
            })}
          </EstadoDaLista>
          <CarregarMais temMais={lista.temMais} restantes={lista.restantes} onCarregarMais={lista.carregarMais} />
        </div>
      </Card>

      {/* Ficha: identificação num cartão próprio, depois os dados em cartões
          (contato, endereço, observações), o histórico em abas e os
          documentos. A ficha rola com a página; só a lista fica ancorada. */}
      <div id="cliente-detail-col">
        {selectedCliente ? (() => {
          const cli = selectedCliente;
          const obrasCli = getClienteProjects(cli.id)
            .slice()
            .sort((a, b) => (b.dataInicio ?? '').localeCompare(a.dataInicio ?? ''));
          const propostasCli = getClienteProposals(cli.id)
            .slice()
            .sort((a, b) => b.numero.localeCompare(a.numero, 'pt-BR', { numeric: true }));
          const docsCli = getClienteDocumentos(cli.id);
          const pj = cli.tipoPessoa === 'CNPJ';
          const abaHist = abaHistorico === 'obras' && obrasCli.length === 0 && propostasCli.length > 0 ? 'propostas' : abaHistorico;

          return (
          <article id="cliente-detail-view" aria-labelledby="cliente-nome" className="space-y-4 text-left">
            {/* Identificação */}
            <Card className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar nome={cli.nome} tamanho="lg" tom="solido" />
                <div className="min-w-0">
                  <h2 id="cliente-nome" className="text-2xl font-bold leading-tight text-slate-900 break-words">{cli.nome}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                    <Chip tom="neutro">{pj ? 'Pessoa jurídica' : 'Pessoa física'}</Chip>
                    <span className="data-font">
                      {cli.cpfCnpj ? `${cli.tipoPessoa} ${maskDocumento(cli.cpfCnpj, cli.tipoPessoa)}` : `${cli.tipoPessoa} não informado`}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  id={`edit-cliente-btn-${cli.id}`}
                  variante="secundario"
                  onClick={() => openEditModal(cli)}
                >
                  <Pencil size={14} />
                  Editar
                </Button>
                <IconButton
                  rotulo="Excluir cliente"
                  tom="perigo"
                  id={`delete-cliente-btn-${cli.id}`}
                  onClick={() => {
                    confirm({
                      title: 'Confirmar exclusão de cliente',
                      message: `Tem certeza de que deseja remover o cliente ${cli.nome}? Esta operação não pode ser desfeita.`,
                      onConfirm: () => {
                        onDeleteCliente(cli.id);
                        setSelectedCliente(clientes.find(c => c.id !== cli.id) || null);
                        toast.success('Cliente removido com sucesso.');
                      }
                    });
                  }}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </Card>

            {/* Dados cadastrais em cartões */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Bloco titulo="Contato">
                <dl className="space-y-3">
                  {pj && <Dado rotulo="Responsável" valor={cli.responsavel} />}
                  <Dado
                    rotulo="Telefone"
                    valor={cli.telefone}
                    href={cli.telefone ? `tel:${cli.telefone.replace(/\D/g, '')}` : undefined}
                  />
                  <Dado rotulo="E-mail" valor={cli.email} href={cli.email ? `mailto:${cli.email}` : undefined} />
                </dl>
              </Bloco>
              <Bloco titulo="Endereço">
                <dl className="space-y-3">
                  <Dado rotulo="Endereço de faturamento" valor={cli.endereco} />
                </dl>
              </Bloco>
              <Bloco titulo="Observações internas" className="md:col-span-2">
                <p className={`text-xs leading-relaxed max-w-prose ${cli.observacoes ? 'text-slate-700 whitespace-pre-line' : 'text-slate-500'}`}>
                  {cli.observacoes || 'Sem observações para este cliente.'}
                </p>
              </Bloco>
            </div>

            {/* Histórico: obras e propostas, mais recentes primeiro */}
            <Card semPadding>
              <div className="px-5 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">Histórico</h3>
                <Abas
                  className="mt-2"
                  rotulo="Histórico do cliente"
                  prefixo={`cliente-hist-${cli.id}`}
                  ativa={abaHist}
                  onTrocar={setAbaHistorico}
                  abas={[
                    { id: 'obras', rotulo: 'Obras', contagem: obrasCli.length },
                    { id: 'propostas', rotulo: 'Propostas', contagem: propostasCli.length },
                  ]}
                />
              </div>
              <PainelAba prefixo={`cliente-hist-${cli.id}`} ativa={abaHist}>
                {abaHist === 'obras' ? (
                  obrasCli.length === 0 ? (
                    <p className="px-5 py-6 text-xs text-slate-500">Nenhuma obra para este cliente ainda.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {obrasCli.map((proj) => (
                        <li key={proj.id} className="px-5 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-xs text-slate-900 truncate">{proj.nome}</p>
                            <p className="text-2xs text-slate-500 mt-0.5 truncate">
                              {proj.responsavelInterno || 'Sem responsável'}
                              {proj.dataInicio && <> · início {formatarDataBR(proj.dataInicio)}</>}
                            </p>
                          </div>
                          <StatusBadge type="projeto" status={proj.situacao} size="sm" />
                        </li>
                      ))}
                    </ul>
                  )
                ) : propostasCli.length === 0 ? (
                  <p className="px-5 py-6 text-xs text-slate-500">Nenhuma proposta para este cliente ainda.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {propostasCli.map((prop) => (
                      <li key={prop.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-900 truncate">
                            <span className="data-font text-slate-500 mr-2">{prop.numero}</span>
                            <span className="font-semibold">{prop.descricao}</span>
                          </p>
                          <p className="text-2xs text-slate-500 mt-0.5">Válida até {formatarDataBR(prop.dataValidade)}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-semibold text-slate-900 data-font">{formatBRL(prop.valorEstimado)}</span>
                          <StatusBadge type="proposta" status={prop.status} size="sm" />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </PainelAba>
            </Card>

            {/* Documentos (Storage): imagens ou PDFs do cliente */}
            <Bloco
              titulo={`Documentos${docsCli.length > 0 ? ` (${docsCli.length})` : ''}`}
              acoes={
                <Button
                  id="upload-cliente-doc-btn"
                  variante="acao"
                  tamanho="sm"
                  carregando={isUploadingDoc}
                  onClick={triggerDocUpload}
                >
                  {!isUploadingDoc && <Upload size={12} />}
                  <span>Anexar</span>
                </Button>
              }
            >
              <input
                ref={docFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                className="hidden"
                onChange={handleDocFileChange}
              />
              {docsCli.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum documento anexado.</p>
              ) : (
                <ul className="-my-2 divide-y divide-slate-100">
                  {docsCli.map((doc) => {
                    const Icon = doc.contentType === 'application/pdf' ? FileText : ImageIcon;
                    return (
                      <li key={doc.id} className="py-2 flex items-center gap-3">
                        <Icon size={16} className="text-slate-500 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-800">{doc.nome}</span>
                        <span className="text-2xs text-slate-500 data-font shrink-0">{doc.tamanho}</span>
                        <div className="flex items-center shrink-0">
                          <IconButton rotulo={`Baixar ${doc.nome}`} tom="acao" onClick={() => onDownloadClienteDocumento(doc)}>
                            <Download size={14} />
                          </IconButton>
                          <IconButton
                            rotulo={`Excluir ${doc.nome}`}
                            tom="perigo"
                            onClick={() => {
                              confirm({
                                title: 'Confirmar exclusão de documento',
                                message: `Remover o documento "${doc.nome}"? Esta operação não pode ser desfeita.`,
                                onConfirm: () => onDeleteClienteDocumento(doc.id),
                              });
                            }}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Bloco>
          </article>
          );
        })() : (
          <SemSelecao icone={User}>
            Escolha um cliente na lista para ver contato, endereço, obras, propostas e documentos.
          </SemSelecao>
        )}
      </div>

      {/* Add Cliente Modal Overlay */}
      <Modal
        id="add-cliente-modal"
        open={showAddModal}
        onClose={() => { setShowAddModal(false); resetForm(); }}
        title={editingId ? 'Editar cliente' : 'Novo cliente'}
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
                {isSaving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Salvar cliente'}
              </Button>
            </>
          }
        >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tipo de pessoa: CPF (física) ou CNPJ (jurídica) */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo de cliente *</label>
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
                            className={`flex items-center justify-center gap-1.5 px-3 ${CONTROLE_ALTURA.md} rounded border text-xs font-bold transition active:scale-95 disabled:opacity-50 ${
                              active
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-superficie text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            <Icon size={14} />
                            <span>{tipo === 'CNPJ' ? 'Pessoa jurídica (CNPJ)' : 'Pessoa física (CPF)'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Field
                    className="md:col-span-2"
                    id="add-cli-nome"
                    label={isCnpj ? 'Razão social' : 'Nome completo'}
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
                  >
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        inputMode="numeric"
                        disabled={isSaving}
                        placeholder={isCnpj ? '00.000.000/0001-00' : '000.000.000-00'}
                        value={formCpfCnpj}
                        onChange={(e) => { setFormCpfCnpj(maskDocumento(e.target.value, formTipoPessoa)); }} mono
                      />
                    )}
                  </Field>

                  {/* Responsável principal existe apenas para pessoa jurídica (CNPJ). */}
                  {isCnpj && (
                    <Field id="add-cli-resp" label="Responsável principal">
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
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
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

                  <Field className="md:col-span-2" id="add-cli-obs" label="Observações internas">
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
    </PaginaAba>
  );
}

/** Cartão de um assunto da ficha: título pequeno, ação opcional à direita. */
function Bloco({ titulo, acoes, children, className = '' }: { titulo: string; acoes?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="mb-3" title={titulo} actions={acoes} />
      {children}
    </Card>
  );
}

/** Um par rótulo/valor; vazio vira "Não informado" em tom de piso. */
function Dado({ rotulo, valor, href }: { rotulo: string; valor: string; href?: string }) {
  return (
    <div>
      <dt className="text-2xs font-medium text-slate-500">{rotulo}</dt>
      <dd className="mt-0.5 text-xs break-words">
        {!valor ? (
          <span className="text-slate-500">Não informado</span>
        ) : href ? (
          <a href={href} className={`font-medium text-blue-600 hover:underline rounded ${FOCO}`}>{valor}</a>
        ) : (
          <span className="font-medium text-slate-800">{valor}</span>
        )}
      </dd>
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
