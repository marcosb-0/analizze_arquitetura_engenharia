import { useMemo, useState } from 'react';
import { CheckCircle, Clock, Users } from 'lucide-react';
import { ContaFinanceira, Funcionario, LancamentoFinanceiro } from '../../types';
import { useFeedback } from '../FeedbackContext';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';

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

interface FolhaSalariosProps {
  funcionarios: Funcionario[];
  lancamentos: LancamentoFinanceiro[];
  contasAtivas: ContaFinanceira[];
  onAddLancamento: (lan: LancamentoFinanceiro) => Promise<boolean>;
}

export default function FolhaSalarios({
  funcionarios,
  lancamentos,
  contasAtivas,
  onAddLancamento,
}: FolhaSalariosProps) {
  const { toast } = useFeedback();

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
  const payrollAccountId = payrollAccount || contasAtivas[0]?.id || '';

  const ativos = useMemo(() => funcionarios.filter(f => f.status === 'Ativo'), [funcionarios]);

  const pagarSalario = async (emp: Funcionario) => {
    const contaPadrao = contasAtivas[0];
    if (!contaPadrao) {
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

    const monthLabel = competenciaToLabel(payrollMonth);

    // Check if already paid this employee in current competencia — matches
    // the structured field, not the free-text description.
    const jaPago = lancamentos.some(
      l => l.funcionarioId === emp.id &&
      l.categoria === 'Salários' &&
      l.competencia === payrollMonth
    );

    if (jaPago) {
      toast.error(`O salário de ${emp.nome} referente a ${monthLabel} já foi registrado.`);
      return;
    }

    const hoje = new Date().toISOString().split('T')[0];
    const novo: LancamentoFinanceiro = {
      id: crypto.randomUUID(),
      tipo: 'Despesa',
      descricao: `Salário de ${emp.nome} - Ref. ${monthLabel}`,
      valor: emp.salarioBase,
      data: hoje,
      dataVencimento: hoje,
      categoria: 'Salários',
      pago: true,
      contaId: payrollAccountId || contaPadrao.id,
      funcionarioId: emp.id,
      competencia: payrollMonth
    };

    if (!(await onAddLancamento(novo))) return;
    toast.success(`Pagamento de ${formatBRL(emp.salarioBase)} registrado para ${emp.nome}.`);
  };

  const semSalario = ativos.filter(f => !f.salarioBase).length;
  const totalFolha = ativos.reduce((sum, f) => sum + (f.salarioBase || 0), 0);

  return (
    <div className="space-y-6">

      {/* Controls & Configuration Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">

        <div className="space-y-1 text-left">
          <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">Mês de Referência da Folha</label>
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
          <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">Conta Bancária de Saída</label>
          <select
            value={payrollAccountId}
            onChange={(e) => setPayrollAccount(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-bold text-slate-800"
          >
            {contasAtivas.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.nome} (Saldo: {formatBRL(acc.saldoAtual)})</option>
            ))}
          </select>
        </div>

        <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex items-center justify-between text-left text-xs self-end">
          <div>
            <span className="text-2xs text-slate-500 font-extrabold block uppercase tracking-wider">Custo da Folha Mensal</span>
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
                <th scope="col" className="p-3">Colaborador</th>
                <th scope="col" className="p-3">Cargo / Função</th>
                <th scope="col" className="p-3 text-right">Salário Base</th>
                <th scope="col" className="p-3 text-center">Situação de Pagamento ({competenciaToLabel(payrollMonth)})</th>
                <th scope="col" className="p-3 text-right w-40">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
              {ativos.map(emp => {
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
                      <div className="text-2xs text-slate-500 font-semibold">{emp.email}</div>
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
                          <CheckCircle size={10} /> Pago (Ref. {formatarDataBR(matchingTrans.data)})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-amber-50 text-amber-700 border border-amber-100">
                          <Clock size={10} /> Pendente de Liberação
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => pagarSalario(emp)}
                        disabled={isPaid || !salary}
                        aria-label={!salary ? 'Cadastre o salário base na ficha do colaborador (módulo Equipe)' : undefined}
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
  );
}
