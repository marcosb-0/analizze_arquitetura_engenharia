import React, { memo, useMemo, useState } from 'react';
import { atrasoEntrada } from '../lib/animacao';
import {
  Search,
  Briefcase,
  MapPin,
  Calendar,
  ArrowRight,
  Trash2,
  FolderPlus,
  AlertTriangle,
  Clock3,
  TrendingUp,
  CalendarX,
  Layers
} from 'lucide-react';
import { Projeto, Cliente, Proposta, ResumoObra, Documento, Funcionario } from '../types';
import type { Role } from '../lib/database.types';
import { formatarPrazo } from '../lib/prazo';
import { dataLocal, formatarDataBR } from '../lib/data';
import { avaliarRiscoObra } from '../lib/avanco';
import { podeGerenciarObra } from '../constants/tabAccess';
import { StatusBadge } from '../constants/status';
import { AnelProgresso, Button, Card, Chip, FileiraPilulas, GRADE_CARTOES, CarregarMais, Field, IconButton, Input, Modal, PaginaAba, Pilula, PREENCHIMENTO, Select, SeletorOrdenacao } from './ui';
import { useListaOrdenada, compararTexto, compararData, type OpcaoOrdenacao } from '../hooks/useListaOrdenada';
import { useValidacao } from '../hooks/useValidacao';
import { Checagem, fimAntesDoInicio, naoEscolhido, vazio } from '../lib/validacao';
import { useFeedback } from './FeedbackContext';
import EstadoDaLista from './EstadoDaLista';

/**
 * As pílulas de situação, na ordem do ciclo de vida da obra — não em ordem
 * alfabética e não na ordem do `enum` do banco. Quem varre a fileira lê a
 * linha do tempo de uma obra: nasce em planejamento, executa, às vezes para,
 * termina.
 */
const SITUACOES_FILTRO = ['Todas', 'Planejamento', 'Em Execução', 'Pausado', 'Finalizado'] as const;

/**
 * A LISTA de obras.
 *
 * O console da obra era renderizado AQUI DENTRO, por um `return` antecipado, e
 * era isso que fazia esta aba receber 49 props para repassar 44 — um
 * intermediário de prop-drilling, não um componente com responsabilidade
 * própria (§1.2). Hoje os dois são irmãos: quem escolhe entre lista e console é
 * `abas/ProjetosConectado`, e cada um assina os contextos de que precisa.
 */
/** Campos do assistente de nova obra, na ordem em que aparecem. */
type CampoObra = 'nome' | 'responsavel' | 'endereco' | 'inicio' | 'fim' | 'cliente';

interface ProjetosTabProps {
  projetos: Projeto[];
  clientes: Cliente[];
  propostas: Proposta[];
  funcionarios: Funcionario[];
  /**
   * O agregado por obra (§4.2, item 23). Substituiu `orcamentos`, `cronograma`,
   * `vinculos` e `medicoes`, que eram recebidos INTEIROS — de todas as obras —
   * para calcular a barra de avanço, os distintivos de risco e as contagens do
   * diálogo de exclusão. A lista nunca precisou das linhas, só dos números.
   */
  resumos: ResumoObra[];
  documentos: Documento[];
  role?: Role;
  loading?: boolean;
  onSelectProject: (id: string | null) => void;
  onAddProjeto: (proj: Projeto) => Promise<string | null>;
  /** Devolve se a escrita chegou ao banco — a tela só confirma depois disso. */
  onDeleteProjeto: (id: string) => Promise<boolean>;
}

