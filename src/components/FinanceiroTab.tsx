import { memo, useCallback, useMemo, useState } from 'react';
import {
  Funcionario,
  Projeto,
  Fornecedor,
  ContaFinanceira,
  LancamentoFinanceiro,
  MedicaoRecente,
  EmpresaConfig,
  ResultadoObra
} from '../types';
import EmpresaIdentidade from './EmpresaIdentidade';
import Spinner from './Spinner';
import PainelFinanceiro from './financeiro/PainelFinanceiro';
import RazaoLancamentos from './financeiro/RazaoLancamentos';
import ResultadoPorObra from './financeiro/ResultadoPorObra';
import ContasBancarias from './financeiro/ContasBancarias';
import FolhaSalarios from './financeiro/FolhaSalarios';
import { FiltrosRazao, FILTROS_RAZAO_PADRAO } from './financeiro/constantes';

type SubAba = 'painel' | 'lancamentos' | 'obras' | 'contas' | 'salarios' | 'identidade';

const SUB_ABAS: { id: SubAba; rotulo: string }[] = [
  { id: 'painel', rotulo: 'Dashboard' },
  { id: 'lancamentos', rotulo: 'Fluxo de Caixa' },
  { id: 'obras', rotulo: 'Resultado por Obra' },
  { id: 'contas', rotulo: 'Contas Bancárias' },
  { id: 'salarios', rotulo: 'Folha e Salários' },
  { id: 'identidade', rotulo: 'Dados da Empresa' },
];

interface FinanceiroTabProps {
  funcionarios: Funcionario[];
  projetos: Projeto[];
  fornecedores: Fornecedor[];
  contas: ContaFinanceira[];
  /**
   * Só os boletins aprovados com valor, de todas as obras (`v_medicao_recente`).
   * Era `MedicaoObra[]` com as medições INTEIRAS de todas as obras — §4.2, item
   * 23: esta tela nunca usou foto, motivo de rejeição nem autor da aprovação.
   */
  medicoesAFaturar: MedicaoRecente[];
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
  onExcluirConta: (id: string) => Promise<boolean>;
  onToggleContaAtiva: (id: string, ativa: boolean) => Promise<boolean>;
  onGerarFaturamento: (medicaoId: string, contaId: string, pago: boolean) => Promise<boolean>;
  onToggleLancamentoPago: (id: string) => Promise<boolean>;
  onDeleteLancamento: (id: string) => Promise<boolean>;
  /** Papel timbrado das propostas. Null enquanto não carregou. */
  empresa: EmpresaConfig | null;
  onSaveEmpresa: (config: Omit<EmpresaConfig, 'id' | 'logoUrl'>) => Promise<EmpresaConfig | null>;
  onUploadLogo: (file: File) => Promise<boolean>;
  onRemoverLogo: () => Promise<void>;
}

/**
 * Módulo financeiro. Este arquivo é só a orquestração: escolhe a sub-aba, guarda
 * o que atravessa a fronteira entre elas e repassa os dados. Cada sub-aba, com
 * os seus cálculos e diálogos, vive em `./financeiro/`.
 */
