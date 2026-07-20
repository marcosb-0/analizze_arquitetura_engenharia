import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Briefcase, 
  MapPin, 
  Calendar, 
  DollarSign, 
  Clock, 
  Plus, 
  Layers, 
  Camera, 
  AlertTriangle, 
  Trash2, 
  History, 
  Percent, 
  FileCheck,
  Building2,
  ChevronLeft,
  FileText,
  Download,
  ShieldAlert,
  HardDriveUpload,
  UserPlus,
  ShieldCheck
} from 'lucide-react';
import {
  Cliente,
  Projeto,
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
  ProjetoEquipeMembro
} from '../types';
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

interface ProjetoConsoleProps {
  projeto: Projeto;
  clientes: Cliente[];
  funcionarios: Funcionario[];
  fornecedores: Fornecedor[];
  orcamentos: ItemOrcamento[];
  alteracoesOrcamento: AlteracaoOrcamento[];
  cronogramas: EtapaCronograma[];
  vinculos: EtapaOrcamentoVinculo[];
  medicoes: MedicaoObra[];
  documentos: Documento[];
  projetoEquipe: ProjetoEquipeMembro[];
  perfisCampo: Acesso[];
  onClose: () => void;
  onUpdateProjetoSituacao: (projId: string, situacao: Projeto['situacao']) => void;
  onAddOrcamentoItem: (item: ItemOrcamento) => void;
  onAddVinculo: (vinculo: EtapaOrcamentoVinculo) => void;
  onRemoveVinculo: (id: string) => void;
  onAddMedicao: (med: { projetoId: string; etapaId: string; percentualMedido: number; observacoes: string }, fotos: File[]) => void;
  onAddDocumento: (doc: Documento, file?: File) => void;
  onDownloadDocumento: (doc: Documento) => void;
  onAddMembroEquipe: (projetoId: string, profileId: string, papel: string) => void;
  onRemoveMembroEquipe: (id: string) => void;
}

