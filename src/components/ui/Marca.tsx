/**
 * A marca provisória do Analizze (redesenho "Trena", 22/set/2026).
 *
 * Um "A" desenhado como esquadro, com a travessa graduada de uma trena, sobre
 * o ciano da marca. O ponto amarelo preserva a referência à fita de medição.
 *
 * É provisória de propósito: quando a logo definitiva chegar, troca-se este
 * arquivo e `public/favicon.svg`, e nada mais no app desenha a marca.
 */
interface MarcaProps {
  tamanho?: number;
  /** `false` desenha só o símbolo (menu recolhido). */
  comNome?: boolean;
  /** Legenda de uma linha abaixo do nome. */
  legenda?: string;
}

export function SimboloMarca({ tamanho = 32 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--color-acao)" />
      <path d="M9 24.5 16 7.5l7 17" fill="none" stroke="var(--color-acao-texto)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.2 19h9.6" stroke="var(--color-acao-texto)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M13.6 19v-2M16 19v-2.8M18.4 19v-2" stroke="var(--color-acao-texto)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="25.2" cy="24.4" r="2.2" fill="var(--color-trena)" />
    </svg>
  );
}

export function Marca({ tamanho = 32, comNome = true, legenda }: MarcaProps) {
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      <SimboloMarca tamanho={tamanho} />
      {comNome && (
        <span className="min-w-0 text-left">
          <span className="block font-display text-lg font-bold leading-none tracking-tight text-slate-900">
            analizze
          </span>
          {legenda && <span className="mt-1 block truncate text-2xs font-semibold text-slate-500">{legenda}</span>}
        </span>
      )}
    </span>
  );
}
