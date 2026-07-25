import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, 
  Calendar, 
  DollarSign, 
  Clock, 
  Plus, 
  Layers, 
  Camera, 
  Trash2, 
  History, 
  Percent, 
  Building2,
  ChevronLeft,
  UserPlus,
  ShieldCheck,
  Pencil,
  CalendarPlus,
  Check,
  X,
  Clock3
} from 'lucide-react';
import {
  Cliente,
  Projeto,
  EdicaoObra,
  EdicaoEtapa,
  ItemOrcamento,
  AlteracaoOrcamento,
  EtapaCronograma,
  EtapaOrcamentoVinculo,
  Funcionario,
  MedicaoObra,
  Documento,
  CategoriaCusto,
  Fornecedor,
  Acesso,
  ProjetoEquipeMembro,
  InsumoProjeto,
  InsumoCatalogo,
  AjustePreco,
  DocumentoCategoria,
  CorCategoriaDocumento,
  EscopoDocumento,
  FotoMedicao
} from '../types';
import type { Role } from '../lib/database.types';
import type { NovaVersaoInput } from '../services/documentosService';
import { buildOrcamentoItem } from '../lib/orcamento';
import { dataLocal, formatarDataBR } from '../lib/data';
import { calcularAvancoFisico } from '../lib/avanco';
import { canAccessConsoleTab, podeGerenciarObra, podeMedirObra } from '../constants/tabAccess';
import DocumentosPanel from './DocumentosPanel';
import InsumosObra from './InsumosObra';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

export function getWorkingDays(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0;
  
  const startParts = startDateStr.split('-');
  const endParts = endDateStr.split('-');
  if (startParts.length !== 3 || endParts.length !== 3) return 0;
  
  const start = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));
  const end = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (start > end) return 0;
  
  let count = 0;
  const curDate = new Date(start.getTime());
  
  while (curDate <= end) {
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0 = Sunday, 6 = Saturday
      count++;
    }
    curDate.setDate(curDate.getDate() + 1);
  }
  
  return count;
}

/**
 * Miniatura de uma foto do boletim. O bucket `medicao-fotos` é privado, então a
 * URL é assinada na hora da exibição. Antes a tela listava só o nome do arquivo
 * — a foto existia no Storage e ninguém conseguia vê-la pelo sistema.
 */
interface FotoBoletimProps {
  foto: FotoMedicao;
  onUrl: (storagePath: string) => Promise<string | null>;
  /** O projeto não usa @types/react, então `key` entra nas props — igual ToastItem. */
  key?: string;
}

function FotoBoletim({ foto, onUrl }: FotoBoletimProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    onUrl(foto.storagePath).then((assinada) => {
      if (!ativo) return;
      if (assinada) setUrl(assinada);
      else setFalhou(true);
    });
    return () => {
      ativo = false;
    };
    // `onUrl` não entra: a prop é recriada a cada render do App e a URL
    // assinada muda a cada chamada — reagir a ela seria um laço infinito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto.storagePath]);

  if (falhou) {
    return (
      <span
        className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-500"
        title="Não foi possível carregar a imagem."
      >
        <Camera size={11} className="shrink-0" />
        <span className="font-mono">{foto.nome}</span>
      </span>
    );
  }

  if (!url) {
    return <span className="h-14 w-14 rounded-lg bg-slate-100 border border-slate-200 animate-pulse shrink-0" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`Abrir ${foto.nome}`}
      className="h-14 w-14 rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition shrink-0 block"
    >
      <img src={url} alt={foto.nome} className="h-full w-full object-cover" loading="lazy" />
    </a>
  );
}

interface ProjetoConsoleProps {
  projeto: Projeto;
  clientes: Cliente[];
  funcionarios: Funcionario[];
  fornecedores: Fornecedor[];
  orcamentos: ItemOrcamento[];
  alteracoesOrcamento: AlteracaoOrcamento[];
  insumosProjeto: InsumoProjeto[];
  catalogo: InsumoCatalogo[];
  cronogramas: EtapaCronograma[];
  vinculos: EtapaOrcamentoVinculo[];
  medicoes: MedicaoObra[];
  documentos: Documento[];
  documentoCategorias: DocumentoCategoria[];
  projetoEquipe: ProjetoEquipeMembro[];
  perfisCampo: Acesso[];
  role?: Role;
  onClose: () => void;
  // As escritas devolvem se chegaram ao banco — nenhum toast de sucesso é
  // disparado antes disso (RLS pode recusar sem gerar erro; ver projetosService).
  onUpdateProjeto: (id: string, patch: EdicaoObra) => Promise<boolean>;
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
  /** URL temporária da foto do boletim — o bucket de medição é privado. */
  onFotoUrlMedicao: (storagePath: string) => Promise<string | null>;
  // Documentos da obra: o painel é o mesmo da aba Documentos, só que preso a
  // este projeto (escopo 'obra').
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

export default function ProjetoConsole({
  projeto,
  clientes,
  funcionarios,
  fornecedores,
  orcamentos,
  alteracoesOrcamento,
  insumosProjeto,
  catalogo,
  cronogramas,
  vinculos,
  medicoes,
  documentos,
  documentoCategorias,
  projetoEquipe,
  perfisCampo,
  role,
  onClose,
  onUpdateProjeto,
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
}: ProjetoConsoleProps) {
  const { toast, confirm } = useFeedback();

  // Quem pode aprovar/rejeitar medições (o guard real está no banco).
  const podeAprovar = podeGerenciarObra(role);
  /**
   * Quem pode escrever nos dados da obra. Antes o console só se defendia de
   * `campo`; `financeiro`, que tem apenas SELECT em projetos/itens_orcamento,
   * enxergava todos os botões de escrita — e o write falhava sem erro.
   */
  const podeGerenciar = podeGerenciarObra(role);
  const podeMedir = podeMedirObra(role);
  const [medicaoBusyId, setMedicaoBusyId] = useState<string | null>(null);

  const handleAprovar = async (medicaoId: string) => {
    setMedicaoBusyId(medicaoId);
    const result = await onAprovarMedicao(medicaoId, false);
    if (result === 'overrun') {
      setMedicaoBusyId(null);
      confirm({
        title: 'Acumulado acima de 100%',
        message: 'Aprovar esta medição faz o avanço da etapa ultrapassar 100%. Deseja aprovar mesmo assim?',
        onConfirm: async () => {
          setMedicaoBusyId(medicaoId);
          const forced = await onAprovarMedicao(medicaoId, true);
          if (forced === 'ok') toast.success('Medição aprovada (com override de 100%).');
          setMedicaoBusyId(null);
        },
      });
      return;
    }
    if (result === 'ok') toast.success('Medição aprovada.', 'O valor foi aplicado ao orçamento da obra.');
    setMedicaoBusyId(null);
  };

  /**
   * Rejeitar exige justificativa: o `confirm` compartilhado não coleta texto, e
   * sem motivo quem lançou o boletim (o campo, pelo app) fica sabendo só que foi
   * recusado. O banco aceita motivo nulo por compatibilidade — a obrigação é aqui.
   */
  const [medicaoParaRejeitar, setMedicaoParaRejeitar] = useState<MedicaoObra | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  const abrirRejeicao = (med: MedicaoObra) => {
    setMotivoRejeicao('');
    setMedicaoParaRejeitar(med);
  };

  const handleRejeitar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicaoParaRejeitar) return;
    const motivo = motivoRejeicao.trim();
    if (motivo.length < 5) {
      toast.error('Descreva o motivo da recusa.', 'Quem lançou a medição precisa saber o que corrigir.');
      return;
    }

