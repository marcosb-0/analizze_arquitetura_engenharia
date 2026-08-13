import React from 'react';
import type { PropsNativas } from './tipos';

/**
 * Um trecho de página com título — a unidade do layout "seções abertas".
 *
 * ## O que ela substitui, e por quê
 *
 * O app agrupava por MOLDURA: quase tudo que tinha um título tinha também fundo
 * branco, borda e sombra. Numa tela com dez agrupamentos isso são dez retângulos
 * disputando a atenção, cada um com padding próprio comendo largura, e o
 * conteúdo de cada um espremido no que sobra — o "comprime muita coisa" do
 * relato. Pior no aninhado: o painel financeiro tinha card dentro de card dentro
 * de grid, três bordas entre o olho e o número.
 *
 * Aqui o agrupamento é feito por TÍTULO e por ESPAÇO (`SECAO_ESPACO`), que é
 * como um documento faz. Não há fundo, borda nem sombra: o conteúdo assenta
 * direto sobre o cinza do shell e usa a largura inteira da coluna.
 *
 * A régua de quando NÃO usar isto — a moldura continua certa quando ela delimita
 * um alvo, não um assunto: item clicável de lista, cartão de obra ou de tarefa,
 * e o bloco colorido de alerta, onde a cor de fundo é a informação. Para esses,
 * `<Card>`.
 *
 * O divisor é `border-b` sob o cabeçalho, e não uma linha solta acima da seção:
 * assim ele pertence ao título e acompanha a coluna quando duas seções ficam
 * lado a lado num grid.
 */

interface SecaoProps extends PropsNativas<HTMLElement> {
  titulo: React.ReactNode;
  /** Uma linha de contexto sob o título. */
  descricao?: React.ReactNode;
  /** Botões, filtros ou selo à direita do título — o papel do antigo `CardHeader actions`. */
  acoes?: React.ReactNode;
  /** Ícone à esquerda do título. Decorativo: o texto do título é o nome acessível. */
  icone?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Secao({ titulo, descricao, acoes, icone, children, className = '', ...rest }: SecaoProps) {
  return (
    <section className={className} {...rest}>
      <div className="flex items-end justify-between gap-3 border-b border-slate-200 pb-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {icone && (
            <span className="text-slate-500 shrink-0" aria-hidden="true">
              {icone}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 leading-tight truncate">{titulo}</h2>
            {descricao && <p className="text-2xs text-slate-500 mt-0.5 leading-snug">{descricao}</p>}
          </div>
        </div>
        {acoes && <div className="flex items-center gap-2 shrink-0">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}
