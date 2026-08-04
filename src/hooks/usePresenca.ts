import { useEffect, useState } from 'react';

/**
 * Segura um elemento montado enquanto a animação de saída roda.
 *
 * É a única coisa que o `AnimatePresence` fazia e o CSS não faz sozinho (§4.7).
 * Um nó desmontado some no mesmo quadro: sem isto, fechar um diálogo é um corte
 * seco, e a gaveta do menu desaparece em vez de deslizar para fora.
 *
 *     const { montado, saindo } = usePresenca(open, 150);
 *     if (!montado) return null;
 *     <div className={saindo ? 'anim-fade-sai' : 'anim-fade-entra'} />
 *
 * `duracao` é o contrato com a classe de saída em `index.css`: precisa ser >= a
 * duração da animação, senão o nó é removido no meio dela. Um timer, e não
 * `animationend`, porque o evento não é confiável aqui — ele não dispara se o
 * elemento estiver em `display:none` (aba de fundo, por exemplo), e o diálogo
 * ficaria montado para sempre, com a armadilha de foco ligada.
 */
export function usePresenca(aberto: boolean, duracao: number): { montado: boolean; saindo: boolean } {
  const [montado, setMontado] = useState(aberto);

  useEffect(() => {
    if (aberto) {
      setMontado(true);
      return;
    }
    if (!montado) return;
    const t = setTimeout(() => setMontado(false), duracao);
    return () => clearTimeout(t);
  }, [aberto, montado, duracao]);

  return { montado, saindo: montado && !aberto };
}
