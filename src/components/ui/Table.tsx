import React, { createContext, useContext } from 'react';

/**
 * Tabela de dados.
 *
 * Havia 13 tabelas e só 8 contêineres com `overflow-x-auto`: as restantes
 * estouravam horizontalmente e empurravam o layout da página inteira. Aqui o
 * scroll horizontal é do próprio contêiner, sempre.
 *
 * ## O cabeçalho fixo, e por que ele não funcionava (item (f) da Fase 5)
 *
 * `TabelaInsumos` já declarava `sticky top-0 z-10` nos dez `<Th>`, com um
 * comentário explicando que o contêiner do `TableWrap` é quem rola. Medido no
 * navegador: **o cabeçalho nunca grudou**. `overflow-x: auto` faz o eixo Y
 * computar `auto` junto (a especificação não deixa um eixo ficar `visible`
 * quando o outro não é), então o contêiner É um escopo de rolagem — mas com
 * altura automática ele nunca ROLA. `sticky top-0` ali gruda no topo de uma
 * caixa que não se move, e quem rola é o `#tab-viewport`, dois níveis acima.
 * Dez declarações que não faziam nada, e nada na tela denunciando.
 *
 * É o mesmo modo de falha que `CAMPO_LARGURA` e o `forma="circulo"` já
 * documentam: o JSX diz uma coisa e a tela mostra outra. Por isso o `sticky`
 * saiu da tela e virou consequência de `rolagem="propria"` — a única forma de
 * declarar o cabeçalho fixo é pedir o contêiner que o torna possível.
 */

/** Só o `TableWrap` sabe se existe rolagem vertical própria; o `Th` precisa saber. */
const RolagemPropria = createContext(false);

interface TableWrapProps {
  children: React.ReactNode;
  className?: string;
  /**
   * `pagina` (padrão): a tabela cresce e quem rola é a página. Certo para tabela
   * curta, e para a que vive dentro de um diálogo.
   *
   * `propria`: a tabela ganha altura máxima e rola por dentro — é o que faz o
   * `<Th>` grudar de verdade. Vale quando a tabela é a razão de a tela existir
   * (o catálogo, a razão de lançamentos), e o custo é uma rolagem aninhada, que
   * a §M conta como problema quando é gratuita.
   */
  rolagem?: 'pagina' | 'propria';
}

export function TableWrap({ children, className = '', rolagem = 'pagina' }: TableWrapProps) {
  const propria = rolagem === 'propria';
  return (
    <RolagemPropria.Provider value={propria}>
      <div className={`w-full ${propria ? 'overflow-auto max-h-[70vh]' : 'overflow-x-auto'} ${className}`}>
        <table className="w-full text-left border-collapse text-xs">{children}</table>
      </div>
    </RolagemPropria.Provider>
  );
}

const ALINHAMENTO = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
type Alinhamento = keyof typeof ALINHAMENTO;

/**
 * Coluna que não sai da tela quando se rola para o lado.
 *
 * A tabela do catálogo pede 1.340 px e mostra 738: rolar até "Preço vigente"
 * apagava a descrição, e as quatro colunas de dinheiro ficavam sem a que diz
 * DE QUEM é aquele número (§M, "cabeçalho de tabela não fixa" ⇄).
 *
 * O fundo é opaco por obrigação — célula `sticky` sem fundo deixa o conteúdo
 * rolar por baixo dela. O preço disso é que o realce de linha do `hover`, que é
 * translúcido, não alcança a coluna fixa. Preferi a coluna legível ao realce
 * completo: a sombra à direita marca a divisão, e o `hover` continua visível
 * nas outras nove colunas.
 */
const FIXA = 'sticky left-0 z-10 shadow-[1px_0_0_0_var(--color-slate-200)]';

interface CelulaProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: Alinhamento;
  children?: React.ReactNode;
  className?: string;
  /** Primeira coluna: acompanha a rolagem horizontal. Use em UMA coluna só. */
  fixa?: boolean;
}

export function Th({ children, align = 'left', fixa = false, className = '', ...rest }: CelulaProps) {
  const rolaSozinha = useContext(RolagemPropria);
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-2xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50 border-b border-slate-200
        ${rolaSozinha ? 'sticky top-0' : ''} ${fixa ? FIXA : ''}
        ${/* o canto passa por cima das duas barras fixas */ ''}
        ${rolaSozinha && fixa ? 'z-20' : rolaSozinha ? 'z-10' : ''}
        ${ALINHAMENTO[align]} ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  mono = false,
  fixa = false,
  className = '',
  ...rest
}: CelulaProps & { mono?: boolean }) {
  return (
    <td
      className={`px-3 py-2 text-slate-700 border-b border-slate-100 ${ALINHAMENTO[align]}
        ${mono ? 'font-mono' : ''} ${fixa ? `${FIXA} bg-white` : ''} ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
