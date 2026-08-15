import { Chip } from '../components/ui';
import type { TomChip } from '../components/ui';

/**
 * O TOM canônico de cada status. Fonte única para selo, ponto e barra.
 *
 * Este arquivo existia mas não era importado em lugar nenhum: cada tela mantinha
 * seu próprio mapa inline, e eles discordavam. "Pausado" era âmbar aqui, vermelho
 * na lista de obras e vermelho na barra do dashboard — mas o badge ao lado dessa
 * mesma barra o pintava de cinza, idêntico a "Planejamento". A mesma obra
 * aparecia em duas cores na mesma linha da tela.
 *
 * O critério adotado: vermelho (`negativo`) fica reservado ao que exige ação —
 * "Rejeitada", "Atrasado". "Pausado" é uma decisão deliberada de quem gere a
 * obra, não uma falha, e por isso é `atencao`. Sem essa separação, "pausado" e
 * "atrasado" ficavam indistinguíveis justamente onde a diferença importa.
 *
 * ## CORREÇÃO 15/ago/2026 — o mapa deixou de ter cor própria
 *
 * O refactor de 14/ago tirou a `border` da pill "porque o mockup usa fundo
 * pálido + texto + ponto — a mesma receita do `<Chip>` novo". Ficou pela
 * metade: a receita era a mesma, o COMPONENTE não. `STATUS_CONFIG` continuou
 * carregando `bg`/`text`/`dot` em Tailwind cru, e o `dot` de todos os sete
 * domínios saía dos tons `-400`/`-500` que a tabela de `PREENCHIMENTO` reprova:
 *
 * | Ponto | sobre branco | piso SC 1.4.11 |
 * |---|---|---|
 * | `slate-400` (Planejamento, Não Iniciado, A fazer, Baixa, Inativo) | 2,63 | 3,0 |
 * | `emerald-500` (Finalizado, Aprovada, Concluído, Ativo) | 2,47 | 3,0 |
 * | `amber-500` (Pausado, Em revisão, Média) | 2,13 | 3,0 |
 * | `sky-500` (Enviada) | 2,71 | 3,0 |
 *
 * Sete bolinhas reprovadas em nove telas, pela mesma razão que `PREENCHIMENTO`
 * existe: o tom foi escolhido a olho, e o dígito do Tailwind não é escala de
 * contraste. Agora o domínio escolhe um **tom** (`TomChip`) e quem pinta é o
 * `<Chip>`, com os hex já medidos de `CHIP`/`PREENCHIMENTO_HEX`. Uma pill só no
 * app inteiro — o que `Button` e `Input` já fizeram para botão e campo.
 *
 * O que se perdeu de propósito: "Enviada" era `sky` e "Em Execução" `blue`, dois
 * azuis que ninguém distinguia lado a lado (e nunca aparecem juntos — são
 * domínios diferentes). Os dois viraram `informativo`.
 */
export const STATUS_CONFIG = {
  projeto: {
    'Planejamento': 'neutro',
    'Em Execução': 'informativo',
    'Pausado': 'atencao',
    'Finalizado': 'positivo',
  },
  proposta: {
    'Elaboração': 'neutro',
    'Enviada': 'informativo',
    'Aprovada': 'positivo',
    'Rejeitada': 'negativo',
  },
  /**
   * O contrato. Tinha mapa próprio dentro de `ListaContratos` (`TOM_STATUS`),
   * com "Encerrado" em `bg-slate-50` — mais claro que o `slate-100` de
   * "Minuta", o que na lista fazia o contrato encerrado parecer o rascunho.
   * Os dois são `neutro`: nem um nem outro pedem ação.
   */
  contrato: {
    'Minuta': 'neutro',
    'Emitido': 'informativo',
    'Assinado': 'positivo',
    'Encerrado': 'neutro',
  },
  etapa: {
    'Não Iniciado': 'neutro',
    'Em Andamento': 'informativo',
    'Concluído': 'positivo',
    'Atrasado': 'negativo',
  },
  funcionario: {
    'Ativo': 'positivo',
    'Inativo': 'neutro',
  },
  // As colunas do quadro de tarefas. "Em revisão" é âmbar pelo mesmo critério do
  // "Pausado": está esperando alguém, mas não é falha — o rose fica para atraso.
  tarefa: {
    'A fazer': 'neutro',
    'Fazendo': 'informativo',
    'Em revisão': 'atencao',
    'Concluída': 'positivo',
  },
  // Prioridade é domínio SEPARADO de `tarefa` e não um quinto status: as duas
  // coisas aparecem lado a lado no mesmo card, e juntá-las num mapa só faria
  // 'Alta' e 'Fazendo' disputarem o mesmo espaço de nomes.
  prioridade: {
    'Alta': 'negativo',
    'Média': 'atencao',
    'Baixa': 'neutro',
  },
  /**
   * Conta de acesso. Novo em 15/ago/2026, com o redesenho da aba Acessos: ali o
   * estado era a COR DE UM BOTÃO (verde "Ativo", vermelho "Revogado"), o que a
   * Regra do Papel proíbe — estado é selo, botão é ação. Virando domínio aqui,
   * a aba ganha o mesmo selo do resto do app e um botão de verdade ao lado.
   *
   * "Aguardando" não é "Revogado": os dois têm `active = false` no banco, mas
   * quem nunca passou por um administrador está ENTRANDO, não foi expulso.
   */
  acesso: {
    'Ativo': 'positivo',
    'Aguardando': 'informativo',
    'Revogado': 'negativo',
  },
} as const satisfies Record<string, Record<string, TomChip>>;

type StatusConfig = typeof STATUS_CONFIG;
export type StatusDominio = keyof StatusConfig;
export type StatusDe<D extends StatusDominio> = keyof StatusConfig[D];

/**
 * O tom de um status, para quem precisa dele fora da pill — o `<Chip>` de um
 * ícone, a cor de uma barra.
 *
 * A versão anterior fazia `(config as any)[status]` e, quando não encontrava,
 * caía no primeiro status do domínio — uma obra com situação desconhecida era
 * silenciosamente pintada de "Planejamento". Com `StatusDe<D>` o compilador
 * recusa um status que não pertença ao domínio, e o `as any` sai.
 */
export function statusTom<D extends StatusDominio>(dominio: D, status: StatusDe<D>): TomChip {
  return STATUS_CONFIG[dominio][status] as TomChip;
}

interface StatusBadgeProps<D extends StatusDominio> {
  type: D;
  status: StatusDe<D>;
  /** O ponto colorido carrega o status sem depender apenas da cor de fundo. */
  showDot?: boolean;
  size?: 'sm' | 'md';
}

/**
 * O selo de status. Hoje é só o `<Chip>` com o tom que o domínio escolheu —
 * ele sobrevive como componente porque é ele que conhece a TABELA (que status
 * existe em que domínio, e com que tom), e é isso que impede a próxima tela de
 * inventar a nona cor de "Pausado".
 */
export function StatusBadge<D extends StatusDominio>({
  type,
  status,
  showDot = true,
  size = 'md',
}: StatusBadgeProps<D>) {
  return (
    <Chip
      tom={statusTom(type, status)}
      ponto={showDot}
      className={size === 'sm' ? 'px-2 py-0.5' : ''}
    >
      {String(status)}
    </Chip>
  );
}
