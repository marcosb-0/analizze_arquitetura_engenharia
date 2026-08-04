import { lazy } from 'react';
import { Wallet } from 'lucide-react';
import { rolesForTab } from '../../constants/tabAccess';
import EmptyState from '../EmptyState';
import RequireRole from '../RequireRole';
import {
  useEmpresaConfigDados,
  useFinanceiroDados,
  useFornecedoresDados,
  useFuncionariosDados,
  useMedicoesDados,
  useProjetosDados,
} from '../../contexts/DadosContext';

const EmpresaTab = lazy(() => import('../EmpresaTab'));

/**
 * Defesa em profundidade: a RLS já devolve vazio para quem não é
 * admin/financeiro, mas sem esta guarda a tela inteira — formulários de
 * lançamento, folha, botões de faturar — ainda era montada e convidava a ações
 * que morreriam no servidor. `rolesForTab` evita repetir a matriz de acesso aqui.
 */
export default function FinanceiroConectado() {
  return (
    <RequireRole
      allow={rolesForTab('empresa')}
      fallback={
        <EmptyState
          icon={Wallet}
          title="Módulo financeiro restrito"
          description="Só os perfis de administração e financeiro têm acesso ao caixa, ao razão e à folha de pagamento."
        />
      }
    >
      <FinanceiroInterno />
    </RequireRole>
  );
}

function FinanceiroInterno() {
  const {
    contas,
    lancamentos,
    resultadoObras,
    loading,
    handleAddConta,
    handleAddLancamento,
    handleUpdateLancamento,
    handleUpdateConta,
    handleExcluirConta,
    handleToggleContaAtiva,
    handleGerarFaturamento,
    handleToggleLancamentoPago,
    handleDeleteLancamento,
  } = useFinanceiroDados();
  const { funcionarios } = useFuncionariosDados();
  const { projetos } = useProjetosDados();
  const { fornecedores } = useFornecedoresDados();
  const { medicoes } = useMedicoesDados();
  const { empresa, handleSaveEmpresa, handleUploadLogo, handleRemoverLogo } = useEmpresaConfigDados();

  return (
    <EmpresaTab
      funcionarios={funcionarios}
      projetos={projetos}
      fornecedores={fornecedores}
      contas={contas}
      medicoes={medicoes}
      resultadoObras={resultadoObras}
      loading={loading}
      onAddConta={handleAddConta}
      lancamentos={lancamentos}
      onAddLancamento={handleAddLancamento}
      onUpdateLancamento={handleUpdateLancamento}
      onUpdateConta={handleUpdateConta}
      onExcluirConta={handleExcluirConta}
      onToggleContaAtiva={handleToggleContaAtiva}
      onGerarFaturamento={handleGerarFaturamento}
      onToggleLancamentoPago={handleToggleLancamentoPago}
      onDeleteLancamento={handleDeleteLancamento}
      empresa={empresa}
      onSaveEmpresa={handleSaveEmpresa}
      onUploadLogo={handleUploadLogo}
      onRemoverLogo={handleRemoverLogo}
    />
  );
}
