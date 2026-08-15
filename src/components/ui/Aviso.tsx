import React from 'react';
import { CHIP, type TomChip } from './tokens';

/**
 * A FAIXA DE AVISO — uma frase sobre o estado atual, com ou sem um botão ao
 * lado. "3 cadastros aguardando liberação", "esta proposta ainda não tem
 * contrato", "documento vencido".
 *
 * ## Por que virou primitivo
 *
 * O cabeçalho de `Card.tsx` já descrevia esta faixa como a exceção que mantém
 * moldura, e explicava por quê. O que ele não tinha era um componente: contadas
 * antes deste arquivo, **doze** faixas escritas à mão em nove telas, cada uma
 * escolhendo o próprio raio (`rounded`/`rounded-lg`), a própria borda
 * (`-100`/`-200`/`/50`) e o próprio par de tons — `bg-amber-50/50` num arquivo,
 * `bg-amber-50` no outro, `text-amber-800` num terceiro. É a mesma dívida que
 * `Chip` acabou de pagar no selo, um nível acima.
 *
 * ## Os tons são os do `Chip`, de propósito
 *
 * Um aviso âmbar e um selo âmbar aparecem na mesma tela o tempo todo (a
 * validade de um documento, o vencimento de uma conta). Com dois mapas de cor
 * eles saíam em dois âmbares, e a diferença lia como se significassem coisas
 * diferentes. Aqui a faixa e o selo compartilham `CHIP`, então "atenção" tem
 * uma cor só no app inteiro.
 *
 * O raio é o da SUPERFÍCIE (16px, `rounded-2xl`) e não o do controle: a faixa é
 * um bloco de conteúdo, irmã do `Card`, e as doze grafias à mão usavam o raio
 * de botão porque foram escritas antes de o sistema ter dois raios.
 *
 * `role="status"` e não `alert`: o conteúdo já está na tela quando ela renderiza
 * e não interrompe ninguém. `alert` faz o leitor de tela cortar a leitura em
 * curso, o que para "3 cadastros na fila" é desproporcional.
 */

interface AvisoProps {
  tom: TomChip;
  /** Ícone à esquerda. Decorativo — o texto é quem informa. */
  icone?: React.ReactNode;
  /**
   * Botão à direita.
   *
   * **Use `secundario` (ou `suave`), nunca `acao`/`fantasma`.** As duas
   * variantes sem fundo pintam o texto de `slate-500`, e cinza sobre um fundo
   * tingido é o caso que a régua de contraste não perdoa: medido no navegador,
   * o "Ver" em `acao` sobre o rosa do aviso negativo dá **4,36:1** — reprova o
   * piso de 4,5:1 por pouco, e só ali (sobre branco o mesmo botão passa). Com
   * fundo próprio o botão deixa de disputar contraste com o tom da faixa.
   */
  acoes?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Aviso({ tom, icone, acoes, children, className = '' }: AvisoProps) {
  const cores = CHIP[tom];
  return (
    <div
      role="status"
      className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-xs ${className}`}
      style={{ background: cores.fundo, color: cores.texto }}
    >
      {icone && (
        <span className="shrink-0" aria-hidden="true">
          {icone}
        </span>
      )}
      <div className="min-w-0 flex-1 leading-snug">{children}</div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </div>
  );
}
