import { useMemo, useState } from 'react';
import { CheckCircle, Clock, Users, Wallet } from 'lucide-react';
import { ContaFinanceira, EmpresaConfig, Funcionario, LancamentoFinanceiro } from '../../types';
import { useFeedback } from '../FeedbackContext';
import { custoColaborador, parametrosDaEmpresa } from '../../lib/custoHora';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';
import { Card, Select } from '../ui';

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
  /** Encargos e jornada padrão, para o custo total além dos salários. */
  empresa: EmpresaConfig | null;
  lancamentos: LancamentoFinanceiro[];
  contasAtivas: ContaFinanceira[];
  onAddLancamento: (lan: LancamentoFinanceiro) => Promise<boolean>;
}

export default function FolhaSalarios({
  funcionarios,
  empresa,
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

  /**
   * O que a folha custa de verdade: salários + encargos + benefícios. Fica ao
   * lado do total de salários, e não no lugar dele, porque os dois respondem
   * perguntas diferentes — um é o que sai por transferência este mês, o outro é
   * o que a empresa gasta com pessoal. `pagarSalario` continua lançando o
   * salário base: VT, VR e encargos não saem nessa mesma transferência.
   *
   * `custoIncompleto` conta quem tem salário mas nenhum encargo definido, nem
   * na ficha nem na empresa. Esses ficam de fora do total, e dizer isso importa:
   * um custo total silenciosamente menor que o real é pior que nenhum.
   */
  const parametros = useMemo(() => parametrosDaEmpresa(empresa), [empresa]);
  const { custoTotal, custoIncompleto } = useMemo(() => {
    let custoTotal = 0;
    let custoIncompleto = 0;
    for (const f of ativos) {
      const custo = custoColaborador(f, parametros);
      if (custo) custoTotal += custo.custoMensal;
      else if (f.salarioBase) custoIncompleto += 1;
    }
    return { custoTotal, custoIncompleto };
  }, [ativos, parametros]);

  return (
    <div className="space-y-6">

      {/* Controls & Configuration Card */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-center">

        <div className="space-y-1 text-left">
          <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">Mês de Referência da Folha</label>
          <Select
            value={payrollMonth}
            onChange={(e) => setPayrollMonth(e.target.value)} fundo="suave" className="font-bold"
          >
            {payrollMonthOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-1 text-left">
          <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">Conta Bancária de Saída</label>
          <Select
            value={payrollAccountId}
            onChange={(e) => setPayrollAccount(e.target.value)} fundo="suave" className="font-bold"
          >
            {contasAtivas.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.nome} (Saldo: {formatBRL(acc.saldoAtual)})</option>
            ))}
          </Select>
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

        <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 flex items-center justify-between text-left text-xs self-end">
          <div>
            <span className="text-2xs text-slate-500 font-extrabold block uppercase tracking-wider">Custo Total da Folha</span>
            <p className="font-extrabold text-emerald-800 text-lg font-mono">
              {formatBRL(custoTotal)}
            </p>
            <p className="text-2xs text-slate-500 font-semibold mt-0.5">
              Com encargos e benefícios
            </p>
            {custoIncompleto > 0 && (
              <p className="text-2xs text-amber-600 font-bold mt-0.5">
                {custoIncompleto} sem encargos definidos — fora do total
              </p>
            )}
          </div>
          <Wallet size={20} className="text-emerald-500/60" />
        </div>
      </div>

      {/* Employee list with Payroll payment status */}
      <Card semPadding className="overflow-hidden">
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
                {/* O que a pessoa custa de fato. Fica ao lado do salário porque
                    é a diferença entre os dois que explica o KPI do topo. */}
                <th scope="col" className="p-3 text-right">Custo Total / Hora</th>
                <th scope="col" className="p-3 text-center">Situação de Pagamento ({competenciaToLabel(payrollMonth)})</th>
                <th scope="col" className="p-3 text-right w-40">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
              {ativos.map(emp => {
                const salary = emp.salarioBase;
                const custo = custoColaborador(emp, parametros);

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
                    <td className="p-3 text-right font-mono">
                      {custo ? (
                        <>
                          <span className="font-bold text-slate-800">{formatBRL(custo.custoMensal)}</span>
                          <span className="block text-2xs text-emerald-700 font-bold">
                            {formatBRL(custo.custoHora)}/h
                          </span>
                        </>
                      ) : (
                        <span className="text-2xs text-slate-500 font-sans font-semibold">—</span>
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
                            : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs'
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
      </Card>
    </div>
  );
}
