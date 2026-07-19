import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from './FeedbackContext';
import Spinner from './Spinner';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { toast } = useFeedback();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Preencha e-mail e senha.');
      return;
    }
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);
    if (error) {
      toast.error('Não foi possível entrar.', error);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm bg-white border border-slate-100 rounded-xl shadow-sm p-7"
      >
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/15">
            <span className="font-bold text-white text-base tracking-tighter">v</span>
          </div>
          <div className="text-left">
            <div className="flex items-baseline gap-0.5">
              <h1 className="font-bold text-slate-900 text-base tracking-tight leading-none">analizze</h1>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 block" />
            </div>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestão de Obras</p>
          </div>
        </div>

        <h2 className="text-sm font-bold text-slate-800 mb-1">Entrar</h2>
        <p className="text-xs text-slate-500 mb-5">Acesse com seu e-mail e senha cadastrados.</p>

        <form onSubmit={handleSubmit} className="space-y-3.5" autoComplete="on">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">E-mail</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com.br"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-600 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Senha</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-600 outline-none transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold py-2.5 rounded-lg transition shadow-sm"
          >
            {isSubmitting ? <Spinner size={14} /> : <LogIn size={14} />}
            Entrar
          </button>
        </form>

        <p className="text-[10px] text-slate-400 mt-5 text-center">
          Sem acesso? Peça a um administrador para criar sua conta.
        </p>
      </motion.div>
    </div>
  );
}
