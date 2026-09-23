import { lazy, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import {
  useClientesDados,
  useControladoriaDados,
  useFinanceiroDados,
  useFuncionariosDados,
  useProjetosDados,
  usePropostasDados,
  useResumoObrasDados,
} from '../../contexts/DadosContext';
import { montarControladoria, type FontesControladoria } from '../../lib/controladoria';

const DashboardOverview = lazy(() => import('../DashboardOverview'));

/**
 * Os conectores (`abas/*Conectado`) são a única coisa que sabe ligar um contexto
 * a uma tela. A tela continua recebendo props — dá para montá-la num teste ou
 * numa outra árvore sem arrastar 19 provedores junto —, e o `App` deixa de
 * conhecer os dois lados.
 *
 * Cada conector assina só os domínios da sua aba. Antes, com tudo no `App`, um
 * lançamento financeiro re-renderizava o painel de indicadores.
 */
export default function DashboardConectado() {
  const { profile } = useAuth();
  const { navigateTab } = useNavegacao();
  const { clientes } = useClientesDados();
  const { propostas } = usePropostasDados();
  const { projetos } = useProjetosDados();
  /**
   * Três assinaturas a menos que antes — orçamento, cronograma e medições saíram
   * (§4.2, item 23). Não é só volume de rede: enquanto o painel assinava os três,
   * qualquer escrita no console da obra o re-renderizava inteiro, mesmo estando
   * em outra aba.
   */
  const { resumos, desvios, atrasos, medicoesRecentes } = useResumoObrasDados();
  const { funcionarios } = useFuncionariosDados();
  // O administrador combina os agregados financeiros com os operacionais no
  // mesmo painel. A ativação dessas leituras continua condicionada ao papel em
  // NavegacaoContext; para os demais perfis os hooks devolvem listas vazias.
  const { margensObra, lancamentos, resultadoObras } = useFinanceiroDados();
  const { custos, compromissos, loading: controleLoading, recarregar } = useControladoriaDados();
  const fontesEmpresa = useMemo<FontesControladoria>(() => ({
    propostas, projetos, resultados: resultadoObras, resumos, margens: margensObra,
    lancamentos, medicoesRecentes, custos, compromissos,
  }), [propostas, projetos, resultadoObras, resumos, margensObra, lancamentos, medicoesRecentes, custos, compromissos]);
  const admin = profile?.role === 'admin';
  const quadroEmpresa = useMemo(() => admin ? montarControladoria(fontesEmpresa) : null, [admin, fontesEmpresa]);

  return (
    <DashboardOverview
      clientes={clientes}
      propostas={propostas}
      projetos={projetos}
      resumos={resumos}
      desvios={desvios}
      atrasos={atrasos}
      medicoesRecentes={medicoesRecentes}
      equipeCount={funcionarios.filter((f) => f.status === 'Ativo').length}
      nomeUsuario={profile?.full_name}
      role={profile?.role}
      onNavigate={navigateTab}
      quadroEmpresa={quadroEmpresa}
      controleLoading={controleLoading}
      onRecarregar={recarregar}
      lancamentos={admin ? lancamentos : undefined}
    />
  );
}
