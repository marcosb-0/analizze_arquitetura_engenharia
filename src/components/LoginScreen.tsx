import React, { useState } from 'react';
import { Lock, Mail, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from './FeedbackContext';
import Spinner from './Spinner';
import { Button, Field, Input } from './ui';
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
    <div className="flex h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-sm bg-white border border-slate-100 rounded-xl shadow-sm p-7 anim-cartao">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/15">
            <span className="font-bold text-white text-base tracking-tighter">A</span>
          </div>
          <div className="text-left">
            <div className="flex items-baseline gap-0.5">
              <h1 className="font-bold text-slate-900 text-base tracking-tight leading-none">analizze</h1>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 block" />
            </div>
            <p className="text-2xs text-slate-500 font-bold uppercase tracking-widest mt-1">Gestão de Obras</p>
          </div>
        </div>

        <h2 className="text-sm font-bold text-slate-800 mb-1">Entrar</h2>
        <p className="text-xs text-slate-500 mb-5">Acesse com seu e-mail e senha cadastrados.</p>

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
                  placeholder="voce@empresa.com.br" fundo="suave" className="pl-9 pr-3"
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
                  placeholder="••••••••" fundo="suave" className="pl-9 pr-3"
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
    </div>
  );
}
