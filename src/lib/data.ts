/**
 * Datas sem hora (colunas `date` do Postgres) chegam como 'YYYY-MM-DD'.
 *
 * `new Date('2026-07-24')` é interpretado pelo JS como **meia-noite UTC**, e em
 * UTC-3 isso vira 21h do dia 23 — a tela mostra um dia a menos. Já
 * `new Date('2026-07-24T00:00:00')`, sem timezone, é lido como hora local.
 *
 * O projeto já usava esse `T00:00:00` solto em vários arquivos; centralizar
 * aqui é o que impede a próxima tela nova de esquecer de novo.
 */

/** Meia-noite local do dia informado. `null` quando ausente ou inválida. */
export function dataLocal(iso?: string | null): Date | null {
  if (!iso) return null;
  // Só o trecho da data: aceita tanto 'YYYY-MM-DD' quanto um timestamp completo.
  const somenteData = iso.slice(0, 10);
  const d = new Date(`${somenteData}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Data no formato brasileiro. Devolve `fallback` em vez de "Invalid Date"
 * quando o campo vem vazio — `data_validade` é nullable e o service o traduz
 * para string vazia.
 */
export function formatarDataBR(iso?: string | null, fallback = '—'): string {
  const d = dataLocal(iso);
  return d ? d.toLocaleDateString('pt-BR') : fallback;
}

/** Meia-noite local de hoje, para comparar com datas sem hora do banco. */
export function hojeLocal(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/**
 * Dias inteiros de hoje até a data: 0 é hoje, negativo já passou.
 * `null` quando a data é ausente ou inválida.
 */
export function diasAte(iso?: string | null): number | null {
  const alvo = dataLocal(iso);
  if (!alvo) return null;
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.round((alvo.getTime() - hojeLocal().getTime()) / msPorDia);
}

/**
 * Um `Date` de volta para 'YYYY-MM-DD', lendo os campos LOCAIS.
 *
 * É a inversa exata de `dataLocal`, e existe pelo mesmo motivo que ela:
 * `toISOString()` converte para UTC e devolve o dia anterior em qualquer hora
 * antes das 21h em UTC-3. Toda aritmética de calendário do cronograma fecha o
 * ciclo por aqui.
 */
export function formatarISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Hoje como 'YYYY-MM-DD' no fuso local — `toISOString()` daria o dia UTC. */
export function hojeISO(): string {
  return formatarISO(new Date());
}
