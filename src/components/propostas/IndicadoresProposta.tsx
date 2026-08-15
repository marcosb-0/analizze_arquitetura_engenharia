import { Calendar, Clock, DollarSign } from 'lucide-react';
import { Proposta } from '../../types';
import { formatarDataBR } from '../../lib/data';
import { formatarPrazo } from '../../lib/prazo';
import { formatBRL } from '../../lib/preco';
import { TOM_VALIDADE, rotuloValidade, situacaoValidade } from '../../lib/validadeProposta';
import { Chip, FaixaKpis, Kpi } from '../ui';

interface Props {
  proposta: Proposta;
  qtdItens: number;
  bloqueado: boolean;
  onEditar: () => void;
}

/**
 * O convite que ocupa o lugar do valor quando prazo e validade estão vazios.
 *
 * Precisa desfazer as três decisões que o `Kpi` toma para um NÚMERO — 20 px,
 * negrito e fonte mono. Sem isso "Definir prazo em dias" saía em mono de 20 px
 * e quebrava em duas linhas, ocupando mais espaço que o valor real ocuparia. É
 * uma frase, não um dado.
 */
const CONVITE = 'text-xs font-normal font-sans italic text-slate-500';

/**
 * Eram três caixas cinzentas com borda, lado a lado, dentro de um painel que já
 * estava dentro de um card. Viraram três números — o mesmo tratamento da fileira
 * de KPIs do painel e do dashboard (ver `ui/Kpi.tsx`).
 *
 * A cor de estado sobreviveu onde ela informa: a caixa da validade ficava rosa
 * ou âmbar conforme o vencimento, e esse sinal agora mora no `<Chip>`
 * (`TOM_VALIDADE`), que já existia ao lado da data. O fundo tingido era o
 * mesmo dado dito duas vezes.
 *
 * `bloqueado` desliga o clique passando `onClick` indefinido, e não uma prop
 * `disabled`: sem ação disponível, o indicador não deve nem parecer clicável —
 * o `<button disabled>` anterior continuava com a moldura de alvo.
 */
export default function IndicadoresProposta({ proposta, qtdItens, bloqueado, onEditar }: Props) {
  const temItens = qtdItens > 0;
  const situacao = situacaoValidade(proposta);
  const rotulo = rotuloValidade(proposta);
  const abrirEdicao = bloqueado ? undefined : onEditar;

  return (
    <FaixaKpis colunas={3}>
      <Kpi
        icone={<DollarSign size={13} />}
        rotulo="Investimento Estimado"
        valor={formatBRL(proposta.valorEstimado)}
        /* Sem isto, um valor zerado parecia defeito. Ele é o estado correto de
           uma proposta recém-aberta: ou vem do orçamento montado abaixo, ou de
           um valor digitado na edição. */
        detalhe={
          temItens
            ? `Calculado: ${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'} + BDI de ${proposta.bdiPercentual}%`
            : proposta.valorManual > 0
              ? 'Valor digitado — passa a ser calculado ao montar o orçamento'
              : 'Monte o orçamento abaixo ou digite um valor em Editar'
        }
      />

      {/* Prazo e validade nascem vazios agora. Em vez de exibir um travessão
          mudo, o campo em branco convida a preenchê-lo — é onde o usuário vai
          procurar quando perceber que falta. */}
      <Kpi
        icone={<Clock size={13} />}
        rotulo="Prazo de Execução"
        valor={
          proposta.prazoExecucaoDias ? (
            formatarPrazo(proposta.prazoExecucaoDias)
          ) : (
            <span className={CONVITE}>
              {bloqueado ? 'Não informado' : 'Definir prazo em dias'}
            </span>
          )
        }
        onClick={abrirEdicao}
      />

      <Kpi
        icone={<Calendar size={13} className={situacao === 'vencida' ? 'text-rose-600' : undefined} />}
        rotulo="Data Limite Validade"
        valor={
          <span className="inline-flex items-baseline gap-1.5">
            {proposta.dataValidade ? (
              formatarDataBR(proposta.dataValidade)
            ) : (
              <span className={CONVITE}>
                {bloqueado ? 'Não informada' : 'Definir validade'}
              </span>
            )}
            {rotulo && TOM_VALIDADE[situacao] && (
              <Chip tom={TOM_VALIDADE[situacao]!}>{rotulo}</Chip>
            )}
          </span>
        }
        onClick={abrirEdicao}
      />
    </FaixaKpis>
  );
}
