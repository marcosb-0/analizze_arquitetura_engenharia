import { LucideIcon } from 'lucide-react';

/**
 * O painel de detalhe antes de alguém escolher uma linha.
 *
 * ## Cinco telas, cinco desenhos
 *
 * As cinco telas mestre/detalhe do app resolviam este momento de cinco jeitos:
 * Clientes e Fornecedores com um ícone de 48px `stroke-1` **piscando**
 * (`animate-pulse`), Equipe com o mesmo ícone parado, Propostas com o ícone e
 * outro tamanho de texto, e Contratos com um parágrafo solto e nenhum ícone. O
 * pior dos cinco é o pisca: `animate-pulse` é o vocabulário de CARREGANDO no
 * app inteiro (é o que o `Spinner` e o esqueleto de lista usam), e aqui não há
 * nada carregando — a tela está pronta e esperando um clique.
 *
 * Não é o `EmptyState`: aquele diz "não existe nenhum registro, crie o
 * primeiro" e traz um botão de ação. Este diz "existem registros, escolha um" —
 * a ação já está na tela, à esquerda, e um segundo botão aqui competiria com
 * ela. Por isso também não tem moldura: emoldurar um vazio é desenhar uma caixa
 * em volta de nada.
 */

interface SemSelecaoProps {
  icone: LucideIcon;
  /** A frase. Diz o que escolher e o que vai aparecer. */
  children: React.ReactNode;
}

export default function SemSelecao({ icone: Icone, children }: SemSelecaoProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-slate-500">
      <Icone size={40} className="stroke-1" aria-hidden="true" />
      <p className="text-xs max-w-xs leading-relaxed">{children}</p>
    </div>
  );
}
