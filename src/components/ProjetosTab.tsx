import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
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
  CalendarX
} from 'lucide-react';
import { Projeto, Cliente, Proposta, ItemOrcamento, EdicaoObra, EdicaoEtapa, EtapaCronograma, EtapaOrcamentoVinculo, MedicaoObra, Documento, DocumentoCategoria, CorCategoriaDocumento, EscopoDocumento, AlteracaoOrcamento, Funcionario, Fornecedor, Acesso, ProjetoEquipeMembro, InsumoProjeto, InsumoCatalogo, AjustePreco } from '../types';
import type { NovaVersaoInput } from '../services/documentosService';
import type { Role } from '../lib/database.types';
import { formatarPrazo } from '../lib/prazo';
import { dataLocal, formatarDataBR } from '../lib/data';
import { avancoFisicoDaObra, avaliarRiscoObra } from '../lib/avanco';
import { podeGerenciarObra } from '../constants/tabAccess';
import { StatusBadge } from '../constants/status';
import { Modal, Button, SeletorOrdenacao, CarregarMais } from './ui';
import { useListaOrdenada, compararTexto, compararData, type OpcaoOrdenacao } from '../hooks/useListaOrdenada';
import ProjetoConsole from './ProjetoConsole';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

interface ProjetosTabProps {
  projetos: Projeto[];
  clientes: Cliente[];
  propostas: Proposta[];
  funcionarios: Funcionario[];
  fornecedores: Fornecedor[];
  orcamentos: ItemOrcamento[];
  alteracoesOrcamento: AlteracaoOrcamento[];
  insumosProjeto: InsumoProjeto[];
  catalogo: InsumoCatalogo[];
  cronograma: EtapaCronograma[];
  vinculos: EtapaOrcamentoVinculo[];
  medicoes: MedicaoObra[];
  documentos: Documento[];
  documentoCategorias: DocumentoCategoria[];
  projetoEquipe: ProjetoEquipeMembro[];
  perfisCampo: Acesso[];
  selectedProjectId: string | null;
  role?: Role;
  loading?: boolean;
  onSelectProject: (id: string | null) => void;
  onAddProjeto: (proj: Projeto) => Promise<string | null>;
  // Devolvem se a escrita chegou ao banco — a tela só confirma depois disso.
  onUpdateProjeto: (id: string, patch: EdicaoObra) => Promise<boolean>;
  onDeleteProjeto: (id: string) => Promise<boolean>;
  onUpdateProjetoSituacao: (projId: string, situacao: Projeto['situacao']) => Promise<boolean>;
  onAddEtapa: (etapa: EtapaCronograma) => Promise<boolean>;
  onUpdateEtapa: (id: string, patch: EdicaoEtapa) => Promise<boolean>;
  onRemoveEtapa: (id: string) => Promise<boolean>;
  onAddOrcamentoItem: (item: ItemOrcamento) => Promise<ItemOrcamento | null>;
  onAjustarPrecoInsumo: (id: string, ajuste: AjustePreco) => Promise<InsumoProjeto | null>;
  onAjustarQuantidadeInsumo: (id: string, quantidade: number) => Promise<InsumoProjeto | null>;
  onRessincronizarBaseInsumo: (id: string, novaBase: number) => Promise<InsumoProjeto | null>;
  onRemoveInsumoProjeto: (id: string) => Promise<boolean>;
  onAddVinculo: (vinculo: EtapaOrcamentoVinculo) => Promise<boolean>;
  onRemoveVinculo: (id: string) => void;
  onAddMedicao: (med: { projetoId: string; etapaId: string; percentualMedido: number; observacoes: string }, fotos: File[]) => Promise<boolean>;
  onAprovarMedicao: (medicaoId: string, permitirOverrun?: boolean) => Promise<'ok' | 'overrun' | 'error'>;
  onRejeitarMedicao: (medicaoId: string, motivo: string) => Promise<boolean>;
  onFotoUrlMedicao: (storagePath: string) => Promise<string | null>;
  // Repassados inteiros ao console — a aba não usa documento para nada.
  onAddDocumento: (doc: Pick<Documento, 'nome' | 'tipo' | 'projetoId'>, entrada: NovaVersaoInput) => Promise<boolean>;
  onAddVersionDocumento: (documentoId: string, entrada: NovaVersaoInput) => Promise<boolean>;
  onUpdateDocumento: (id: string, patch: { nome?: string; tipo?: string }) => Promise<boolean>;
  onDeleteDocumento: (id: string) => Promise<boolean>;
  onDownloadDocumento: (doc: Documento, storagePath?: string) => void;
  onPreviewUrlDocumento: (storagePath: string) => Promise<string | null>;
  onAddCategoriaDocumento: (nome: string, cor: CorCategoriaDocumento, escopo: EscopoDocumento) => void;
  onUpdateCategoriaDocumento: (id: string, patch: { nome?: string; cor?: CorCategoriaDocumento }) => void;
  onDeleteCategoriaDocumento: (id: string) => void;
  onAddMembroEquipe: (projetoId: string, profileId: string, papel: string) => Promise<boolean>;
  onRemoveMembroEquipe: (id: string) => void;
}

