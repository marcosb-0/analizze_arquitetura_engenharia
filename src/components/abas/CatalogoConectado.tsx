import { lazy } from 'react';
import { useAcoes } from '../../contexts/AcoesContext';
import {
  useCatalogoDados,
  useFornecedoresDados,
  useEmpresaConfigDados,
  useProjetosDados,
  useSinapiDados,
} from '../../contexts/DadosContext';
import { EMPRESA_FALLBACK } from '../../constants/empresa';

const CatalogoTab = lazy(() => import('../CatalogoTab'));

export default function CatalogoConectado() {
  const {
    catalogo,
    total,
    loading,
    filtro,
    paginas,
    aplicarFiltro,
    recarregar,
    carregarDetalhe,
    handleAddCatalogoItem,
    handleUpdateCatalogoItem,
    handleSetAtivoCatalogoItem,
    carregarUsos,
    handleExcluirCatalogoItem,
    handleAddCotacao,
    handleDesativarCotacao,
    handleAdotarPrecoCotacao,
    handleAddComponente,
    handleUpdateComponente,
    handleRemoverComponente,
    buscarCandidatosComponente,
    carregarComposicao,
  } = useCatalogoDados();
  const { projetos } = useProjetosDados();
  const { fornecedores } = useFornecedoresDados();
  const { empresa } = useEmpresaConfigDados();
  const { adicionarInsumo, adicionarItemOrcamento } = useAcoes();
  const sinapi = useSinapiDados();

  return (
    <CatalogoTab
      catalogo={catalogo}
      total={total}
      loading={loading}
      filtro={filtro}
      paginas={paginas}
      projetos={projetos}
      fornecedores={fornecedores}
      aplicarFiltro={aplicarFiltro}
      recarregar={recarregar}
      carregarDetalhe={carregarDetalhe}
      onAddCatalogoItem={handleAddCatalogoItem}
      onUpdateCatalogoItem={handleUpdateCatalogoItem}
      onSetAtivoCatalogoItem={handleSetAtivoCatalogoItem}
      carregarUsosInsumo={carregarUsos}
      onExcluirCatalogoItem={handleExcluirCatalogoItem}
      onAddOrcamentoItem={adicionarItemOrcamento}
      onAddInsumoProjeto={adicionarInsumo}
      onAddCotacao={handleAddCotacao}
      onDesativarCotacao={handleDesativarCotacao}
      onAdotarPrecoCotacao={handleAdotarPrecoCotacao}
      onAddComponente={handleAddComponente}
      onUpdateComponente={handleUpdateComponente}
      onRemoverComponente={handleRemoverComponente}
      buscarCandidatosComponente={buscarCandidatosComponente}
      carregarComposicao={carregarComposicao}
      // Fallback de 8 h enquanto a configuração não chegou do servidor: a
      // conversão coeficiente ⇄ produtividade é de tela, e uma jornada
      // provisória é melhor que um campo travado esperando o fetch.
      jornadaDiaria={empresa?.jornadaDiariaHoras ?? EMPRESA_FALLBACK.jornadaDiariaHoras}
      sinapi={sinapi}
    />
  );
}
