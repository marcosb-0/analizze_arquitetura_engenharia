import { lazy } from 'react';
import {
  useCatalogoDados,
  useCentrosCustoDados,
  useFinanceiroDados,
  useFornecedoresDados,
} from '../../contexts/DadosContext';

const FornecedoresTab = lazy(() => import('../FornecedoresTab'));

export default function FornecedoresConectado() {
  const {
    fornecedores,
    loading,
    handleAddFornecedor,
    handleUpdateFornecedor,
    handleSetAtivoFornecedor,
    handleDeleteFornecedor,
    handleAddCompra,
    handleTogglePago,
  } = useFornecedoresDados();
  const { contas } = useFinanceiroDados();
  const { catalogo } = useCatalogoDados();
  const { centrosCusto } = useCentrosCustoDados();

  return (
    <FornecedoresTab
      fornecedores={fornecedores}
      loading={loading}
      contas={contas}
      centrosCusto={centrosCusto}
      catalogo={catalogo}
      onAddFornecedor={handleAddFornecedor}
      onUpdateFornecedor={handleUpdateFornecedor}
      onSetAtivoFornecedor={handleSetAtivoFornecedor}
      onDeleteFornecedor={handleDeleteFornecedor}
      onAddCompra={handleAddCompra}
      onTogglePago={handleTogglePago}
    />
  );
}
