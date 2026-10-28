import React, { useState } from 'react';
import { Lock, Mail, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from './FeedbackContext';
import Spinner from './Spinner';
import { Button, Field, Input, Marca } from './ui';
import { useValidacao } from '../hooks/useValidacao';
import { vazio } from '../lib/validacao';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'email' | 'senha'>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        { campo: 'email', invalido: vazio(email), erro: 'Informe seu e-mail.' },
        { campo: 'senha', invalido: vazio(password), erro: 'Informe sua senha.' },
      ])
    ) return;
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);
    if (error) {
      toast.error('Não foi possível entrar.', error);
    }
  };

  return (
    <div className="grid min-h-dvh bg-slate-50 lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
      {/* O painel da marca: azul sólido, recolhido em bloco arredondado, com a
          composição de cartões que o app usa. Só acima de `lg` — no celular a
          tela é o formulário e nada mais. */}
      <aside className="relative m-4 hidden overflow-hidden rounded-[2rem] bg-acao p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <span className="inline-flex items-center gap-2.5 text-lg font-bold tracking-[-0.02em]">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 32 32"><path d="M9.5 23.5 16 8.5l6.5 15" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M12.2 18.5h7.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </span>
          analizze
        </span>
        <CartoesDecorativos />
        <div className="max-w-md">
          <p className="titulo-pagina">Da proposta aceita à margem real da obra, sem planilha paralela.</p>
          <p className="mt-4 text-sm text-white/85">
            Orçamento, cronograma, medição de campo e financeiro no mesmo lugar.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm anim-cartao">
        <div className="mb-8 lg:hidden">
          <Marca tamanho={36} legenda="Gestão de obras" />
        </div>

        <h1 className="titulo-pagina text-slate-900">Entrar</h1>
        <p className="mt-1.5 mb-7 text-sm text-slate-500">Acesse com seu e-mail e senha cadastrados.</p>

        <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={handleSubmit} className="space-y-3.5" autoComplete="on">
          <Field label="E-mail" erro={erros.email} required>
            {(props) => (
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  {...props}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); limparErro('email'); }}
                  placeholder="voce@empresa.com.br" className="pl-9 pr-3"
                />
              </div>
            )}
          </Field>

          <Field label="Senha" erro={erros.senha} required>
            {(props) => (
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); limparErro('senha'); }}
                  placeholder="••••••••" className="pl-9 pr-3"
                />
              </div>
            )}
          </Field>

          <Button
            type="submit"
            disabled={isSubmitting} bloco
          >
            {isSubmitting ? <Spinner size={14} /> : <LogIn size={14} />}
            Entrar
          </Button>
        </form>

        <p className="text-2xs text-slate-500 mt-5 text-center">
          Sem acesso? Peça a um administrador para criar sua conta.
        </p>
      </div>
      </main>
    </div>
  );
}

/**
 * A fita da trena, graduada em centímetros com o numeral a cada dezena — o
 * mesmo desenho que `<Trena>` usa em escala de percentual. Decorativa.
 */
function CartoesDecorativos() {
  return (
    <div aria-hidden="true" className="mx-auto grid w-full max-w-sm gap-3">
      {[72, 45, 90].map((pct, i) => (
        <div key={i} className="rounded-2xl bg-white/12 p-4 backdrop-blur-sm" style={{ marginLeft: i === 1 ? '2.5rem' : 0, marginRight: i === 1 ? 0 : '2.5rem' }}>
          <div className="h-2.5 w-1/3 rounded-full bg-white/45" />
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
