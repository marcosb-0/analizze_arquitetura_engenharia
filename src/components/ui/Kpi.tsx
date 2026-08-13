import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { FOCO } from './tokens';

/**
 * Um número de destaque com o seu rótulo — sem caixa.
 *
 * ## Por que o indicador perdeu a moldura
 *
 * A fileira de quatro KPIs era quatro cards de `p-3.5` com borda, sombra, um
 * chip colorido de ícone e uma setinha de "abre em". Somados, ~64 px de cada
 * card iam para moldura e ícone, e o número — a única coisa que alguém lê de
 * longe — ficava com o resto. Quatro caixas iguais lado a lado também não
 * agrupam nada: elas só repetem a mesma borda quatro vezes.
 *
 * Sem caixa, o par rótulo + número já se lê como uma unidade, e o espaço que
 * sobrou foi para o número.
 *
 * **Régua vertical entre os KPIs foi tentada e descartada.** Ela exige
 * `nth-child` por breakpoint para apagar a borda do primeiro de cada linha, e
 * `border-l` e `border-l-0` são a MESMA propriedade — quem vence é a ordem no
 * CSS, não a ordem no atributo. É a disputa de utilitários que `CAMPO_LARGURA`
 * e `CONTROLE_ALTURA` documentam, e o modo de falha seria uma linha sobrando na
 * borda esquerda em só um tamanho de tela. O `gap` separa o suficiente, e o
 * divisor que fecha o bloco é o do cabeçalho da `<Secao>` acima.
 *
 * ## O clique
 *
 * Três dos quatro KPIs do painel navegam. Clicável vira `<button>` de verdade
 * (foco de teclado, Enter e Espaço de graça — o `<div onClick>` que estava lá
 * não tinha nada disso). O retorno visual é a cor do número e a seta, não um
 * fundo: fundo em item de grid pede padding, padding pede margem negativa, e
 * margem negativa desalinha a fileira inteira.
 */

interface KpiProps {
  rotulo: string;
  /** O número já formatado. */
  valor: React.ReactNode;
  /** Linha secundária — comparação, total, percentual. */
  detalhe?: React.ReactNode;
  /** Decorativo. O nome acessível é o rótulo. */
  icone?: React.ReactNode;
  /** Com clique o KPI vira botão e ganha a seta de "leva para". */
  onClick?: () => void;
  className?: string;
  id?: string;
}

export function Kpi({ rotulo, valor, detalhe, icone, onClick, className = '', id }: KpiProps) {
  const conteudo = (
    <>
      <span className="flex items-center gap-1.5 text-2xs font-bold text-slate-500 uppercase tracking-wider">
        {icone && (
          <span className="shrink-0" aria-hidden="true">
            {icone}
          </span>
        )}
        <span className="truncate">{rotulo}</span>
        {/* A seta é o que diz que o número leva a algum lugar sem depender do
            hover — quem chega de teclado ou de toque não passa o mouse. */}
        {onClick && <ArrowUpRight size={13} className="shrink-0 text-slate-500 group-hover:text-blue-700 transition" aria-hidden="true" />}
      </span>
      <span className="block text-xl font-bold text-slate-900 data-font mt-1 group-hover:text-blue-700 transition">
        {valor}
      </span>
      {detalhe && <span className="block text-2xs text-slate-500 mt-0.5 leading-snug">{detalhe}</span>}
    </>
  );

  if (!onClick) {
    return (
      <div id={id} className={className}>
        {conteudo}
      </div>
    );
  }

  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className={`group text-left rounded-lg ${FOCO} ${className}`}
    >
      {conteudo}
    </button>
  );
}

/**
 * A fileira de KPIs. Duas colunas no celular (um número por linha inteira
 * desperdiça a tela sem ganhar leitura) e o número pedido a partir de `md`.
 *
 * `gap-x-8` é o dobro do espaço entre cards de antes: é ele que faz o papel que
 * a borda fazia, e com menos espaço os pares rótulo/número encostam e voltam a
 * parecer uma coisa só.
 */
interface FaixaKpisProps {
  colunas?: 2 | 3 | 4;
  children: React.ReactNode;
  className?: string;
  id?: string;
}

const COLUNAS = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
} as const;

export function FaixaKpis({ colunas = 4, children, className = '', id }: FaixaKpisProps) {
  return (
    <div id={id} className={`grid ${COLUNAS[colunas]} gap-x-8 gap-y-6 ${className}`}>
      {children}
    </div>
  );
}