export default function ProjetosTab({
  projetos,
  clientes,
  propostas,
  funcionarios,
  fornecedores,
  orcamentos,
  alteracoesOrcamento,
  insumosProjeto,
  catalogo,
  cronograma,
  vinculos,
  medicoes,
  documentos,
  documentoCategorias,
  projetoEquipe,
  perfisCampo,
  selectedProjectId,
  role,
  loading = false,
  onSelectProject,
  onAddProjeto,
  onUpdateProjeto,
  onDeleteProjeto,
  onUpdateProjetoSituacao,
  onAddEtapa,
  onUpdateEtapa,
  onRemoveEtapa,
  onAddOrcamentoItem,
  onAjustarPrecoInsumo,
  onAjustarQuantidadeInsumo,
  onRessincronizarBaseInsumo,
  onRemoveInsumoProjeto,
  onAddVinculo,
  onRemoveVinculo,
  onAddMedicao,
  onAprovarMedicao,
  onRejeitarMedicao,
  onFotoUrlMedicao,
  onAddDocumento,
  onAddVersionDocumento,
  onUpdateDocumento,
  onDeleteDocumento,
  onDownloadDocumento,
  onPreviewUrlDocumento,
  onAddCategoriaDocumento,
  onUpdateCategoriaDocumento,
  onDeleteCategoriaDocumento,
  onAddMembroEquipe,
  onRemoveMembroEquipe
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
  const [projectToDelete, setProjectToDelete] = useState<Projeto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Calculations
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
  ], [cronograma, vinculos, orcamentos]);

  const lista = useListaOrdenada({ itens: filteredProjetos, opcoes: ORDENS_OBRA, porPagina: 24 });

  // Mesma função do console e do dashboard (ponderada pelo orçamento vinculado
  // a cada etapa). Aqui era uma média simples, então a mesma obra mostrava um
  // número na lista e outro ao entrar.
  const getProjectProgress = (projId: string) =>
    avancoFisicoDaObra(projId, cronograma, vinculos, orcamentos);

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
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome || !formClienteId || !formResponsavel || !formEndereco || !formInicio || !formFim) {
      toast.error("Por favor, preencha todos os campos obrigatórios: Título, Cliente, Responsável, Endereço, Início e Entrega.");
      return;
    }
    if (formFim < formInicio) {
      toast.error("A data de entrega não pode ser anterior à data de início.");
      return;
    }

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

  // If a project is selected, render the IMMERSIVE PROJECT CONSOLE immediately!
  const selectedProject = projetos.find(p => p.id === selectedProjectId);
  if (selectedProject) {
    return (
      <ProjetoConsole
        /**
         * `key` por obra: trocar de obra REMONTA o console.
         *
         * Sem ela, o React reaproveitava a instância e o estado do console
         * sobrevivia à troca — inclusive a etapa selecionada para medir e as
         * fotos já escolhidas. O banco aceitava a combinação (as duas FKs de
         * `medicoes_obra` eram independentes) e o dinheiro caía no orçamento da
         * obra errada, porque o fan-out segue o vínculo da ETAPA. Ver §3.6 e a
         * trigger `trg_medicao_etapa_do_projeto`.
         *
         * Os formulários já não dependem disto: cada diálogo do console é um
         * componente montado só enquanto está aberto (ver `projeto-console/`).
         * A `key` segue necessária pela sub-aba e pelos filtros da tela.
         *
         * Custo: a sub-aba aberta e os filtros voltam ao padrão ao trocar de obra.
         * É o comportamento certo — são estado DAQUELA obra, não da tela.
         */
        key={selectedProject.id}
        projeto={selectedProject}
        clientes={clientes}
        funcionarios={funcionarios.filter(f => f.status === 'Ativo')}
        fornecedores={fornecedores}
        orcamentos={orcamentos}
        alteracoesOrcamento={alteracoesOrcamento}
        cronogramas={cronograma}
        vinculos={vinculos}
        medicoes={medicoes}
        documentos={documentos}
        documentoCategorias={documentoCategorias}
        projetoEquipe={projetoEquipe}
        perfisCampo={perfisCampo}
        role={role}
        onClose={() => onSelectProject(null)}
        onUpdateProjeto={onUpdateProjeto}
        onUpdateProjetoSituacao={onUpdateProjetoSituacao}
        onAddEtapa={onAddEtapa}
        onUpdateEtapa={onUpdateEtapa}
        onRemoveEtapa={onRemoveEtapa}
        insumosProjeto={insumosProjeto}
        catalogo={catalogo}
        onAddOrcamentoItem={onAddOrcamentoItem}
        onAjustarPrecoInsumo={onAjustarPrecoInsumo}
        onAjustarQuantidadeInsumo={onAjustarQuantidadeInsumo}
        onRessincronizarBaseInsumo={onRessincronizarBaseInsumo}
        onRemoveInsumoProjeto={onRemoveInsumoProjeto}
        onAddVinculo={onAddVinculo}
        onRemoveVinculo={onRemoveVinculo}
        onAddMedicao={onAddMedicao}
        onAprovarMedicao={onAprovarMedicao}
        onRejeitarMedicao={onRejeitarMedicao}
        onFotoUrlMedicao={onFotoUrlMedicao}
        onAddDocumento={onAddDocumento}
        onAddVersionDocumento={onAddVersionDocumento}
        onUpdateDocumento={onUpdateDocumento}
        onDeleteDocumento={onDeleteDocumento}
        onDownloadDocumento={onDownloadDocumento}
        onPreviewUrlDocumento={onPreviewUrlDocumento}
        onAddCategoriaDocumento={onAddCategoriaDocumento}
        onUpdateCategoriaDocumento={onUpdateCategoriaDocumento}
        onDeleteCategoriaDocumento={onDeleteCategoriaDocumento}
        onAddMembroEquipe={onAddMembroEquipe}
        onRemoveMembroEquipe={onRemoveMembroEquipe}
      />
    );
  }

  return (
    <div id="projetos-tab-content" className="space-y-6">
      
      {/* Title block */}
      <div id="projetos-title" className="flex items-center justify-between">
        <div className="text-left">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Obras e Projetos Ativos</h2>
          <p className="text-xs text-slate-500">Módulo central de acompanhamento, orçamento integrado, medições de campo e cronograma de obra.</p>
        </div>
        {podeGerenciar && (
          <button
            id="add-projeto-trigger-btn"
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm"
          >
            <FolderPlus size={15} />
            <span>Iniciar Obra</span>
          </button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div id="projetos-filters" className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
          <input
            id="proj-search-text-input"
            type="text"
            placeholder="Buscar por nome da obra, gerente responsável ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-800"
          />
        </div>

        <div>
          <select
            id="proj-status-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-600 font-medium cursor-pointer"
          >
            <option value="Todas">Situação: Todas</option>
            <option value="Planejamento">Situação: Planejamento</option>
            <option value="Em Execução">Situação: Em Execução</option>
            <option value="Pausado">Situação: Pausado</option>
            <option value="Finalizado">Situação: Finalizado</option>
          </select>
        </div>
      </div>

      {!loading && filteredProjetos.length > 0 && (
        <SeletorOrdenacao
          opcoes={lista.opcoes}
          valor={lista.ordemId}
          onChange={lista.setOrdemId}
          mostrando={lista.mostrando}
          total={lista.total}
        />
      )}

      {/* Grid List of Projects */}
      <div id="projetos-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          /* Sem isto a tela mostrava "Nenhum projeto cadastrado" com o CTA de
             criar enquanto o fetch estava em curso — convite a duplicar obra. */
          <div className="col-span-full flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
            <Spinner size={22} />
            <span className="text-xs font-semibold">Carregando obras...</span>
          </div>
        ) : lista.total === 0 ? (
          <div className="col-span-full">
            {projetos.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="Nenhum projeto cadastrado"
                description={
                  podeGerenciar
                    ? 'Inicie um planejamento de obra a partir de propostas aprovadas ou do zero.'
                    : 'Nenhuma obra foi atribuída ao seu perfil ainda.'
                }
                actionLabel={podeGerenciar ? 'Iniciar Obra' : undefined}
                onAction={podeGerenciar ? () => setShowAddModal(true) : undefined}
              />
            ) : (
              <EmptyState
                icon={Search}
                title="Nenhuma obra encontrada"
                description="Nenhuma obra corresponde à busca ou ao filtro de situação aplicados."
              />
            )}
          </div>
        ) : (
          lista.visiveis.map((proj, index) => {
            const progress = getProjectProgress(proj.id);
            const risco = avaliarRiscoObra(proj, cronograma, medicoes, orcamentos);

            return (
              <motion.div
                key={proj.id}
                id={`project-card-${proj.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.35) }}
                className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden group"
              >
                {/* Upper info block */}
                <div className="p-3.5 space-y-2.5 text-left">
                  <div className="flex justify-between items-start">
                    <StatusBadge type="projeto" status={proj.situacao} />
                    {podeGerenciar && (
                      <button
                        id={`delete-project-btn-${proj.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(proj);
                        }}
                        className="text-slate-300 hover:text-rose-600 p-1 rounded transition active:scale-95 shrink-0"
                        title="Excluir Obra"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div>
                    <h3 className="font-bold text-xs text-slate-900 group-hover:text-blue-600 transition truncate" title={proj.nome}>
                      {proj.nome}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      Cliente: <strong>{getClientName(proj.clienteId)}</strong>
                    </p>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2 rounded-md">
                    <p className="flex items-center gap-1.5 truncate">
                      <MapPin size={12} className="text-slate-400 shrink-0" />
                      <span>{proj.enderecoObra}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-400 shrink-0" />
                      <span>Término: {formatarDataBR(proj.dataFim)}</span>
                    </p>
                  </div>

                  {/* Sinais de atenção — atraso, boletim parado e estouro de
                      orçamento eram visíveis só no dashboard, nunca aqui. */}
                  {risco.temRisco && (
                    <div className="flex flex-wrap gap-1.5">
                      {risco.entregaVencida && (
                        <span
                          className="inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/60"
                          title="A previsão de entrega já venceu e a obra não foi finalizada."
                        >
                          <CalendarX size={10} /> Prazo vencido
                        </span>
                      )}
                      {risco.etapasAtrasadas > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60"
                          title="Etapas com prazo vencido sem conclusão."
                        >
                          <AlertTriangle size={10} />
                          {risco.etapasAtrasadas} {risco.etapasAtrasadas === 1 ? 'etapa atrasada' : 'etapas atrasadas'}
                        </span>
                      )}
                      {risco.medicoesPendentes > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200/60"
                          title="Boletins de medição aguardando aprovação."
                        >
                          <Clock3 size={10} />
                          {risco.medicoesPendentes} {risco.medicoesPendentes === 1 ? 'medição pendente' : 'medições pendentes'}
                        </span>
                      )}
                      {risco.estouroOrcamento > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/60"
                          title="Valor executado acima do orçado."
                        >
                          <TrendingUp size={10} />
                          {risco.estouroOrcamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} acima
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Progress bar section */}
                <div className="px-3.5 pb-3.5 space-y-1.5 text-left">
                  <div className="flex justify-between text-xs font-mono text-slate-400">
                    <span>Avanço Físico</span>
                    <span className="font-bold text-slate-800">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200 flex">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        proj.situacao === 'Em Execução' ? 'bg-blue-500' :
                        proj.situacao === 'Finalizado' ? 'bg-emerald-500' : 'bg-slate-400'
                      }`} 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>

                {/* Card footer action link */}
                <button
                  id={`enter-project-btn-${proj.id}`}
                  onClick={() => onSelectProject(proj.id)}
                  className="w-full bg-slate-50 hover:bg-blue-600 text-slate-700 hover:text-white font-bold py-2 text-xs border-t border-slate-200 flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <span>Gerenciar Obra</span>
                  <ArrowRight size={13} />
                </button>
              </motion.div>
            );
          })
        )}
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
              {/* Progress Indicator Dots */}
              <div className="flex justify-center gap-2 py-2 bg-slate-100/50 border-b border-slate-200/50">
                <span className={`h-2 w-2 rounded-full transition-all duration-300 ${wizardStep === 1 ? 'bg-blue-600 w-4' : 'bg-slate-300'}`}></span>
                <span className={`h-2 w-2 rounded-full transition-all duration-300 ${wizardStep === 2 ? 'bg-blue-600 w-4' : 'bg-slate-300'}`}></span>
                <span className={`h-2 w-2 rounded-full transition-all duration-300 ${wizardStep === 3 ? 'bg-blue-600 w-4' : 'bg-slate-300'}`}></span>
              </div>

              {/* Form Content */}
              <div className="p-4 space-y-4 text-left overflow-y-auto max-h-[70vh]">
                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 1: Dados básicos do projeto</h4>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Título / Nome do Projeto *</label>
                      <input
                        id="add-proj-nome"
                        type="text"
                        required
                        placeholder="Ex: Reforma de Cobertura Residencial"
                        value={formNome}
                        onChange={(e) => setFormNome(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Gerente de Obra Responsável *</label>
                      <select
                        id="add-proj-responsavel"
                        required
                        value={formResponsavel}
                        onChange={(e) => setFormResponsavel(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white focus:border-blue-600 text-slate-800"
                      >
                        <option value="">Selecione um responsável...</option>
                        {funcionarios.map(f => (
                          <option key={f.id} value={f.id}>{f.nome} ({f.cargo})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Endereço do Canteiro *</label>
                      <input
                        id="add-proj-endereco"
                        type="text"
                        required
                        placeholder="Rua, Número, Bairro, Cidade - UF"
                        value={formEndereco}
                        onChange={(e) => setFormEndereco(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Data Início Mobilização *</label>
                        <input
                          id="add-proj-inicio"
                          type="date"
                          required
                          value={formInicio}
                          onChange={(e) => setFormInicio(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Data Previsão Entrega *</label>
                        <input
                          id="add-proj-fim"
                          type="date"
                          required
                          value={formFim}
                          onChange={(e) => setFormFim(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={closeWizard}
                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!formNome || !formResponsavel || !formEndereco || !formInicio || !formFim) {
                            toast.error("Por favor, preencha todos os campos obrigatórios do Passo 1.");
                            return;
                          }
                          setWizardStep(2);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm cursor-pointer border-none"
                      >
                        Próximo: Proposta →
                      </button>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 2: Vinculação de Proposta</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente Vinculado *</label>
                        <select
                          id="add-proj-cliente"
                          required
                          value={formClienteId}
                          onChange={(e) => {
                            setFormClienteId(e.target.value);
                            setFormPropostaId('');
                          }}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700 font-medium"
                        >
                          <option value="">Selecione um cliente...</option>
                          {clientes.map(c => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Proposta Aprovada (Opcional)</label>
                        <select
                          id="add-proj-proposta"
                          value={formPropostaId}
                          onChange={(e) => setFormPropostaId(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700"
                          disabled={!formClienteId}
                        >
                          <option value="">Nenhuma proposta vinculada</option>
                          {getApprovedProposalsForClient(formClienteId).map(p => (
                            <option key={p.id} value={p.id}>{p.numero} - {p.descricao}</option>
                          ))}
                        </select>
                      </div>

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
                      <button
                        type="button"
                        onClick={() => setWizardStep(1)}
                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition cursor-pointer"
                      >
                        ← Voltar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!formClienteId) {
                            toast.error("Por favor, selecione o cliente vinculado.");
                            return;
                          }
                          setWizardStep(3);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm cursor-pointer border-none"
                      >
                        Próximo: Cronograma →
                      </button>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-950 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">Passo 3: Cronograma Inicial Sugerido</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Com base no prazo do projeto (<strong className="text-slate-700">{formatarDataBR(formInicio)}</strong> a <strong className="text-slate-700">{formatarDataBR(formFim)}</strong>), estas frentes de trabalho serão criadas automaticamente, escalonadas ao longo do prazo e sob responsabilidade de <strong className="text-slate-700">{responsavelNome}</strong>:
                    </p>

                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-200 shadow-xs bg-slate-50/50">
                      {previewStages.map((stage, i) => (
                        <div key={stage.nome} className="p-2.5 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-bold text-slate-900">{i + 1}. {stage.nome}</p>
                            <p className="text-2xs text-slate-400 font-medium">Responsável: {responsavelNome}</p>
                          </div>
                          <span className="font-mono font-semibold text-slate-600">
                            {stage.ini} a {stage.fim}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setWizardStep(2)}
                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition cursor-pointer"
                      >
                        ← Voltar
                      </button>
                      <button
                        id="submit-add-project-btn"
                        type="button"
                        disabled={isSaving}
                        onClick={handleCreateProject}
                        className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 cursor-pointer border-none"
                      >
                        {isSaving ? (
                          <>
                            <Spinner size={14} />
                            <span>Iniciando...</span>
                          </>
                        ) : (
                          <>
                            <FolderPlus size={14} />
                            <span>Planejar Obra</span>
                          </>
                        )}
                      </button>
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
                    <span className="font-mono text-rose-700">{orcamentos.filter(o => o.projetoId === projectToDelete.id).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Atividades do cronograma:</span>
                    <span className="font-mono text-rose-700">{cronograma.filter(c => c.projetoId === projectToDelete.id).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Boletins de medição lançados:</span>
                    <span className="font-mono text-rose-700">{medicoes.filter(m => m.projetoId === projectToDelete.id).length}</span>
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

    </div>
  );
}
