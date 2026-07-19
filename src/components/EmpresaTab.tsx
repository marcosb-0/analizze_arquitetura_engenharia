import React, { useState, useMemo } from 'react';
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
  Percent
} from 'lucide-react';
import { 
  Funcionario, 
  Projeto, 
  Fornecedor, 
  ContaFinanceira, 
  LancamentoFinanceiro 
} from '../types';
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

const PAYROLL_MONTH_TO_COMPETENCIA: Record<string, string> = {
  'Julho/2026': '2026-07',
  'Agosto/2026': '2026-08',
  'Setembro/2026': '2026-09',
  'Outubro/2026': '2026-10',
};

interface EmpresaTabProps {
  funcionarios: Funcionario[];
  projetos: Projeto[];
  fornecedores: Fornecedor[];
  contas: ContaFinanceira[];
  onAddConta: (conta: ContaFinanceira) => void;
  lancamentos: LancamentoFinanceiro[];
  onAddLancamento: (lan: LancamentoFinanceiro) => void;
  onToggleLancamentoPago: (id: string) => void;
  onDeleteLancamento: (id: string) => void;
}

export default function EmpresaTab({
  funcionarios,
  projetos,
  fornecedores,
  contas,
  onAddConta,
  lancamentos,
  onAddLancamento,
  onToggleLancamentoPago,
  onDeleteLancamento
}: EmpresaTabProps) {
  const { toast } = useFeedback();
  
  // Active sub-section
  const [activeSubTab, setActiveSubTab] = useState<'painel' | 'lancamentos' | 'contas' | 'salarios'>('painel');

  // Filter States for Ledger
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTipo, setFilterTipo] = useState<'Todos' | 'Receita' | 'Despesa'>('Todos');
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'Pago' | 'Pendente'>('Todos');
  const [filterCategoria, setFilterCategoria] = useState<string>('Todos');
  const [filterConta, setFilterConta] = useState<string>('Todos');

  // Form States - New Account
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accNome, setAccNome] = useState('');
  const [accBanco, setAccBanco] = useState('');
  const [accTipo, setAccTipo] = useState<'Corrente' | 'Poupança' | 'Caixa Interno'>('Corrente');
  const [accSaldo, setAccSaldo] = useState('');

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

  // Form States - Payroll month
  const [payrollMonth, setPayrollMonth] = useState('Julho/2026');
  const [payrollAccount, setPayrollAccount] = useState(contas[0]?.id || '');

  // Default Categories for Revenue and Expenses
  const categoriasDespesa = ['Salários', 'Fornecedores', 'Aluguel Escritório', 'Energia/Água/Internet', 'Marketing/Vendas', 'Impostos/Taxas', 'Ferramentas/EPIs', 'Outros'];
  const categoriasReceita = ['Aporte Capital', 'Faturamento Obra', 'Rendimento', 'Outros'];

  // Handle adding new bank account
  const handleCreateAccount = (e: React.FormEvent) => {
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

    onAddConta(newAcc);
    setAccNome('');
    setAccBanco('');
    setAccTipo('Corrente');
    setAccSaldo('');
    setShowAddAccount(false);
    toast.success('Conta financeira registrada com sucesso.');
  };

  // Handle adding new transaction
  const handleCreateTransaction = (e: React.FormEvent) => {
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

    const newLan: LancamentoFinanceiro = {
      id: crypto.randomUUID(),
      tipo: trTipo,
      descricao: trDescricao,
      valor: valor,
      data: trData,
      categoria: trCategoria as any,
      pago: trPago,
      contaId: trContaId,
      projetoId: trProjetoId || undefined,
      funcionarioId: trFuncionarioId || undefined,
      fornecedorId: trFornecedorId || undefined
    };

    onAddLancamento(newLan);
    
    // Reset form
    setTrDescricao('');
    setTrValor('');
    setTrData(new Date().toISOString().split('T')[0]);
    setTrProjetoId('');
    setTrFuncionarioId('');
    setTrFornecedorId('');
    setShowAddTrans(false);
    toast.success('Lançamento registrado com sucesso.');
  };

  // Quick Action: Pay Salary
  const handleQuickPaySalary = (emp: Funcionario) => {
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
    const desc = `Salário de ${emp.nome} - Ref. ${payrollMonth}`;

    // Check if already paid this employee in current month
    const alreadyPaid = lancamentos.some(
      l => l.funcionarioId === emp.id && 
      l.categoria === 'Salários' && 
      l.descricao.includes(payrollMonth)
    );

    if (alreadyPaid) {
      toast.error(`O salário de ${emp.nome} referente a ${payrollMonth} já foi registrado.`);
      return;
    }

    const newLan: LancamentoFinanceiro = {
      id: crypto.randomUUID(),
      tipo: 'Despesa',
      descricao: desc,
      valor: salary,
      data: new Date().toISOString().split('T')[0],
      categoria: 'Salários',
      pago: true,
      contaId: payrollAccount || defaultAcc.id,
      funcionarioId: emp.id,
      // fix #7: structured competencia (YYYY-MM) backs a real DB unique
      // constraint, instead of relying only on this description string match.
      competencia: PAYROLL_MONTH_TO_COMPETENCIA[payrollMonth]
    };

    onAddLancamento(newLan);
    toast.success(`Pagamento de R$ ${salary.toFixed(2)} registrado para ${emp.nome}.`);
  };

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

      // 3. Status
      const matchStatus = filterStatus === 'Todos' || 
                          (filterStatus === 'Pago' && l.pago) || 
                          (filterStatus === 'Pendente' && !l.pago);

      // 4. Category
      const matchCategory = filterCategoria === 'Todos' || l.categoria === filterCategoria;

      // 5. Account
      const matchConta = filterConta === 'Todos' || l.contaId === filterConta;

      return matchSearch && matchTipo && matchStatus && matchCategory && matchConta;
    }).sort((a, b) => b.data.localeCompare(a.data)); // most recent first
  }, [lancamentos, searchQuery, filterTipo, filterStatus, filterCategoria, filterConta, projetos]);

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
        </div>
      </div>

      {/* ----------------------------------------------------
          SUB-TAB 1: FINANCIAL DASHBOARD (PAINEL)
          ---------------------------------------------------- */}
      {activeSubTab === 'painel' && (
        <div className="space-y-6">
          
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Account Balance */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between text-slate-450">
                <span className="text-[10px] font-bold uppercase tracking-wider">Saldo Total em Caixa</span>
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <Landmark size={15} />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-extrabold text-slate-900 font-mono">
                  R$ {metrics.totalContasBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-[10px] text-slate-400 mt-1 font-semibold">Consolidado em {contas.length} contas ativas</p>
              </div>
            </div>

            {/* Income Received */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between text-slate-450">
                <span className="text-[10px] font-bold uppercase tracking-wider">Receitas Consolidadas</span>
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                  <TrendingUp size={15} />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-extrabold text-emerald-600 font-mono">
                  R$ {metrics.totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-slate-400 font-semibold">Pendentes: R$ {metrics.totalPendenteReceber.toLocaleString('pt-BR')}</span>
                </div>
              </div>
            </div>

            {/* Expenses Paid */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between text-slate-450">
                <span className="text-[10px] font-bold uppercase tracking-wider">Despesas Consolidadas</span>
                <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
                  <TrendingDown size={15} />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-extrabold text-rose-600 font-mono">
                  R$ {metrics.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-slate-400 font-semibold">Contas a pagar: R$ {metrics.totalPendentePagar.toLocaleString('pt-BR')}</span>
                </div>
              </div>
            </div>

            {/* Net Operating Balance */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between text-slate-450">
                <span className="text-[10px] font-bold uppercase tracking-wider">Resultado Líquido</span>
                <div className="w-8 h-8 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center">
                  <DollarSign size={15} />
                </div>
              </div>
              <div className="mt-4">
                <span className={`text-2xl font-extrabold font-mono ${metrics.netBalance >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                  R$ {metrics.netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-[10px] text-slate-400 mt-1 font-semibold">Diferença entre Receitas e Despesas Pagas</p>
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
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Histórico mensal consolidado de entradas e saídas efetivadas</p>
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
                      <Tooltip formatter={(value) => [`R$ ${value.toLocaleString('pt-BR')}`]} contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px', fontWeight: 'bold' }} />
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
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Principais centros de custo da empresa no período</p>
              </div>

              <div className="space-y-3 pt-2">
                {(() => {
                  const expensesByCategory: { [key: string]: number } = {};
                  let totalCatExpenses = 0;

                  lancamentos.forEach(l => {
                    if (l.tipo === 'Despesa') {
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
                        Nenhuma despesa registrada para cálculo de centros de custo.
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
                          <span className="font-mono text-slate-900">R$ {item.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className={`${colorClass} h-full rounded-full`} style={{ width: `${item.percent}%` }} />
                          </div>
                          <span className="text-[9px] font-bold text-slate-450 font-mono shrink-0 w-8 text-right">{item.percent.toFixed(1)}%</span>
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
                    setShowAddTrans(true);
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-rose-50/40 border border-slate-150 hover:border-rose-200 rounded-xl transition text-center space-y-2 group"
                >
                  <div className="w-10 h-10 bg-rose-50 group-hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition">
                    <TrendingDown size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Registrar Despesa</span>
                  <span className="text-[9px] text-slate-400 font-semibold">Contas, taxas, compras</span>
                </button>

                <button
                  onClick={() => {
                    setTrTipo('Receita');
                    setTrCategoria('Faturamento Obra');
                    setTrContaId(contas[0]?.id || '');
                    setShowAddTrans(true);
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-emerald-50/40 border border-slate-150 hover:border-emerald-200 rounded-xl transition text-center space-y-2 group"
                >
                  <div className="w-10 h-10 bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center transition">
                    <TrendingUp size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Lançar Receita</span>
                  <span className="text-[9px] text-slate-400 font-semibold">Faturamento de obra, aporte</span>
                </button>

                <button
                  onClick={() => setActiveSubTab('salarios')}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-blue-50/40 border border-slate-150 hover:border-blue-200 rounded-xl transition text-center space-y-2 group"
                >
                  <div className="w-10 h-10 bg-blue-50 group-hover:bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center transition">
                    <Users size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Folha de Salários</span>
                  <span className="text-[9px] text-slate-400 font-semibold">Pagar colaboradores</span>
                </button>

                <button
                  onClick={() => setShowAddAccount(true)}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-violet-50/40 border border-slate-150 hover:border-violet-200 rounded-xl transition text-center space-y-2 group"
                >
                  <div className="w-10 h-10 bg-violet-50 group-hover:bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center transition">
                    <Landmark size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Vincular Conta</span>
                  <span className="text-[9px] text-slate-400 font-semibold">Bancos e caixinhas</span>
                </button>
              </div>
            </div>

            {/* Account List Summary */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-800 text-sm">Saldos Disponíveis por Conta</h3>
                <button onClick={() => setActiveSubTab('contas')} className="text-[11px] text-blue-600 hover:underline font-bold">Ver Contas Bancárias →</button>
              </div>
              
              <div className="space-y-2.5 pt-1">
                {contas.map(acc => (
                  <div key={acc.id} className="p-3 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500">
                        <Landmark size={14} />
                      </div>
                      <div className="text-left text-xs">
                        <p className="font-extrabold text-slate-800">{acc.nome}</p>
                        <p className="text-[9px] text-slate-450 font-semibold">{acc.banco} ({acc.tipo})</p>
                      </div>
                    </div>
                    <div className="text-right text-xs font-mono font-bold text-slate-900">
                      R$ {acc.saldoAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
      {activeSubTab === 'lancamentos' && (
        <div className="space-y-4">
          
          {/* Header filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-150 flex flex-col gap-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-2.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar lançamentos por descrição, categoria ou obra..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-8 pr-3 text-xs outline-none focus:border-blue-600 transition"
                />
              </div>

              <button
                onClick={() => {
                  setTrTipo('Despesa');
                  setTrCategoria('Outros');
                  setTrContaId(contas[0]?.id || '');
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
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Tipo de Fluxo</label>
                <select
                  value={filterTipo}
                  onChange={(e) => setFilterTipo(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus:border-blue-600 font-semibold text-slate-700"
                >
                  <option value="Todos">Todos os Fluxos</option>
                  <option value="Receita">Entradas (Receitas)</option>
                  <option value="Despesa">Saídas (Despesas)</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="space-y-1 text-left">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Situação</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus:border-blue-600 font-semibold text-slate-700"
                >
                  <option value="Todos">Todas as Situações</option>
                  <option value="Pago">Pago / Compensado</option>
                  <option value="Pendente">A Pagar / Receber</option>
                </select>
              </div>

              {/* Category Filter */}
              <div className="space-y-1 text-left">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Centro de Custo / Categoria</label>
                <select
                  value={filterCategoria}
                  onChange={(e) => setFilterCategoria(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus:border-blue-600 font-semibold text-slate-700"
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
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Conta Bancária</label>
                <select
                  value={filterConta}
                  onChange={(e) => setFilterConta(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none focus:border-blue-600 font-semibold text-slate-700"
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
          <div className="bg-white rounded-xl border border-slate-150 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-450 text-[9px] font-extrabold uppercase tracking-wider border-b border-slate-150 text-left">
                    <th className="p-3 w-28">Data</th>
                    <th className="p-3">Descrição / Vínculo</th>
                    <th className="p-3 w-36">Categoria</th>
                    <th className="p-3 w-40">Conta Financeira</th>
                    <th className="p-3 w-28">Situação</th>
                    <th className="p-3 w-36 text-right">Valor</th>
                    <th className="p-3 w-16 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                  {filteredLancamentos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400">
                        Nenhum lançamento financeiro encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredLancamentos.map(l => {
                      const accountName = contas.find(c => c.id === l.contaId)?.nome || 'Desconhecida';
                      const projectName = l.projetoId ? projetos.find(p => p.id === l.projetoId)?.nome : null;
                      const employeeName = l.funcionarioId ? funcionarios.find(f => f.id === l.funcionarioId)?.nome : null;
                      const supplierName = l.fornecedorId ? fornecedores.find(f => f.id === l.fornecedorId)?.empresa : null;

                      return (
                        <tr key={l.id} className="hover:bg-slate-50/40 transition">
                          <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                            {new Date(l.data).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-800 leading-normal">{l.descricao}</div>
                            {/* Link badges */}
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {projectName && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-extrabold bg-blue-50 text-blue-700 border border-blue-100/50 uppercase tracking-wide">
                                  <Briefcase size={8} /> Obra: {projectName}
                                </span>
                              )}
                              {employeeName && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-extrabold bg-violet-50 text-violet-700 border border-violet-100/50 uppercase tracking-wide">
                                  <Users size={8} /> Folha: {employeeName}
                                </span>
                              )}
                              {supplierName && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-extrabold bg-orange-50 text-orange-700 border border-orange-100/50 uppercase tracking-wide">
                                  Fornecedor: {supplierName}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-slate-600 bg-slate-100/60 px-2 py-0.5 rounded text-[10px]">
                              {l.categoria}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-slate-600 whitespace-nowrap">
                            {accountName}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <button
                              onClick={() => {
                                onToggleLancamentoPago(l.id);
                                toast.success('Situação do lançamento alterada.');
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
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
                            {l.tipo === 'Receita' ? '+' : '-'} R$ {l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => {
                                if (window.confirm(`Excluir o lançamento "${l.descricao}"?`)) {
                                  onDeleteLancamento(l.id);
                                  toast.success('Lançamento removido.');
                                }
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
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          SUB-TAB 3: BANK ACCOUNTS (CONTAS)
          ---------------------------------------------------- */}
      {activeSubTab === 'contas' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-150">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Contas Bancárias de Caixa Ativos</h3>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Bancos cadastrados para faturamentos e pagamentos da empresa</p>
            </div>
            <button
              onClick={() => setShowAddAccount(true)}
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
                <div key={acc.id} className="bg-white rounded-2xl border border-slate-150 p-5 space-y-4 flex flex-col justify-between shadow-xs relative overflow-hidden group">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <span className="text-[9px] bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-500 uppercase tracking-wide">{acc.tipo}</span>
                      <h4 className="font-extrabold text-slate-800 text-sm pt-1">{acc.nome}</h4>
                      <p className="text-[10px] text-slate-450 font-semibold">{acc.banco}</p>
                    </div>
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                      <Landmark size={18} />
                    </div>
                  </div>

                  <div className="py-2 border-t border-b border-dashed border-slate-100 flex justify-between text-[11px]">
                    <div className="text-left">
                      <span className="text-slate-400 font-bold text-[8px] block uppercase">Entradas Acumuladas</span>
                      <span className="text-emerald-600 font-bold font-mono">R$ {accRecebido.toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 font-bold text-[8px] block uppercase">Saídas Acumuladas</span>
                      <span className="text-rose-600 font-bold font-mono">R$ {accPago.toLocaleString('pt-BR')}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Saldo Atual</span>
                    <span className="text-xl font-extrabold text-slate-900 font-mono">
                      R$ {acc.saldoAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
      {activeSubTab === 'salarios' && (
        <div className="space-y-6">
          
          {/* Controls & Configuration Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-150 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            
            <div className="space-y-1 text-left">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Mês de Referência da Folha</label>
              <select
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none font-bold text-slate-800"
              >
                <option value="Julho/2026">Julho / 2026</option>
                <option value="Agosto/2026">Agosto / 2026</option>
                <option value="Setembro/2026">Setembro / 2026</option>
                <option value="Outubro/2026">Outubro / 2026</option>
              </select>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Conta Bancária de Saída</label>
              <select
                value={payrollAccount}
                onChange={(e) => setPayrollAccount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none font-bold text-slate-800"
              >
                {contas.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.nome} (Sald: R$ {acc.saldoAtual.toLocaleString('pt-BR')})</option>
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
                    <span className="text-[8px] text-slate-400 font-extrabold block uppercase tracking-wider">Custo da Folha Mensal</span>
                    <p className="font-extrabold text-blue-800 text-lg font-mono">
                      R$ {totalFolha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    {semSalario > 0 && (
                      <p className="text-[9px] text-amber-600 font-bold mt-0.5">
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
          <div className="bg-white rounded-xl border border-slate-150 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-150 text-left">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Quadro de Colaboradores e Liberação de Salários</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-450 text-[9px] font-extrabold uppercase tracking-wider border-b border-slate-150">
                    <th className="p-3">Colaborador</th>
                    <th className="p-3">Cargo / Função</th>
                    <th className="p-3 text-right">Salário Base</th>
                    <th className="p-3 text-center">Situação de Pagamento ({payrollMonth})</th>
                    <th className="p-3 text-right w-40">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                  {funcionarios.filter(f => f.status === 'Ativo').map(emp => {
                    const salary = emp.salarioBase;
                    
                    // Check if already paid for the selected payrollMonth
                    const matchingTrans = lancamentos.find(
                      l => l.funcionarioId === emp.id && 
                      l.categoria === 'Salários' && 
                      l.descricao.includes(payrollMonth)
                    );
                    const isPaid = !!matchingTrans;

                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/40 transition">
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{emp.nome}</div>
                          <div className="text-[10px] text-slate-400 font-semibold">{emp.email}</div>
                        </td>
                        <td className="p-3 font-semibold text-slate-600">
                          {emp.cargo}
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          {salary ? (
                            <>R$ {salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-100 font-sans">
                              Não cadastrado
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <CheckCircle size={10} /> Pago (Ref. {new Date(matchingTrans.data).toLocaleDateString('pt-BR')})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-100">
                              <Clock size={10} /> Pendente de Liberação
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleQuickPaySalary(emp)}
                            disabled={isPaid || !salary}
                            title={!salary ? 'Cadastre o salário base na ficha do colaborador (módulo Equipe)' : undefined}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition whitespace-nowrap ${
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
      {showAddAccount && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-150 w-full max-w-md overflow-hidden shadow-xl text-left">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Vincular Nova Conta Financeira</h3>
              <button onClick={() => setShowAddAccount(false)} className="text-slate-450 hover:text-slate-600 text-xs font-bold">Fechar</button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase">Nome Identificador da Conta</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Conta Caixa PJ, Fundo Reserva..."
                  value={accNome}
                  onChange={(e) => setAccNome(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-250 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Instituição / Banco</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Banco do Brasil, Itaú..."
                    value={accBanco}
                    onChange={(e) => setAccBanco(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-250 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Tipo de Caixa</label>
                  <select
                    value={accTipo}
                    onChange={(e) => setAccTipo(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-250 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 font-medium text-slate-700"
                  >
                    <option value="Corrente">Conta Corrente</option>
                    <option value="Poupança">Conta Poupança</option>
                    <option value="Caixa Interno">Caixa Interno (Caixinha)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase">Saldo Inicial de Implantação (R$)</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={accSaldo}
                  onChange={(e) => setAccSaldo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-250 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 font-mono font-bold"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2.5 rounded-lg text-xs transition mt-2 shadow-sm"
              >
                Vincular Conta Bancária
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          MODAL: REGISTER TRANSACTION (RECEITA / DESPESA)
          ---------------------------------------------------- */}
      {showAddTrans && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-150 w-full max-w-lg overflow-hidden shadow-xl text-left">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                Lançar {trTipo === 'Receita' ? 'Entrada (Receita)' : 'Saída (Despesa)'}
              </h3>
              <button onClick={() => setShowAddTrans(false)} className="text-slate-450 hover:text-slate-600 text-xs font-bold">Fechar</button>
            </div>

            <form onSubmit={handleCreateTransaction} className="p-5 space-y-4">
              
              {/* Type Switch */}
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-bold w-full">
                <button
                  type="button"
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
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Descrição do Lançamento</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Pagamento mensalidade escritório, etc"
                    value={trDescricao}
                    onChange={(e) => setTrDescricao(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600"
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Categoria</label>
                  <select
                    value={trCategoria}
                    onChange={(e) => setTrCategoria(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-700 font-medium"
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
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Valor (R$)</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={trValor}
                    onChange={(e) => setTrValor(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 font-mono font-bold text-slate-800"
                  />
                </div>

                {/* Date */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Data da Operação</label>
                  <input
                    type="date"
                    required
                    value={trData}
                    onChange={(e) => setTrData(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Account */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Conta para Movimentar</label>
                  <select
                    required
                    value={trContaId}
                    onChange={(e) => setTrContaId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-700 font-medium"
                  >
                    <option value="">Selecione a conta...</option>
                    {contas.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.nome} (Sald: R$ {acc.saldoAtual.toLocaleString('pt-BR')})</option>
                    ))}
                  </select>
                </div>

                {/* Optional Project Connection */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Vincular a uma Obra / Projeto (Opcional)</label>
                  <select
                    value={trProjetoId}
                    onChange={(e) => setTrProjetoId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-700 font-medium"
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
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Colaborador Associado (Opcional)</label>
                  <select
                    value={trFuncionarioId}
                    onChange={(e) => setTrFuncionarioId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-700 font-medium"
                  >
                    <option value="">Ninguém associado</option>
                    {funcionarios.map(f => (
                      <option key={f.id} value={f.id}>{f.nome} ({f.cargo})</option>
                    ))}
                  </select>
                </div>

                {/* Supplier association */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Fornecedor Associado (Opcional)</label>
                  <select
                    value={trFornecedorId}
                    onChange={(e) => setTrFornecedorId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-700 font-medium"
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
                Salvar Lançamento Financeiro
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