export default function ProjetoConsole({
  projeto,
  clientes,
  funcionarios,
  fornecedores,
  orcamentos,
  alteracoesOrcamento,
  cronogramas,
  vinculos,
  medicoes,
  documentos,
  projetoEquipe,
  perfisCampo,
  onClose,
  onUpdateProjetoSituacao,
  onAddOrcamentoItem,
  onAddVinculo,
  onRemoveVinculo,
  onAddMedicao,
  onAddDocumento,
  onDownloadDocumento,
  onAddMembroEquipe,
  onRemoveMembroEquipe
}: ProjetoConsoleProps) {
  const { toast, confirm } = useFeedback();

  // Console Internal Tabs
  const [internalTab, setInternalTab] = useState<'geral' | 'orcamento' | 'cronograma' | 'medicoes' | 'documentos' | 'equipe'>('geral');

  // Sub-modal states
  const [showAddBudgetItemModal, setShowAddBudgetItemModal] = useState(false);
  const [showAddMedicaoModal, setShowAddMedicaoModal] = useState(false);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showVinculoModal, setShowVinculoModal] = useState(false);
  const [vinculoEtapaId, setVinculoEtapaId] = useState<string | null>(null);

  // Saving states for modals (Task 5)
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isSavingMedicao, setIsSavingMedicao] = useState(false);
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

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
  const [docNome, setDocNome] = useState('');
  const [docTipo, setDocTipo] = useState<Documento['tipo']>('Contrato');
  const [docVersao, setDocVersao] = useState('1.0');
  const [docFile, setDocFile] = useState<File | null>(null);

  // 4. New Vinculo (Etapa <-> Orçamento) State
  const [vinculoItemId, setVinculoItemId] = useState('');
  const [vinculoPeso, setVinculoPeso] = useState('100');

  // 5. New Equipe Membro (acesso de campo) State
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

  // Physical Summary % — weighted by each etapa's linked orçado value (via
  // etapa_orcamento_vinculo), not a flat average across etapas. An etapa that
  // drives R$200k of budget should count more than one driving R$5k. Falls
  // back to a simple average only when no etapa has any budget link yet
  // (otherwise the weighted sum would divide by zero).
  const progressoFisicoMedio = useMemo(() => {
    if (projectSteps.length === 0) return 0;
    const pesos = projectSteps.map(step =>
      projectVinculos
        .filter(v => v.etapaId === step.id)
        .reduce((sum, v) => {
          const item = projectBudgetItems.find(i => i.id === v.itemOrcamentoId);
          return sum + (item ? (v.pesoPercentual / 100) * item.valorOrcado : 0);
        }, 0)
    );
    const pesoTotal = pesos.reduce((a, b) => a + b, 0);
    if (pesoTotal <= 0) {
      const sum = projectSteps.reduce((acc, curr) => acc + curr.percentualExecutado, 0);
      return Math.round(sum / projectSteps.length);
    }
    const somaPonderada = projectSteps.reduce((acc, step, i) => acc + step.percentualExecutado * pesos[i], 0);
    return Math.round(somaPonderada / pesoTotal);
  }, [projectSteps, projectVinculos, projectBudgetItems]);

  const getFuncionarioName = (id: string) => {
    return funcionarios.find(f => f.id === id)?.nome || 'Profissional não cadastrado';
  };

  const medicaoBloqueada = projeto.situacao === 'Pausado' || projeto.situacao === 'Finalizado';

  // Real Gantt positioning: bars placed/sized by each etapa's actual
  // data_inicio/data_fim within the project's overall date span, instead of
  // a fixed "Jan/Mar..Out/Dez" header unrelated to the obra's real dates.
  const ganttRange = useMemo(() => {
    const starts = projectSteps.map(s => new Date(s.dataInicio + 'T00:00:00').getTime()).filter(t => !isNaN(t));
    const ends = projectSteps.map(s => new Date(s.dataFim + 'T00:00:00').getTime()).filter(t => !isNaN(t));
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
  const handleAddBudgetItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetDesc || !budgetOrcado) {
      toast.error('Preencha os campos obrigatórios (Descrição, Valor Orçado).');
      return;
    }

    setIsSavingBudget(true);

    setTimeout(() => {
      const newItem: ItemOrcamento = {
        id: crypto.randomUUID(),
        projetoId: projeto.id,
        categoria: budgetCat,
        descricao: budgetDesc,
        valorOrcado: parseFloat(budgetOrcado),
        valorContratado: budgetContratado ? parseFloat(budgetContratado) : 0,
        valorExecutado: 0,
        fornecedorId: budgetFornecedorId || undefined
      };

      // The aditivo log entry is created server-side by trg_log_item_orcamento_insert
      // in the same transaction as the item insert — no separate client call needed.
      onAddOrcamentoItem(newItem);

      setIsSavingBudget(false);
      setShowAddBudgetItemModal(false);
      toast.success("Item orçamentário registrado.", `Adicionado em ${budgetCat}.`);

      // Reset Form
      setBudgetDesc('');
      setBudgetOrcado('');
      setBudgetContratado('');
      setBudgetFornecedorId('');
    }, 600);
  };

  const handleAddMembroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!membroProfileId) {
      toast.error('Selecione um profissional para conceder acesso.');
      return;
    }
    onAddMembroEquipe(projeto.id, membroProfileId, membroPapel);
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
      await onAddMedicao(
        {
          projetoId: projeto.id,
          etapaId: medEtapaId,
          percentualMedido: parseFloat(medPercent),
          observacoes: medObs || 'Medição periódica realizada.',
        },
        medPhotos
      );
      setShowAddMedicaoModal(false);
      toast.success("Boletim de medição lançado.", `Evolução de +${medPercent}% registrada.`);
      // A primeira medição tira a obra de "Planejamento" automaticamente —
      // é o próprio sinal de que a execução começou de fato.
      if (projeto.situacao === 'Planejamento') {
        onUpdateProjetoSituacao(projeto.id, 'Em Execução');
      }
      setMedEtapaId('');
      setMedPercent('');
      setMedObs('');
      setMedPhotos([]);
    } finally {
      setIsSavingMedicao(false);
    }
  };

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docNome || !docFile) {
      toast.error("Informe o título e selecione o arquivo do documento.");
      return;
    }

    setIsSavingDoc(true);

    const newDoc: Documento = {
      id: crypto.randomUUID(),
      nome: docNome,
      tipo: docTipo,
      projetoId: projeto.id,
      dataCriacao: new Date().toISOString().split('T')[0],
      versao: docVersao || '1.0',
      tamanho: ''
    };

    await onAddDocumento(newDoc, docFile);
    setIsSavingDoc(false);
    setShowAddDocModal(false);
    toast.success("Documento técnico anexado.", `O arquivo ${newDoc.nome} está disponível para consulta.`);
    setDocNome('');
    setDocFile(null);
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
    return projectVinculos
      .filter(v => v.itemOrcamentoId === itemId && v.id !== excludeVinculoId)
      .reduce((sum, v) => sum + v.pesoPercentual, 0);
  };

  const handleAddVinculoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vinculoEtapaId || !vinculoItemId || !vinculoPeso) return;
    const peso = parseFloat(vinculoPeso);
    if (isNaN(peso) || peso <= 0 || peso > 100) {
      toast.error('O peso deve ser um percentual entre 1 e 100.');
      return;
    }
    const pesoUsadoItem = getPesoUsadoItem(vinculoItemId);
    if (pesoUsadoItem + peso > 100) {
      toast.error(
        'Peso excede o disponível para este item.',
        `Este item já tem ${pesoUsadoItem}% do seu valor orçado alocado a outras etapas. Disponível: ${100 - pesoUsadoItem}%.`
      );
      return;
    }
    onAddVinculo({ id: crypto.randomUUID(), etapaId: vinculoEtapaId, itemOrcamentoId: vinculoItemId, pesoPercentual: peso });
    setVinculoItemId('');
    setVinculoPeso('100');
    toast.success('Item de orçamento vinculado à etapa.');
  };

  const handleDownload = (doc: Documento) => {
    setDownloadingDocId(doc.id);
    onDownloadDocumento(doc);
    setTimeout(() => setDownloadingDocId(null), 800);
  };

  const applySituacaoChange = (situacao: Projeto['situacao']) => {
    onUpdateProjetoSituacao(projeto.id, situacao);
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

        {/* Console Header Action Menu (Change status) */}
        <div className="flex items-center gap-2">
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
      </div>

      {/* Internal Workspace Menu Bar */}
      <div id="console-subnavigation" className="border-b border-slate-150/80 pb-px flex gap-6 overflow-x-auto select-none bg-transparent px-2">
        <button
          onClick={() => setInternalTab('geral')}
          className={`pb-2 text-xs font-bold transition shrink-0 cursor-pointer relative ${
            internalTab === 'geral' 
              ? 'text-blue-600 font-extrabold border-b-2 border-blue-600' 
              : 'text-slate-400 hover:text-slate-800'
          }`}
        >
          Geral
        </button>
        <button
          id="console-tab-orcamento"
          onClick={() => setInternalTab('orcamento')}
          className={`pb-2 text-xs font-bold transition shrink-0 cursor-pointer relative ${
            internalTab === 'orcamento' 
              ? 'text-blue-600 font-extrabold border-b-2 border-blue-600' 
              : 'text-slate-400 hover:text-slate-800'
          }`}
        >
          Orçamentos ({projectBudgetItems.length})
        </button>
        <button
          id="console-tab-cronograma"
          onClick={() => setInternalTab('cronograma')}
          className={`pb-2 text-xs font-bold transition shrink-0 cursor-pointer relative ${
            internalTab === 'cronograma' 
              ? 'text-blue-600 font-extrabold border-b-2 border-blue-600' 
              : 'text-slate-400 hover:text-slate-800'
          }`}
        >
          Cronograma
        </button>
        <button
          id="console-tab-medicoes"
          onClick={() => setInternalTab('medicoes')}
          className={`pb-2 text-xs font-bold transition shrink-0 cursor-pointer relative ${
            internalTab === 'medicoes' 
              ? 'text-blue-600 font-extrabold border-b-2 border-blue-600' 
              : 'text-slate-400 hover:text-slate-800'
          }`}
        >
          Medições ({projectMedicoes.length})
        </button>
        <button
          onClick={() => setInternalTab('documentos')}
          className={`pb-2 text-xs font-bold transition shrink-0 cursor-pointer relative ${
            internalTab === 'documentos' 
              ? 'text-blue-600 font-extrabold border-b-2 border-blue-600' 
              : 'text-slate-400 hover:text-slate-800'
          }`}
        >
          Documentos ({projectDocuments.length})
        </button>
        <button
          onClick={() => setInternalTab('equipe')}
          className={`pb-2 text-xs font-bold transition shrink-0 cursor-pointer relative ${
            internalTab === 'equipe' 
              ? 'text-blue-600 font-extrabold border-b-2 border-blue-600' 
              : 'text-slate-400 hover:text-slate-800'
          }`}
        >
          Equipe
        </button>
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
                    {new Date(projeto.dataFim).toLocaleDateString('pt-BR')}
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
                    <span><strong>Mobilização Inicial:</strong> {new Date(projeto.dataInicio).toLocaleDateString('pt-BR')}</span>
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

            {/* Quick internal notes checklist */}
            <div className="p-3.5 bg-blue-50/10 border border-blue-200/50 rounded-lg space-y-1.5">
              <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Memorial Técnico & Condicionantes</span>
              </h4>
              <ul className="text-xs text-slate-600 space-y-1 pl-4 list-disc leading-relaxed">
                <li>Garantir o recolhimento prévio da ART de Execução antes do início da etapa subsequente de Instalações.</li>
                <li>Todas as medições de campo devem possuir registro fotográfico anexado no boletim de medição periódica.</li>
                <li>Qualquer aditivo contratual de aumento ou redução de material deve ser formalizado via registro de log na aba de Orçamento.</li>
              </ul>
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

              <button
                id="console-add-budget-item-btn"
                onClick={() => setShowAddBudgetItemModal(true)}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition shadow-sm"
              >
                <Plus size={14} />
                <span>Novo Item</span>
              </button>
            </div>

            {/* Cost Breakdown Tables */}
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Planilha Orçamentária Detalhada</h4>
              
              {projectBudgetItems.length === 0 ? (
                <EmptyState
                  icon={DollarSign}
                  title="Planilha vazia"
                  description="Adicione insumos, materiais ou taxas para compor a estrutura orçamentária."
                  actionLabel="Novo Item"
                  onAction={() => setShowAddBudgetItemModal(true)}
                />
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white">
                  <table id="budget-items-table" className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-xs">
                      <tr>
                        <th className="p-3">Categoria</th>
                        <th className="p-3">Descrição do Insumo / Atividade</th>
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
                        <span className="text-xs text-slate-400">{new Date(alt.data).toLocaleDateString('pt-BR')}</span>
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
            <div>
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Cronograma Físico da Obra</h4>
              <p className="text-xs text-slate-400">Progresso calculado a partir das medições registradas. Vincule itens de orçamento a cada etapa para habilitar o cálculo.</p>
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
                      const stepStart = new Date(step.dataInicio + 'T00:00:00').getTime();
                      const stepEnd = new Date(step.dataFim + 'T00:00:00').getTime();
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
                              title={`${new Date(step.dataInicio).toLocaleDateString('pt-BR')} a ${new Date(step.dataFim).toLocaleDateString('pt-BR')}`}
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
                            <div>{new Date(step.dataInicio).toLocaleDateString('pt-BR')} a {new Date(step.dataFim).toLocaleDateString('pt-BR')}</div>
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
                          <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              id={`vincular-orcamento-etapa-${step.id}`}
                              onClick={() => {
                                setVinculoEtapaId(step.id);
                                setVinculoItemId('');
                                setVinculoPeso('100');
                                setShowVinculoModal(true);
                              }}
                              className="bg-slate-50 text-slate-600 hover:bg-slate-800 hover:text-white px-2 py-1 rounded font-bold text-[10px] transition active:scale-95 border border-slate-200 cursor-pointer"
                            >
                              Vincular Orçamento
                            </button>
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
                actionLabel="Registrar Vistoria"
                onAction={() => setShowAddMedicaoModal(true)}
              />
            ) : (
              <div className="space-y-2">
                {projectMedicoes.map(med => {
                  const step = projectSteps.find(s => s.id === med.etapaId);
                  return (
                    <div key={med.id} className="p-3 bg-white border border-slate-200 shadow-sm rounded-lg flex gap-4">
                      <div className="h-12 w-12 rounded-lg bg-blue-50 flex flex-col items-center justify-center border border-blue-200 shrink-0 font-bold">
                        <span className="text-xs text-blue-800 leading-none">{new Date(med.dataMedicao).getDate()}</span>
                        <span className="text-xs text-blue-700 font-mono uppercase">{new Date(med.dataMedicao).toLocaleString('pt-BR', { month: 'short' }).slice(0, 3)}</span>
                      </div>
                      
                      <div className="flex-1 min-w-0 text-left space-y-1.5">
                        <div className="flex justify-between items-start">
                          <h5 className="font-bold text-xs text-slate-900">
                            Boletim Medição: <strong className="text-blue-600">{step ? step.nome : 'Geral'}</strong>
                          </h5>
                          <span className="text-xs font-bold font-mono text-emerald-600">
                            {med.valorMedido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Evolução física aferida: <strong className="text-slate-800">+{med.percentualMedido}%</strong>
                        </p>
                        <p className="text-xs text-slate-700 italic bg-slate-50 p-2 rounded-lg">
                          "{med.observacoes}"
                        </p>
                        
                        {/* Attached Photos list */}
                        {med.fotos.length > 0 && (
                          <div className="flex gap-2 pt-1 flex-wrap">
                            {med.fotos.map((photo, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-600 transition">
                                <Camera size={11} className="text-slate-500 shrink-0" />
                                <span className="font-mono">{photo}</span>
                              </div>
                            ))}
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
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Documentos Vinculados à Obra</h4>
                <p className="text-xs text-slate-400">Desenhos arquitetônicos, licenças e contratos específicos deste canteiro.</p>
              </div>
              <button
                id="console-add-doc-btn"
                onClick={() => setShowAddDocModal(true)}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition shadow-sm"
              >
                <Plus size={14} />
                <span>Novo Documento</span>
              </button>
            </div>

            {projectDocuments.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Sem arquivos vinculados"
                description="Armazene ARTs, plantas em DWG/PDF, contratos e vistorias no console da obra."
                actionLabel="Anexar Arquivo"
                onAction={() => setShowAddDocModal(true)}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projectDocuments.map(doc => {
                  const isDownloading = downloadingDocId === doc.id;
                  return (
                    <div key={doc.id} className="p-3.5 bg-white border border-slate-200 shadow-xs rounded-lg flex items-center justify-between">
                      <div className="min-w-0 text-left space-y-1">
                        <span className="bg-slate-100 text-slate-600 text-xs font-bold px-1.5 py-0.5 rounded uppercase">
                          {doc.tipo}
                        </span>
                        <h5 className="font-bold text-xs text-slate-950 mt-2 truncate max-w-[200px]" title={doc.nome}>{doc.nome}</h5>
                        <p className="text-xs text-slate-400 font-mono">Versão: {doc.versao} • {doc.tamanho}</p>
                      </div>
                      
                      <button
                        id={`simulate-download-btn-${doc.id}`}
                        disabled={isDownloading}
                        onClick={() => handleDownload(doc)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition active:scale-95 disabled:opacity-50 shrink-0"
                        title="Baixar arquivo oficial"
                      >
                        {isDownloading ? (
                          <Spinner size={16} />
                        ) : (
                          <Download size={16} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: EQUIPE RESIDENTE */}
        {internalTab === 'equipe' && (
          <div id="tab-pane-equipe" className="space-y-4 text-left">
            <div>
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Profissionais e Terceiros no Canteiro</h4>
              <p className="text-xs text-slate-400 font-medium">Equipe residente e encarregados das frentes de trabalho ativas.</p>
            </div>

            {/* List resident employees based on schedule stages */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projectSteps.length === 0 ? (
                <p className="text-xs text-slate-400 italic pl-1 col-span-full">Nenhuma equipe alocada a etapas no momento.</p>
              ) : (
                projectSteps.map(step => {
                  const worker = funcionarios.find(f => f.id === step.responsavelId);
                  return (
                    <div key={step.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-3">
                      <div className="h-10 w-10 bg-blue-50 border border-blue-200 text-blue-800 font-bold rounded-full flex items-center justify-center shrink-0 text-xs shadow-xs">
                        {worker ? worker.nome.split(' ').slice(0, 2).map(n => n[0]).join('') : 'EQ'}
                      </div>
                      
                      <div className="flex-1 min-w-0 space-y-1 text-left">
                        <span className="text-xs font-bold uppercase text-slate-400 block">Líder da Etapa: {step.nome}</span>
                        <h5 className="font-bold text-xs text-slate-900 truncate">
                          {worker ? worker.nome : 'Equipe Técnica Externa'}
                        </h5>
                        <p className="text-xs text-blue-600 font-bold truncate">
                          {worker ? worker.cargo : 'Fornecedor Terceirizado'}
                        </p>
                        
                        {worker && (
                          <div className="pt-2 text-xs text-slate-500 space-y-0.5 border-t border-slate-200/50 mt-1.5 font-mono">
                            <p>Celular: {worker.telefone}</p>
                            <p>E-mail: {worker.email}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
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
                    min="1"
                    max="100"
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

      {/* MODAL 3: ADD DOCUMENTO */}
      <AnimatePresence>
        {showAddDocModal && (
          <div id="add-doc-console-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSavingDoc) setShowAddDocModal(false); }}
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
                <h3 className="font-bold text-slate-900 text-sm">Registrar Documento</h3>
                <button 
                  onClick={() => setShowAddDocModal(false)}
                  disabled={isSavingDoc}
                  className="text-slate-400 hover:text-slate-600 font-bold transition disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleAddDoc} className="p-4 space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Arquivo *</label>
                  <input
                    id="add-doc-console-file"
                    type="file"
                    required
                    disabled={isSavingDoc}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setDocFile(file);
                      if (file && !docNome) setDocNome(file.name);
                    }}
                    className="w-full border border-slate-200 rounded-lg p-1.5 text-xs outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Título do Documento *</label>
                  <input
                    id="add-doc-console-nome"
                    type="text"
                    required
                    disabled={isSavingDoc}
                    placeholder="Ex: Contrato_Terceirizacao_Clima_Alfa.pdf"
                    value={docNome}
                    onChange={(e) => setDocNome(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tipo de Documento *</label>
                    <select
                      id="add-doc-console-tipo"
                      disabled={isSavingDoc}
                      value={docTipo}
                      onChange={(e) => setDocTipo(e.target.value as Documento['tipo'])}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700 disabled:bg-slate-50 font-semibold"
                    >
                      <option value="Contrato">Contrato</option>
                      <option value="Projeto Técnico">Projeto Técnico</option>
                      <option value="ART/RRT">ART/RRT</option>
                      <option value="Licença">Licença</option>
                      <option value="Foto">Foto</option>
                      <option value="Relatório">Relatório</option>
                      <option value="Nota Fiscal">Nota Fiscal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Versão Inicial</label>
                    <input
                      id="add-doc-console-versao"
                      type="text"
                      disabled={isSavingDoc}
                      placeholder="1.0"
                      value={docVersao}
                      onChange={(e) => setDocVersao(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingDoc}
                    onClick={() => setShowAddDocModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-add-doc-console-btn"
                    type="submit"
                    disabled={isSavingDoc}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
                  >
                    {isSavingDoc ? (
                      <>
                        <Spinner size={14} />
                        <span>Fazendo upload...</span>
                      </>
                    ) : (
                      <>
                        <HardDriveUpload size={14} />
                        <span>Anexar Arquivo</span>
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
        {showVinculoModal && vinculoEtapaId && (() => {
          const etapa = projectSteps.find(s => s.id === vinculoEtapaId);
          const currentVinculos = projectVinculos.filter(v => v.etapaId === vinculoEtapaId);
          const pesoUsado = currentVinculos.reduce((sum, v) => sum + v.pesoPercentual, 0);
          return (
            <div id="vinculo-etapa-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowVinculoModal(false)}
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
                    <h3 className="font-bold text-slate-900 text-sm">Vincular Orçamento</h3>
                    <p className="text-[10px] text-slate-400 font-semibold">{etapa?.nome}</p>
                  </div>
                  <button onClick={() => setShowVinculoModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Defina de quais linhas do orçamento esta etapa consome verba, e em qual peso. Quando uma medição for lançada para esta etapa, o valor será aplicado proporcionalmente a cada linha vinculada.
                  </p>

                  {currentVinculos.length > 0 && (
                    <div className="space-y-1.5">
                      {currentVinculos.map(v => {
                        const item = projectBudgetItems.find(i => i.id === v.itemOrcamentoId);
                        return (
                          <div key={v.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-150 rounded text-xs">
                            <span className="font-semibold text-slate-700 truncate pr-2">{item?.descricao ?? 'Item removido'}</span>
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
                          return (
                            <option key={item.id} value={item.id} disabled={disponivel <= 0}>
                              {item.descricao} ({item.categoria}) — {disponivel}% disponível
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Peso (%) — nesta etapa: {pesoUsado}%{vinculoItemId ? ` · disponível no item: ${100 - getPesoUsadoItem(vinculoItemId)}%` : ''}
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

    </div>
  );
}
