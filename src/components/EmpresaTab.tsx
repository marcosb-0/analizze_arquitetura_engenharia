import React, { useState, useMemo, useEffect } from 'react';
import { 
  DollarSign, 
  Plus, 
  Search, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  Landmark, 
  Calendar, 
  CheckCircle, 
  Clock, 
  Trash2, 
  ArrowRightLeft, 
  Users, 
  Sliders, 
  FileText,
  CreditCard,
  Briefcase,
  Layers,
  Percent,
  AlertTriangle,
  Pencil
} from 'lucide-react';
import {
  Funcionario,
  Projeto,
  Fornecedor,
  ContaFinanceira,
  LancamentoFinanceiro,
  MedicaoObra,
  EmpresaConfig,
  ResultadoObra
} from '../types';
import EmpresaIdentidade from './EmpresaIdentidade';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { useFeedback } from './FeedbackContext';
import { Modal, CarregarMais } from './ui';
import { formatBRL } from '../lib/preco';
import Spinner from './Spinner';
import EmptyState from './EmptyState';

/** Linhas do razão renderizadas por vez. O filtro roda sobre tudo; só a
 *  renderização é fatiada. */
const LANCAMENTOS_POR_PAGINA = 50;

const MESES_PT_COMPLETO = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// competencia is the canonical YYYY-MM value; this only formats it for display.
function competenciaToLabel(competencia: string): string {
  const [year, month] = competencia.split('-');
  const monthName = MESES_PT_COMPLETO[parseInt(month, 10) - 1] || month;
  return `${monthName}/${year}`;
}

// Generates a rolling window of competencia options around the current date,
// instead of a fixed list that stops working once the calendar moves past it.
function generatePayrollMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let offset = -3; offset <= 2; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    options.push({ value, label: competenciaToLabel(value) });
  }
  return options;
}

interface EmpresaTabProps {
  funcionarios: Funcionario[];
  projetos: Projeto[];
  fornecedores: Fornecedor[];
  contas: ContaFinanceira[];
  medicoes: MedicaoObra[];
  /** Somado no servidor (fn_resultado_obra) — não recalcular no cliente. */
  resultadoObras: ResultadoObra[];
  /** Enquanto true, contas e lançamentos ainda não chegaram — sem isso a tela
   *  exibia saldo zero e razão vazio, indistinguíveis de empresa sem movimento. */
  loading: boolean;
  /** Escritas resolvem para `true` só depois do aceite do servidor — ver useFinanceiro. */
  onAddConta: (conta: ContaFinanceira) => Promise<boolean>;
  lancamentos: LancamentoFinanceiro[];
  onAddLancamento: (lan: LancamentoFinanceiro) => Promise<boolean>;
  onUpdateLancamento: (id: string, patch: Partial<LancamentoFinanceiro>) => Promise<boolean>;
  onUpdateConta: (id: string, patch: Partial<ContaFinanceira>) => Promise<boolean>;
  onGerarFaturamento: (medicaoId: string, contaId: string, pago: boolean) => Promise<boolean>;
  onToggleLancamentoPago: (id: string) => Promise<boolean>;
  onDeleteLancamento: (id: string) => Promise<boolean>;
  /** Papel timbrado das propostas. Null enquanto não carregou. */
  empresa: EmpresaConfig | null;
  onSaveEmpresa: (config: Omit<EmpresaConfig, 'id' | 'logoUrl'>) => Promise<EmpresaConfig | null>;
  onUploadLogo: (file: File) => Promise<boolean>;
  onRemoverLogo: () => Promise<void>;
}

