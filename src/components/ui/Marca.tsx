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
      <rect width="32" height="32" rx="10" fill="#1585cd" />
      <path d="M9.5 23.5 16 8.5l6.5 15" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.2 18.5h7.6" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Marca({ tamanho = 32, comNome = true, legenda }: MarcaProps) {
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      <SimboloMarca tamanho={tamanho} />
      {comNome && (
        <span className="min-w-0 text-left">
          <span className="block text-lg font-bold leading-none tracking-[-0.02em] text-slate-900">
            analizze
          </span>
          {legenda && <span className="mt-1 block truncate text-2xs font-medium text-slate-500">{legenda}</span>}
        </span>
      )}
    </span>
  );
}