function FinanceiroTab({
  funcionarios,
  projetos,
  fornecedores,
  contas,
  medicoesAFaturar,
  resultadoObras,
  loading,
  onAddConta,
  lancamentos,
  onAddLancamento,
  onUpdateLancamento,
  onUpdateConta,
  onExcluirConta,
  onToggleContaAtiva,
  onGerarFaturamento,
  onToggleLancamentoPago,
  onDeleteLancamento,
  empresa,
  onSaveEmpresa,
  onUploadLogo,
  onRemoverLogo
}: FinanceiroTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubAba>('painel');

  /**
   * Os filtros do razão ficam aqui, e não dentro dele, por duas razões: o painel
   * os escreve (o card de vencidos joga o usuário no razão já filtrado) e a
   * sub-aba desmonta ao trocar de aba — guardados lá dentro, um pulo ao
   * "Resultado por Obra" e de volta apagaria a busca em curso.
   */
  const [filtros, setFiltros] = useState<FiltrosRazao>(FILTROS_RAZAO_PADRAO);
  const aplicarFiltros = useCallback(
    (patch: Partial<FiltrosRazao>) => setFiltros(f => ({ ...f, ...patch })),
    []
  );
  const verVencidos = useCallback((tipo: 'Receita' | 'Despesa') => {
    setFiltros(f => ({ ...f, status: 'Vencido', tipo }));
    setActiveSubTab('lancamentos');
  }, []);

  /**
   * Conta inativa sai de tudo que é ESCOLHA (lançar, pagar folha, faturar) e do
   * total em caixa, mas `contas` cru continua sendo usado onde o papel é
   * NOMEAR o histórico — o filtro de conta do razão e o nome na linha antiga.
   * Trocar lá também faria lançamento antigo exibir "Desconhecida".
   */
  const contasAtivas = useMemo(() => contas.filter(c => c.ativa), [contas]);

  return (
    <div className="space-y-6 text-left select-none animate-fade-in">

      {/* Header and Sub Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Gestão Corporativa e Financeira</h2>
          <p className="text-xs text-slate-500 font-semibold uppercase mt-0.5 tracking-wider">Contas Bancárias, Fluxo de Caixa Realizado, Despesas e Folha</p>
        </div>

        {/* Subtab selection pills */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-bold self-start sm:self-center">
          {SUB_ABAS.map(({ id, rotulo }) => (
            <button
              key={id}
              onClick={() => setActiveSubTab(id)}
              className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* As cinco sub-abas financeiras dependem de `useFinanceiro`; Dados da
          Empresa vem de outro hook e não espera por ele. */}
      {loading && activeSubTab !== 'identidade' && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-blue-600">
          <Spinner size={22} />
          <span className="text-xs font-semibold text-slate-500">Carregando dados financeiros…</span>
        </div>
      )}

      {activeSubTab === 'identidade' && (
        <EmpresaIdentidade
          empresa={empresa}
          onSave={onSaveEmpresa}
          onUploadLogo={onUploadLogo}
          onRemoverLogo={onRemoverLogo}
        />
      )}

      {activeSubTab === 'painel' && !loading && (
        <PainelFinanceiro
          lancamentos={lancamentos}
          contasAtivas={contasAtivas}
          medicoesAFaturar={medicoesAFaturar}
          projetos={projetos}
          funcionarios={funcionarios}
          fornecedores={fornecedores}
          onAddConta={onAddConta}
          onUpdateConta={onUpdateConta}
          onAddLancamento={onAddLancamento}
          onUpdateLancamento={onUpdateLancamento}
          onGerarFaturamento={onGerarFaturamento}
          onVerVencidos={verVencidos}
          onIrParaContas={() => setActiveSubTab('contas')}
          onIrParaFolha={() => setActiveSubTab('salarios')}
        />
      )}

      {activeSubTab === 'lancamentos' && !loading && (
        <RazaoLancamentos
          lancamentos={lancamentos}
          contas={contas}
          contasAtivas={contasAtivas}
          projetos={projetos}
          funcionarios={funcionarios}
          fornecedores={fornecedores}
          filtros={filtros}
          onFiltrosChange={aplicarFiltros}
          onAddLancamento={onAddLancamento}
          onUpdateLancamento={onUpdateLancamento}
          onToggleLancamentoPago={onToggleLancamentoPago}
          onDeleteLancamento={onDeleteLancamento}
        />
      )}

      {activeSubTab === 'obras' && !loading && (
        <ResultadoPorObra resultadoObras={resultadoObras} />
      )}

      {activeSubTab === 'contas' && !loading && (
        <ContasBancarias
          contas={contas}
          lancamentos={lancamentos}
          onAddConta={onAddConta}
          onUpdateConta={onUpdateConta}
          onExcluirConta={onExcluirConta}
          onToggleContaAtiva={onToggleContaAtiva}
        />
      )}

      {activeSubTab === 'salarios' && !loading && (
        <FolhaSalarios
          funcionarios={funcionarios}
          lancamentos={lancamentos}
          contasAtivas={contasAtivas}
          onAddLancamento={onAddLancamento}
        />
      )}
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
export default memo(FinanceiroTab);
