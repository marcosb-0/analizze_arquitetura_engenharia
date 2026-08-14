import React from 'react';
import type { PropsNativas } from './tipos';
import { DESTAQUE_PAINEL } from './tokens';

/**
 * Superfície branca padrão. O app usava `rounded-lg`, `rounded-xl` e
 * `rounded-2xl` para o mesmo tipo de bloco, com `shadow-sm`/`shadow-xs`/nenhuma
 * sombra, e boa parte das bordas apontava para `slate-150` — um tom que não
 * existe, o que fazia a borda sair na cor do texto.
 *
 * ## Raio e sombra — refactor 14/ago/2026, a partir do mockup "Analizze - App"
 *
 * O raio subiu de `rounded-lg` (8px, o "raio único" do North Star antigo)
 * para `rounded-2xl` (16px) — o mockup usa 16px em TODO cartão/painel/modal,
 * consistentemente, e não é gosto isolado: é a superfície que carrega a nova
 * paleta mais "macia". Controle (botão, campo) NÃO sobe — continua 8px, ver
 * `CAMPO_BASE`/`Button.tsx`. É um sistema de 2 raios agora, não 1.
 *
 * A sombra em repouso SAIU (o mockup não desenha nenhuma em cartão parado —
 * só a borda define o bloco); o hover do `interativo` trocou `shadow-md`
 * pelo valor exato que o mockup usa em TODO cartão clicável (obra, kanban,
 * KPI de financeiro): maior e mais suave, e com o tinte do próprio
 * `slate-900` novo (`#101828` ≈ `16,24,40`) em vez do preto neutro do
 * `shadow-md` padrão.
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
  /**
   * `destaque`: o painel azul-escuro sólido do mockup para CTA financeiro
   * ("BM pendente", "Medições a faturar") — sem borda (o próprio fundo
   * saturado já delimita o bloco) e com a cor de texto do par definida por
   * padrão, para filhos que não escrevem a própria cor.
   */
  variante?: 'padrao' | 'destaque';
  children?: React.ReactNode;
  className?: string;
}

export function Card({
  children,
  className = '',
  semPadding = false,
  interativo = false,
  variante = 'padrao',
  style,
  ...rest
}: CardProps) {
  const destaque = variante === 'destaque';
  return (
    <div
      className={`rounded-2xl
        ${destaque ? '' : 'bg-white border border-slate-200'}
        ${semPadding ? '' : 'p-4'}
        ${interativo ? 'hover:shadow-[0_12px_24px_-8px_rgba(16,24,40,0.14)] hover:border-blue-300 cursor-pointer transition' : ''} ${className}`}
      style={destaque ? { background: DESTAQUE_PAINEL.fundo, color: DESTAQUE_PAINEL.texto, ...style } : style}
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
        {icon && <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600 shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 text-xs leading-tight">{title}</h3>
          {description && <p className="text-2xs text-slate-500 mt-0.5 leading-snug">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