    setMedicaoBusyId(medicaoParaRejeitar.id);
    const done = await onRejeitarMedicao(medicaoParaRejeitar.id, motivo);
    setMedicaoBusyId(null);
    if (!done) return;
    setMedicaoParaRejeitar(null);
    toast.success('Medição rejeitada.', 'O motivo ficou registrado no boletim.');
  };

  // Console Internal Tabs
  const [internalTab, setInternalTab] = useState<'geral' | 'orcamento' | 'cronograma' | 'medicoes' | 'documentos' | 'equipe'>('geral');

  // Nenhum papel deve ficar numa aba que ele não pode ver (financeiro não tem
  // política em cronograma/medições/documentos: voltariam vazias).
  useEffect(() => {
    if (!canAccessConsoleTab(role, internalTab)) setInternalTab('geral');
  }, [role, internalTab]);

  // Sub-modal states
  const [showAddBudgetItemModal, setShowAddBudgetItemModal] = useState(false);
  const [showAddMedicaoModal, setShowAddMedicaoModal] = useState(false);
  // O mesmo modal atende os dois sentidos do vínculo N:N: partindo da etapa
  // ("de quais linhas esta etapa consome verba") ou partindo do item de
  // orçamento ("em quais etapas este item é aplicado" — cimento em fundação,
  // alvenaria e reboco). Antes só existia o primeiro.
  const [vinculoModal, setVinculoModal] = useState<
    { modo: 'etapa'; etapaId: string } | { modo: 'item'; itemId: string } | null
  >(null);

  // Saving states for modals (Task 5)
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isSavingMedicao, setIsSavingMedicao] = useState(false);

  // Como a planilha orçamentária é agrupada. "Categoria" é a visão contábil
  // (Materiais, Mão de Obra…); "Etapa" é a visão de obra — quanto custa a
  // fundação —, derivada dos mesmos vínculos que a medição usa para ratear.
  const [orcamentoAgrupamento, setOrcamentoAgrupamento] = useState<'categoria' | 'etapa'>('categoria');

  // 1. New Budget Item State
  const [budgetCat, setBudgetCat] = useState<CategoriaCusto>('Materiais');
  const [budgetDesc, setBudgetDesc] = useState('');
  const [budgetOrcado, setBudgetOrcado] = useState('');
  const [budgetContratado, setBudgetContratado] = useState('');
  const [budgetFornecedorId, setBudgetFornecedorId] = useState('');

  // 2. New Measurement State
  const [medEtapaId, setMedEtapaId] = useState('');
  const [medPercent, setMedPercent] = useState('');
  const [medObs, setMedObs] = useState('');
  const [medPhotos, setMedPhotos] = useState<File[]>([]);

  // 3. New Document State

  // 4. New Vinculo (Etapa <-> Orçamento) State — o campo em branco é o "outro
  //    lado" do vínculo, definido pelo modo com que o modal foi aberto.
  const [vinculoItemId, setVinculoItemId] = useState('');
  const [vinculoEtapaAlvoId, setVinculoEtapaAlvoId] = useState('');
  const [vinculoPeso, setVinculoPeso] = useState('100');

  // 5. Edição da obra (nome/cliente/responsável/endereço/prazo)
  const [showEditObraModal, setShowEditObraModal] = useState(false);
  const [isSavingObra, setIsSavingObra] = useState(false);
  const [editNome, setEditNome] = useState(projeto.nome);
  const [editClienteId, setEditClienteId] = useState(projeto.clienteId);
  const [editResponsavelId, setEditResponsavelId] = useState(projeto.responsavelInternoId ?? '');
  const [editEndereco, setEditEndereco] = useState(projeto.enderecoObra);
  const [editInicio, setEditInicio] = useState(projeto.dataInicio);
  const [editFim, setEditFim] = useState(projeto.dataFim);

  // 6. Etapa do cronograma (criar/editar). Progresso e status não entram: são
  //    derivados das medições.
  const [etapaModal, setEtapaModal] = useState<{ modo: 'nova' | 'edicao'; etapa?: EtapaCronograma } | null>(null);
  const [isSavingEtapa, setIsSavingEtapa] = useState(false);
  const [etapaNome, setEtapaNome] = useState('');
  const [etapaInicio, setEtapaInicio] = useState('');
  const [etapaFim, setEtapaFim] = useState('');
  const [etapaResponsavel, setEtapaResponsavel] = useState('');

  // 7. New Equipe Membro (acesso de campo) State
  const [showAddMembroModal, setShowAddMembroModal] = useState(false);
  const [membroProfileId, setMembroProfileId] = useState('');
  const [membroPapel, setMembroPapel] = useState('');

  // Helpers
  const client = useMemo(() => {
    return clientes.find(c => c.id === projeto.clienteId);
  }, [clientes, projeto.clienteId]);

  const responsavelFuncionario = useMemo(() => {
    return funcionarios.find(f => f.id === projeto.responsavelInternoId);
  }, [funcionarios, projeto.responsavelInternoId]);

  const projectBudgetItems = useMemo(() => {
    return orcamentos.filter(item => item.projetoId === projeto.id);
  }, [orcamentos, projeto.id]);

  const projectInsumos = useMemo(
    () => insumosProjeto.filter(i => i.projetoId === projeto.id),
    [insumosProjeto, projeto.id]
  );

  const projectAlteracoes = useMemo(() => {
    return alteracoesOrcamento.filter(alt => alt.projetoId === projeto.id);
  }, [alteracoesOrcamento, projeto.id]);

  const projectSteps = useMemo(() => {
    return cronogramas.filter(step => step.projetoId === projeto.id);
  }, [cronogramas, projeto.id]);

  const projectMedicoes = useMemo(() => {
    return medicoes.filter(med => med.projetoId === projeto.id);
  }, [medicoes, projeto.id]);

  const projectVinculos = useMemo(() => {
    const stepIds = new Set(projectSteps.map(s => s.id));
    return vinculos.filter(v => stepIds.has(v.etapaId));
  }, [vinculos, projectSteps]);

  const projectEquipe = useMemo(() => {
    return projetoEquipe.filter(m => m.projetoId === projeto.id);
  }, [projetoEquipe, projeto.id]);

  /** Quanto do valor de cada item de orçamento já está alocado a etapas (0–100). */
  const pesoAlocadoPorItem = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of projectVinculos) {
      mapa.set(v.itemOrcamentoId, (mapa.get(v.itemOrcamentoId) ?? 0) + v.pesoPercentual);
    }
    return mapa;
  }, [projectVinculos]);

  /** Quantas etapas consomem cada item — "cimento em 3 etapas". */
  const etapasPorItem = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of projectVinculos) {
      mapa.set(v.itemOrcamentoId, (mapa.get(v.itemOrcamentoId) ?? 0) + 1);
    }
    return mapa;
  }, [projectVinculos]);

  /**
   * A planilha vista pelo lado da obra: os mesmos vínculos etapa↔item lidos na
   * direção contrária, para responder "quanto custa a fundação".
   *
   * O executado reproduz a conta do `fn_apply_medicao` (percentual medido da
   * etapa × peso do vínculo × valor orçado do item), e não um rateio do
   * `valorExecutado` do item — assim o número por etapa é o mesmo que foi de
   * fato aplicado no banco quando a medição entrou.
   *
   * A linha "não alocado" existe porque peso sobrando é dinheiro que nenhuma
   * medição vai alcançar: some as duas e você tem o total orçado da obra.
   */
  const alocacaoPorEtapa = useMemo(() => {
    const itensPorId = new Map<string, ItemOrcamento>(projectBudgetItems.map(i => [i.id, i]));

    const linhas = projectSteps.map(step => {
      const doStep = projectVinculos.filter(v => v.etapaId === step.id);
      let orcado = 0;
      let contratado = 0;
      let executado = 0;
      for (const v of doStep) {
        const item = itensPorId.get(v.itemOrcamentoId);
        if (!item) continue;
        const fatia = v.pesoPercentual / 100;
        orcado += fatia * item.valorOrcado;
        contratado += fatia * item.valorContratado;
        executado += fatia * item.valorOrcado * (step.percentualExecutado / 100);
      }
      return { etapa: step, vinculos: doStep.length, orcado, contratado, executado };
    });

    let orcadoNaoAlocado = 0;
    let contratadoNaoAlocado = 0;
    let itensNaoAlocados = 0;
    for (const item of projectBudgetItems) {
      const sobra = Math.max(0, 100 - (pesoAlocadoPorItem.get(item.id) ?? 0)) / 100;
      if (sobra <= 0) continue;
      itensNaoAlocados += 1;
      orcadoNaoAlocado += sobra * item.valorOrcado;
      contratadoNaoAlocado += sobra * item.valorContratado;
    }

    return {
      linhas,
      naoAlocado: { orcado: orcadoNaoAlocado, contratado: contratadoNaoAlocado, itens: itensNaoAlocados },
    };
  }, [projectSteps, projectVinculos, projectBudgetItems, pesoAlocadoPorItem]);

  /**
   * Encarregados agrupados por pessoa, com as etapas que cada um lidera. A tela
   * antes renderizava uma linha por etapa, então o mesmo encarregado aparecia
   * cinco vezes numa obra de cinco frentes.
   */
  const encarregados = useMemo(() => {
    const porPessoa = new Map<string, { funcionario?: Funcionario; etapas: string[] }>();
    for (const step of projectSteps) {
      const chave = step.responsavelId || 'sem-responsavel';
      const atual =
        porPessoa.get(chave) ?? {
          funcionario: funcionarios.find((f) => f.id === step.responsavelId),
          etapas: [],
        };
      atual.etapas.push(step.nome);
      porPessoa.set(chave, atual);
    }
    return Array.from(porPessoa, ([chave, dados]) => ({ chave, ...dados }));
  }, [projectSteps, funcionarios]);

  const perfisDisponiveis = useMemo(() => {
    const assignedIds = new Set(projectEquipe.map(m => m.profileId));
    return perfisCampo.filter(p => !assignedIds.has(p.id));
  }, [perfisCampo, projectEquipe]);

  const projectDocuments = useMemo(() => {
    return documentos.filter(doc => doc.projetoId === projeto.id);
  }, [documentos, projeto.id]);

  // Financial Summary KPIs
  const totalOrcado = useMemo(() => projectBudgetItems.reduce((acc, curr) => acc + curr.valorOrcado, 0), [projectBudgetItems]);
  const totalContratado = useMemo(() => projectBudgetItems.reduce((acc, curr) => acc + curr.valorContratado, 0), [projectBudgetItems]);
  const totalExecutado = useMemo(() => projectBudgetItems.reduce((acc, curr) => acc + curr.valorExecutado, 0), [projectBudgetItems]);
  // Two distinct notions of "saldo": what's left to physically execute/measure
  // vs. what's left to commit into new contracts. Conflating them into one
  // number used to hide the case where everything is already contracted (0 left
  // to negotiate) while still showing a "healthy" green balance based on execution.
  const saldoDisponivel = totalOrcado - totalExecutado;
  const saldoAComprometer = totalOrcado - totalContratado;

  // Avanço físico ponderado pelo orçamento vinculado a cada etapa. A conta vive
  // em src/lib/avanco.ts porque a lista de obras e o dashboard mostram o mesmo
  // número — antes cada tela tinha a sua e elas discordavam.
  const progressoFisicoMedio = useMemo(
    () => calcularAvancoFisico(projectSteps, projectVinculos, projectBudgetItems),
    [projectSteps, projectVinculos, projectBudgetItems]
  );

  const getFuncionarioName = (id: string) => {
    return funcionarios.find(f => f.id === id)?.nome || 'Profissional não cadastrado';
  };

  const medicaoBloqueada = projeto.situacao === 'Pausado' || projeto.situacao === 'Finalizado';

  // Real Gantt positioning: bars placed/sized by each etapa's actual
  // data_inicio/data_fim within the project's overall date span, instead of
  // a fixed "Jan/Mar..Out/Dez" header unrelated to the obra's real dates.
  const ganttRange = useMemo(() => {
    const starts = projectSteps.map(s => dataLocal(s.dataInicio)?.getTime()).filter((t): t is number => t !== undefined);
    const ends = projectSteps.map(s => dataLocal(s.dataFim)?.getTime()).filter((t): t is number => t !== undefined);
    if (starts.length === 0 || ends.length === 0) return null;
    const rangeStart = Math.min(...starts);
    const rangeEnd = Math.max(...ends);
    if (rangeEnd <= rangeStart) return null;
    return { rangeStart, rangeEnd };
  }, [projectSteps]);

  const ganttTicks = useMemo(() => {
    if (!ganttRange) return [];
    const count = 5;
    return Array.from({ length: count }, (_, i) => {
      const t = ganttRange.rangeStart + ((ganttRange.rangeEnd - ganttRange.rangeStart) * i) / (count - 1);
      return new Date(t).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    });
  }, [ganttRange]);

  // Submit handlers
  const handleAddBudgetItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetDesc || !budgetOrcado) {
      toast.error('Preencha os campos obrigatórios (Descrição, Valor Orçado).');
      return;
    }

    setIsSavingBudget(true);

    // Fonte única de criação (mesma usada pela vinculação do catálogo).
    const newItem = buildOrcamentoItem({
      projetoId: projeto.id,
      categoria: budgetCat,
      descricao: budgetDesc,
      valorOrcado: parseFloat(budgetOrcado),
      valorContratado: budgetContratado ? parseFloat(budgetContratado) : 0,
      fornecedorId: budgetFornecedorId || undefined,
    });

    // The aditivo log entry is created server-side by trg_log_item_orcamento_insert
    // in the same transaction as the item insert — no separate client call needed.
    const criado = await onAddOrcamentoItem(newItem);
    setIsSavingBudget(false);
    // Falhou: o hook já explicou o motivo no toast de erro. O modal fica aberto
    // com os dados preenchidos para o usuário tentar de novo.
    if (!criado) return;

    setShowAddBudgetItemModal(false);
    toast.success("Item orçamentário registrado.", `Adicionado em ${budgetCat}.`);

    // Reset Form
    setBudgetDesc('');
    setBudgetOrcado('');
    setBudgetContratado('');
    setBudgetFornecedorId('');
  };

  const handleAddMembroSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!membroProfileId) {
      toast.error('Selecione um profissional para conceder acesso.');
      return;
    }
    const ok = await onAddMembroEquipe(projeto.id, membroProfileId, membroPapel);
    if (!ok) return;
    setShowAddMembroModal(false);
    setMembroProfileId('');
    setMembroPapel('');
    toast.success('Acesso à obra concedido.');
  };

  // The financial fan-out (which orçamento lines this medição affects, and by
  // how much) and the etapa's resulting percentual/status are both computed
  // server-side from etapa_orcamento_vinculo (fix #1) — this handler just
  // submits the raw measurement + photos.
  const handleAddMedicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medEtapaId || !medPercent) {
      toast.error('Preencha a Etapa e o Percentual Executado.');
      return;
    }
    if (projeto.situacao === 'Pausado' || projeto.situacao === 'Finalizado') {
      toast.error(`Não é possível lançar medições com a obra "${projeto.situacao}".`, 'Mude a situação da obra para "Em Execução" antes de medir.');
      return;
    }

    setIsSavingMedicao(true);
    try {
      const ok = await onAddMedicao(
        {
          projetoId: projeto.id,
          etapaId: medEtapaId,
          percentualMedido: parseFloat(medPercent),
          observacoes: medObs || 'Medição periódica realizada.',
        },
        medPhotos
      );
      // Sem isto a tela anunciava "boletim lançado" — e ainda promovia a obra
      // para "Em Execução" — por cima do toast de erro do hook.
      if (!ok) return;

      setShowAddMedicaoModal(false);
      toast.success("Boletim de medição lançado.", `Evolução de +${medPercent}% registrada.`);
      // A primeira medição tira a obra de "Planejamento" automaticamente —
      // é o próprio sinal de que a execução começou de fato.
      if (projeto.situacao === 'Planejamento') {
        await onUpdateProjetoSituacao(projeto.id, 'Em Execução');
      }
      setMedEtapaId('');
      setMedPercent('');
      setMedObs('');
      setMedPhotos([]);
    } finally {
      setIsSavingMedicao(false);
    }
  };

  // How much of an item's own orçado value is already claimed by OTHER etapas
  // linked to it. This is the invariant that must not exceed 100% — fn_apply_medicao
  // applies peso_percentual against the ITEM's valor_orcado, so if two etapas both
  // claim, say, 70% of the same item, measuring both to completion applies 140% of
  // that item's budget. (Not to be confused with an etapa's own peso total across
  // its several linked items, which has no such ceiling — see seed data in
  // fn_criar_projeto_padrao, where each item's peso sums to exactly 100% across
  // the etapas that draw from it.)
  const getPesoUsadoItem = (itemId: string, excludeVinculoId?: string) => {
    const total = pesoAlocadoPorItem.get(itemId) ?? 0;
    if (!excludeVinculoId) return total;
    const excluido = projectVinculos.find(v => v.id === excludeVinculoId);
    return excluido?.itemOrcamentoId === itemId ? total - excluido.pesoPercentual : total;
  };

  const abrirVinculosDaEtapa = (etapaId: string) => {
    setVinculoItemId('');
    setVinculoPeso('100');
    setVinculoModal({ modo: 'etapa', etapaId });
  };

  const abrirVinculosDoItem = (itemId: string) => {
    // Partindo do item, o peso que falta alocar é quase sempre o que se quer
    // lançar na próxima etapa — pré-preenche o restante.
    const restante = Math.max(0, 100 - getPesoUsadoItem(itemId));
    setVinculoEtapaAlvoId('');
    setVinculoPeso(restante > 0 ? String(restante) : '');
    setVinculoModal({ modo: 'item', itemId });
  };

  const handleAddVinculoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vinculoModal || !vinculoPeso) return;
    const etapaId = vinculoModal.modo === 'etapa' ? vinculoModal.etapaId : vinculoEtapaAlvoId;
    const itemId = vinculoModal.modo === 'item' ? vinculoModal.itemId : vinculoItemId;
    if (!etapaId || !itemId) return;
    const peso = parseFloat(vinculoPeso);
    if (isNaN(peso) || peso <= 0 || peso > 100) {
      toast.error('O peso deve ser um percentual entre 1 e 100.');
      return;
    }
    const pesoUsadoItem = getPesoUsadoItem(itemId);
    if (pesoUsadoItem + peso > 100) {
      toast.error(
        'Peso excede o disponível para este item.',
        `Este item já tem ${pesoUsadoItem}% do seu valor orçado alocado a outras etapas. Disponível: ${100 - pesoUsadoItem}%.`
      );
      return;
    }
    const ok = await onAddVinculo({ id: crypto.randomUUID(), etapaId, itemOrcamentoId: itemId, pesoPercentual: peso });
    if (!ok) return;
    setVinculoItemId('');
    setVinculoEtapaAlvoId('');
    // Distribuindo um item entre etapas, o próximo lançamento parte do que
    // ainda sobrou dele — não de 100%, que só erraria de novo.
    const restante = Math.max(0, 100 - (pesoUsadoItem + peso));
    setVinculoPeso(vinculoModal.modo === 'item' ? (restante > 0 ? String(restante) : '') : '100');
    toast.success('Item de orçamento vinculado à etapa.');
  };

  const applySituacaoChange = async (situacao: Projeto['situacao']) => {
    const ok = await onUpdateProjetoSituacao(projeto.id, situacao);
    if (!ok) return;
    toast.success("Situação do projeto alterada", `Obra agora está em status "${situacao}".`);
  };

  const handleSituacaoChange = (situacao: Projeto['situacao']) => {
    // "Finalizado" com avanço físico incompleto normalmente é erro de operação
    // (esqueceram de medir a última etapa) — soft-block com confirmação em vez
    // de bloquear de vez, já que administrativamente pode haver motivo real
    // para encerrar antes de 100% (obra abortada, rescisão, etc.).
    if (situacao === 'Finalizado' && progressoFisicoMedio < 100) {
      confirm({
        title: 'Avanço físico incompleto',
        message: `Esta obra está com ${progressoFisicoMedio}% de avanço físico medido. Marcar como "Finalizado" mesmo assim?`,
        onConfirm: () => applySituacaoChange(situacao),
      });
      return;
    }
    applySituacaoChange(situacao);
  };

  const abrirEdicaoObra = () => {
    setEditNome(projeto.nome);
    setEditClienteId(projeto.clienteId);
    setEditResponsavelId(projeto.responsavelInternoId ?? '');
    setEditEndereco(projeto.enderecoObra);
    setEditInicio(projeto.dataInicio);
    setEditFim(projeto.dataFim);
    setShowEditObraModal(true);
  };

  const handleSalvarObra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNome.trim() || !editClienteId || !editInicio || !editFim) {
      toast.error('Preencha nome, cliente, início e previsão de entrega.');
      return;
    }
    if (editFim < editInicio) {
      toast.error('A previsão de entrega não pode ser anterior ao início.');
      return;
    }
    setIsSavingObra(true);
    const ok = await onUpdateProjeto(projeto.id, {
      nome: editNome.trim(),
      clienteId: editClienteId,
      responsavelInternoId: editResponsavelId,
      enderecoObra: editEndereco.trim(),
      dataInicio: editInicio,
      dataFim: editFim,
    });
    setIsSavingObra(false);
    if (!ok) return;
    setShowEditObraModal(false);
    toast.success('Dados da obra atualizados.');
  };

  const abrirNovaEtapa = () => {
    setEtapaNome('');
    // Nasce dentro do prazo da obra — o caso comum é a etapa esquecida no meio.
    setEtapaInicio(projeto.dataInicio);
    setEtapaFim(projeto.dataFim);
    setEtapaResponsavel(projeto.responsavelInternoId ?? '');
    setEtapaModal({ modo: 'nova' });
  };

  const abrirEdicaoEtapa = (etapa: EtapaCronograma) => {
    setEtapaNome(etapa.nome);
    setEtapaInicio(etapa.dataInicio);
    setEtapaFim(etapa.dataFim);
    setEtapaResponsavel(etapa.responsavelId);
    setEtapaModal({ modo: 'edicao', etapa });
  };

  const handleSalvarEtapa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!etapaModal) return;
    if (!etapaNome.trim() || !etapaInicio || !etapaFim) {
      toast.error('Preencha nome, início e fim da etapa.');
      return;
    }
    if (etapaFim < etapaInicio) {
      toast.error('A data de fim da etapa não pode ser anterior ao início.');
      return;
    }

    setIsSavingEtapa(true);
    const ok =
      etapaModal.modo === 'nova'
        ? await onAddEtapa({
            id: crypto.randomUUID(),
            projetoId: projeto.id,
            nome: etapaNome.trim(),
            dataInicio: etapaInicio,
            dataFim: etapaFim,
            responsavelId: etapaResponsavel,
            // Derivados no banco; entram aqui só para satisfazer o tipo.
            percentualExecutado: 0,
            status: 'Não Iniciado',
          })
        : await onUpdateEtapa(etapaModal.etapa!.id, {
            nome: etapaNome.trim(),
            dataInicio: etapaInicio,
            dataFim: etapaFim,
            responsavelId: etapaResponsavel,
          });
    setIsSavingEtapa(false);
    if (!ok) return;
    setEtapaModal(null);
    toast.success(etapaModal.modo === 'nova' ? 'Etapa criada.' : 'Etapa atualizada.');
  };

  /**
   * Excluir etapa é destrutivo além do óbvio: `medicoes_obra.etapa_id` tem
   * `on delete cascade`, então os boletins vão embora e o valor executado das
   * linhas de orçamento cai (é derivado deles). O aviso diz o tamanho do buraco.
   */
  const handleRemoverEtapa = (etapa: EtapaCronograma) => {
    const medicoesDaEtapa = projectMedicoes.filter((m) => m.etapaId === etapa.id);
    const vinculosDaEtapa = projectVinculos.filter((v) => v.etapaId === etapa.id);
    const aprovadas = medicoesDaEtapa.filter((m) => m.status === 'Aprovada').length;

    const partes = [
      `${vinculosDaEtapa.length} ${vinculosDaEtapa.length === 1 ? 'vínculo de orçamento' : 'vínculos de orçamento'}`,
      `${medicoesDaEtapa.length} ${medicoesDaEtapa.length === 1 ? 'boletim de medição' : 'boletins de medição'}`,
    ];
    const alertaFinanceiro = aprovadas > 0
      ? ` ${aprovadas} ${aprovadas === 1 ? 'medição aprovada' : 'medições aprovadas'} serão desfeitas, e o valor executado do orçamento vai diminuir.`
      : '';

    confirm({
      title: `Excluir a etapa "${etapa.nome}"?`,
      message: `Serão removidos também ${partes.join(' e ')}.${alertaFinanceiro} Esta ação é irreversível.`,
      onConfirm: async () => {
        const ok = await onRemoveEtapa(etapa.id);
        if (ok) toast.success('Etapa excluída.');
      },
    });
  };

  const statusColorMap = {
    'Planejamento': 'bg-slate-100 text-slate-600 border border-slate-200/50',
    'Em Execução': 'bg-blue-50 text-blue-700 border border-blue-100',
    'Pausado': 'bg-rose-50 text-rose-700 border border-rose-100',
    'Finalizado': 'bg-emerald-50 text-emerald-700 border border-emerald-100'
  };

  return (
    <div id="projeto-console-container" className="flex flex-col h-[calc(100vh-120px)] space-y-4">
      
      {/* Console Header */}
      <div id="console-header" className="bg-white text-slate-800 p-5 rounded-xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left shadow-xs">
        <div className="flex items-start gap-4">
          <button
            id="back-to-projects-btn"
            onClick={onClose}
            className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/40 rounded-lg text-slate-500 hover:text-slate-800 transition active:scale-95 shrink-0"
            title="Voltar para a lista"
          >
            <ChevronLeft size={18} />
          </button>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-mono text-blue-600 bg-blue-50 border border-blue-100/60 px-2 py-0.5 rounded font-bold uppercase tracking-wider cursor-help"
                title={projeto.id}
              >
                Código Obra: {projeto.id.slice(0, 8).toUpperCase()}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColorMap[projeto.situacao] || 'bg-slate-100'}`}>
                {projeto.situacao}
              </span>
            </div>
            <h2 className="text-base font-extrabold tracking-tight text-slate-950 flex items-center gap-1.5">
              <span>Projeto</span>
              <span className="text-blue-600 font-bold">{projeto.nome}</span>
            </h2>
            <p className="text-xs text-slate-450 flex items-center gap-1.5">
              <Building2 size={13} className="text-slate-400" />
              <span className="text-slate-500">Cliente: <strong className="text-slate-800 font-bold">{client?.nome || 'N/A'}</strong></span>
            </p>
          </div>
        </div>

        {/* Ações da obra — só para quem tem escrita (a RLS é a barreira real:
            financeiro e campo têm apenas SELECT). */}
        {podeGerenciar && (
          <div className="flex items-center gap-2">
            <button
              id="console-editar-obra-btn"
              type="button"
              onClick={abrirEdicaoObra}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-250/70 rounded-lg px-3 py-2 text-xs font-bold shadow-xs transition flex items-center gap-1.5 active:scale-95"
              title="Editar dados da obra"
            >
              <Pencil size={13} />
              <span>Editar Obra</span>
            </button>
            <select
              id="console-project-situacao"
              value={projeto.situacao}
              onChange={(e) => handleSituacaoChange(e.target.value as Projeto['situacao'])}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-250/70 rounded-lg p-2 text-xs outline-none cursor-pointer font-bold shadow-xs transition"
            >
              <option value="Planejamento">Mudar para: Planejamento</option>
              <option value="Em Execução">Mudar para: Em Execução</option>
              <option value="Pausado">Mudar para: Pausado</option>
              <option value="Finalizado">Mudar para: Finalizado</option>
            </select>
          </div>
        )}
      </div>

      {/* Internal Workspace Menu Bar — cada papel vê só o que a RLS permite */}
      <div id="console-subnavigation" className="border-b border-slate-150/80 pb-px flex gap-6 overflow-x-auto select-none bg-transparent px-2">
        {([
          { id: 'geral', label: 'Geral' },
          { id: 'orcamento', label: `Orçamentos (${projectBudgetItems.length})` },
          { id: 'cronograma', label: 'Cronograma' },
          { id: 'medicoes', label: `Medições (${projectMedicoes.length})` },
          { id: 'documentos', label: `Documentos (${projectDocuments.length})` },
          { id: 'equipe', label: 'Equipe' },
        ] as const)
          .filter((t) => canAccessConsoleTab(role, t.id))
          .map((t) => (
            <button
              key={t.id}
              id={`console-tab-${t.id}`}
              onClick={() => setInternalTab(t.id)}
              className={`pb-2 text-xs font-bold transition shrink-0 cursor-pointer relative ${
                internalTab === t.id
                  ? 'text-blue-600 font-extrabold border-b-2 border-blue-600'
                  : 'text-slate-400 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {/* Internal Tab Content Box */}
      <div id="console-workspace" className="flex-1 overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-sm p-4">
        
        {/* TAB 1: PAINEL GERAL (OVERVIEW) */}
        {internalTab === 'geral' && (
          <div id="tab-pane-geral" className="space-y-4 text-left">
            {/* Quick overview metric row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded text-white font-bold shrink-0">
                  <Percent size={18} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Evolução Física Média</span>
                  <h4 className="text-lg font-bold text-slate-900">{progressoFisicoMedio}%</h4>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-3">
                <div className="p-2 bg-emerald-500 rounded text-white shrink-0">
                  <DollarSign size={18} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase" title="Orçado menos executado — não desconta valores já contratados.">Saldo a Executar</span>
                  <h4 className={`text-lg font-bold font-mono ${saldoDisponivel >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {saldoDisponivel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </h4>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-3">
                <div className="p-2 bg-slate-800 rounded text-blue-400 shrink-0">
                  <Calendar size={18} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Previsão de Entrega</span>
                  <h4 className="text-sm font-bold text-slate-800">
                    {formatarDataBR(projeto.dataFim)}
                  </h4>
                  <span className="text-[10px] text-blue-600 font-bold font-mono">
                    ({getWorkingDays(projeto.dataInicio, projeto.dataFim)} dias úteis)
                  </span>
                </div>
              </div>
            </div>

            {/* Core Address & Responsibles Card */}
            <div className="bg-slate-50/50 p-3.5 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Localização e Detalhes da Obra</h4>
                <div className="space-y-1.5 text-xs text-slate-700">
                  <p className="flex items-center gap-2">
                    <MapPin size={14} className="text-blue-500 shrink-0" />
                    <span><strong>Endereço do Canteiro:</strong> {projeto.enderecoObra}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Calendar size={14} className="text-slate-400 shrink-0" />
                    <span><strong>Mobilização Inicial:</strong> {formatarDataBR(projeto.dataInicio)}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-400 shrink-0" />
                    <span><strong>Duração Real Útil:</strong> {getWorkingDays(projeto.dataInicio, projeto.dataFim)} dias úteis (fim de semana descontado)</span>
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Responsabilidade e Liderança</h4>
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-3">
                  <div className="h-10 w-10 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center font-bold text-blue-800 shrink-0 text-xs">
                    {projeto.responsavelInterno.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-slate-950">{projeto.responsavelInterno}</h5>
                    <p className="text-xs text-slate-500">{responsavelFuncionario?.cargo || 'Responsável a definir'}</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: ORÇAMENTO DO PROJETO */}
        {internalTab === 'orcamento' && (
          <div id="tab-pane-orcamento" className="space-y-4 text-left">
            {/* Financial indicators header */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-1">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase block">Total Orçado</span>
                  <span className="font-mono text-xs font-bold text-slate-900">{totalOrcado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase block">Total Contratado</span>
                  <span className="font-mono text-xs font-bold text-blue-700">{totalContratado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase block">Total Executado</span>
                  <span className="font-mono text-xs font-bold text-emerald-600">{totalExecutado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase block" title="Orçado menos executado — o que ainda falta medir/entregar.">Saldo a Executar</span>
                  <span className={`font-mono text-xs font-bold block ${saldoDisponivel >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {saldoDisponivel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase block" title="Orçado menos contratado — o que ainda falta comprometer em contratos/pedidos.">Saldo a Comprometer</span>
                  <span className={`font-mono text-xs font-bold block ${saldoAComprometer >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {saldoAComprometer.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>

              {podeGerenciar && (
                <button
                  id="console-add-budget-item-btn"
                  onClick={() => setShowAddBudgetItemModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition shadow-sm"
                >
                  <Plus size={14} />
                  <span>Novo Item</span>
                </button>
              )}
            </div>

            {/* Cost Breakdown Tables */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Planilha Orçamentária Detalhada</h4>
                <div id="orcamento-agrupamento" className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  {([
                    { valor: 'categoria' as const, label: 'Por categoria' },
                    { valor: 'etapa' as const, label: 'Por etapa' },
                  ]).map(opcao => (
                    <button
                      key={opcao.valor}
                      id={`orcamento-agrupamento-${opcao.valor}`}
                      onClick={() => setOrcamentoAgrupamento(opcao.valor)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition ${
                        orcamentoAgrupamento === opcao.valor
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {opcao.label}
                    </button>
                  ))}
                </div>
              </div>

              {projectBudgetItems.length === 0 ? (
                <EmptyState
                  icon={DollarSign}
                  title="Planilha vazia"
                  description="Adicione insumos, materiais ou taxas para compor a estrutura orçamentária."
                  actionLabel={podeGerenciar ? 'Novo Item' : undefined}
                  onAction={podeGerenciar ? () => setShowAddBudgetItemModal(true) : undefined}
                />
              ) : orcamentoAgrupamento === 'etapa' ? (
                <div className="space-y-2">
                  <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white">
                    <table id="budget-by-etapa-table" className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-xs">
                        <tr>
                          <th className="p-3">Etapa</th>
                          <th className="p-3 text-center">Itens</th>
                          <th className="p-3 text-right">Orçado Alocado</th>
                          <th className="p-3 text-right">Contratado</th>
                          <th className="p-3 text-right">Executado</th>
                          <th className="p-3 text-right">Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {alocacaoPorEtapa.linhas.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-xs text-slate-400 italic">
                              Nenhuma etapa cadastrada — monte o cronograma para ver o custo por frente de serviço.
                            </td>
                          </tr>
                        )}
                        {alocacaoPorEtapa.linhas.map(linha => {
                          const saldo = linha.orcado - linha.executado;
                          return (
                            <tr key={linha.etapa.id} className="hover:bg-slate-50/40 transition">
                              <td className="p-3">
                                {podeGerenciar ? (
                                  <button
                                    id={`alocacao-etapa-${linha.etapa.id}`}
                                    onClick={() => abrirVinculosDaEtapa(linha.etapa.id)}
                                    title="Ver e editar os itens de orçamento desta etapa"
                                    className="font-bold text-slate-900 hover:text-blue-700 transition cursor-pointer text-left"
                                  >
                                    {linha.etapa.nome}
                                  </button>
                                ) : (
                                  <span className="font-bold text-slate-900">{linha.etapa.nome}</span>
                                )}
                                <div className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                  {linha.etapa.percentualExecutado}% medido
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                {linha.vinculos === 0 ? (
                                  <span className="text-[10px] font-bold text-amber-600">sem vínculo</span>
                                ) : (
                                  <span className="font-mono font-bold text-slate-700">{linha.vinculos}</span>
                                )}
                              </td>
                              <td className="p-3 text-right font-mono font-medium">{linha.orcado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                              <td className="p-3 text-right font-mono text-blue-700">{linha.contratado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                              <td className="p-3 text-right font-mono text-emerald-600">{linha.executado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                              <td className={`p-3 text-right font-mono font-bold ${saldo >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                                {saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t-2 border-slate-200">
                        {alocacaoPorEtapa.naoAlocado.itens > 0 && (
                          <tr className="bg-amber-50/60">
                            <td className="p-3">
                              <span className="font-bold text-amber-800">Não alocado a nenhuma etapa</span>
                              <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                                Verba que nenhuma medição vai alcançar enquanto não for vinculada.
                              </div>
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-amber-800">{alocacaoPorEtapa.naoAlocado.itens}</td>
                            <td className="p-3 text-right font-mono font-bold text-amber-800">{alocacaoPorEtapa.naoAlocado.orcado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className="p-3 text-right font-mono text-amber-800">{alocacaoPorEtapa.naoAlocado.contratado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className="p-3 text-right font-mono text-amber-800">—</td>
                            <td className="p-3 text-right font-mono text-amber-800">—</td>
                          </tr>
                        )}
                        <tr className="bg-slate-50 font-bold text-slate-900">
                          <td className="p-3 uppercase text-[10px] tracking-wider">Total da obra</td>
                          <td className="p-3 text-center font-mono">{projectBudgetItems.length}</td>
                          <td className="p-3 text-right font-mono">{totalOrcado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td className="p-3 text-right font-mono text-blue-700">{totalContratado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td className="p-3 text-right font-mono text-emerald-600">{totalExecutado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td className="p-3 text-right font-mono">{saldoDisponivel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Cada etapa recebe a fatia do item de orçamento definida no vínculo — o mesmo rateio que a medição aplica.
                    Um item pode alimentar várias etapas (cimento na fundação, na alvenaria e no reboco), e as fatias por etapa somadas ao não alocado fecham o total da obra.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white">
                  <table id="budget-items-table" className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-xs">
                      <tr>
                        <th className="p-3">Categoria</th>
                        <th className="p-3">Descrição do Insumo / Atividade</th>
                        <th className="p-3">Etapas</th>
                        <th className="p-3 text-right">Orçado Base</th>
                        <th className="p-3 text-right">Contratado</th>
                        <th className="p-3 text-right">Executado</th>
                        <th className="p-3 text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {projectBudgetItems.map(item => {
                        const balance = item.valorOrcado - item.valorExecutado;
                        const supplierName = item.fornecedorId ? fornecedores.find(f => f.id === item.fornecedorId)?.empresa : null;
                        // Peso sobrando é verba que nenhuma medição vai alcançar:
                        // fica em âmbar até o item estar 100% distribuído.
                        const alocado = pesoAlocadoPorItem.get(item.id) ?? 0;
                        const nEtapas = etapasPorItem.get(item.id) ?? 0;
                        const alocacaoIncompleta = alocado < 100;
                        const alocacaoLabel = nEtapas === 0
                          ? 'Não alocado'
                          : `${nEtapas} ${nEtapas === 1 ? 'etapa' : 'etapas'} · ${alocado}%`;
                        const alocacaoTitulo = nEtapas === 0
                          ? 'Nenhuma etapa consome este item — o valor nunca entra numa medição.'
                          : alocacaoIncompleta
                            ? `${100 - alocado}% do valor deste item não está em nenhuma etapa e não será medido.`
                            : 'Valor totalmente distribuído entre as etapas.';

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/40 transition">
                            <td className="p-3 font-semibold text-xs">
                              <span className="bg-slate-100 text-slate-750 border border-slate-200 px-2 py-0.5 rounded text-xs">
                                {item.categoria}
                              </span>
                            </td>
                            <td className="p-3 text-xs">
                              <div className="font-bold text-slate-800 leading-normal">{item.descricao}</div>
                              {supplierName && (
                                <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-blue-50 text-blue-700 border border-blue-100/50 uppercase tracking-wide">
                                  Fornecedor: {supplierName}
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              {podeGerenciar ? (
                                <button
                                  id={`alocacao-item-${item.id}`}
                                  onClick={() => abrirVinculosDoItem(item.id)}
                                  title={`${alocacaoTitulo} Clique para distribuir este item entre as etapas.`}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition active:scale-95 cursor-pointer ${
                                    alocacaoIncompleta
                                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                  }`}
                                >
                                  {alocacaoLabel}
                                </button>
                              ) : (
                                <span
                                  title={alocacaoTitulo}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    alocacaoIncompleta
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {alocacaoLabel}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-medium">{item.valorOrcado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className="p-3 text-right font-mono text-blue-700">{item.valorContratado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className="p-3 text-right font-mono text-emerald-600">{item.valorExecutado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className={`p-3 text-right font-mono font-bold ${balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                              {balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Quantitativo de insumos — quantidade, preço base e o ajuste desta obra */}
            <InsumosObra
              insumos={projectInsumos}
              catalogo={catalogo}
              fornecedores={fornecedores}
              somenteLeitura={!podeGerenciar}
              onAjustarPreco={onAjustarPrecoInsumo}
              onAjustarQuantidade={onAjustarQuantidadeInsumo}
              onRessincronizarBase={onRessincronizarBaseInsumo}
              onRemover={onRemoveInsumoProjeto}
            />

            {/* Log of revisions (Histórico de Alterações) */}
            <div className="space-y-3 pt-4 border-t border-slate-150">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <History size={14} className="text-slate-400 shrink-0" />
                <span>Registro de Ajustes e Aditivos Orçamentários ({projectAlteracoes.length})</span>
              </h4>
              
              {projectAlteracoes.length === 0 ? (
                <p className="text-xs text-slate-400 pl-1">Nenhum aditivo financeiro cadastrado para esta obra.</p>
              ) : (
                <div className="space-y-2">
                  {projectAlteracoes.map(alt => (
                    <div key={alt.id} className="p-3 bg-slate-50 border border-slate-150 rounded-lg flex justify-between items-center text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                            alt.tipo === 'Aumento' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>{alt.tipo}</span>
                          <span className="font-semibold text-slate-900">{alt.item}</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-normal italic">"{alt.descricao}"</p>
                      </div>
                      <div className="text-right ml-4 shrink-0 font-mono">
                        <span className={`font-bold block ${alt.tipo === 'Aumento' ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {alt.tipo === 'Aumento' ? '+' : '-'}{alt.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className="text-xs text-slate-400">{formatarDataBR(alt.data)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 3: CRONOGRAMA & GANTT */}
        {internalTab === 'cronograma' && (
          <div id="tab-pane-cronograma" className="space-y-6 text-left">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Cronograma Físico da Obra</h4>
                <p className="text-xs text-slate-400">Progresso calculado a partir das medições registradas. Vincule itens de orçamento a cada etapa para habilitar o cálculo.</p>
              </div>
              {podeGerenciar && (
                <button
                  id="console-add-etapa-btn"
                  type="button"
                  onClick={abrirNovaEtapa}
                  className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition shadow-sm"
                >
                  <CalendarPlus size={14} />
                  <span>Nova Etapa</span>
                </button>
              )}
            </div>

            {/* List and Gantt visualizer */}
            <div className="space-y-6">
              
              {/* Gantt Representation (bars positioned/sized by real dates) */}
              <div className="p-3.5 bg-slate-900 text-slate-100 rounded-lg space-y-3 shadow-md">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1.5">
                    <Layers size={12} className="text-blue-400 shrink-0" />
                    <span>Gráfico de Gantt Integrado</span>
                  </span>
                  <span className="text-xs font-mono text-slate-500">
                    {ganttRange
                      ? `${new Date(ganttRange.rangeStart).toLocaleDateString('pt-BR')} — ${new Date(ganttRange.rangeEnd).toLocaleDateString('pt-BR')}`
                      : 'Sem datas de cronograma'}
                  </span>
                </div>

                {!ganttRange ? (
                  <p className="text-xs text-slate-500 italic py-4 text-center">Nenhuma etapa com datas válidas para exibir no gráfico.</p>
                ) : (
                  <div className="space-y-4 text-xs">
                    {/* Timeline header, ticks evenly spaced across the real date span */}
                    <div className="grid grid-cols-12 gap-1 text-xs font-semibold text-slate-500 font-mono text-center border-b border-slate-800 pb-1 shrink-0">
                      <span className="col-span-4 text-left">Etapa da Obra</span>
                      <div className="col-span-8 flex justify-between">
                        {ganttTicks.map((label, i) => <span key={i}>{label}</span>)}
                      </div>
                    </div>

                    {/* Steps Gantt rows */}
                    {projectSteps.map(step => {
                      const stepStart = dataLocal(step.dataInicio)?.getTime() ?? NaN;
                      const stepEnd = dataLocal(step.dataFim)?.getTime() ?? NaN;
                      const totalRange = ganttRange.rangeEnd - ganttRange.rangeStart;
                      const datasValidas = !isNaN(stepStart) && !isNaN(stepEnd) && stepEnd >= stepStart;
                      const leftPct = datasValidas ? Math.max(0, ((stepStart - ganttRange.rangeStart) / totalRange) * 100) : 0;
                      const widthPct = datasValidas
                        ? Math.min(100 - leftPct, Math.max(2, ((stepEnd - stepStart) / totalRange) * 100))
                        : 100;
                      return (
                        <div key={step.id} className="grid grid-cols-12 gap-1 items-center py-1">
                          <div className="col-span-4 text-left truncate font-medium text-slate-200 text-xs">
                            {step.nome}
                            <span className="block text-xs text-slate-400 font-mono">({step.percentualExecutado}% Concluído)</span>
                          </div>

                          {/* Track: full-duration bar positioned along the real timeline */}
                          <div className="col-span-8 relative h-5">
                            <div
                              className={`absolute top-0 h-full rounded-lg border overflow-hidden ${
                                step.status === 'Concluído' ? 'border-emerald-500 bg-slate-800/60' :
                                step.status === 'Atrasado' ? 'border-rose-500 bg-slate-800/60' :
                                step.status === 'Em Andamento' ? 'border-blue-400 bg-slate-800/60' :
                                'border-slate-600 bg-slate-800/60'
                              }`}
                              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              title={`${formatarDataBR(step.dataInicio)} a ${formatarDataBR(step.dataFim)}`}
                            >
                              <div
                                className={`h-full flex items-center justify-end px-1.5 select-none transition-all duration-300 ${
                                  step.status === 'Concluído' ? 'bg-emerald-600' :
                                  step.status === 'Em Andamento' ? 'bg-blue-500' :
                                  step.status === 'Atrasado' ? 'bg-rose-600' :
                                  'bg-slate-700'
                                }`}
                                style={{ width: `${step.percentualExecutado}%` }}
                              >
                                {step.percentualExecutado > 25 && (
                                  <span className="text-xs font-mono font-bold text-slate-950 leading-none">
                                    {step.percentualExecutado}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Stages list — progresso físico e status são somente leitura,
                  derivados das medições (fix #1). A única forma de avançar
                  uma etapa é registrar uma medição. */}
              <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-xs">
                    <tr>
                      <th className="p-3">Etapa</th>
                      <th className="p-3">Período</th>
                      <th className="p-3">Encarregado</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-center">Progresso Físico (%)</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectSteps.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-xs text-slate-400 italic">
                          Nenhuma etapa cadastrada.{podeGerenciar ? ' Use "Nova Etapa" para montar o cronograma.' : ''}
                        </td>
                      </tr>
                    )}
                    {projectSteps.map(step => {
                      const stepVinculos = projectVinculos.filter(v => v.etapaId === step.id);
                      return (
                        <tr key={step.id} className="hover:bg-slate-50/40 transition">
                          <td className="p-3 font-bold text-slate-900">
                            {step.nome}
                            {stepVinculos.length === 0 && (
                              <span className="block text-[9px] text-amber-600 font-semibold normal-case mt-0.5">Sem orçamento vinculado</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-500">
                            <div>{formatarDataBR(step.dataInicio)} a {formatarDataBR(step.dataFim)}</div>
                            <div className="text-[10px] text-blue-600 font-bold font-mono mt-0.5">
                              {getWorkingDays(step.dataInicio, step.dataFim)} dias úteis
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-slate-800">{getFuncionarioName(step.responsavelId)}</span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded font-bold text-[10px] ${
                              step.status === 'Concluído' ? 'bg-emerald-50 text-emerald-700' :
                              step.status === 'Em Andamento' ? 'bg-blue-50 text-blue-700' :
                              step.status === 'Atrasado' ? 'bg-rose-50 text-rose-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {step.status}
                            </span>
                          </td>
                          <td className="p-3 text-center min-w-[160px]">
                            <div className="flex items-center justify-end gap-3">
                              <div className="w-full h-1.5 bg-slate-150 rounded-lg overflow-hidden">
                                <div className="h-full bg-blue-600" style={{ width: `${step.percentualExecutado}%` }} />
                              </div>
                              <span className="font-mono font-bold text-slate-900 w-10 text-right">{step.percentualExecutado}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {podeGerenciar && (
                                <>
                                  <button
                                    id={`vincular-orcamento-etapa-${step.id}`}
                                    onClick={() => abrirVinculosDaEtapa(step.id)}
                                    className="bg-slate-50 text-slate-600 hover:bg-slate-800 hover:text-white px-2 py-1 rounded font-bold text-[10px] transition active:scale-95 border border-slate-200 cursor-pointer"
                                  >
                                    Vincular Orçamento
                                  </button>
                                  <button
                                    id={`editar-etapa-${step.id}`}
                                    onClick={() => abrirEdicaoEtapa(step)}
                                    title="Editar nome, prazo e encarregado"
                                    className="text-slate-400 hover:text-blue-600 p-1 rounded transition active:scale-95"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    id={`excluir-etapa-${step.id}`}
                                    onClick={() => handleRemoverEtapa(step)}
                                    title="Excluir etapa"
                                    className="text-slate-400 hover:text-rose-600 p-1 rounded transition active:scale-95"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                              {podeMedir && (
                                <button
                                  id={`medir-etapa-rapido-${step.id}`}
                                  disabled={medicaoBloqueada}
                                  title={medicaoBloqueada ? `Obra "${projeto.situacao}" — mude a situação para medir.` : undefined}
                                  onClick={() => {
                                    setMedEtapaId(step.id);
                                    setMedPercent('');
                                    setMedObs('');
                                    setMedPhotos([]);
                                    setShowAddMedicaoModal(true);
                                  }}
                                  className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-2 py-1 rounded font-bold text-[10px] transition active:scale-95 border border-blue-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-50 disabled:hover:text-blue-600"
                                >
                                  Medir
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MEDIÇÃO DE OBRA */}
        {internalTab === 'medicoes' && (
          <div id="tab-pane-medicoes" className="space-y-4 text-left">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Histórico de Medições Periódicas</h4>
                <p className="text-xs text-slate-400 font-medium">Boletins técnicos de aferição física emitidos diretamente no canteiro de obras.</p>
              </div>
              {podeMedir && (
                <button
                  id="console-add-medicao-btn"
                  disabled={medicaoBloqueada}
                  title={medicaoBloqueada ? `Obra "${projeto.situacao}" — mude a situação para medir.` : undefined}
                  onClick={() => setShowAddMedicaoModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  <Camera size={14} />
                  <span>Medir Atividade</span>
                </button>
              )}
            </div>

            {/* Custom Physical & Financial charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-left">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Curva Física de Medição</span>
                <div className="flex items-center gap-4 mt-3">
                  <div className="h-14 w-14 rounded-full bg-blue-50 border-4 border-blue-600 flex flex-col items-center justify-center font-bold text-slate-800 text-xs shrink-0">
                    {progressoFisicoMedio}%
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-850">Avanço Físico Geral</p>
                    <p className="text-xs text-slate-500 leading-normal">Média geral ponderada das etapas em andamento.</p>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-left">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Acumulado Financeiro Medido</span>
                <div className="flex items-center gap-4 mt-3">
                  <div className="h-14 w-14 rounded-full bg-emerald-50 border-4 border-emerald-500 flex flex-col items-center justify-center font-bold text-emerald-800 text-xs shrink-0">
                    {totalOrcado > 0 ? ((totalExecutado / totalOrcado) * 100).toFixed(0) : 0}%
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-850">Faturamento Físico-Financeiro</p>
                    <p className="text-xs text-slate-500 leading-normal font-mono font-semibold text-emerald-600">
                      {totalExecutado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} medidos
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Log list of old measurements */}
            {projectMedicoes.length === 0 ? (
              <EmptyState
                icon={Camera}
                title="Sem medições lançadas"
                description="Registre as vistorias técnicas periódicas para acompanhar o progresso real."
                actionLabel={podeMedir && !medicaoBloqueada ? 'Registrar Vistoria' : undefined}
                onAction={podeMedir && !medicaoBloqueada ? () => setShowAddMedicaoModal(true) : undefined}
              />
            ) : (
              <div className="space-y-2">
                {projectMedicoes.map(med => {
                  const step = projectSteps.find(s => s.id === med.etapaId);
                  // `data_medicao` é uma coluna `date`: sem o parse local o
                  // selo do boletim mostrava o dia anterior ao medido.
                  const dataMed = dataLocal(med.dataMedicao);
                  const statusStyle = med.status === 'Aprovada'
                    ? { wrap: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: Check }
                    : med.status === 'Rejeitada'
                      ? { wrap: 'text-rose-700 bg-rose-50 border-rose-200', icon: X }
                      : { wrap: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock3 };
                  const StatusIcon = statusStyle.icon;
                  const busy = medicaoBusyId === med.id;
                  return (
                    <div key={med.id} className={`p-3 bg-white border shadow-sm rounded-lg flex gap-4 ${med.status === 'Rejeitada' ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}>
                      <div className="h-12 w-12 rounded-lg bg-blue-50 flex flex-col items-center justify-center border border-blue-200 shrink-0 font-bold">
                        <span className="text-xs text-blue-800 leading-none">{dataMed ? dataMed.getDate() : '—'}</span>
                        <span className="text-xs text-blue-700 font-mono uppercase">{dataMed ? dataMed.toLocaleString('pt-BR', { month: 'short' }).slice(0, 3) : ''}</span>
                      </div>

                      <div className="flex-1 min-w-0 text-left space-y-1.5">
                        <div className="flex justify-between items-start gap-2">
                          <h5 className="font-bold text-xs text-slate-900">
                            Boletim Medição: <strong className="text-blue-600">{step ? step.nome : 'Geral'}</strong>
                          </h5>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${statusStyle.wrap}`}>
                              <StatusIcon size={10} /> {med.status}
                            </span>
                            {med.status === 'Aprovada' && (
                              <span className="text-xs font-bold font-mono text-emerald-600">
                                {med.valorMedido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">
                          Evolução física aferida: <strong className="text-slate-800">+{med.percentualMedido}%</strong>
                          {med.status === 'Pendente' && <span className="text-amber-600 font-semibold"> · aguardando aprovação</span>}
                        </p>
                        <p className="text-xs text-slate-700 italic bg-slate-50 p-2 rounded-lg">
                          "{med.observacoes}"
                        </p>

                        {med.status === 'Rejeitada' && (
                          <p className="text-xs bg-rose-50 border border-rose-100 text-rose-800 p-2 rounded-lg leading-relaxed">
                            <strong className="font-bold">Motivo da recusa:</strong>{' '}
                            {med.motivoRejeicao ?? (
                              <span className="italic text-rose-700/80">
                                não registrado — esta rejeição é anterior ao campo de motivo.
                              </span>
                            )}
                          </p>
                        )}

                        {/* Registro fotográfico — miniaturas clicáveis */}
                        {med.fotos.length > 0 && (
                          <div className="flex gap-2 pt-1 flex-wrap">
                            {med.fotos.map((foto) => (
                              <FotoBoletim key={foto.storagePath} foto={foto} onUrl={onFotoUrlMedicao} />
                            ))}
                          </div>
                        )}

                        {/* Aprovação (admin/gestão) — só para medições pendentes */}
                        {podeAprovar && med.status === 'Pendente' && (
                          <div className="flex gap-2 pt-1.5">
                            <button
                              onClick={() => handleAprovar(med.id)}
                              disabled={busy}
                              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                            >
                              {busy ? <Spinner size={12} /> : <Check size={12} />} Aprovar
                            </button>
                            <button
                              onClick={() => abrirRejeicao(med)}
                              disabled={busy}
                              className="flex items-center gap-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-bold px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                            >
                              <X size={12} /> Rejeitar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: DOCUMENTOS DA OBRA */}
        {internalTab === 'documentos' && (
          <div id="tab-pane-documentos" className="space-y-4 text-left">
            <div>
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Documentos Desta Obra</h4>
              <p className="text-xs text-slate-400">
                Plantas, ARTs, licenças e contrato deste canteiro — com versionamento. O que é da construtora fica na aba Documentos.
              </p>
            </div>

            <DocumentosPanel
              escopo="obra"
              projetoId={projeto.id}
              variante="embedded"
              documentos={documentos}
              categorias={documentoCategorias}
              onAddDocumento={onAddDocumento}
              onAddVersion={onAddVersionDocumento}
              onUpdateDocumento={onUpdateDocumento}
              onDeleteDocumento={onDeleteDocumento}
              onDownloadDocumento={onDownloadDocumento}
              onPreviewUrl={onPreviewUrlDocumento}
              onAddCategoria={onAddCategoriaDocumento}
              onUpdateCategoria={onUpdateCategoriaDocumento}
              onDeleteCategoria={onDeleteCategoriaDocumento}
            />
          </div>
        )}

        {/* TAB 6: EQUIPE RESIDENTE */}
        {internalTab === 'equipe' && (
          <div id="tab-pane-equipe" className="space-y-4 text-left">
            <div>
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Profissionais e Terceiros no Canteiro</h4>
              <p className="text-xs text-slate-400 font-medium">Equipe residente e encarregados das frentes de trabalho ativas.</p>
            </div>

            {/* Encarregados das frentes — uma pessoa por card, com as etapas dela */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {encarregados.length === 0 ? (
                <p className="text-xs text-slate-400 italic pl-1 col-span-full">Nenhuma equipe alocada a etapas no momento.</p>
              ) : (
                encarregados.map(({ chave, funcionario, etapas }) => (
                  <div key={chave} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-3">
                    <div className="h-10 w-10 bg-blue-50 border border-blue-200 text-blue-800 font-bold rounded-full flex items-center justify-center shrink-0 text-xs shadow-xs">
                      {funcionario ? funcionario.nome.split(' ').slice(0, 2).map(n => n[0]).join('') : 'EQ'}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1 text-left">
                      <h5 className="font-bold text-xs text-slate-900 truncate">
                        {funcionario ? funcionario.nome : 'Etapas sem encarregado definido'}
                      </h5>
                      <p className="text-xs text-blue-600 font-bold truncate">
                        {funcionario ? funcionario.cargo : 'Atribua um responsável na aba Cronograma'}
                      </p>

                      <div className="pt-1.5 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          {etapas.length === 1 ? 'Frente de trabalho' : `${etapas.length} frentes de trabalho`}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {etapas.map((nome, i) => (
                            <span key={`${chave}-${i}`} className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                              {nome}
                            </span>
                          ))}
                        </div>
                      </div>

                      {funcionario && (
                        <div className="pt-2 text-xs text-slate-500 space-y-0.5 border-t border-slate-200/50 mt-1.5 font-mono">
                          <p>Celular: {funcionario.telefone}</p>
                          <p>E-mail: {funcionario.email}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Acesso ao App de Campo — quem pode ver/medir esta obra pelo app mobile */}
            <div className="pt-4 border-t border-slate-150 space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-slate-400 shrink-0" />
                    <span>Acesso ao App de Campo</span>
                  </h4>
                  <p className="text-xs text-slate-400 font-medium">Usuários com permissão para medir e visualizar esta obra pelo aplicativo móvel.</p>
                </div>
                <button
                  id="console-add-membro-equipe-btn"
                  onClick={() => setShowAddMembroModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition shadow-sm"
                >
                  <UserPlus size={14} />
                  <span>Conceder Acesso</span>
                </button>
              </div>

              {projectEquipe.length === 0 ? (
                <p className="text-xs text-slate-400 italic pl-1">Nenhum usuário de campo tem acesso a esta obra ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {projectEquipe.map(membro => {
                    const perfil = perfisCampo.find(p => p.id === membro.profileId);
                    return (
                      <div key={membro.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{perfil?.fullName || perfil?.email || 'Usuário removido'}</span>
                          {membro.papel && <span className="text-slate-500 ml-2">— {membro.papel}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveMembroEquipe(membro.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded transition active:scale-95"
                          title="Revogar acesso"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* MODAL 1: ADD BUDGET ITEM */}
      <AnimatePresence>
        {showAddBudgetItemModal && (
          <div id="add-budget-item-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSavingBudget) setShowAddBudgetItemModal(false); }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Contents */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-slate-200"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">Lançamento de Despesa</h3>
                <button 
                  onClick={() => setShowAddBudgetItemModal(false)}
                  disabled={isSavingBudget}
                  className="text-slate-400 hover:text-slate-600 font-bold transition"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleAddBudgetItem} className="p-4 space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Categoria de Custo *</label>
                  <select
                    id="add-bud-cat"
                    disabled={isSavingBudget}
                    value={budgetCat}
                    onChange={(e) => setBudgetCat(e.target.value as CategoriaCusto)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700 font-semibold disabled:bg-slate-50"
                  >
                    <option value="Materiais">Materiais (Custos Diretos)</option>
                    <option value="Mão de Obra">Mão de Obra (Custos Diretos)</option>
                    <option value="Equipamentos">Equipamentos (Custos Diretos)</option>
                    <option value="Terceiros">Terceiros (Custos Diretos)</option>
                    <option value="Deslocamentos">Deslocamentos (Custos Indiretos)</option>
                    <option value="Administração">Administração (Custos Indiretos)</option>
                    <option value="Contingências">Contingências (Custos Indiretos)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Insumo / Descrição Técnico *</label>
                  <input
                    id="add-bud-desc"
                    type="text"
                    required
                    disabled={isSavingBudget}
                    placeholder="Ex: 200m² de Lajotas Cerâmicas de Revestimento"
                    value={budgetDesc}
                    onChange={(e) => setBudgetDesc(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Orçado (R$) *</label>
                    <input
                      id="add-bud-orcado"
                      type="number"
                      step="0.01"
                      required
                      disabled={isSavingBudget}
                      placeholder="Ex: 5500.00"
                      value={budgetOrcado}
                      onChange={(e) => setBudgetOrcado(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Contratado (R$)</label>
                    <input
                      id="add-bud-contratado"
                      type="number"
                      step="0.01"
                      disabled={isSavingBudget}
                      placeholder="Ex: 5000.00"
                      value={budgetContratado}
                      onChange={(e) => setBudgetContratado(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Fornecedor Vinculado</label>
                  <select
                    id="add-bud-fornecedor"
                    disabled={isSavingBudget}
                    value={budgetFornecedorId}
                    onChange={(e) => setBudgetFornecedorId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700 disabled:bg-slate-50"
                  >
                    <option value="">Nenhum fornecedor vinculado</option>
                    {fornecedores.map(f => (
                      <option key={f.id} value={f.id}>{f.empresa}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingBudget}
                    onClick={() => setShowAddBudgetItemModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-budget-item-btn"
                    type="submit"
                    disabled={isSavingBudget}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
                  >
                    {isSavingBudget ? (
                      <>
                        <Spinner size={14} />
                        <span>Faturando...</span>
                      </>
                    ) : (
                      <>
                        <DollarSign size={14} />
                        <span>Faturar Item</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: ADD MEDICAO */}
      <AnimatePresence>
        {showAddMedicaoModal && (
          <div id="add-medicao-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSavingMedicao) setShowAddMedicaoModal(false); }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Contents */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">Lançar Medição Técnica</h3>
                <button 
                  onClick={() => setShowAddMedicaoModal(false)}
                  disabled={isSavingMedicao}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleAddMedicao} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Etapa de Obra Medida *</label>
                  <select
                    id="add-med-etapa"
                    required
                    disabled={isSavingMedicao}
                    value={medEtapaId}
                    onChange={(e) => setMedEtapaId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-705 font-semibold disabled:bg-slate-50"
                  >
                    <option value="">Selecione a etapa aferida...</option>
                    {projectSteps.map(step => (
                      <option key={step.id} value={step.id}>{step.nome} (Atual: {step.percentualExecutado}%)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Avanço Físico Medido nesta data (%) *</label>
                  <input
                    id="add-med-percent"
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    required
                    disabled={isSavingMedicao}
                    placeholder="Ex: 25"
                    value={medPercent}
                    onChange={(e) => setMedPercent(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Notas Técnicas de Campo</label>
                  <textarea
                    id="add-med-obs"
                    disabled={isSavingMedicao}
                    placeholder="Anotações sobre a execução, qualidade de acabamento, etc..."
                    value={medObs}
                    onChange={(e) => setMedObs(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Registro Fotográfico Anexo</label>
                  <input
                    id="add-med-photo-input"
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={isSavingMedicao}
                    onChange={(e) => setMedPhotos([...medPhotos, ...Array.from(e.target.files ?? [])])}
                    className="w-full border border-slate-200 rounded-lg p-1.5 text-xs outline-none disabled:bg-slate-50"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {medPhotos.map((photo, idx) => (
                      <span key={idx} className="bg-slate-100 text-slate-700 text-xs font-mono px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1.5">
                        <span>{photo.name}</span>
                        <button type="button" disabled={isSavingMedicao} onClick={() => setMedPhotos(medPhotos.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-rose-600 font-bold">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingMedicao}
                    onClick={() => setShowAddMedicaoModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-medicao-btn"
                    type="submit"
                    disabled={isSavingMedicao}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
                  >
                    {isSavingMedicao ? (
                      <>
                        <Spinner size={14} />
                        <span>Aferindo...</span>
                      </>
                    ) : (
                      <>
                        <Camera size={14} />
                        <span>Registrar Boletim</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: VINCULAR ETAPA <-> ORÇAMENTO */}
      <AnimatePresence>
        {vinculoModal && (() => {
          // O vínculo é o mesmo registro nos dois modos; muda só qual lado já
          // está fixo e qual o formulário pergunta.
          const modoEtapa = vinculoModal.modo === 'etapa';
          const etapaFixa = modoEtapa ? projectSteps.find(s => s.id === vinculoModal.etapaId) : undefined;
          const itemFixo = modoEtapa ? undefined : projectBudgetItems.find(i => i.id === vinculoModal.itemId);
          const currentVinculos = modoEtapa
            ? projectVinculos.filter(v => v.etapaId === vinculoModal.etapaId)
            : projectVinculos.filter(v => v.itemOrcamentoId === vinculoModal.itemId);
          const pesoUsado = currentVinculos.reduce((sum, v) => sum + v.pesoPercentual, 0);
          const etapasJaVinculadas = new Set(currentVinculos.map(v => v.etapaId));
          const itensJaVinculados = new Set(currentVinculos.map(v => v.itemOrcamentoId));
          const restanteDoItem = modoEtapa ? null : Math.max(0, 100 - pesoUsado);
          return (
            <div id="vinculo-etapa-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setVinculoModal(null)}
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
                className="relative bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]"
              >
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                  <div className="pr-2 min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm">
                      {modoEtapa ? 'Vincular Orçamento' : 'Distribuir entre Etapas'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-semibold truncate">
                      {modoEtapa ? etapaFixa?.nome : itemFixo?.descricao}
                    </p>
                  </div>
                  <button onClick={() => setVinculoModal(null)} className="text-slate-400 hover:text-slate-600 font-bold shrink-0">✕</button>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {modoEtapa
                      ? 'Defina de quais linhas do orçamento esta etapa consome verba, e em qual peso. Quando uma medição for lançada para esta etapa, o valor será aplicado proporcionalmente a cada linha vinculada.'
                      : 'Distribua o valor deste item entre as etapas em que ele é aplicado — o mesmo material pode entrar em várias frentes. A soma dos pesos não pode passar de 100%; o que sobrar não entra em nenhuma medição.'}
                  </p>

                  {!modoEtapa && (
                    <div className={`p-2 rounded border text-[10px] font-bold ${
                      restanteDoItem === 0
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}>
                      {restanteDoItem === 0
                        ? 'Item 100% distribuído entre as etapas.'
                        : `${restanteDoItem}% do valor deste item ainda não está em nenhuma etapa.`}
                    </div>
                  )}

                  {currentVinculos.length > 0 && (
                    <div className="space-y-1.5">
                      {currentVinculos.map(v => {
                        const rotulo = modoEtapa
                          ? projectBudgetItems.find(i => i.id === v.itemOrcamentoId)?.descricao ?? 'Item removido'
                          : projectSteps.find(s => s.id === v.etapaId)?.nome ?? 'Etapa removida';
                        return (
                          <div key={v.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-150 rounded text-xs">
                            <span className="font-semibold text-slate-700 truncate pr-2">{rotulo}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-bold text-blue-600">{v.pesoPercentual}%</span>
                              <button
                                type="button"
                                onClick={() => onRemoveVinculo(v.id)}
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <form onSubmit={handleAddVinculoSubmit} className="pt-3 border-t border-slate-150 space-y-2.5">
                    {modoEtapa ? (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Item de Orçamento</label>
                        <select
                          id="vinculo-item-select"
                          required
                          value={vinculoItemId}
                          onChange={(e) => setVinculoItemId(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700"
                        >
                          <option value="">Selecione...</option>
                          {projectBudgetItems.map(item => {
                            const disponivel = 100 - getPesoUsadoItem(item.id);
                            const jaNaEtapa = itensJaVinculados.has(item.id);
                            return (
                              <option key={item.id} value={item.id} disabled={jaNaEtapa || disponivel <= 0}>
                                {item.descricao} ({item.categoria}) — {jaNaEtapa ? 'já vinculado' : `${disponivel}% disponível`}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Etapa do Cronograma</label>
                        <select
                          id="vinculo-etapa-select"
                          required
                          value={vinculoEtapaAlvoId}
                          onChange={(e) => setVinculoEtapaAlvoId(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700"
                        >
                          <option value="">Selecione...</option>
                          {projectSteps.map(step => (
                            <option key={step.id} value={step.id} disabled={etapasJaVinculadas.has(step.id)}>
                              {step.nome}{etapasJaVinculadas.has(step.id) ? ' — já vinculada' : ''}
                            </option>
                          ))}
                        </select>
                        {projectSteps.length === 0 && (
                          <p className="text-[10px] text-amber-600 font-semibold mt-1">
                            Nenhuma etapa cadastrada — monte o cronograma antes de distribuir o orçamento.
                          </p>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        {modoEtapa
                          ? `Peso (%) — nesta etapa: ${pesoUsado}%${vinculoItemId ? ` · disponível no item: ${100 - getPesoUsadoItem(vinculoItemId)}%` : ''}`
                          : `Peso (%) — já distribuído: ${pesoUsado}% · disponível: ${restanteDoItem}%`}
                      </label>
                      <input
                        id="vinculo-peso-input"
                        type="number"
                        min="1"
                        max="100"
                        required
                        value={vinculoPeso}
                        onChange={(e) => setVinculoPeso(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600"
                      />
                    </div>
                    <button
                      id="submit-vinculo-btn"
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs transition"
                    >
                      Adicionar Vínculo
                    </button>
                  </form>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* MODAL 5: CONCEDER ACESSO DE CAMPO */}
      <AnimatePresence>
        {showAddMembroModal && (
          <div id="add-membro-equipe-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddMembroModal(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-slate-200"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">Conceder Acesso à Obra</h3>
                <button onClick={() => setShowAddMembroModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
              </div>
              <form onSubmit={handleAddMembroSubmit} className="p-4 space-y-4 text-left">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Apenas usuários do app de campo precisam de concessão explícita — administração, gestão e financeiro já enxergam todas as obras.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Profissional de Campo</label>
                  <select
                    id="add-membro-profile-select"
                    required
                    value={membroProfileId}
                    onChange={(e) => setMembroProfileId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700"
                  >
                    <option value="">Selecione...</option>
                    {perfisDisponiveis.map(p => (
                      <option key={p.id} value={p.id}>{p.fullName || p.email}</option>
                    ))}
                  </select>
                  {perfisDisponiveis.length === 0 && (
                    <p className="text-[10px] text-amber-600 font-semibold mt-1">Nenhum usuário de campo disponível para conceder acesso.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Papel na Obra (Opcional)</label>
                  <input
                    id="add-membro-papel-input"
                    type="text"
                    placeholder="Ex: Mestre de Obras"
                    value={membroPapel}
                    onChange={(e) => setMembroPapel(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800"
                  />
                </div>
                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAddMembroModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-membro-equipe-btn"
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
                  >
                    <UserPlus size={14} />
                    <span>Conceder</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 6: EDITAR DADOS DA OBRA */}
      <AnimatePresence>
        {showEditObraModal && (
          <div id="editar-obra-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSavingObra) setShowEditObraModal(false); }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Editar Obra</h3>
                  <p className="text-[10px] text-slate-400 font-semibold">A situação da obra muda pelo seletor do cabeçalho.</p>
                </div>
                <button
                  onClick={() => setShowEditObraModal(false)}
                  disabled={isSavingObra}
                  className="text-slate-400 hover:text-slate-600 font-bold transition disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleSalvarObra} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nome da Obra *</label>
                  <input
                    id="edit-obra-nome"
                    type="text"
                    required
                    disabled={isSavingObra}
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente *</label>
                  <select
                    id="edit-obra-cliente"
                    required
                    disabled={isSavingObra}
                    value={editClienteId}
                    onChange={(e) => setEditClienteId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700 disabled:bg-slate-50"
                  >
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Gerente de Obra</label>
                  <select
                    id="edit-obra-responsavel"
                    disabled={isSavingObra}
                    value={editResponsavelId}
                    onChange={(e) => setEditResponsavelId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700 disabled:bg-slate-50"
                  >
                    <option value="">A definir</option>
                    {funcionarios.map(f => (
                      <option key={f.id} value={f.id}>{f.nome} ({f.cargo})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Endereço do Canteiro</label>
                  <input
                    id="edit-obra-endereco"
                    type="text"
                    disabled={isSavingObra}
                    value={editEndereco}
                    onChange={(e) => setEditEndereco(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Início *</label>
                    <input
                      id="edit-obra-inicio"
                      type="date"
                      required
                      disabled={isSavingObra}
                      value={editInicio}
                      onChange={(e) => setEditInicio(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Previsão de Entrega *</label>
                    <input
                      id="edit-obra-fim"
                      type="date"
                      required
                      disabled={isSavingObra}
                      value={editFim}
                      onChange={(e) => setEditFim(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Mudar o prazo da obra não move as etapas do cronograma — elas têm datas próprias e são editadas na aba Cronograma.
                </p>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingObra}
                    onClick={() => setShowEditObraModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-editar-obra-btn"
                    type="submit"
                    disabled={isSavingObra}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {isSavingObra ? (
                      <>
                        <Spinner size={14} />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Pencil size={14} />
                        <span>Salvar Alterações</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 7: CRIAR / EDITAR ETAPA DO CRONOGRAMA */}
      <AnimatePresence>
        {etapaModal && (
          <div id="etapa-cronograma-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSavingEtapa) setEtapaModal(null); }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {etapaModal.modo === 'nova' ? 'Nova Etapa' : 'Editar Etapa'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    {etapaModal.modo === 'nova' ? 'Uma nova frente de trabalho no cronograma.' : etapaModal.etapa?.nome}
                  </p>
                </div>
                <button
                  onClick={() => setEtapaModal(null)}
                  disabled={isSavingEtapa}
                  className="text-slate-400 hover:text-slate-600 font-bold transition disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleSalvarEtapa} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nome da Etapa *</label>
                  <input
                    id="etapa-nome-input"
                    type="text"
                    required
                    disabled={isSavingEtapa}
                    placeholder="Ex: Impermeabilização da Laje"
                    value={etapaNome}
                    onChange={(e) => setEtapaNome(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Início *</label>
                    <input
                      id="etapa-inicio-input"
                      type="date"
                      required
                      disabled={isSavingEtapa}
                      value={etapaInicio}
                      onChange={(e) => setEtapaInicio(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Fim *</label>
                    <input
                      id="etapa-fim-input"
                      type="date"
                      required
                      disabled={isSavingEtapa}
                      value={etapaFim}
                      onChange={(e) => setEtapaFim(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Encarregado</label>
                  <select
                    id="etapa-responsavel-select"
                    disabled={isSavingEtapa}
                    value={etapaResponsavel}
                    onChange={(e) => setEtapaResponsavel(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700 disabled:bg-slate-50"
                  >
                    <option value="">A definir</option>
                    {funcionarios.map(f => (
                      <option key={f.id} value={f.id}>{f.nome} ({f.cargo})</option>
                    ))}
                  </select>
                </div>

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Progresso e status não são editáveis: saem das medições aprovadas desta etapa.
                </p>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingEtapa}
                    onClick={() => setEtapaModal(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-etapa-btn"
                    type="submit"
                    disabled={isSavingEtapa}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {isSavingEtapa ? (
                      <>
                        <Spinner size={14} />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <span>{etapaModal.modo === 'nova' ? 'Criar Etapa' : 'Salvar Etapa'}</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 8: REJEITAR MEDIÇÃO (com justificativa obrigatória) */}
      <AnimatePresence>
        {medicaoParaRejeitar && (
          <div id="rejeitar-medicao-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!medicaoBusyId) setMedicaoParaRejeitar(null); }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-rose-200"
            >
              <div className="p-4 border-b border-rose-200 bg-rose-50 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-bold text-rose-800 text-sm">Rejeitar Medição</h3>
                  <p className="text-[10px] text-rose-500 font-semibold">
                    {projectSteps.find(st => st.id === medicaoParaRejeitar.etapaId)?.nome ?? 'Etapa removida'}
                    {' · '}
                    +{medicaoParaRejeitar.percentualMedido}%
                  </p>
                </div>
                <button
                  onClick={() => setMedicaoParaRejeitar(null)}
                  disabled={!!medicaoBusyId}
                  className="text-rose-400 hover:text-rose-600 font-bold transition disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleRejeitar} className="p-4 space-y-4 text-left">
                <p className="text-xs text-slate-600 leading-relaxed">
                  O boletim fica marcado como rejeitado e não afeta o orçamento. O motivo
                  abaixo aparece no boletim para quem o lançou.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Motivo da recusa *</label>
                  <textarea
                    id="motivo-rejeicao-input"
                    required
                    autoFocus
                    disabled={!!medicaoBusyId}
                    rows={3}
                    placeholder="Ex: falta o registro fotográfico da face norte; o percentual não confere com o executado em campo."
                    value={motivoRejeicao}
                    onChange={(e) => setMotivoRejeicao(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-rose-500 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!!medicaoBusyId}
                    onClick={() => setMedicaoParaRejeitar(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-rejeitar-medicao-btn"
                    type="submit"
                    disabled={!!medicaoBusyId}
                    className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {medicaoBusyId ? (
                      <>
                        <Spinner size={14} />
                        <span>Rejeitando...</span>
                      </>
                    ) : (
                      <>
                        <X size={14} />
                        <span>Rejeitar Boletim</span>
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
