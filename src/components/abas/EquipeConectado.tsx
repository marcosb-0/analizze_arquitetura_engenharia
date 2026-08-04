import { lazy } from 'react';
import {
  useCronogramaDados,
  useFuncionarioDocumentosDados,
  useFuncionariosDados,
  useProjetosDados,
} from '../../contexts/DadosContext';

const EquipeTab = lazy(() => import('../EquipeTab'));

export default function EquipeConectado() {
  const {
    funcionarios,
    loading,
    handleAddFuncionario,
    handleUpdateFuncionario,
    handleUpdateStatusFuncionario,
    handleUpdateSalarioFuncionario,
  } = useFuncionariosDados();
  const { projetos } = useProjetosDados();
  const { cronograma } = useCronogramaDados();
  const {
    funcionarioDocumentos,
    handleUploadFuncionarioDocumento,
    handleUpdateValidadeDocumento,
    handleDeleteFuncionarioDocumento,
    handleDownloadFuncionarioDocumento,
  } = useFuncionarioDocumentosDados();

  return (
    <EquipeTab
      funcionarios={funcionarios}
      projetos={projetos}
      cronograma={cronograma}
      loading={loading}
      funcionarioDocumentos={funcionarioDocumentos}
      onAddFuncionario={handleAddFuncionario}
      onUpdateFuncionario={handleUpdateFuncionario}
      onUpdateStatusFuncionario={handleUpdateStatusFuncionario}
      onUpdateSalarioFuncionario={handleUpdateSalarioFuncionario}
      onUploadFuncionarioDocumento={handleUploadFuncionarioDocumento}
      onUpdateValidadeDocumento={handleUpdateValidadeDocumento}
      onDeleteFuncionarioDocumento={handleDeleteFuncionarioDocumento}
      onDownloadFuncionarioDocumento={handleDownloadFuncionarioDocumento}
    />
  );
}
