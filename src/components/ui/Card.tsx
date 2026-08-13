import React from 'react';
import type { PropsNativas } from './tipos';

/**
 * Superfície branca padrão. O app usava `rounded-lg`, `rounded-xl` e
 * `rounded-2xl` para o mesmo tipo de bloco, com `shadow-sm`/`shadow-xs`/nenhuma
 * sombra, e boa parte das bordas apontava para `slate-150` — um tom que não
 * existe, o que fazia a borda sair na cor do texto.
 *
 * ## Quando a moldura é a resposta certa — redesenho de 13/ago/2026
 *
 * A partir do redesenho "seções abertas", a maioria dos blocos que tinha caixa
 * deixou de ter: agrupar por ASSUNTO passou a ser papel da `<Secao>` (título +
 * divisor + espaço). Este componente ficou com o que a `Secao` não faz — a
 * moldura que delimita um ALVO, não um assunto:
 *
 *   - item clicável de lista ou feed, cartão de obra, de tarefa, de kanban;
 *   - bloco de alerta colorido, onde o fundo é a informação;
 *   - a lista mestre do layout mestre/detalhe, que rola por dentro.
 *
 * Se o bloco não é clicável, não é colorido e não rola sozinho, ele quase certo
 * quer ser uma `<Secao>`.
 *
 * ## A exceção que sobrou, e por que ela não é o padrão antigo disfarçado
 *
 * A FAIXA DE AVISO de uma linha — "convertida na obra X", "esta proposta ainda
 * não tem contrato", "sem cláusulas com texto" — mantém moldura, e as de estado
 * neutro mantêm o fundo `bg-slate-50` mesmo sem cor de alerta.
 *
 * Ela parece violar a régua acima (não é clicável, não é colorida), mas é o
 * mesmo objeto que o alerta rose/amber ao lado dela, com o tom que corresponde
 * a "nada de errado, só um fato do estado". Tirar a moldura das neutras e
 * manter nas coloridas faria o MESMO componente aparecer de duas formas
 * conforme a gravidade, que é justamente o tipo de incoerência que este
 * redesenho veio apagar.
 *
 * O teste é a estrutura, não o tom: se tem título e agrupa mais de uma coisa, é
 * `<Secao>`; se é uma frase sobre o estado atual, com ou sem um botão ao lado,
 * é faixa de aviso e fica emoldurada.
 */

interface CardProps extends PropsNativas<HTMLDivElement> {
  /** Remove o padding interno — para cards que contêm uma tabela colada às bordas. */
  semPadding?: boolean;
  /**
   * O card É o alvo do clique. Junta o realce de hover que estava escrito à mão
   * em cada grade de cartões (obra, tarefa, medição recente, insumo) — sempre a
   * mesma receita, com o tom da borda variando por tela sem razão nenhuma.
   *
   * Não põe `role` nem `tabIndex`: quem clica um card ou é um `<button>` que o
   * embrulha, ou tem um link dentro. Um `<div onClick>` continua inacessível com
   * ou sem esta prop, e fingir o contrário aqui esconderia isso.
   */
  interativo?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function Card({
  children,
  className = '',
  semPadding = false,
  interativo = false,
  ...rest
}: CardProps) {
  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 shadow-sm
        ${semPadding ? '' : 'p-4'}
        ${interativo ? 'hover:shadow-md hover:border-blue-300 cursor-pointer transition' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Ações à direita — botões, filtros, badges. */
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, description, actions, icon, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="flex items-start gap-2 min-w-0">
        {icon && <div className="p-1.5 bg-blue-50 rounded text-blue-600 shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 text-xs leading-tight">{title}</h3>
          {description && <p className="text-2xs text-slate-500 mt-0.5 leading-snug">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
