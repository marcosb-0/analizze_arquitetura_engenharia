import { lazy, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { FileiraPilulas, Pilula } from '../ui';
import {
  useCargaEquipeDados,
  useCentrosCustoDados,
  useEmpresaConfigDados,
  useFuncionarioDocumentosDados,
  useFuncionariosDados,
  useProjetosDados,
} from '../../contexts/DadosContext';

const EquipeTab = lazy(() => import('../EquipeTab'));
const CustoMaoDeObra = lazy(() => import('../equipe/CustoMaoDeObra'));

type Visao = 'pessoas' | 'custos';

/** `?secao=custos` — o mesmo parâmetro que a seção tinha em Configurações. */
function visaoDaUrl(): Visao {
  return new URLSearchParams(window.location.search).get('secao') === 'custos' ? 'custos' : 'pessoas';
}

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
  const { centrosCusto } = useCentrosCustoDados();
  /**
   * As frentes ABERTAS de todas as obras, e não o cronograma inteiro (§4.2, item
   * 23): a tela já descartava as concluídas em memória, e `useCronograma` agora
   * carrega só a obra aberta no console.
   */
  const { etapasAtivas } = useCargaEquipeDados();
  const {
    funcionarioDocumentos,
    handleUploadFuncionarioDocumento,
    handleUpdateValidadeDocumento,
    handleDeleteFuncionarioDocumento,
    handleDownloadFuncionarioDocumento,
  } = useFuncionarioDocumentosDados();
  /**
   * Os encargos e a jornada padrão da empresa. A ficha só sobrescreve o que
   * for diferente, então sem isto não há custo/hora para mostrar. Desde
   * 25/set/2026 a edição desses parâmetros também mora aqui (visão "Custo da
   * mão de obra"), e não mais em Configurações.
   */
  const { empresa, rubricas, handleSaveEmpresa, handleSaveRubricas, handleCriarRubrica, handleExcluirRubrica } =
    useEmpresaConfigDados();
  const { role } = useAuth();

  const [visao, setVisao] = useState<Visao>(visaoDaUrl);
  const mudarVisao = (proxima: Visao) => {
    setVisao(proxima);
    const url = new URL(window.location.href);
    if (proxima === 'custos') url.searchParams.set('secao', 'custos');
    else url.searchParams.delete('secao');
    window.history.replaceState(window.history.state, '', url);
  };
  const seletor = (
    <FileiraPilulas rotulo="Visão da equipe">
      <Pilula ativo={visao === 'pessoas'} onClick={() => mudarVisao('pessoas')}>Pessoas</Pilula>
      <Pilula ativo={visao === 'custos'} onClick={() => mudarVisao('custos')}>Custo da mão de obra</Pilula>
    </FileiraPilulas>
  );

  if (visao === 'custos') {
    return (
      <CustoMaoDeObra
        seletor={seletor}
        funcionarios={funcionarios}
        empresa={empresa}
        rubricas={rubricas}
        // Mesma fronteira da RLS de `empresa_config` e `encargos_rubricas`.
        editavel={role === 'admin' || role === 'gestao'}
        onSaveEmpresa={handleSaveEmpresa}
        onSaveRubricas={handleSaveRubricas}
        onCreate={handleCriarRubrica}
        onDelete={handleExcluirRubrica}
      />
    );
  }

  return (
    <EquipeTab
      seletorVisao={seletor}
      funcionarios={funcionarios}
      centrosCusto={centrosCusto}
      projetos={projetos}
      empresa={empresa}
      rubricas={rubricas}
      cronograma={etapasAtivas}
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
