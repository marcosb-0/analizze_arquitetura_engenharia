import { lazy, useCallback, useMemo } from 'react';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import {
  useClientesDados,
  useContratosDados,
  useEmpresaConfigDados,
  useModelosTextoDados,
  useProjetosDados,
} from '../../contexts/DadosContext';

const ContratosTab = lazy(() => import('../ContratosTab'));

export default function ContratosConectado() {
  const {
    contratos,
    clausulas,
    loading,
    carregandoDetalhe,
    carregarClausulas,
    handleUpdateContrato,
    handleUpdateStatusContrato,
    handleDeleteContrato,
    handleAddClausula,
    handleInserirModeloNoContrato,
    handleUpdateClausula,
    handleRemoveClausula,
    handleReordenarClausula,
  } = useContratosDados();
  const { clientes } = useClientesDados();
  const { projetos } = useProjetosDados();
  const { empresa } = useEmpresaConfigDados();
  const {
    modelos,
    handleAddModelo,
    handleUpdateModelo,
    handleAposentarModelo,
  } = useModelosTextoDados();
  const { navigateTab } = useNavegacao();

  const abrirObra = useCallback(
    (projetoId: string) => navigateTab('projetos', projetoId),
    [navigateTab]
  );

  // A aba de contratos não cria contrato: o caminho é a proposta aprovada.
  const irParaPropostas = useCallback(() => navigateTab('propostas'), [navigateTab]);

  /**
   * Agrupados e memoizados pelo mesmo motivo de `descritivo` em
   * PropostasConectado: `ContratosTab` é `memo`, e um literal de objeto teria
   * identidade nova a cada render — a aba repintaria a cada tecla digitada.
   */
  const clausulasProps = useMemo(
    () => ({
      onAdd: handleAddClausula,
      onInserirModelo: handleInserirModeloNoContrato,
      onUpdate: handleUpdateClausula,
      onRemove: handleRemoveClausula,
      onReordenar: handleReordenarClausula,
      onAddModelo: handleAddModelo,
      onUpdateModelo: handleUpdateModelo,
      onAposentarModelo: handleAposentarModelo,
    }),
    [handleAddClausula, handleInserirModeloNoContrato, handleUpdateClausula, handleRemoveClausula,
     handleReordenarClausula, handleAddModelo, handleUpdateModelo, handleAposentarModelo]
  );

  return (
    <ContratosTab
      contratos={contratos}
      clausulas={clausulas}
      modelos={modelos}
      clientes={clientes}
      projetos={projetos}
      empresa={empresa}
      loading={loading}
      carregandoDetalhe={carregandoDetalhe}
      carregarClausulas={carregarClausulas}
      onUpdateContrato={handleUpdateContrato}
      onMudarStatus={handleUpdateStatusContrato}
      onDeleteContrato={handleDeleteContrato}
      onAbrirObra={abrirObra}
      onIrParaPropostas={irParaPropostas}
      clausulasProps={clausulasProps}
    />
  );
}