function ProjetosTab({
  projetos,
  clientes,
  propostas,
  funcionarios,
  resumos,
  documentos,
  role,
  loading = false,
  onSelectProject,
  onAddProjeto,
  onDeleteProjeto,
}: ProjetosTabProps) {
  const { toast } = useFeedback();
  // Escrita em obra é de admin/gestão; financeiro e campo têm a aba em leitura
  // (a RLS é a barreira real — isto evita oferecer o que vai falhar).
  const podeGerenciar = podeGerenciarObra(role);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todas');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New Project Form State
  const [formNome, setFormNome] = useState('');
  const [formClienteId, setFormClienteId] = useState(clientes[0]?.id || '');
  const [formPropostaId, setFormPropostaId] = useState('');
  const [formResponsavel, setFormResponsavel] = useState('');
  const [formEndereco, setFormEndereco] = useState('');
  const [formInicio, setFormInicio] = useState('');
  const [formFim, setFormFim] = useState('');

  // Wizard & Delete Modals States
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const { erros, validar, limparErro, limparTudo, areaRef } = useValidacao<CampoObra>();
  const [projectToDelete, setProjectToDelete] = useState<Projeto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Calculations
  const resumoPorProjeto = useMemo(
    () => new Map(resumos.map((r) => [r.projetoId, r])),
    [resumos]
  );

  const filteredProjetos = useMemo(() => projetos.filter(p => {
    const cli = clientes.find(c => c.id === p.clienteId);
    const matchesSearch = 
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.responsavelInterno.toLowerCase().includes(search.toLowerCase()) ||
      (cli && cli.nome.toLowerCase().includes(search.toLowerCase()));
    
    const matchesStatus = statusFilter === 'Todas' || p.situacao === statusFilter;
    return matchesSearch && matchesStatus;
  }), [projetos, clientes, search, statusFilter]);

  // Prazo primeiro: a pergunta mais frequente aqui é "o que vence antes".
  const ORDENS_OBRA = useMemo<OpcaoOrdenacao<Projeto>[]>(() => [
    { id: 'prazo', label: 'Entrega mais próxima', comparar: (a, b) => (a.dataFim ?? '').localeCompare(b.dataFim ?? '') },
    { id: 'recentes', label: 'Início mais recente', comparar: (a, b) => compararData(a.dataInicio, b.dataInicio) },
    { id: 'nome', label: 'Nome (A–Z)', comparar: (a, b) => compararTexto(a.nome, b.nome) },
    { id: 'avanco', label: 'Menor avanço físico', comparar: (a, b) => getProjectProgress(a.id) - getProjectProgress(b.id) },
  ], [resumoPorProjeto]);

  const lista = useListaOrdenada({ itens: filteredProjetos, opcoes: ORDENS_OBRA, porPagina: 24 });

  // Mesmo número do console (ponderado pelo orçamento vinculado a cada etapa),
  // agora vindo de `v_resumo_obra`. Aqui já foi uma média simples, e a mesma
  // obra mostrava um número na lista e outro ao entrar.
  const getProjectProgress = (projId: string) => resumoPorProjeto.get(projId)?.avancoFisico ?? 0;

  const getClientName = (clientId: string) => {
    return clientes.find(c => c.id === clientId)?.nome || 'Cliente não encontrado';
  };

  const getApprovedProposalsForClient = (clientId: string) => {
    return propostas.filter(p => p.clienteId === clientId && p.status === 'Aprovada');
  };

  // Mirrors fn_criar_projeto_manual's stage schedule (15/30/25/20/10% of the
  // span) so the wizard preview shows what will actually be created — not the
  // old hardcoded rows with fake dates and fake per-stage role names.
  const previewStages = (() => {
    const start = dataLocal(formInicio);
    const end = dataLocal(formFim);
    if (!start || !end) return [];
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (totalDays < 0) return [];
    const fracs = [0, 0.15, 0.45, 0.7, 0.9, 1];
    const nomes = ['Fundação / Terraplanagem', 'Estrutura / Alvenaria', 'Instalações', 'Acabamentos', 'Entrega'];
    const dateAt = (frac: number) => {
      const d = new Date(start.getTime());
      d.setDate(d.getDate() + Math.floor(totalDays * frac));
      return d.toLocaleDateString('pt-BR');
    };
    return nomes.map((nome, i) => ({ nome, ini: dateAt(fracs[i]), fim: dateAt(fracs[i + 1]) }));
  })();
  const responsavelNome = funcionarios.find(f => f.id === formResponsavel)?.nome || 'A definir';

  // Fechar o assistente volta para o passo 1 — antes o passo sobrevivia ao
  // fechamento e reabrir caía direto no passo 3.
  const closeWizard = () => {
    if (isSaving) return;
    setShowAddModal(false);
    setWizardStep(1);
    limparTudo();
  };

  /** Checagens na ordem da tela do passo 1 — a ordem decide para onde vai o foco. */
  const checagensPasso1 = (): Checagem<CampoObra>[] => [
    { campo: 'nome', invalido: vazio(formNome), erro: 'Informe o título da obra.' },
    { campo: 'responsavel', invalido: naoEscolhido(formResponsavel), erro: 'Escolha o gerente responsável.' },
    { campo: 'endereco', invalido: vazio(formEndereco), erro: 'Informe o endereço do canteiro.' },
    { campo: 'inicio', invalido: vazio(formInicio), erro: 'Informe a data de início.' },
    { campo: 'fim', invalido: vazio(formFim), erro: 'Informe a data de entrega.' },
    {
      campo: 'fim',
      invalido: fimAntesDoInicio(formInicio, formFim),
      erro: 'A entrega não pode ser anterior ao início.',
    },
  ];

  const checagensPasso2 = (): Checagem<CampoObra>[] => [
    { campo: 'cliente', invalido: naoEscolhido(formClienteId), erro: 'Escolha o cliente da obra.' },
  ];

  /**
   * Volta ao passo do primeiro problema antes de validar: o campo precisa estar
   * montado para receber o foco. Sem isso o assistente ficava mudo no passo 3 —
   * o botão "Planejar Obra" respondia e nada acontecia, porque o que faltava
   * estava dois passos atrás.
   */
  const validarAssistente = (lista: Checagem<CampoObra>[]): boolean => {
    const primeiro = lista.find((c) => c.invalido);
    if (primeiro) setWizardStep(primeiro.campo === 'cliente' ? 2 : 1);
    return validar(lista);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarAssistente([...checagensPasso1(), ...checagensPasso2()])) return;

    setIsSaving(true);

    const responsavel = funcionarios.find(f => f.id === formResponsavel);
    const newProj: Projeto = {
      id: crypto.randomUUID(),
      nome: formNome,
      clienteId: formClienteId,
      propostaId: formPropostaId || undefined,
      responsavelInterno: responsavel?.nome || formResponsavel,
      responsavelInternoId: formResponsavel,
      enderecoObra: formEndereco || 'Não informado',
      dataInicio: formInicio,
      dataFim: formFim,
      situacao: 'Planejamento'
    };

    // The DB (fn_criar_projeto_manual) generates the real id + stages atomically;
    // only confirm success once it lands. On failure the hook already toasted.
    const createdId = await onAddProjeto(newProj);
    setIsSaving(false);
    if (!createdId) return;

    setShowAddModal(false);
    toast.success("Planejamento de obra inicializado.", `O projeto "${newProj.nome}" foi registrado.`);

    // Reset Form + wizard
    setFormNome('');
    setFormPropostaId('');
    setFormResponsavel('');
    setFormEndereco('');
    setFormInicio('');
    setFormFim('');
    setWizardStep(1);
  };

  return (
    <PaginaAba largura="painel" id="projetos-tab-content">
      
      {/* Title block */}
      <div id="projetos-title" className="flex items-center justify-between">
        <div className="text-left">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Obras e Projetos Ativos</h2>
          <p className="text-xs text-slate-500">Módulo central de acompanhamento, orçamento integrado, medições de campo e cronograma de obra.</p>
        </div>
        {podeGerenciar && (
          <Button
            id="add-projeto-trigger-btn"
            onClick={() => setShowAddModal(true)}
          >
            <FolderPlus size={15} />
            <span>Iniciar Obra</span>
          </Button>
        )}
      </div>

      {/* Filter Toolbar — a barra de filtros era um card branco com sombra,
          acima de uma grade de cards. Filtro não é conteúdo agrupado: são dois
          controles, e agora eles ficam soltos sobre o fundo.

          REDESENHO 14/ago/2026 — a situação saiu do `<Select>` e virou a
          fileira de PÍLULAS do mockup "Analizze - App". São cinco opções
          fixas e mutuamente exclusivas, e o valor de vê-las todas de uma vez é
          justamente saber que existem: dentro do select, "Pausado" só aparece
          para quem abre o menu. A busca continua sendo campo — ali o conjunto
          de valores é infinito, e pílula não serve. */}
      <div id="projetos-filters" className="relative text-left">
        <Search className="absolute left-3 top-3 text-slate-500" size={14} />
        <Input
          id="proj-search-text-input"
          type="text"
          placeholder="Buscar por nome da obra, gerente responsável ou cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-4"
        />
      </div>

      <FileiraPilulas rotulo="Situação da obra">
        {SITUACOES_FILTRO.map((situacao) => (
          <Pilula
            key={situacao}
            ativo={statusFilter === situacao}
            onClick={() => setStatusFilter(situacao)}
          >
            {situacao}
          </Pilula>
        ))}

        {!loading && filteredProjetos.length > 0 && (
          <div className="ml-auto">
            <SeletorOrdenacao
              opcoes={lista.opcoes}
              valor={lista.ordemId}
              onChange={lista.setOrdemId}
              mostrando={lista.mostrando}
              total={lista.total}
            />
          </div>
        )}
      </FileiraPilulas>

      {/* Grid List of Projects */}
      {/* A contagem de colunas é consequência do piso de 330 px do cartão, não
          de breakpoint — a escada `md:2 lg:3 2xl:4` foi remendada uma vez
          (cartões de 460 px em monitor largo) e cada monitor novo pedia outro
          degrau. Ver o cabeçalho de `GRADE_CARTOES`. */}
      <div id="projetos-grid" className={GRADE_CARTOES.entidade}>
        <EstadoDaLista
          loading={loading}
          total={lista.total}
          totalSemFiltro={projetos.length}
          carregandoLabel="Carregando obras..."
          className="col-span-full"
          vazio={{
            icon: Briefcase,
            title: 'Nenhuma obra cadastrada',
            description: podeGerenciar
              ? 'Inicie um planejamento de obra a partir de propostas aprovadas ou do zero. É a obra que passa a receber orçamento, cronograma e medições.'
              : 'Nenhuma obra foi atribuída ao seu perfil ainda. Peça a um administrador para incluir você na equipe da obra.',
            actionLabel: podeGerenciar ? 'Iniciar Obra' : undefined,
            onAction: podeGerenciar ? () => setShowAddModal(true) : undefined,
          }}
          semResultado={{
            title: 'Nenhuma obra encontrada',
            description: 'Nenhuma obra corresponde à busca ou ao filtro de situação aplicados.',
          }}
          onLimparFiltros={() => { setSearch(''); setStatusFilter('Todas'); }}
        >
          {lista.visiveis.map((proj, index) => {
            const progress = getProjectProgress(proj.id);
            const risco = avaliarRiscoObra(proj, resumoPorProjeto.get(proj.id));

            return (
              // O cartão de obra MANTÉM moldura: aqui ela delimita o alvo do
              // clique, não um assunto. Ver o cabeçalho de `ui/Card.tsx`.
              //
              // NÃO usa `interativo`: o card em si não é o alvo do clique — só
              // o botão "Gerenciar Obra" no rodapé e o ícone de excluir são —
              // então `cursor-pointer` no card inteiro mentiria sobre o que é
              // clicável. O realce de hover (sombra + borda) é replicado à mão
              // por ser só polimento visual, não affordance de clique.
              <Card
                key={proj.id}
                id={`project-card-${proj.id}`}
                style={{ animationDelay: atrasoEntrada(index, 0.05, 0.35) }}
                className="anim-cartao flex flex-col gap-3.5 text-left transition hover:shadow-[0_12px_24px_-8px_rgba(16,24,40,0.14)] hover:border-blue-300"
              >
                {/* Identidade primeiro, situação à direita — a ordem do mockup.
                    Antes o selo de situação vinha ACIMA do nome, e a primeira
                    coisa lida numa grade de obras era "Planejamento" repetido,
                    não qual obra é qual. */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-slate-900" title={proj.nome}>
                      {proj.nome}
                    </h3>
                    <p className="mt-0.5 truncate text-2xs text-slate-500">
                      {getClientName(proj.clienteId)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusBadge type="projeto" status={proj.situacao} size="sm" />
                    {podeGerenciar && (
                      <IconButton
                        rotulo="Excluir Obra"
                        tom="perigo"
                        tamanho="sm"
                        id={`delete-project-btn-${proj.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(proj);
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    )}
                  </div>
                </div>

                {/* Anel + ficha da obra lado a lado: o percentual deixa de ser
                    uma barra no rodapé e passa a ser a âncora visual do cartão,
                    como no mockup. */}
                <div className="flex items-center gap-3.5">
                  <AnelProgresso
                    percentual={progress}
                    tamanho={64}
                    tom={
                      proj.situacao === 'Em Execução' ? 'acao' :
                      proj.situacao === 'Finalizado' ? 'positivo' : 'neutro'
                    }
                  />
                  <div className="flex min-w-0 flex-col gap-1.5 text-2xs text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={12} className="shrink-0 text-slate-500" aria-hidden="true" />
                      Entrega {formatarDataBR(proj.dataFim)}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <MapPin size={12} className="shrink-0 text-slate-500" aria-hidden="true" />
                      <span className="truncate" title={proj.enderecoObra}>{proj.enderecoObra}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Layers size={12} className="shrink-0 text-slate-500" aria-hidden="true" />
                      {(resumoPorProjeto.get(proj.id)?.etapasConcluidas ?? 0)}/
                      {(resumoPorProjeto.get(proj.id)?.etapasTotal ?? 0)} etapas concluídas
                    </span>
                  </div>
                </div>

                {/* Sinais de atenção — atraso, boletim parado e estouro de
                    orçamento eram visíveis só no dashboard, nunca aqui. */}
                {risco.temRisco && (
                  <div className="flex flex-wrap gap-1.5">
                    {risco.entregaVencida && (
                      <Chip tom="negativo" title="A previsão de entrega já venceu e a obra não foi finalizada.">
                        <CalendarX size={10} /> Prazo vencido
                      </Chip>
                    )}
                    {risco.etapasAtrasadas > 0 && (
                      <Chip tom="atencao" title="Etapas com prazo vencido sem conclusão.">
                        <AlertTriangle size={10} />
                        {risco.etapasAtrasadas} {risco.etapasAtrasadas === 1 ? 'etapa atrasada' : 'etapas atrasadas'}
                      </Chip>
                    )}
                    {risco.medicoesPendentes > 0 && (
                      <Chip tom="informativo" title="Boletins de medição aguardando aprovação.">
                        <Clock3 size={10} />
                        {risco.medicoesPendentes} {risco.medicoesPendentes === 1 ? 'medição pendente' : 'medições pendentes'}
                      </Chip>
                    )}
                    {risco.estouroOrcamento > 0 && (
                      <Chip tom="negativo" title="Valor executado acima do orçado.">
                        <TrendingUp size={10} />
                        {risco.estouroOrcamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} acima
                      </Chip>
                    )}
                  </div>
                )}

                {/* Rodapé: o número que resume a obra à esquerda, a porta de
                    entrada à direita. */}
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <div className="min-w-0">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
                      Medido
                    </span>
                    <p className="data-font text-xs font-bold text-slate-900">
                      {(resumoPorProjeto.get(proj.id)?.valorExecutado ?? 0)
                        .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                  <Button
                    id={`enter-project-btn-${proj.id}`}
                    variante="suave"
                    tamanho="sm"
                    onClick={() => onSelectProject(proj.id)}
                  >
                    Abrir
                    <ArrowRight size={13} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </EstadoDaLista>
      </div>

      <CarregarMais temMais={lista.temMais} restantes={lista.restantes} onCarregarMais={lista.carregarMais} />

      {/* Add Project Modal Overlay */}
      <Modal
        id="add-project-modal"
        open={showAddModal}
        onClose={closeWizard}
        title="Assistente de Nova Obra"
        description={`Passo ${wizardStep} de 3`}
        size="lg"
        bloqueado={isSaving}
      >
              {/* Onde antes havia três bolinhas.
                  Elas repetiam o que o subtítulo do diálogo já diz por escrito
                  ("Passo 2 de 3") e diziam pior: as duas inativas eram
                  `slate-300`, 1,49:1 sobre o fundo — abaixo do piso de 3:1 da
                  SC 1.4.11 e, na prática, invisíveis. Sobrou uma trilha que
                  mostra o QUANTO já andou, com o tom medido de PREENCHIMENTO. */}
              <div className="h-1 bg-slate-100" aria-hidden="true">
                <div
                  className={`h-full ${PREENCHIMENTO.acao} transition-all duration-300`}
                  style={{ width: `${(wizardStep / 3) * 100}%` }}
                />
              </div>

              {/* Form Content — `areaRef` restringe a busca pelo primeiro campo
                  inválido a este corpo, para o foco não escapar para a lista atrás. */}
              <div ref={areaRef as React.RefObject<HTMLDivElement>} className="p-4 space-y-4 text-left overflow-y-auto max-h-[70vh]">
                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 1: Dados básicos do projeto</h4>
                    <Field id="add-proj-nome" label="Título / Nome do Projeto" erro={erros.nome} required>
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          placeholder="Ex: Reforma de Cobertura Residencial"
                          value={formNome}
                          onChange={(e) => { setFormNome(e.target.value); limparErro('nome'); }}
                        />
                      )}
                    </Field>

                    <Field id="add-proj-responsavel" label="Gerente de Obra Responsável" erro={erros.responsavel} required>
                      {(props) => (
                        <Select
                          {...props}
                          value={formResponsavel}
                          onChange={(e) => { setFormResponsavel(e.target.value); limparErro('responsavel'); }}
                        >
                          <option value="">Selecione um responsável...</option>
                          {funcionarios.map(f => (
                            <option key={f.id} value={f.id}>{f.nome} ({f.cargo})</option>
                          ))}
                        </Select>
                      )}
                    </Field>

                    <Field id="add-proj-endereco" label="Endereço do Canteiro" erro={erros.endereco} required>
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          placeholder="Rua, Número, Bairro, Cidade - UF"
                          value={formEndereco}
                          onChange={(e) => { setFormEndereco(e.target.value); limparErro('endereco'); }}
                        />
                      )}
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field id="add-proj-inicio" label="Data Início Mobilização" erro={erros.inicio} required>
                        {(props) => (
                          <Input
                            {...props}
                            type="date"
                            value={formInicio}
                            onChange={(e) => { setFormInicio(e.target.value); limparErro('inicio'); limparErro('fim'); }}
                          />
                        )}
                      </Field>
                      <Field id="add-proj-fim" label="Data Previsão Entrega" erro={erros.fim} required>
                        {(props) => (
                          <Input
                            {...props}
                            type="date"
                            value={formFim}
                            onChange={(e) => { setFormFim(e.target.value); limparErro('fim'); }}
                          />
                        )}
                      </Field>
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                      <Button variante="fantasma" onClick={closeWizard}>
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        onClick={() => { if (validarAssistente(checagensPasso1())) setWizardStep(2); }}
                      >
                        Próximo: Proposta →
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 2: Vinculação de Proposta</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <Field id="add-proj-cliente" label="Cliente Vinculado" erro={erros.cliente} required>
                        {(props) => (
                          <Select
                            {...props}
                            value={formClienteId}
                            onChange={(e) => {
                              setFormClienteId(e.target.value);
                              setFormPropostaId('');
                              limparErro('cliente');
                            }} className="font-medium"
                          >
                            <option value="">Selecione um cliente...</option>
                            {clientes.map(c => (
                              <option key={c.id} value={c.id}>{c.nome}</option>
                            ))}
                          </Select>
                        )}
                      </Field>

                      <Field id="add-proj-proposta" label="Proposta Aprovada (Opcional)">
                        {(props) => (
                          <Select
                            {...props}
                            value={formPropostaId}
                            onChange={(e) => setFormPropostaId(e.target.value)}
                            disabled={!formClienteId}
                          >
                            <option value="">Nenhuma proposta vinculada</option>
                            {getApprovedProposalsForClient(formClienteId).map(p => (
                              <option key={p.id} value={p.id}>{p.numero} - {p.descricao}</option>
                            ))}
                          </Select>
                        )}
                      </Field>

                      {formPropostaId && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
                          <span className="font-bold block text-2xs uppercase tracking-wider text-blue-400">Resumo da Proposta Comercial</span>
                          <p><strong>Descrição:</strong> {propostas.find(p => p.id === formPropostaId)?.descricao}</p>
                          <p><strong>Investimento:</strong> {propostas.find(p => p.id === formPropostaId)?.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                          <p><strong>Prazo:</strong> {formatarPrazo(propostas.find(p => p.id === formPropostaId)?.prazoExecucaoDias)}</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                      <Button variante="fantasma" onClick={() => setWizardStep(1)}>
                        ← Voltar
                      </Button>
                      <Button
                        type="button"
                        onClick={() => { if (validarAssistente(checagensPasso2())) setWizardStep(3); }}
                      >
                        Próximo: Cronograma →
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 3: Cronograma Inicial Sugerido</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Com base no prazo do projeto (<strong className="text-slate-700">{formatarDataBR(formInicio)}</strong> a <strong className="text-slate-700">{formatarDataBR(formFim)}</strong>), estas frentes de trabalho serão criadas automaticamente, escalonadas ao longo do prazo e sob responsabilidade de <strong className="text-slate-700">{responsavelNome}</strong>:
                    </p>

                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-200 bg-slate-50/50">
                      {previewStages.map((stage, i) => (
                        <div key={stage.nome} className="p-2.5 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-bold text-slate-900">{i + 1}. {stage.nome}</p>
                            <p className="text-2xs text-slate-500 font-medium">Responsável: {responsavelNome}</p>
                          </div>
                          <span className="font-mono font-semibold text-slate-600">
                            {stage.ini} a {stage.fim}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                      <Button variante="fantasma" onClick={() => setWizardStep(2)}>
                        ← Voltar
                      </Button>
                      {/* Era verde sólido escrito à mão. Criar a obra é a AÇÃO
                          principal do assistente, não um estado "aprovado" —
                          e a Regra do Papel manda o papel decidir a cor. */}
                      <Button
                        id="submit-add-project-btn"
                        onClick={handleCreateProject}
                        carregando={isSaving}
                      >
                        {!isSaving && <FolderPlus size={14} />}
                        <span>{isSaving ? 'Iniciando...' : 'Planejar Obra'}</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
      </Modal>

      {/* Cascading Delete Impact Modal */}
      <Modal
        id="delete-impact-modal"
        open={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        title="Aviso de Impacto de Exclusão"
        size="md"
        bloqueado={isDeleting}
      >
        {projectToDelete && (
              <div className="p-4 space-y-4 text-left">
                <p className="text-xs text-slate-700 leading-relaxed">
                  A exclusão do projeto <strong className="text-slate-900">"{projectToDelete.nome}"</strong> é uma ação irreversível. Todos os dados vinculados nos módulos do Analizze serão removidos permanentemente em cascata:
                </p>

                <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 space-y-2 text-xs font-semibold text-rose-950">
                  <div className="flex justify-between">
                    <span>Itens de orçamento associados:</span>
                    <span className="font-mono text-rose-700">{resumoPorProjeto.get(projectToDelete.id)?.itensTotal ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Atividades do cronograma:</span>
                    <span className="font-mono text-rose-700">{resumoPorProjeto.get(projectToDelete.id)?.etapasTotal ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Boletins de medição lançados:</span>
                    <span className="font-mono text-rose-700">{resumoPorProjeto.get(projectToDelete.id)?.medicoesTotal ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Documentações anexadas:</span>
                    <span className="font-mono text-rose-700">{documentos.filter(d => d.projetoId === projectToDelete.id).length}</span>
                  </div>
                </div>

                <p className="text-2xs text-rose-600 font-medium">
                  Confirma que deseja prosseguir e excluir este projeto juntamente com todos os seus registros de histórico financeiro e de campo?
                </p>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <Button variante="fantasma" disabled={isDeleting} onClick={() => setProjectToDelete(null)}>
                    Cancelar
                  </Button>
                  <Button
                    id="confirm-delete-project-btn"
                    variante="perigo"
                    carregando={isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      // Só fecha o modal e comemora depois que o banco confirma:
                      // em erro (ou perfil sem permissão) o hook já mostrou o
                      // motivo e restaurou a obra na lista.
                      const ok = await onDeleteProjeto(projectToDelete.id);
                      setIsDeleting(false);
                      if (!ok) return;
                      setProjectToDelete(null);
                      toast.success('Projeto e dados vinculados removidos com sucesso.');
                    }}
                  >
                    {isDeleting ? 'Excluindo...' : 'Excluir Obra e Vínculos'}
                  </Button>
                </div>
              </div>
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
export default memo(ProjetosTab);
