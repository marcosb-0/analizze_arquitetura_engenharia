
/**
 * Cores canônicas de status. Fonte única para badges, pontos e barras.
 *
 * Este arquivo existia mas não era importado em lugar nenhum: cada tela mantinha
 * seu próprio mapa inline, e eles discordavam. "Pausado" era âmbar aqui, vermelho
 * na lista de obras e vermelho na barra do dashboard — mas o badge ao lado dessa
 * mesma barra o pintava de cinza, idêntico a "Planejamento". A mesma obra
 * aparecia em duas cores na mesma linha da tela.
 *
 * O critério adotado: vermelho (rose) fica reservado ao que exige ação —
 * "Rejeitada", "Atrasado". "Pausado" é uma decisão deliberada de quem gere a
 * obra, não uma falha, e por isso é âmbar. Sem essa separação, "pausado" e
 * "atrasado" ficavam indistinguíveis justamente onde a diferença importa.
 */
export const STATUS_CONFIG = {
  projeto: {
    'Planejamento':    { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-200',   dot: 'bg-slate-400' },
    'Em Execução':     { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
    'Pausado':         { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
    'Finalizado':      { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  },
  proposta: {
    'Elaboração':      { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-200',   dot: 'bg-slate-400' },
    'Enviada':         { bg: 'bg-sky-50',      text: 'text-sky-700',     border: 'border-sky-200',     dot: 'bg-sky-500' },
    'Aprovada':        { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    'Rejeitada':       { bg: 'bg-rose-50',     text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  },
  etapa: {
    'Não Iniciado':    { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400' },
    'Em Andamento':    { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
    'Concluído':       { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    'Atrasado':        { bg: 'bg-rose-50',     text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  },
  funcionario: {
    'Ativo':           { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    'Inativo':         { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400' },
  },
} as const;

type StatusConfig = typeof STATUS_CONFIG;
export type StatusDominio = keyof StatusConfig;
export type StatusDe<D extends StatusDominio> = keyof StatusConfig[D];

interface StatusTokens {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

/**
 * A versão anterior fazia `(config as any)[status]` e, quando não encontrava,
 * caía no primeiro status do domínio — uma obra com situação desconhecida era
 * silenciosamente pintada de "Planejamento". Com `StatusDe<D>` o compilador
 * recusa um status que não pertença ao domínio, e o `as any` sai.
 */
function tokens<D extends StatusDominio>(dominio: D, status: StatusDe<D>): StatusTokens {
  return STATUS_CONFIG[dominio][status] as StatusTokens;
}

/** Só a cor sólida do status — para barras de progresso e marcadores. */
export function statusDot<D extends StatusDominio>(dominio: D, status: StatusDe<D>): string {
  return tokens(dominio, status).dot;
}

const TAMANHOS = {
  sm: 'gap-1 px-1.5 py-0.5 text-2xs',
  md: 'gap-1.5 px-2.5 py-1 text-xs',
} as const;

interface StatusBadgeProps<D extends StatusDominio> {
  type: D;
  status: StatusDe<D>;
  /** O ponto colorido carrega o status sem depender apenas da cor de fundo. */
  showDot?: boolean;
  size?: keyof typeof TAMANHOS;
}

export function StatusBadge<D extends StatusDominio>({
  type,
  status,
  showDot = true,
  size = 'md',
}: StatusBadgeProps<D>) {
  const config = tokens(type, status);

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold border whitespace-nowrap ${TAMANHOS[size]} ${config.bg} ${config.text} ${config.border}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />}
      {String(status)}
    </span>
  );
}
