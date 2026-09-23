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
      {/* A carcaça: o painel grafite com a fita da trena atravessando. Só
          acima de `lg` — no celular a tela é o formulário e nada mais. */}
      <aside data-ilha="escura" className="relative hidden overflow-hidden bg-carcaca lg:flex lg:flex-col lg:justify-between p-12">
        <Marca tamanho={40} legenda="Gestão de obras" />
        <div className="max-w-md">
          <p className="titulo-pagina text-slate-900">Da proposta aceita à margem real da obra, sem planilha paralela.</p>
          <p className="mt-4 text-sm text-slate-600">
            Orçamento, cronograma, medição de campo e financeiro no mesmo lugar — o que o campo mede vira avanço e faturamento.
          </p>
        </div>
        <FitaDeTrena />
      </aside>

      <main className="flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm anim-cartao">
        <div className="mb-8 lg:hidden">
          <Marca tamanho={36} legenda="Gestão de obras" />
        </div>

        <h1 className="titulo-pagina text-slate-900">Entrar</h1>
        <p className="mt-1.5 mb-7 text-xs text-slate-500">Acesse com seu e-mail e senha cadastrados.</p>

        <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={handleSubmit} className="space-y-3.5" autoComplete="on">
          <Field label="E-mail" erro={erros.email} required>
            {(props) => (
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-2.5 text-slate-500" />
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
                <Lock size={14} className="absolute left-3 top-2.5 text-slate-500" />
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
function FitaDeTrena() {
  const marcas = Array.from({ length: 121 }, (_, i) => i);
  return (
    <svg viewBox="0 0 1200 96" className="-mx-12 w-[calc(100%+6rem)]" aria-hidden="true" preserveAspectRatio="xMinYMid slice">
      <rect x="0" y="12" width="1200" height="72" fill="var(--color-trena)" />
      {marcas.map((i) => {
        const x = 8 + i * 10;
        const h = i % 10 === 0 ? 34 : i % 5 === 0 ? 24 : 14;
        return <rect key={i} x={x} y="12" width={i % 10 === 0 ? 2 : 1.2} height={h} fill="var(--color-trena-tinta)" />;
      })}
      {marcas.filter((i) => i % 10 === 0 && i > 0).map((i) => (
        <text
          key={i}
          x={8 + i * 10 + 5}
          y="70"
          fill={i % 50 === 0 ? 'var(--color-perigo)' : 'var(--color-trena-tinta)'}
          fontFamily="Barlow Semi Condensed, sans-serif"
          fontWeight="700"
          fontSize="20"
        >
          {i}
        </text>
      ))}
    </svg>
  );
}
