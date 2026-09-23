import { useCallback, useEffect, useState } from 'react';

/**
 * Tema claro/escuro. A escolha é conveniência DESTE navegador (monitor do
 * escritório à noite, notebook no sol da obra), por isso vive em
 * `localStorage` — e o `index.html` a aplica antes da primeira pintura.
 *
 * Sem escolha salva, vale o sistema operacional (`prefers-color-scheme`, em
 * tema.css). O alternador passa a gravar uma escolha explícita.
 */
export type Tema = 'light' | 'dark';
const CHAVE = 'analizze:tema';

function temaEfetivo(): Tema {
  const d = document.documentElement.dataset.theme;
  if (d === 'dark' || d === 'light') return d;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(() => (typeof document === 'undefined' ? 'light' : temaEfetivo()));

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const aoMudar = () => { if (!document.documentElement.dataset.theme) setTema(temaEfetivo()); };
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  const alternar = useCallback(() => {
    const novo: Tema = temaEfetivo() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem(CHAVE, novo); } catch { /* navegador sem storage: vale só nesta sessão */ }
    setTema(novo);
  }, []);

  return { tema, alternar };
}