export default function EmpresaTab({
  funcionarios,
  projetos,
  fornecedores,
  contas,
  medicoes,
  resultadoObras,
  loading,
  onAddConta,
  lancamentos,
  onAddLancamento,
  onUpdateLancamento,
  onUpdateConta,
  onGerarFaturamento,
  onToggleLancamentoPago,
  onDeleteLancamento,
  empresa,
  onSaveEmpresa,
  onUploadLogo,
  onRemoverLogo
}: EmpresaTabProps) {
  const { toast, confirm } = useFeedback();
  
  // Active sub-section
  const [activeSubTab, setActiveSubTab] = useState<'painel' | 'lancamentos' | 'obras' | 'contas' | 'salarios' | 'identidade'>('painel');

  // Filter States for Ledger
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTipo, setFilterTipo] = useState<'Todos' | 'Receita' | 'Despesa'>('Todos');
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'Pago' | 'Pendente' | 'Vencido'>('Todos');
  const [filterCategoria, setFilterCategoria] = useState<string>('Todos');
  const [filterConta, setFilterConta] = useState<string>('Todos');

  // Form States - New Account
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accNome, setAccNome] = useState('');
  const [accBanco, setAccBanco] = useState('');
  const [accTipo, setAccTipo] = useState<'Corrente' | 'Poupança' | 'Caixa Interno'>('Corrente');
  const [accSaldo, setAccSaldo] = useState('');
  /** Conta sendo editada; null = o modal está criando. */
  const [editandoConta, setEditandoConta] = useState<ContaFinanceira | null>(null);

  // Form States - New Transaction
  const [showAddTrans, setShowAddTrans] = useState(false);
  const [trTipo, setTrTipo] = useState<'Receita' | 'Despesa'>('Despesa');
  const [trDescricao, setTrDescricao] = useState('');
  const [trValor, setTrValor] = useState('');
  const [trData, setTrData] = useState(new Date().toISOString().split('T')[0]);
  const [trCategoria, setTrCategoria] = useState<string>('Outros');
  const [trContaId, setTrContaId] = useState('');
  const [trProjetoId, setTrProjetoId] = useState('');
  const [trFuncionarioId, setTrFuncionarioId] = useState('');
  const [trFornecedorId, setTrFornecedorId] = useState('');
  const [trPago, setTrPago] = useState(true);
  const [trVencimento, setTrVencimento] = useState(new Date().toISOString().split('T')[0]);
  /** Lançamento sendo editado; null = o modal está criando. */
  const [editandoLancamento, setEditandoLancamento] = useState<LancamentoFinanceiro | null>(null);
  /** Faturamento de medição: o fato financeiro é imutável (ver trg_lancamento_protege_faturamento). */
  const camposFinanceirosTravados = !!editandoLancamento?.medicaoId;

  // Form States - Payroll month (canonical YYYY-MM competencia value)
  const payrollMonthOptions = useMemo(() => generatePayrollMonthOptions(), []);
  const [payrollMonth, setPayrollMonth] = useState(() => new Date().toISOString().slice(0, 7));
  /**
   * `''` significa "o usuário ainda não escolheu", e não "nenhuma conta".
   * Inicializar o estado com `contas[0]?.id` não funcionava: `contas` chega
   * assíncrono, no primeiro render é `[]`, então o estado nascia vazio e nunca
   * se corrigia — o campo ficava em branco enquanto o pagamento saía pela
   * primeira conta da lista. Derivar a cada render se ajusta sozinho.
   */
  const [payrollAccount, setPayrollAccount] = useState('');
  const payrollAccountId = payrollAccount || contas[0]?.id || '';

  // Default Categories for Revenue and Expenses
  const categoriasDespesa = ['Salários', 'Fornecedores', 'Aluguel Escritório', 'Energia/Água/Internet', 'Marketing/Vendas', 'Impostos/Taxas', 'Ferramentas/EPIs', 'Outros'];
  const categoriasReceita = ['Aporte Capital', 'Faturamento Obra', 'Rendimento', 'Outros'];

  // "Medições a Faturar": measurements that executed budget value but haven't
  // been turned into a "Faturamento Obra" revenue yet. Links the obra's physical
  // execution to the ledger without any silent write — the user confirms each.
  const faturadasMedicaoIds = useMemo(
    () => new Set(lancamentos.filter(l => l.categoria === 'Faturamento Obra' && l.medicaoId).map(l => l.medicaoId)),
    [lancamentos]
  );
  const medicoesAFaturar = useMemo(
    () => medicoes
      .filter(m => m.valorMedido > 0 && !faturadasMedicaoIds.has(m.id))
      .sort((a, b) => (a.dataMedicao < b.dataMedicao ? 1 : -1)),
    [medicoes, faturadasMedicaoIds]
  );

  // Faturamento modal state
  const [faturarMedicao, setFaturarMedicao] = useState<MedicaoObra | null>(null);
  const [faturarContaId, setFaturarContaId] = useState('');
  const [faturarPago, setFaturarPago] = useState(false);
  const [faturando, setFaturando] = useState(false);

  const getProjetoNome = (projetoId?: string) => projetos.find(p => p.id === projetoId)?.nome ?? 'Obra';

  const openFaturar = (m: MedicaoObra) => {
    setFaturarMedicao(m);
    setFaturarContaId(contas[0]?.id ?? '');
    setFaturarPago(false);
  };
  const confirmFaturar = async () => {
    if (!faturarMedicao) return;
    if (!faturarContaId) { toast.error('Selecione a conta de destino.'); return; }
    setFaturando(true);
    const ok = await onGerarFaturamento(faturarMedicao.id, faturarContaId, faturarPago);
    setFaturando(false);
    if (ok) setFaturarMedicao(null);
  };

  const abrirEdicaoConta = (c: ContaFinanceira) => {
    setEditandoConta(c);
    setAccNome(c.nome);
    setAccBanco(c.banco);
    setAccTipo(c.tipo);
    setAccSaldo(String(c.saldoInicial));
    setShowAddAccount(true);
  };

  const fecharModalConta = () => {
    setShowAddAccount(false);
    setEditandoConta(null);
    setAccNome('');
    setAccBanco('');
    setAccTipo('Corrente');
    setAccSaldo('');
  };

  // Handle adding new bank account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accNome || !accBanco || !accSaldo) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    const saldo = parseFloat(accSaldo);
    if (isNaN(saldo)) {
      toast.error('Saldo inicial inválido.');
      return;
    }

    const newAcc: ContaFinanceira = {
      id: crypto.randomUUID(),
      nome: accNome,
      banco: accBanco,
      tipo: accTipo,
      saldoInicial: saldo,
      saldoAtual: saldo
    };

    if (editandoConta) {
      const ok = await onUpdateConta(editandoConta.id, {
        nome: accNome, banco: accBanco, tipo: accTipo, saldoInicial: saldo,
      });
      if (!ok) return;
      fecharModalConta();
      toast.success('Conta financeira atualizada.');
      return;
    }

    // Formulário só é limpo e modal só fecha se o banco aceitou — senão o
    // usuário perderia o que digitou junto com o registro que não existiu.
    if (!(await onAddConta(newAcc))) return;

    fecharModalConta();
    toast.success('Conta financeira registrada com sucesso.');
  };

  const abrirEdicaoLancamento = (l: LancamentoFinanceiro) => {
    setEditandoLancamento(l);
    setTrTipo(l.tipo);
    setTrDescricao(l.descricao);
    setTrValor(String(l.valor));
    setTrData(l.data);
    setTrVencimento(l.dataVencimento);
    setTrCategoria(l.categoria);
    setTrContaId(l.contaId);
    setTrProjetoId(l.projetoId ?? '');
    setTrFuncionarioId(l.funcionarioId ?? '');
    setTrFornecedorId(l.fornecedorId ?? '');
    setTrPago(l.pago);
    setShowAddTrans(true);
  };

  const fecharModalLancamento = () => {
    setShowAddTrans(false);
    setEditandoLancamento(null);
    setTrDescricao('');
    setTrValor('');
    setTrData(new Date().toISOString().split('T')[0]);
    setTrVencimento(new Date().toISOString().split('T')[0]);
    setTrProjetoId('');
    setTrFuncionarioId('');
    setTrFornecedorId('');
  };

  // Handle adding new transaction
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trDescricao || !trValor || !trContaId) {
      toast.error('Preencha a descrição, valor e conta bancária.');
      return;
    }
    const valor = parseFloat(trValor);
    if (isNaN(valor) || valor <= 0) {
      toast.error('O valor deve ser maior que zero.');
      return;
    }
    if (trCategoria === 'Salários' && !trFuncionarioId) {
      toast.error('Selecione o colaborador associado a este lançamento de salário.', 'Sem esse vínculo a Folha não consegue identificar o pagamento.');
      return;
    }

    const newLan: LancamentoFinanceiro = {
      id: crypto.randomUUID(),
      tipo: trTipo,
      descricao: trDescricao,
      valor: valor,
      data: trData,
      dataVencimento: trVencimento || trData,
      categoria: trCategoria as any,
      pago: trPago,
      contaId: trContaId,
      projetoId: trProjetoId || undefined,
      funcionarioId: trFuncionarioId || undefined,
      fornecedorId: trFornecedorId || undefined,
      // Structured competencia backs the DB unique constraint and the Folha
      // "already paid" check — keep it in sync for manual Salários entries too.
      competencia: trCategoria === 'Salários' ? trData.slice(0, 7) : undefined
    };

    if (editandoLancamento) {
      // Num faturamento de medição os campos travados nem entram no patch — o
      // banco recusaria (trg_lancamento_protege_faturamento) e o usuário levaria
      // um erro por um campo que a tela nem deixou ele editar.
      const patch: Partial<LancamentoFinanceiro> = camposFinanceirosTravados
        ? { descricao: trDescricao, data: trData, dataVencimento: trVencimento || trData, contaId: trContaId }
        : {
            tipo: trTipo,
            descricao: trDescricao,
            valor,
            data: trData,
            dataVencimento: trVencimento || trData,
            categoria: trCategoria as LancamentoFinanceiro['categoria'],
            contaId: trContaId,
            projetoId: trProjetoId || undefined,
            funcionarioId: trFuncionarioId || undefined,
            fornecedorId: trFornecedorId || undefined,
            competencia: trCategoria === 'Salários' ? trData.slice(0, 7) : undefined,
          };
      if (!(await onUpdateLancamento(editandoLancamento.id, patch))) return;
      fecharModalLancamento();
      toast.success('Lançamento atualizado.');
      return;
    }

    if (!(await onAddLancamento(newLan))) return;

    fecharModalLancamento();
    toast.success('Lançamento registrado com sucesso.');
  };

  // Quick Action: Pay Salary
  const handleQuickPaySalary = async (emp: Funcionario) => {
    const defaultAcc = contas[0];
    if (!defaultAcc) {
      toast.error('Nenhuma conta financeira cadastrada para realizar o pagamento.');
      return;
    }

    if (!emp.salarioBase) {
      toast.error(
        `${emp.nome} não tem salário base cadastrado.`,
        'Cadastre o salário na ficha do colaborador (módulo Equipe) antes de liberar o pagamento.'
      );
      return;
    }

    const salary = emp.salarioBase;
    const monthLabel = competenciaToLabel(payrollMonth);
    const desc = `Salário de ${emp.nome} - Ref. ${monthLabel}`;

    // Check if already paid this employee in current competencia — matches
    // the structured field, not the free-text description.
    const alreadyPaid = lancamentos.some(
      l => l.funcionarioId === emp.id &&
      l.categoria === 'Salários' &&
      l.competencia === payrollMonth
    );

    if (alreadyPaid) {
      toast.error(`O salário de ${emp.nome} referente a ${monthLabel} já foi registrado.`);
      return;
    }

    const newLan: LancamentoFinanceiro = {
      id: crypto.randomUUID(),
      tipo: 'Despesa',
      descricao: desc,
      valor: salary,
      data: new Date().toISOString().split('T')[0],
      dataVencimento: new Date().toISOString().split('T')[0],
      categoria: 'Salários',
      pago: true,
      contaId: payrollAccountId || defaultAcc.id,
      funcionarioId: emp.id,
      competencia: payrollMonth
    };

    if (!(await onAddLancamento(newLan))) return;
    toast.success(`Pagamento de ${formatBRL(salary)} registrado para ${emp.nome}.`);
  };

  /**
   * Comparação de vencimento é feita em string YYYY-MM-DD, não em Date: `data`
   * e `data_vencimento` são `date` no Postgres, sem fuso, e `new Date('2026-07-31')`
   * é interpretado como UTC — em BRT vira o dia 30 e uma conta que vence hoje
   * apareceria como vencida.
   */
  const hoje = new Date().toISOString().split('T')[0];

  const aging = useMemo(() => {
    const emSete = new Date();
    emSete.setDate(emSete.getDate() + 7);
    const limite = emSete.toISOString().split('T')[0];

    const bucket = () => ({ vencido: 0, proximo: 0, aVencer: 0 });
    const pagar = bucket();
    const receber = bucket();

    lancamentos.forEach(l => {
      if (l.pago) return;
      const alvo = l.tipo === 'Despesa' ? pagar : receber;
      if (l.dataVencimento < hoje) alvo.vencido += l.valor;
      else if (l.dataVencimento <= limite) alvo.proximo += l.valor;
      else alvo.aVencer += l.valor;
    });

    return { pagar, receber };
  }, [lancamentos, hoje]);

  // --- CALCULATE SUMMARY METRICS ---
  const metrics = useMemo(() => {
    let totalContasBalance = contas.reduce((sum, c) => sum + c.saldoAtual, 0);
    
    let totalRecebido = 0;
    let totalPendenteReceber = 0;
    let totalPago = 0;
    let totalPendentePagar = 0;

    lancamentos.forEach(l => {
      if (l.tipo === 'Receita') {
        if (l.pago) {
          totalRecebido += l.valor;
        } else {
          totalPendenteReceber += l.valor;
        }
      } else {
        if (l.pago) {
          totalPago += l.valor;
        } else {
          totalPendentePagar += l.valor;
        }
      }
    });

    const netBalance = totalRecebido - totalPago;

    return {
      totalContasBalance,
      totalRecebido,
      totalPendenteReceber,
      totalPago,
      totalPendentePagar,
      netBalance
    };
  }, [lancamentos, contas]);

  // --- PREPARE CHART DATA ---
  const chartData = useMemo(() => {
    // Group lancamentos by month (YYYY-MM)
    const grouped: { [key: string]: { receitas: number; despesas: number } } = {};
    
    // Sort transactions chronologically
    const sorted = [...lancamentos].sort((a, b) => a.data.localeCompare(b.data));

    sorted.forEach(l => {
      if (!l.data) return;
      const dateParts = l.data.split('-');
      if (dateParts.length < 2) return;
      const monthLabel = `${dateParts[0]}-${dateParts[1]}`; // YYYY-MM
      
      if (!grouped[monthLabel]) {
        grouped[monthLabel] = { receitas: 0, despesas: 0 };
      }

      if (l.pago) { // Only count executed flow
        if (l.tipo === 'Receita') {
          grouped[monthLabel].receitas += l.valor;
        } else {
          grouped[monthLabel].despesas += l.valor;
        }
      }
    });

    const monthsPortuguese: { [key: string]: string } = {
      '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
      '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
    };

    return Object.keys(grouped).map(key => {
      const [year, month] = key.split('-');
      const monthName = monthsPortuguese[month] || month;
      return {
        mes: `${monthName}/${year.substring(2)}`,
        'Receitas (R$)': parseFloat(grouped[key].receitas.toFixed(2)),
        'Despesas (R$)': parseFloat(grouped[key].despesas.toFixed(2)),
        'Saldo (R$)': parseFloat((grouped[key].receitas - grouped[key].despesas).toFixed(2))
      };
    }).slice(-6); // Last 6 active months
  }, [lancamentos]);

  // --- LEDGER FILTERING ---
  const filteredLancamentos = useMemo(() => {
    return lancamentos.filter(l => {
      // 1. Search Query
      const matchSearch = l.descricao.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          l.categoria.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (l.projetoId && projetos.find(p => p.id === l.projetoId)?.nome.toLowerCase().includes(searchQuery.toLowerCase()));

      // 2. Type
      const matchTipo = filterTipo === 'Todos' || l.tipo === filterTipo;

      // 3. Status — "Vencido" é subconjunto de pendente, não status próprio.
      const matchStatus = filterStatus === 'Todos' ||
                          (filterStatus === 'Pago' && l.pago) ||
                          (filterStatus === 'Pendente' && !l.pago) ||
                          (filterStatus === 'Vencido' && !l.pago && l.dataVencimento < hoje);

      // 4. Category
      const matchCategory = filterCategoria === 'Todos' || l.categoria === filterCategoria;

      // 5. Account
      const matchConta = filterConta === 'Todos' || l.contaId === filterConta;

      return matchSearch && matchTipo && matchStatus && matchCategory && matchConta;
    }).sort((a, b) => b.data.localeCompare(a.data)); // most recent first
  }, [lancamentos, searchQuery, filterTipo, filterStatus, filterCategoria, filterConta, projetos]);

  /**
   * O razão é filtrado por inteiro (os agregados do painel dependem disso), mas
   * só uma fatia vai para o DOM — uma tabela de milhares de linhas trava a aba.
   * Qualquer mudança de filtro volta para a primeira página, senão o usuário
   * filtra e continua vendo a contagem da busca anterior.
   */
  const [visiveis, setVisiveis] = useState(LANCAMENTOS_POR_PAGINA);
  useEffect(() => {
    setVisiveis(LANCAMENTOS_POR_PAGINA);
  }, [searchQuery, filterTipo, filterStatus, filterCategoria, filterConta]);
  const lancamentosVisiveis = filteredLancamentos.slice(0, visiveis);

  const totaisObras = useMemo(() => resultadoObras.reduce((acc, r) => ({
    orcado: acc.orcado + r.valorOrcado,
    executado: acc.executado + r.valorExecutado,
    faturado: acc.faturado + r.receitaFaturada,
    aFaturar: acc.aFaturar + r.aFaturar,
    despesa: acc.despesa + r.despesaLancada,
    resultado: acc.resultado + r.resultadoCompetencia,
    resultadoCaixa: acc.resultadoCaixa + r.resultadoCaixa,
  }), { orcado: 0, executado: 0, faturado: 0, aFaturar: 0, despesa: 0, resultado: 0, resultadoCaixa: 0 }), [resultadoObras]);

  /**
   * Obras cujo faturamento nasceu igual ao custo executado: sinal de que o BDI
   * ficou pelo caminho (o faturamento por medição deriva de itens_orcamento, que
   * é custo quando o item tem insumo vinculado). Só conta quem já faturou algo e
   * tem BDI declarado na proposta — sem isso o alerta apareceria para obra
   * parada e para obra que realmente foi vendida a custo.
   */
  const semMargemPorCusto = useMemo(
    () => resultadoObras.filter(r =>
      r.receitaFaturada > 0 &&
      (r.bdiPercentual ?? 0) > 0 &&
      Math.abs(r.receitaFaturada - r.valorExecutado) < 0.01
    ),
    [resultadoObras]
  );

  return (
    <div className="space-y-6 text-left select-none animate-fade-in">
      
      {/* Header and Sub Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Gestão Corporativa e Financeira</h2>
          <p className="text-xs text-slate-400 font-semibold uppercase mt-0.5 tracking-wider">Contas Bancárias, Fluxo de Caixa Realizado, Despesas e Folha</p>
        </div>

        {/* Subtab selection pills */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-bold self-start sm:self-center">
          <button
            onClick={() => setActiveSubTab('painel')}
            className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === 'painel' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveSubTab('lancamentos')}
            className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === 'lancamentos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Fluxo de Caixa
          </button>
          <button
            onClick={() => setActiveSubTab('obras')}
            className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === 'obras' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Resultado por Obra
          </button>
          <button
            onClick={() => setActiveSubTab('contas')}
            className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === 'contas' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Contas Bancárias
          </button>
          <button
            onClick={() => setActiveSubTab('salarios')}
            className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === 'salarios' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Folha e Salários
          </button>
          <button
            onClick={() => setActiveSubTab('identidade')}
            className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === 'identidade' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Dados da Empresa
          </button>
        </div>
      </div>

      {/* As quatro sub-abas financeiras dependem de `useFinanceiro`; Dados da
          Empresa vem de outro hook e não espera por ele. */}
      {loading && activeSubTab !== 'identidade' && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-blue-600">
          <Spinner size={22} />
          <span className="text-xs font-semibold text-slate-400">Carregando dados financeiros…</span>
        </div>
      )}

      {/* ----------------------------------------------------
          SUB-ABA: IDENTIDADE (papel timbrado das propostas)
          ---------------------------------------------------- */}
      {activeSubTab === 'identidade' && (
        <EmpresaIdentidade
          empresa={empresa}
          onSave={onSaveEmpresa}
          onUploadLogo={onUploadLogo}
          onRemoverLogo={onRemoverLogo}
        />
      )}

      {/* ----------------------------------------------------
          SUB-TAB 1: FINANCIAL DASHBOARD (PAINEL)
          ---------------------------------------------------- */}
      {activeSubTab === 'painel' && !loading && (
        <div className="space-y-6">

          {/* Medições a Faturar — liga a execução física da obra ao caixa */}
          {medicoesAFaturar.length > 0 && (
            <div className="bg-white border border-emerald-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-emerald-100 bg-emerald-50/50">
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                  <Percent size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-none">Medições a Faturar</h3>
                  <p className="text-2xs text-slate-500 mt-1">Execução medida em obra que ainda não virou receita. Revise e gere o faturamento.</p>
                </div>
                <span className="ml-auto text-2xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                  {medicoesAFaturar.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {medicoesAFaturar.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{getProjetoNome(m.projetoId)}</p>
                      <p className="text-2xs text-slate-500 mt-0.5">
                        Medição de {new Date(m.dataMedicao).toLocaleDateString('pt-BR')} · +{m.percentualMedido}%
                      </p>
                    </div>
                    <span className="text-sm font-mono font-bold text-emerald-600 shrink-0">
                      {formatBRL(m.valorMedido)}
                    </span>
                    <button
                      onClick={() => openFaturar(m)}
                      className="shrink-0 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-sm"
                    >
                      Faturar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aging — o que está em aberto, por urgência. Antes "Contas a pagar"
              era um número só, sem noção de atraso. */}
          {(aging.pagar.vencido + aging.pagar.proximo + aging.pagar.aVencer +
            aging.receber.vencido + aging.receber.proximo + aging.receber.aVencer) > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {([
                { titulo: 'A Pagar', dados: aging.pagar, cor: 'rose' as const },
                { titulo: 'A Receber', dados: aging.receber, cor: 'emerald' as const },
              ]).map(({ titulo, dados, cor }) => (
                <div key={titulo} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-800 text-sm">{titulo}</h3>
                    <span className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Por vencimento</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <button
                      onClick={() => { setFilterStatus('Vencido'); setFilterTipo(titulo === 'A Pagar' ? 'Despesa' : 'Receita'); setActiveSubTab('lancamentos'); }}
                      className={`p-3 rounded-xl border transition text-left ${dados.vencido > 0 ? 'bg-rose-50 border-rose-200 hover:bg-rose-100/60' : 'bg-slate-50 border-slate-200'}`}
                    >
                      <span className="text-2xs font-extrabold uppercase tracking-wider block text-slate-500">Vencido</span>
                      <span className={`text-sm font-mono font-extrabold ${dados.vencido > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {formatBRL(dados.vencido)}
                      </span>
                    </button>
                    <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 text-left">
                      <span className="text-2xs font-extrabold uppercase tracking-wider block text-slate-500">Em 7 dias</span>
                      <span className="text-sm font-mono font-extrabold text-amber-600">{formatBRL(dados.proximo)}</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-left">
                      <span className="text-2xs font-extrabold uppercase tracking-wider block text-slate-500">A vencer</span>
                      <span className={`text-sm font-mono font-extrabold ${cor === 'rose' ? 'text-slate-600' : 'text-emerald-600'}`}>
                        {formatBRL(dados.aVencer)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Account Balance */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-2xs font-bold uppercase tracking-wider">Saldo Total em Caixa</span>
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <Landmark size={15} />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-extrabold text-slate-900 font-mono">
                  {formatBRL(metrics.totalContasBalance)}
                </span>
                <p className="text-2xs text-slate-400 mt-1 font-semibold">Consolidado em {contas.length} contas ativas</p>
              </div>
            </div>

            {/* Income Received */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-2xs font-bold uppercase tracking-wider">Receitas Consolidadas</span>
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                  <TrendingUp size={15} />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-extrabold text-emerald-600 font-mono">
                  {formatBRL(metrics.totalRecebido)}
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-2xs text-slate-400 font-semibold">Pendentes: {formatBRL(metrics.totalPendenteReceber)}</span>
                </div>
              </div>
            </div>

            {/* Expenses Paid */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-2xs font-bold uppercase tracking-wider">Despesas Consolidadas</span>
                <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
                  <TrendingDown size={15} />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-extrabold text-rose-600 font-mono">
                  {formatBRL(metrics.totalPago)}
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-2xs text-slate-400 font-semibold">Contas a pagar: {formatBRL(metrics.totalPendentePagar)}</span>
                </div>
              </div>
            </div>

            {/* Net Operating Balance */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-2xs font-bold uppercase tracking-wider">Resultado Líquido</span>
                <div className="w-8 h-8 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center">
                  <DollarSign size={15} />
                </div>
              </div>
              <div className="mt-4">
                <span className={`text-2xl font-extrabold font-mono ${metrics.netBalance >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                  {formatBRL(metrics.netBalance)}
                </span>
                <p className="text-2xs text-slate-400 mt-1 font-semibold">Diferença entre Receitas e Despesas Pagas</p>
              </div>
            </div>
          </div>

          {/* Cash Flow Graphics and Category Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Chart */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Evolução do Fluxo de Caixa</h3>
                  <p className="text-2xs text-slate-400 font-semibold uppercase">Histórico mensal consolidado de entradas e saídas efetivadas</p>
                </div>
              </div>
              <div className="h-64 mt-2">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    Dados insuficientes para desenhar gráfico histórico.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }} />
                      <Tooltip formatter={(value) => [formatBRL(Number(value))]} contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px', fontWeight: 'bold' }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
                      <Bar dataKey="Receitas (R$)" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Despesas (R$)" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Quick overview of Corporate Expenses */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Distribuição de Despesas</h3>
                <p className="text-2xs text-slate-400 font-semibold uppercase">Centros de custo das despesas efetivadas — histórico completo</p>
              </div>

              <div className="space-y-3 pt-2">
                {(() => {
                  // Só despesa efetivada, igual ao gráfico ao lado e ao card
                  // "Despesas Consolidadas": este painel decompõe exatamente
                  // aquele total. Antes somava também as pendentes, então os
                  // dois quadros vizinhos mostravam números que não fechavam.
                  const expensesByCategory: { [key: string]: number } = {};
                  let totalCatExpenses = 0;

                  lancamentos.forEach(l => {
                    if (l.tipo === 'Despesa' && l.pago) {
                      expensesByCategory[l.categoria] = (expensesByCategory[l.categoria] || 0) + l.valor;
                      totalCatExpenses += l.valor;
                    }
                  });

                  const sortedCategories = Object.keys(expensesByCategory)
                    .map(cat => ({
                      name: cat,
                      value: expensesByCategory[cat],
                      percent: totalCatExpenses > 0 ? (expensesByCategory[cat] / totalCatExpenses) * 100 : 0
                    }))
                    .sort((a, b) => b.value - a.value);

                  if (sortedCategories.length === 0) {
                    return (
                      <div className="text-center py-8 text-xs text-slate-400">
                        Nenhuma despesa efetivada para cálculo de centros de custo.
                      </div>
                    );
                  }

                  return sortedCategories.map((item, idx) => {
                    const colors = ['bg-rose-500', 'bg-amber-500', 'bg-violet-500', 'bg-blue-500', 'bg-indigo-500', 'bg-slate-500'];
                    const colorClass = colors[idx % colors.length];
                    
                    return (
                      <div key={item.name} className="space-y-1 text-xs">
                        <div className="flex justify-between items-center font-semibold text-slate-700">
                          <span className="truncate">{item.name}</span>
                          <span className="font-mono text-slate-900">{formatBRL(item.value)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className={`${colorClass} h-full rounded-full`} style={{ width: `${item.percent}%` }} />
                          </div>
                          <span className="text-2xs font-bold text-slate-500 font-mono shrink-0 w-8 text-right">{item.percent.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* Quick Actions and Bank Account Summary inside Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Quick Actions Cards */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-800 text-sm">Ações Financeiras Rápidas</h3>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => {
                    setTrTipo('Despesa');
                    setTrCategoria('Outros');
                    setTrContaId(contas[0]?.id || '');
                    setEditandoLancamento(null);
                    setTrVencimento(new Date().toISOString().split('T')[0]);
                    setShowAddTrans(true);
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-rose-50/40 border border-slate-200 hover:border-rose-200 rounded-xl transition text-center space-y-2 group"
                >
                  <div className="w-10 h-10 bg-rose-50 group-hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition">
                    <TrendingDown size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Registrar Despesa</span>
                  <span className="text-2xs text-slate-400 font-semibold">Contas, taxas, compras</span>
                </button>

                <button
                  onClick={() => {
                    setTrTipo('Receita');
                    setTrCategoria('Faturamento Obra');
                    setTrContaId(contas[0]?.id || '');
                    setEditandoLancamento(null);
                    setTrVencimento(new Date().toISOString().split('T')[0]);
                    setShowAddTrans(true);
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-200 rounded-xl transition text-center space-y-2 group"
                >
                  <div className="w-10 h-10 bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center transition">
                    <TrendingUp size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Lançar Receita</span>
                  <span className="text-2xs text-slate-400 font-semibold">Faturamento de obra, aporte</span>
                </button>

                <button
                  onClick={() => setActiveSubTab('salarios')}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-blue-50/40 border border-slate-200 hover:border-blue-200 rounded-xl transition text-center space-y-2 group"
                >
                  <div className="w-10 h-10 bg-blue-50 group-hover:bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center transition">
                    <Users size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Folha de Salários</span>
                  <span className="text-2xs text-slate-400 font-semibold">Pagar colaboradores</span>
                </button>

                <button
                  onClick={() => { setEditandoConta(null); setShowAddAccount(true); }}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-violet-50/40 border border-slate-200 hover:border-violet-200 rounded-xl transition text-center space-y-2 group"
                >
                  <div className="w-10 h-10 bg-violet-50 group-hover:bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center transition">
                    <Landmark size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Vincular Conta</span>
                  <span className="text-2xs text-slate-400 font-semibold">Bancos e caixinhas</span>
                </button>
              </div>
            </div>

            {/* Account List Summary */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-800 text-sm">Saldos Disponíveis por Conta</h3>
                <button onClick={() => setActiveSubTab('contas')} className="text-2xs text-blue-600 hover:underline font-bold">Ver Contas Bancárias →</button>
              </div>
              
              <div className="space-y-2.5 pt-1">
                {contas.map(acc => (
                  <div key={acc.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500">
                        <Landmark size={14} />
                      </div>
                      <div className="text-left text-xs">
                        <p className="font-extrabold text-slate-800">{acc.nome}</p>
                        <p className="text-2xs text-slate-500 font-semibold">{acc.banco} ({acc.tipo})</p>
                      </div>
                    </div>
                    <div className="text-right text-xs font-mono font-bold text-slate-900">
                      {formatBRL(acc.saldoAtual)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          SUB-TAB 2: TRANSACTIONS LEDGER (LANCAMENTOS)
          ---------------------------------------------------- */}
      {activeSubTab === 'lancamentos' && !loading && (
        <div className="space-y-4">
          
          {/* Header filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col gap-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-2.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar lançamentos por descrição, categoria ou obra..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-8 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 transition"
                />
              </div>

              <button
                onClick={() => {
                  setTrTipo('Despesa');
                  setTrCategoria('Outros');
                  setTrContaId(contas[0]?.id || '');
                  setEditandoLancamento(null);
                  setTrVencimento(new Date().toISOString().split('T')[0]);
                  setShowAddTrans(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <Plus size={14} />
                Novo Lançamento
              </button>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1.5 border-t border-slate-100">
              {/* Type Filter */}
              <div className="space-y-1 text-left">
                <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Tipo de Fluxo</label>
                <select
                  value={filterTipo}
                  onChange={(e) => setFilterTipo(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-semibold text-slate-700"
                >
                  <option value="Todos">Todos os Fluxos</option>
                  <option value="Receita">Entradas (Receitas)</option>
                  <option value="Despesa">Saídas (Despesas)</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="space-y-1 text-left">
                <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Situação</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-semibold text-slate-700"
                >
                  <option value="Todos">Todas as Situações</option>
                  <option value="Pago">Pago / Compensado</option>
                  <option value="Pendente">A Pagar / Receber</option>
                  <option value="Vencido">Vencidos</option>
                </select>
              </div>

              {/* Category Filter */}
              <div className="space-y-1 text-left">
                <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Centro de Custo / Categoria</label>
                <select
                  value={filterCategoria}
                  onChange={(e) => setFilterCategoria(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-semibold text-slate-700"
                >
                  <option value="Todos">Todas as Categorias</option>
                  <optgroup label="Entradas">
                    {categoriasReceita.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Saídas">
                    {categoriasDespesa.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Bank Filter */}
              <div className="space-y-1 text-left">
                <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Conta Bancária</label>
                <select
                  value={filterConta}
                  onChange={(e) => setFilterConta(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-semibold text-slate-700"
                >
                  <option value="Todos">Todas as Contas</option>
                  {contas.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Ledger Table / List */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-2xs font-extrabold uppercase tracking-wider border-b border-slate-200 text-left">
                    <th className="p-3 w-28">Data</th>
                    <th className="p-3 w-28">Vencimento</th>
                    <th className="p-3">Descrição / Vínculo</th>
                    <th className="p-3 w-36">Categoria</th>
                    <th className="p-3 w-40">Conta Financeira</th>
                    <th className="p-3 w-28">Situação</th>
                    <th className="p-3 w-36 text-right">Valor</th>
                    <th className="p-3 w-24 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                  {lancamentosVisiveis.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-400">
                        Nenhum lançamento financeiro encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    lancamentosVisiveis.map(l => {
                      const accountName = contas.find(c => c.id === l.contaId)?.nome || 'Desconhecida';
                      const projectName = l.projetoId ? projetos.find(p => p.id === l.projetoId)?.nome : null;
                      const employeeName = l.funcionarioId ? funcionarios.find(f => f.id === l.funcionarioId)?.nome : null;
                      const supplierName = l.fornecedorId ? fornecedores.find(f => f.id === l.fornecedorId)?.empresa : null;

                      return (
                        <tr key={l.id} className="hover:bg-slate-50/40 transition">
                          <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                            {new Date(l.data).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="p-3 font-mono whitespace-nowrap">
                            {(() => {
                              const vencido = !l.pago && l.dataVencimento < hoje;
                              return (
                                <span className={vencido ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                                  {new Date(l.dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                                  {vencido && <span className="block text-2xs font-extrabold uppercase">Vencido</span>}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-800 leading-normal">{l.descricao}</div>
                            {/* Link badges */}
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {projectName && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-2xs font-extrabold bg-blue-50 text-blue-700 border border-blue-100/50 uppercase tracking-wide">
                                  <Briefcase size={8} /> Obra: {projectName}
                                </span>
                              )}
                              {employeeName && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-2xs font-extrabold bg-violet-50 text-violet-700 border border-violet-100/50 uppercase tracking-wide">
                                  <Users size={8} /> Folha: {employeeName}
                                </span>
                              )}
                              {supplierName && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-2xs font-extrabold bg-orange-50 text-orange-700 border border-orange-100/50 uppercase tracking-wide">
                                  Fornecedor: {supplierName}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-slate-600 bg-slate-100/60 px-2 py-0.5 rounded text-2xs">
                              {l.categoria}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-slate-600 whitespace-nowrap">
                            {accountName}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <button
                              onClick={async () => {
                                if (await onToggleLancamentoPago(l.id)) {
                                  toast.success('Situação do lançamento alterada.');
                                }
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold border transition ${
                                l.pago
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100/50'
                              }`}
                              title={l.pago ? 'Clique para marcar como Pendente' : 'Clique para compensar e pagar'}
                            >
                              {l.pago ? (
                                <>
                                  <CheckCircle size={11} className="text-emerald-600" />
                                  <span>{l.tipo === 'Receita' ? 'Recebido' : 'Pago'}</span>
                                </>
                              ) : (
                                <>
                                  <Clock size={11} className="text-amber-600" />
                                  <span>Pendente</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className={`p-3 text-right font-mono font-bold whitespace-nowrap text-sm ${l.tipo === 'Receita' ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {l.tipo === 'Receita' ? '+' : '-'} {formatBRL(l.valor)}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => abrirEdicaoLancamento(l)}
                              className="p-1.5 hover:bg-slate-100 hover:text-blue-600 rounded text-slate-400 transition"
                              title="Editar Lançamento"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => {
                                confirm({
                                  title: `Excluir o lançamento "${l.descricao}"?`,
                                  message: l.medicaoId
                                    ? 'Este lançamento veio do faturamento de uma medição. Excluí-lo retira o valor do saldo da conta e libera a medição para ser faturada de novo. Esta ação é irreversível.'
                                    : 'O valor sai do saldo da conta. Esta ação é irreversível.',
                                  onConfirm: async () => {
                                    if (await onDeleteLancamento(l.id)) {
                                      toast.success('Lançamento removido.');
                                    }
                                  },
                                });
                              }}
                              className="p-1.5 hover:bg-slate-100 hover:text-rose-600 rounded text-slate-400 transition"
                              title="Excluir Lançamento"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <CarregarMais
              temMais={visiveis < filteredLancamentos.length}
              restantes={filteredLancamentos.length - visiveis}
              onCarregarMais={() => setVisiveis((n) => n + LANCAMENTOS_POR_PAGINA)}
              className="border-t border-slate-100"
            />
          </div>

          {filteredLancamentos.length > 0 && (
            <p className="text-2xs text-slate-400 font-semibold text-center">
              Exibindo {lancamentosVisiveis.length} de {filteredLancamentos.length} lançamentos.
            </p>
          )}
        </div>
      )}

      {/* ----------------------------------------------------
          SUB-TAB: RESULTADO POR OBRA
          ---------------------------------------------------- */}
      {activeSubTab === 'obras' && !loading && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-800 text-sm">Resultado por Obra</h3>
            <p className="text-2xs text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
              Receita faturada contra despesa lançada, obra a obra
            </p>
            <p className="text-2xs text-slate-500 mt-2 leading-relaxed">
              O resultado compara <strong>dinheiro com dinheiro</strong>: só o que passou pelo razão.
              Orçado e executado aparecem como contexto da execução física — somá-los à despesa
              contaria o mesmo custo duas vezes.
            </p>
          </div>

          {resultadoObras.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="Nenhuma obra para apurar"
              description="Assim que uma obra tiver orçamento, medição faturada ou despesa lançada, o resultado dela aparece aqui."
            />
          ) : (
            <>
              {semMargemPorCusto.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 flex gap-3">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <p className="font-bold">
                      {semMargemPorCusto.length === 1 ? 'Uma obra fatura' : `${semMargemPorCusto.length} obras faturam`} exatamente o custo orçado do avanço.
                    </p>
                    <p className="mt-1 text-amber-800">
                      O faturamento por medição deriva de <span className="font-mono">itens_orcamento</span>, que
                      vale o custo dos insumos quando há insumo vinculado. O BDI da proposta não percorre esse
                      caminho, então a margem some antes de chegar ao razão. Enquanto isso não for tratado, o
                      resultado abaixo mede a obra sem a margem comercial.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-2xs font-extrabold uppercase tracking-wider border-b border-slate-200 text-left">
                        <th className="p-3">Obra</th>
                        <th className="p-3 text-right">Orçado</th>
                        <th className="p-3 text-right">Executado</th>
                        <th className="p-3 text-right">Faturado</th>
                        <th className="p-3 text-right">A faturar</th>
                        <th className="p-3 text-right">Despesa</th>
                        <th className="p-3 text-right">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                      {resultadoObras.map(r => (
                        <tr key={r.projetoId} className="hover:bg-slate-50/40 transition">
                          <td className="p-3">
                            <div className="font-bold text-slate-800">{r.projetoNome}</div>
                            <div className="text-2xs text-slate-400 font-semibold">
                              {r.clienteNome ?? 'Sem cliente'} · {r.situacao}
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600 whitespace-nowrap">{formatBRL(r.valorOrcado)}</td>
                          <td className="p-3 text-right font-mono text-slate-600 whitespace-nowrap">{formatBRL(r.valorExecutado)}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">{formatBRL(r.receitaFaturada)}</td>
                          <td className={`p-3 text-right font-mono whitespace-nowrap ${r.aFaturar > 0 ? 'font-bold text-amber-600' : 'text-slate-400'}`}>
                            {formatBRL(r.aFaturar)}
                          </td>
                          <td className="p-3 text-right font-mono text-rose-600 whitespace-nowrap">{formatBRL(r.despesaLancada)}</td>
                          <td className={`p-3 text-right font-mono font-extrabold whitespace-nowrap ${r.resultadoCompetencia >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                            {formatBRL(r.resultadoCompetencia)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t-2 border-slate-200 text-xs font-extrabold text-slate-800">
                        <td className="p-3 uppercase text-2xs tracking-wider text-slate-500">Total</td>
                        <td className="p-3 text-right font-mono">{formatBRL(totaisObras.orcado)}</td>
                        <td className="p-3 text-right font-mono">{formatBRL(totaisObras.executado)}</td>
                        <td className="p-3 text-right font-mono text-emerald-700">{formatBRL(totaisObras.faturado)}</td>
                        <td className="p-3 text-right font-mono text-amber-700">{formatBRL(totaisObras.aFaturar)}</td>
                        <td className="p-3 text-right font-mono text-rose-700">{formatBRL(totaisObras.despesa)}</td>
                        <td className={`p-3 text-right font-mono ${totaisObras.resultado >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                          {formatBRL(totaisObras.resultado)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <p className="text-2xs text-slate-400 font-semibold text-center">
                Resultado por competência (faturado − lançado). Em regime de caixa, considerando só o que foi
                pago e recebido: <span className="font-mono text-slate-600">{formatBRL(totaisObras.resultadoCaixa)}</span>.
              </p>
            </>
          )}
        </div>
      )}

      {/* ----------------------------------------------------
          SUB-TAB 3: BANK ACCOUNTS (CONTAS)
          ---------------------------------------------------- */}
      {activeSubTab === 'contas' && !loading && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Contas Bancárias de Caixa Ativos</h3>
              <p className="text-2xs text-slate-400 font-semibold uppercase tracking-wider">Bancos cadastrados para faturamentos e pagamentos da empresa</p>
            </div>
            <button
              onClick={() => { setEditandoConta(null); setShowAddAccount(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 transition shadow-sm"
            >
              <Plus size={14} /> Cadastrar Nova Conta
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {contas.map(acc => {
              // Calculate receipts and expenses on this specific account
              const accRecebido = lancamentos.filter(l => l.contaId === acc.id && l.tipo === 'Receita' && l.pago).reduce((sum, l) => sum + l.valor, 0);
              const accPago = lancamentos.filter(l => l.contaId === acc.id && l.tipo === 'Despesa' && l.pago).reduce((sum, l) => sum + l.valor, 0);

              return (
                <div key={acc.id} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 flex flex-col justify-between shadow-xs relative overflow-hidden group">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <span className="text-2xs bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-500 uppercase tracking-wide">{acc.tipo}</span>
                      <h4 className="font-extrabold text-slate-800 text-sm pt-1">{acc.nome}</h4>
                      <p className="text-2xs text-slate-500 font-semibold">{acc.banco}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => abrirEdicaoConta(acc)}
                        className="p-2 hover:bg-slate-100 hover:text-blue-600 rounded-lg text-slate-400 transition"
                        title="Editar conta"
                      >
                        <Pencil size={14} />
                      </button>
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                        <Landmark size={18} />
                      </div>
                    </div>
                  </div>

                  <div className="py-2 border-t border-b border-dashed border-slate-100 flex justify-between text-2xs">
                    <div className="text-left">
                      <span className="text-slate-400 font-bold text-2xs block uppercase">Entradas Acumuladas</span>
                      <span className="text-emerald-600 font-bold font-mono">{formatBRL(accRecebido)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 font-bold text-2xs block uppercase">Saídas Acumuladas</span>
                      <span className="text-rose-600 font-bold font-mono">{formatBRL(accPago)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-2xs text-slate-400 font-bold uppercase">Saldo Atual</span>
                    <span className="text-xl font-extrabold text-slate-900 font-mono">
                      {formatBRL(acc.saldoAtual)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          SUB-TAB 4: PAYROLL & SALARIES (SALARIOS)
          ---------------------------------------------------- */}
      {activeSubTab === 'salarios' && !loading && (
        <div className="space-y-6">
          
          {/* Controls & Configuration Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            
            <div className="space-y-1 text-left">
              <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Mês de Referência da Folha</label>
              <select
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-bold text-slate-800"
              >
                {payrollMonthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Conta Bancária de Saída</label>
              <select
                value={payrollAccountId}
                onChange={(e) => setPayrollAccount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-bold text-slate-800"
              >
                {contas.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.nome} (Saldo: {formatBRL(acc.saldoAtual)})</option>
                ))}
              </select>
            </div>

            {(() => {
              const ativos = funcionarios.filter(f => f.status === 'Ativo');
              const semSalario = ativos.filter(f => !f.salarioBase).length;
              const totalFolha = ativos.reduce((sum, f) => sum + (f.salarioBase || 0), 0);
              return (
                <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex items-center justify-between text-left text-xs self-end">
                  <div>
                    <span className="text-2xs text-slate-400 font-extrabold block uppercase tracking-wider">Custo da Folha Mensal</span>
                    <p className="font-extrabold text-blue-800 text-lg font-mono">
                      {formatBRL(totalFolha)}
                    </p>
                    {semSalario > 0 && (
                      <p className="text-2xs text-amber-600 font-bold mt-0.5">
                        {semSalario} colaborador(es) sem salário cadastrado — fora do total
                      </p>
                    )}
                  </div>
                  <Users size={20} className="text-blue-500/60" />
                </div>
              );
            })()}
          </div>

          {/* Employee list with Payroll payment status */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 text-left">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Quadro de Colaboradores e Liberação de Salários</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-2xs font-extrabold uppercase tracking-wider border-b border-slate-200">
                    <th className="p-3">Colaborador</th>
                    <th className="p-3">Cargo / Função</th>
                    <th className="p-3 text-right">Salário Base</th>
                    <th className="p-3 text-center">Situação de Pagamento ({competenciaToLabel(payrollMonth)})</th>
                    <th className="p-3 text-right w-40">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                  {funcionarios.filter(f => f.status === 'Ativo').map(emp => {
                    const salary = emp.salarioBase;
                    
                    // Check if already paid for the selected competencia (structured field)
                    const matchingTrans = lancamentos.find(
                      l => l.funcionarioId === emp.id &&
                      l.categoria === 'Salários' &&
                      l.competencia === payrollMonth
                    );
                    const isPaid = !!matchingTrans;

                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/40 transition">
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{emp.nome}</div>
                          <div className="text-2xs text-slate-400 font-semibold">{emp.email}</div>
                        </td>
                        <td className="p-3 font-semibold text-slate-600">
                          {emp.cargo}
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          {salary ? (
                            <>{formatBRL(salary)}</>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-extrabold bg-amber-50 text-amber-700 border border-amber-100 font-sans">
                              Não cadastrado
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <CheckCircle size={10} /> Pago (Ref. {new Date(matchingTrans.data).toLocaleDateString('pt-BR')})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-amber-50 text-amber-700 border border-amber-100">
                              <Clock size={10} /> Pendente de Liberação
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleQuickPaySalary(emp)}
                            disabled={isPaid || !salary}
                            title={!salary ? 'Cadastre o salário base na ficha do colaborador (módulo Equipe)' : undefined}
                            className={`px-3 py-1.5 rounded-md text-2xs font-bold transition whitespace-nowrap ${
                              isPaid || !salary
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                            }`}
                          >
                            {isPaid ? 'Salário Pago' : !salary ? 'Sem Salário Base' : 'Pagar Salário'}
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

      {/* ----------------------------------------------------
          MODAL: ADD NEW BANK ACCOUNT
          ---------------------------------------------------- */}
      <Modal
        open={showAddAccount}
        onClose={fecharModalConta}
        title={editandoConta ? `Editar conta — ${editandoConta.nome}` : 'Vincular Nova Conta Financeira'}
        size="md"
      >
            <form onSubmit={handleCreateAccount} className="p-5 space-y-4 overflow-y-auto">
              <div className="space-y-1">
                <label className="text-2xs font-bold text-slate-500 uppercase">Nome Identificador da Conta</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Conta Caixa PJ, Fundo Reserva..."
                  value={accNome}
                  onChange={(e) => setAccNome(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Instituição / Banco</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Banco do Brasil, Itaú..."
                    value={accBanco}
                    onChange={(e) => setAccBanco(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Tipo de Caixa</label>
                  <select
                    value={accTipo}
                    onChange={(e) => setAccTipo(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-medium text-slate-700"
                  >
                    <option value="Corrente">Conta Corrente</option>
                    <option value="Poupança">Conta Poupança</option>
                    <option value="Caixa Interno">Caixa Interno (Caixinha)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-2xs font-bold text-slate-500 uppercase">Saldo Inicial de Implantação (R$)</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={accSaldo}
                  onChange={(e) => setAccSaldo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono font-bold"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2.5 rounded-lg text-xs transition mt-2 shadow-sm"
              >
                {editandoConta ? 'Salvar Alterações' : 'Vincular Conta Bancária'}
              </button>
            </form>
      </Modal>

      {/* ----------------------------------------------------
          MODAL: REGISTER TRANSACTION (RECEITA / DESPESA)
          ---------------------------------------------------- */}
      <Modal
        open={showAddTrans}
        onClose={fecharModalLancamento}
        title={editandoLancamento
          ? 'Editar Lançamento'
          : `Lançar ${trTipo === 'Receita' ? 'Entrada (Receita)' : 'Saída (Despesa)'}`}
        size="lg"
      >
            <form onSubmit={handleCreateTransaction} className="p-5 space-y-4 overflow-y-auto">

              {camposFinanceirosTravados && (
                <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3 flex gap-2.5 text-xs text-blue-900">
                  <AlertTriangle size={14} className="text-blue-600 shrink-0 mt-0.5" />
                  <span>
                    Este lançamento veio do faturamento de uma medição. Valor, tipo, categoria e obra
                    ficam travados para não desfazer o elo com a execução da obra — corrija descrição,
                    datas ou conta. Para mudar o valor, exclua o lançamento e fature a medição de novo.
                  </span>
                </div>
              )}

              {/* Type Switch */}
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-bold w-full">
                <button
                  type="button"
                  disabled={camposFinanceirosTravados}
                  onClick={() => {
                    setTrTipo('Despesa');
                    setTrCategoria('Outros');
                  }}
                  className={`flex-1 py-2 text-center rounded-md transition-all ${trTipo === 'Despesa' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-500'}`}
                >
                  Saída (Despesa)
                </button>
                <button
                  type="button"
                  disabled={camposFinanceirosTravados}
                  onClick={() => {
                    setTrTipo('Receita');
                    setTrCategoria('Faturamento Obra');
                  }}
                  className={`flex-1 py-2 text-center rounded-md transition-all ${trTipo === 'Receita' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-500'}`}
                >
                  Entrada (Receita)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Description */}
                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Descrição do Lançamento</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Pagamento mensalidade escritório, etc"
                    value={trDescricao}
                    onChange={(e) => setTrDescricao(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Categoria</label>
                  <select
                    value={trCategoria}
                    disabled={camposFinanceirosTravados}
                    onChange={(e) => setTrCategoria(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-700 font-medium disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {trTipo === 'Despesa' 
                      ? categoriasDespesa.map(cat => <option key={cat} value={cat}>{cat}</option>)
                      : categoriasReceita.map(cat => <option key={cat} value={cat}>{cat}</option>)
                    }
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Value */}
                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Valor (R$)</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={trValor}
                    disabled={camposFinanceirosTravados}
                    onChange={(e) => setTrValor(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Date */}
                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Data da Operação</label>
                  <input
                    type="date"
                    required
                    value={trData}
                    onChange={(e) => {
                      setTrData(e.target.value);
                      // Vencimento acompanha a data enquanto o usuário não o move
                      // por conta própria — o caso comum é serem iguais.
                      if (trVencimento === trData) setTrVencimento(e.target.value);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Vencimento */}
                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Vencimento</label>
                  <input
                    type="date"
                    required
                    value={trVencimento}
                    onChange={(e) => setTrVencimento(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
                  />
                  <p className="text-2xs text-slate-400 font-semibold">Usado no painel de vencidos e a vencer.</p>
                </div>
                <div />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Account */}
                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Conta para Movimentar</label>
                  <select
                    required
                    value={trContaId}
                    onChange={(e) => setTrContaId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-700 font-medium"
                  >
                    <option value="">Selecione a conta...</option>
                    {contas.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.nome} (Saldo: {formatBRL(acc.saldoAtual)})</option>
                    ))}
                  </select>
                </div>

                {/* Optional Project Connection */}
                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Vincular a uma Obra / Projeto (Opcional)</label>
                  <select
                    value={trProjetoId}
                    disabled={camposFinanceirosTravados}
                    onChange={(e) => setTrProjetoId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-700 font-medium disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    <option value="">Nenhum projeto vinculado</option>
                    {projetos.map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Advanced Connections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Employee association */}
                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Colaborador Associado (Opcional)</label>
                  <select
                    value={trFuncionarioId}
                    onChange={(e) => setTrFuncionarioId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-700 font-medium"
                  >
                    <option value="">Ninguém associado</option>
                    {funcionarios.map(f => (
                      <option key={f.id} value={f.id}>{f.nome} ({f.cargo})</option>
                    ))}
                  </select>
                </div>

                {/* Supplier association */}
                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-500 uppercase">Fornecedor Associado (Opcional)</label>
                  <select
                    value={trFornecedorId}
                    onChange={(e) => setTrFornecedorId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-700 font-medium"
                  >
                    <option value="">Nenhum fornecedor</option>
                    {fornecedores.map(f => (
                      <option key={f.id} value={f.id}>{f.empresa}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment checkbox toggle */}
              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk-pago"
                  checked={trPago}
                  onChange={(e) => setTrPago(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="chk-pago" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Compensado / {trTipo === 'Receita' ? 'Recebido em conta' : 'Pago de imediato'}
                </label>
              </div>

              <button
                type="submit"
                className={`w-full font-extrabold py-2.5 rounded-lg text-xs transition mt-2 shadow-sm text-white ${
                  trTipo === 'Receita' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {editandoLancamento ? 'Salvar Alterações' : 'Salvar Lançamento Financeiro'}
              </button>
            </form>
      </Modal>

      {/* Faturar medição modal */}
      <Modal
        open={!!faturarMedicao}
        onClose={() => setFaturarMedicao(null)}
        title="Faturar Medição"
        size="md"
        bloqueado={faturando}
      >
        {faturarMedicao && (
          <>
            <div className="p-5 space-y-4 text-left overflow-y-auto">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">{getProjetoNome(faturarMedicao.projetoId)}</p>
                  <p className="text-2xs text-slate-500 mt-0.5">Medição de {new Date(faturarMedicao.dataMedicao).toLocaleDateString('pt-BR')}</p>
                </div>
                <span className="text-base font-mono font-bold text-emerald-600">
                  {formatBRL(faturarMedicao.valorMedido)}
                </span>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Conta de destino</label>
                <select value={faturarContaId} onChange={(e) => setFaturarContaId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300">
                  <option value="">Selecione a conta…</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.banco}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={faturarPago} onChange={(e) => setFaturarPago(e.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-200" />
                Marcar como já recebido (senão entra como "a receber")
              </label>
              <p className="text-2xs text-slate-400 leading-snug">
                Será criada uma receita <strong>Faturamento Obra</strong> vinculada a esta medição e à obra. Cada medição só pode ser faturada uma vez.
              </p>
            </div>
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex justify-end gap-2">
              <button onClick={() => setFaturarMedicao(null)} disabled={faturando} className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition disabled:opacity-50">Cancelar</button>
              <button onClick={confirmFaturar} disabled={faturando} className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm disabled:opacity-60">
                {faturando ? 'Gerando…' : 'Gerar faturamento'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
