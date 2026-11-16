import { lazy, useCallback, useState } from 'react';
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
const PresencaEquipe = lazy(() => import('../equipe/presenca/PresencaEquipe'));
const ChamadaCampo = lazy(() => import('../equipe/presenca/ChamadaCampo'));

type Visao = 'pessoas' | 'custos' | 'presenca';

/** `?secao=custos` — o mesmo parâmetro que a seção tinha em Configurações. */
function visaoDaUrl(): Visao {
  const secao = new URLSearchParams(window.location.search).get('secao');
  return secao === 'custos' || secao === 'presenca' ? secao : 'pessoas';
}

/**
 * Para o `campo`, Equipe É a chamada e nada mais: ele não lê `funcionarios`
 * (salário, CPF, conta) e a lista dele vem de `fn_funcionarios_chamada`. Sair
 * antes dos hooks de domínio é o que mantém a aba sem pedir dado nenhum que a
 * RLS devolveria vazio — `DADOS_EQUIPE_CAMPO` em `constants/abas.ts` é a outra
 * metade disso.
 */
export default function EquipeConectado() {
  const { role } = useAuth();
  if (role === 'campo') return <ChamadaCampo />;
  return <EquipeEscritorio />;
}

function EquipeEscritorio() {
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
  const { empresa, rubricas, gruposEncargo, handleSaveEmpresa, handleSaveRubricas, handleCriarRubrica, handleExcluirRubrica, handleCriarGrupoEncargo, handleExcluirGrupoEncargo } =
    useEmpresaConfigDados();
  const { role } = useAuth();

  const [visao, setVisao] = useState<Visao>(visaoDaUrl);
  /** A ficha que a visão de custo mandou abrir ao clicar num nome. */
  const [fichaInicial, setFichaInicial] = useState<string | null>(null);
  const mudarVisao = useCallback((proxima: Visao) => {
    setVisao(proxima);
    const url = new URL(window.location.href);
    if (proxima !== 'pessoas') url.searchParams.set('secao', proxima);
    else url.searchParams.delete('secao');
    window.history.replaceState(window.history.state, '', url);
    // A troca é instantânea; sem voltar ao topo, a outra visão abria no meio.
    document.getElementById('tab-viewport')?.scrollTo({ top: 0 });
  }, []);
  const verCustos = useCallback(() => mudarVisao('custos'), [mudarVisao]);
  const abrirFicha = useCallback((id: string) => { setFichaInicial(id); mudarVisao('pessoas'); }, [mudarVisao]);
  const seletor = (
    <FileiraPilulas rotulo="Visão da equipe">
      <Pilula ativo={visao === 'pessoas'} onClick={() => mudarVisao('pessoas')}>Pessoas</Pilula>
      <Pilula ativo={visao === 'presenca'} onClick={() => mudarVisao('presenca')}>Presença</Pilula>
      <Pilula ativo={visao === 'custos'} onClick={() => mudarVisao('custos')}>Custo da mão de obra</Pilula>
    </FileiraPilulas>
  );

  if (visao === 'presenca') {
    return (
      <PresencaEquipe
        seletor={seletor}
        funcionarios={funcionarios}
        // Mesma fronteira de `gestao_all_presencas`; `financeiro` só lê.
        editavel={role === 'admin' || role === 'gestao'}
      />
    );
  }

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
        onAbrirFicha={abrirFicha}
        gruposEncargo={gruposEncargo}
        onCriarGrupo={handleCriarGrupoEncargo}
        onExcluirGrupo={handleExcluirGrupoEncargo}
      />
    );
  }

  return (
    <EquipeTab
      seletorVisao={seletor}
      onVerCustos={verCustos}
      selecionadoInicial={fichaInicial}
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
