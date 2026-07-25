import { useEffect, useRef } from 'react';

/**
 * Fecha um overlay com Esc.
 *
 * Nenhum modal da aplicação respondia ao teclado: sair de um diálogo exigia
 * acertar o "✕" ou o backdrop com o mouse — o que deixa de fora quem navega
 * por teclado e quebra a expectativa mais básica de um diálogo.
 *
 * Escuta em `keydown` na janela, não no contêiner, porque o foco costuma
 * estar num input dentro do modal e o evento não subiria até um handler
 * pendurado no overlay.
 */
export function useEscapeParaFechar(ativo: boolean, aoFechar: () => void) {
  // O callback normalmente é uma seta recriada a cada render. Guardá-lo numa
  // ref evita remontar o listener a cada render e, ao mesmo tempo, impede que
  // o handler fique preso a um closure antigo.
  const callback = useRef(aoFechar);
  callback.current = aoFechar;

  useEffect(() => {
    if (!ativo) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        callback.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ativo]);
}
