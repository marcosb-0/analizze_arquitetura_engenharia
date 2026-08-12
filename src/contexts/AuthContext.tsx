import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { Database, Role } from '../lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextProps {
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  /**
   * Se este acesso está habilitado. Desde
   * `20260802100001_papel_respeita_active.sql`, `fn_current_role()` devolve NULL
   * para perfil desativado, então a RLS já barra tudo no servidor — mas sem
   * checagem aqui o usuário veria um app inteiro vazio sem nenhuma explicação
   * (era o "estado morto" do §5.2 da auditoria). Ver a tela em App.tsx.
   *
   * `false` quando o perfil não pôde ser carregado: sem perfil não há papel, e
   * fingir que está ativo só empurra a falha para a primeira consulta.
   */
  active: boolean;
  /**
   * `true` quando o cadastro existe mas nunca passou pela mão de um admin.
   *
   * É o terceiro estado de "não pode usar o sistema", e ele precisa de nome
   * próprio porque `active = false` cobre dois casos que pedem conversas
   * opostas: quem acabou de se cadastrar está na fila, quem foi desligado teve o
   * acesso cortado. Dizer "seu acesso foi desativado" a quem nunca teve acesso
   * manda a pessoa reclamar de algo que não aconteceu.
   *
   * Só é `true` com o perfil lido — falha de leitura é `profileError`, e ali não
   * dá para afirmar nada sobre aprovação.
   */
  aguardandoAprovacao: boolean;
  /** Distingue "perfil carregado e desativado" de "perfil não carregou". */
  profileError: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    // A leitura do próprio perfil continua permitida mesmo desativado:
    // `profiles_select_own_or_admin` casa por `id = auth.uid()`, que não passa
    // por fn_current_role(). É o que permite descobrir `active = false` e
    // mostrar a tela certa em vez de um app vazio.
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) {
      console.error('Falha ao carregar perfil do usuário:', error.message);
      setProfile(null);
      setProfileError(error.message);
      return;
    }
    setProfile(data);
    setProfileError(null);
  };

  useEffect(() => {
    // Dedupe (auditoria-360 D1): `getSession()` e `onAuthStateChange` disparavam
    // AMBOS `loadProfile` para o mesmo usuário no boot — a mesma linha de
    // `profiles` era buscada ~2× a cada login. Guardar o último id carregado faz
    // o segundo gatilho pular quando nada mudou. `getSession` continua sendo a
    // fonte do estado inicial (resolve `loading`); `onAuthStateChange` cobre
    // login/logout/refresh e só recarrega o perfil quando o usuário muda.
    let ultimoPerfilCarregado: string | null = null;
    const carregarSeNovo = async (userId: string) => {
      if (userId === ultimoPerfilCarregado) return;
      ultimoPerfilCarregado = userId;
      await loadProfile(userId);
    };

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (initialSession?.user) {
        await carregarSeNovo(initialSession.user.id);
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        await carregarSeNovo(newSession.user.id);
      } else {
        ultimoPerfilCarregado = null;
        setProfile(null);
        setProfileError(null);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        role: profile?.role ?? null,
        // Sem perfil não há acesso: `active` só é verdadeiro com perfil lido e
        // habilitado. Ver o comentário no tipo.
        active: profile?.active === true,
        // `aprovado_em` nulo com perfil lido = nunca liberado por um admin.
        // Exige `profile` não-nulo: sem perfil, o estado é falha de leitura.
        aguardandoAprovacao: profile != null && profile.aprovado_em == null,
        profileError,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
