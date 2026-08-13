import React from 'react';
import type { PropsNativas } from './tipos';
import { PAGINA_LARGURA, SECAO_ESPACO, type LarguraPagina } from './tokens';

/**
 * A raiz de uma aba: largura máxima, centralização e o ritmo entre as seções.
 *
 * `#tab-viewport` continua burro de propósito — ele é só o scroller e o padding
 * externo. Quem declara a largura é a tela, porque a resposta certa depende do
 * conteúdo (ver o cabeçalho de `PAGINA_LARGURA`): a planilha de orçamento quer
 * `cheia`, o painel quer `painel`, o formulário de identidade quer `leitura`.
 *
 * O `w-full` ao lado do `max-w-*` não é redundante: `mx-auto` só centraliza um
 * bloco com largura definida, e um `<div>` filho de contêiner `flex` pode não
 * esticar sozinho.
 */

interface PaginaAbaProps extends PropsNativas<HTMLDivElement> {
  largura?: LarguraPagina;
  /**
   * `secoes` (padrão): a página é uma pilha de `<Secao>` e recebe o ritmo
   * vertical de `SECAO_ESPACO`.
   *
   * `livre`: a raiz é um grid ou flex declarado pela tela (mestre/detalhe). O
   * ritmo TEM de sair — `space-y-*` é `margin-top` no irmão, e num grid isso
   * empurra a segunda coluna 32 px para baixo da primeira. Sem esta prop a
   * saída seria um `!space-y-0` na tela, que é a disputa de utilitários que
   * `CAMPO_LARGURA` documenta, agora com `!important` para disfarçar.
   */
  fluxo?: 'secoes' | 'livre';
  children: React.ReactNode;
  className?: string;
}

export function PaginaAba({
  largura = 'painel',
  fluxo = 'secoes',
  children,
  className = '',
  ...rest
}: PaginaAbaProps) {
  return (
    <div
      className={`${PAGINA_LARGURA[largura]} mx-auto w-full ${fluxo === 'secoes' ? SECAO_ESPACO : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
