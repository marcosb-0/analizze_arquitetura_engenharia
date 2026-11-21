import React, { createElement } from 'react';
import { Typography } from '@heroui/react';

/**
 * Tipografia do HeroUI (`Typography`) por PAPEL — decisão de 21/nov/2026.
 *
 * O `type` do HeroUI é o visual; o elemento é o semântico, trocado pela prop
 * `render` como a especificação manda ("H1 visual style, h2 semantic
 * element"). Assim o título da página continua sendo `<h1>` com o visual de
 * `h3`, e a hierarquia do leitor de tela não depende do tamanho escolhido.
 *
 *   pagina  → h3  24px/600  (era `.titulo-pagina`, 28px)
 *   cartao  → h5  18px/600  (ficha, janela, cartão em destaque)
 *   bloco   → h6  16px/600  (título de seção dentro da página)
 *   item    → body-sm 14px semibold (título de item de lista/cartão pequeno)
 *   rotulo  → body-xs 12px semibold
 *
 * Corpo de texto é `<Typography type="body-sm">` direto (o `<p>` vem de graça);
 * apoio é `color="muted"`. Cor/espaço/truncar continuam em `className`.
 */
export type PapelTitulo = 'pagina' | 'cartao' | 'bloco' | 'item' | 'rotulo';

const TIPO = { pagina: 'h3', cartao: 'h5', bloco: 'h6', item: 'body-sm', rotulo: 'body-xs' } as const;

type Elemento = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div' | 'legend';

interface TituloProps extends Omit<React.HTMLAttributes<HTMLElement>, 'color'> {
  papel: PapelTitulo;
  /** O elemento semântico. O visual vem do papel. */
  como?: Elemento;
  color?: 'default' | 'muted';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  truncate?: boolean;
  children: React.ReactNode;
}

export function Titulo({ papel, como = 'h2', weight, ...rest }: TituloProps) {
  const pequeno = papel === 'item' || papel === 'rotulo';
  return (
    <Typography
      type={TIPO[papel]}
      weight={weight ?? (pequeno ? 'semibold' : undefined)}
      render={(props) => createElement(como, props)}
      {...rest}
    />
  );
}

export { Typography };
