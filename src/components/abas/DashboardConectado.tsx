import { lazy, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import {
  useClientesDados,
  useControladoriaDados,
  useFinanceiroDados,
  useFuncionariosDados,
  useIndicadoresDados,
  useProjetosDados,
  usePropostasDados,
  useResumoObrasDados,
  useTarefasDados,
} from '../../contexts/DadosContext';
import { montarControladoria, type FontesControladoria } from '../../lib/controladoria';

const PainelIndicadores = lazy(() => import('../indicadores/PainelIndicadores'));
const DashboardOverview = lazy(() => import('../DashboardOverview'));

/**
 * Os conectores (`abas/*Conectado`) são a única coisa que sabe ligar um contexto
 * a uma tela. A tela continua recebendo props — dá para montá-la num teste ou
 * numa outra árvore sem arrastar 19 provedores junto —, e o `App` deixa de
 * conhecer os dois lados.
 *
 * Cada conector assina só os domínios da sua aba. Antes, com tudo no `App`, um
 * lançamento financeiro re-renderizava o painel de indicadores.
 *
 * Desde 15/nov/2026 a aba é o painel de BI (`PainelIndicadores`); o painel
 * antigo (`DashboardOverview`) virou a seção "Para agir agora" da Visão Geral,
 * e chega pronto aqui para o painel não precisar assinar propostas e
 * controladoria só para repassá-los.
 */
export default function DashboardConectado() {
  const { profile } = useAuth();
  const { navigateTab } = useNavegacao();
  const { clientes } = useClientesDados();
  const { propostas } = usePropostasDados();
  const { projetos } = useProjetosDados();
  const { tarefas } = useTarefasDados();
  /**
   * Três assinaturas a menos que antes — orçamento, cronograma e medições saíram
   * (§4.2, item 23). Não é só volume de rede: enquanto o painel assinava os três,
   * qualquer escrita no console da obra o re-renderizava inteiro, mesmo estando
   * em outra aba.
   */
  const { resumos, desvios, atrasos, medicoesRecentes, recarregar: recarregarResumos } = useResumoObrasDados();
  const { funcionarios } = useFuncionariosDados();
  const indicadores = useIndicadoresDados();
  // O administrador combina os agregados financeiros com os operacionais no
  // mesmo painel. A ativação dessas leituras continua condicionada ao papel em
  // NavegacaoContext; para os demais perfis os hooks devolvem listas vazias.
  const { margensObra, lancamentos, resultadoObras } = useFinanceiroDados();
  const { custos, compromissos, loading: controleLoading, recarregar: recarregarControle } = useControladoriaDados();
  const fontesEmpresa = useMemo<FontesControladoria>(() => ({
    propostas, projetos, resultados: resultadoObras, resumos, margens: margensObra,
    lancamentos, medicoesRecentes, custos, compromissos,
  }), [propostas, projetos, resultadoObras, resumos, margensObra, lancamentos, medicoesRecentes, custos, compromissos]);
  const admin = profile?.role === 'admin';
  const quadroEmpresa = useMemo(() => admin ? montarControladoria(fontesEmpresa) : null, [admin, fontesEmpresa]);

  const { recarregar: recarregarIndicadores } = indicadores;
  // "Atualizar dados" atualiza tudo que a tela mostra: as linhas do BI, o
  // resumo por obra (avanço, atrasos) e, para o administrador, a controladoria.
  const recarregar = useCallback(() => {
    void Promise.all([recarregarIndicadores(), recarregarResumos(), admin ? recarregarControle() : Promise.resolve()]);
  }, [recarregarIndicadores, recarregarResumos, recarregarControle, admin]);
  const abrirObra = useCallback((id: string) => navigateTab('projetos', id), [navigateTab]);

  return (
    <PainelIndicadores
      dados={indicadores.dados}
      acesso={indicadores.acesso}
      carregando={indicadores.loading}
      atualizando={indicadores.atualizando}
      erro={indicadores.erro}
      onRecarregar={recarregar}
      projetos={projetos}
      resumos={resumos}
      tarefas={tarefas}
      clientes={clientes}
      funcionarios={funcionarios}
      nomeUsuario={profile?.full_name}
      onAbrirObra={abrirObra}
      foraDosFiltros={
        <DashboardOverview
          clientes={clientes}
          propostas={propostas}
          projetos={projetos}
          resumos={resumos}
          desvios={desvios}
          atrasos={atrasos}
          role={profile?.role}
          onNavigate={navigateTab}
          quadroEmpresa={quadroEmpresa}
          controleLoading={controleLoading}
          lancamentos={admin ? lancamentos : undefined}
        />
      }
    />
  );
}
