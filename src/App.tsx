/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuth } from './contexts/AuthContext';
import { NavegacaoProvider } from './contexts/NavegacaoContext';
import { DadosProvider } from './contexts/DadosContext';
import { AcoesProvider } from './contexts/AcoesContext';
import AppShell from './components/shell/AppShell';
import AcessoIndisponivel from './components/AcessoIndisponivel';
import LoginScreen from './components/LoginScreen';
import Spinner from './components/Spinner';

/**
 * O que sobrou do `App`: decidir se há alguém autenticado e ativo, e montar a
 * árvore de contextos.
 *
 * Eram 815 linhas fazendo quatro trabalhos — instanciar 19 hooks, definir 12
 * handlers de composição, manter a navegação e montar as 10 abas com 10 a 49
 * props cada (§1.2 da auditoria). Cada um desses quatro virou um lugar próprio:
 * `NavegacaoContext`, `DadosContext`, `AcoesContext` e `components/abas/`.
 *
 * A ordem dos provedores importa: `AcoesProvider` compõe escritas de vários
 * domínios e navega depois de converter uma proposta em obra, então precisa dos
 * outros dois já montados.
 *
 * As guardas ficam ANTES da árvore, e isso é estrutural: os hooks de dados só
 * são montados para uma sessão ativa. Antes eles rodavam acima do primeiro
 * `return`, e um acesso desativado ainda disparava as ~7 buscas do conjunto do
 * painel — todas voltando vazias pela RLS. Era o motivo de `ativo()` precisar
 * consultar `active`; hoje não precisa.
 */
export default function App() {
  const { session, profile, active, profileError, loading: authLoading, signOut } = useAuth();

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC] text-blue-600">
        <Spinner size={24} />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  /**
   * Autenticado, mas sem permissão de uso. Desde
   * `20260802100001_papel_respeita_active.sql` a RLS já barra tudo para perfil
   * desativado (`fn_current_role` devolve NULL) — sem esta guarda o usuário veria
   * a aplicação inteira vazia e sem explicação, que é justamente o "estado
   * morto" apontado no §5.2 da auditoria. Cobre também a falha de leitura do
   * perfil, em que `role` nulo esconde todas as abas.
   */
  if (!active) {
    return (
      <AcessoIndisponivel
        erro={profileError}
        email={profile?.email ?? session.user.email}
        onSignOut={signOut}
      />
    );
  }

  return (
    <NavegacaoProvider>
      <DadosProvider>
        <AcoesProvider>
          <AppShell />
        </AcoesProvider>
      </DadosProvider>
    </NavegacaoProvider>
  );
}
