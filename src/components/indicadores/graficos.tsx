import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GRAFICO_FONTE, GRAFICO_NEUTRO_HEX } from '../ui';

/**
 * Os três formatos de gráfico do painel de indicadores — barras, linhas e
 * rosca — sobre o Recharts que o Financeiro já carrega.
 *
 *
 * A paleta e o porquê da ordem estão em `cores.ts`.
 */
export interface Serie<T> {
  chave: keyof T & string;
  rotulo: string;
  cor: string;
  /** Linha tracejada — a referência (previsto, meta). */
  tracejada?: boolean;
}

const EIXO = { fontSize: GRAFICO_FONTE, fill: GRAFICO_NEUTRO_HEX.rotulo, fontWeight: 600 } as const;
/** O vão de 2px entre preenchimentos vizinhos é desenhado na cor do cartão. */
const VAO = 'var(--color-superficie)';

export function Legenda<T>({ series }: { series: Serie<T>[] }) {
  // Uma série só não tem legenda: o título do bloco já a nomeia.
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs font-semibold text-slate-500" aria-hidden="true">
      {series.map((s) => (
        <li key={s.chave} className="inline-flex items-center gap-1.5">
          {s.tracejada
            ? <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: s.cor }} />
            : <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.cor }} />}
          {s.rotulo}
        </li>
      ))}
    </ul>
  );
}

interface ItemDica {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number | ((obj: unknown) => unknown);
}

/** A dica de hover. Valor em tinta de texto; a cor só no marcador. */
function Dica({ active, payload, label, formatar, rotuloDe }: {
  active?: boolean;
  payload?: readonly ItemDica[];
  label?: React.ReactNode;
  formatar: (v: number) => string;
  rotuloDe?: (label: React.ReactNode) => React.ReactNode;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-superficie px-3 py-2 text-2xs shadow-flutuante">
      {label !== undefined && label !== '' && <p className="mb-1 font-semibold text-slate-900">{rotuloDe ? rotuloDe(label) : label}</p>}
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4 text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} aria-hidden="true" />
              {p.name}
            </span>
            <b className="font-mono text-slate-900">{typeof p.value === 'number' ? formatar(p.value) : '—'}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ALTURA = { normal: 260, expandido: 460 } as const;
export type TamanhoGrafico = keyof typeof ALTURA;

interface BarrasProps<T> {
  dados: T[];
  /** Campo do rótulo da categoria (mês, obra). */
  categoria: keyof T & string;
  series: Serie<T>[];
  formatar: (v: number) => string;
  /** Formato curto do eixo de valor. */
  formatarEixo?: (v: number) => string;
  empilhado?: boolean;
  /** Barras deitadas — para comparar entidades de nome comprido (obras). */
  deitado?: boolean;
  tamanho?: TamanhoGrafico;
  /** Clique numa barra. Com ele, o cursor vira mão e a dica avisa. */
  onClicar?: (linha: T) => void;
  /** Cor por barra, quando a cor codifica estado e não a série. */
  corDaBarra?: (linha: T) => string | undefined;
  dominio?: [number, number];
  /** Eixo de contagem: sem 0,5 boletim. */
  contagem?: boolean;
}

export function GraficoBarras<T extends object>({
  dados, categoria, series, formatar, formatarEixo = formatar, empilhado = false, deitado = false,
  tamanho = 'normal', onClicar, corDaBarra, dominio, contagem = false,
}: BarrasProps<T>) {
  // Deitado: a altura acompanha o número de barras, senão 30 obras viram fios.
  const altura = deitado ? Math.max(ALTURA[tamanho] * 0.6, dados.length * (tamanho === 'expandido' ? 40 : 34) + 40) : ALTURA[tamanho];
  const larguraRotulo = deitado
    ? Math.min(tamanho === 'expandido' ? 260 : 160, Math.max(80, ...dados.map((d) => String(d[categoria] ?? '').length * 7)))
    : undefined;
  const clicar = onClicar ? (item: { payload?: unknown }) => item.payload && onClicar(item.payload as T) : undefined;
  return (
    <div style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          // O gráfico é `aria-hidden` (a leitura acessível é a tabela do
          // bloco); a camada de teclado do Recharts poria um alvo de foco
          // invisível ao leitor de tela.
          accessibilityLayer={false}
          data={dados}
          layout={deitado ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 12, left: deitado ? 4 : -8, bottom: 0 }}
          barGap={2}
          barCategoryGap={deitado ? '22%' : '28%'}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRAFICO_NEUTRO_HEX.grade} vertical={deitado} horizontal={!deitado} />
          {deitado ? (
            <>
              <XAxis type="number" tickLine={false} axisLine={false} tick={EIXO} tickFormatter={formatarEixo} domain={dominio} allowDecimals={!contagem} />
              <YAxis type="category" dataKey={String(categoria)} tickLine={false} axisLine={false} tick={EIXO} width={larguraRotulo} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey={String(categoria)} tickLine={false} axisLine={{ stroke: GRAFICO_NEUTRO_HEX.borda }} tick={EIXO} minTickGap={8} />
              <YAxis tickLine={false} axisLine={false} tick={EIXO} tickFormatter={formatarEixo} width={64} domain={dominio} allowDecimals={!contagem} />
            </>
          )}
          <Tooltip
            cursor={{ fill: GRAFICO_NEUTRO_HEX.grade }}
            content={(p) => <Dica active={p.active} payload={p.payload as readonly ItemDica[]} label={p.label} formatar={formatar} />}
          />
          {series.map((s, i) => {
            const topo = !empilhado || i === series.length - 1;
            const raio: [number, number, number, number] = topo ? (deitado ? [0, 4, 4, 0] : [4, 4, 0, 0]) : [0, 0, 0, 0];
            return (
              <Bar
                key={s.chave}
                dataKey={String(s.chave)}
                name={s.rotulo}
                fill={s.cor}
                stackId={empilhado ? 'pilha' : undefined}
                radius={raio}
                maxBarSize={deitado ? 22 : 36}
                stroke={empilhado ? VAO : undefined}
                strokeWidth={empilhado ? 2 : 0}
                onClick={clicar}
                cursor={onClicar ? 'pointer' : undefined}
                isAnimationActive={false}
              >
                {corDaBarra && dados.map((d, j) => <Cell key={j} fill={corDaBarra(d) ?? s.cor} />)}
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface LinhasProps<T> {
  dados: T[];
  categoria: keyof T & string;
  series: Serie<T>[];
  formatar: (v: number) => string;
  formatarEixo?: (v: number) => string;
  dominio?: [number, number];
  tamanho?: TamanhoGrafico;
}

export function GraficoLinhas<T extends object>({
  dados, categoria, series, formatar, formatarEixo = formatar, dominio, tamanho = 'normal',
}: LinhasProps<T>) {
  return (
    <div style={{ height: ALTURA[tamanho] }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={dados} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRAFICO_NEUTRO_HEX.grade} vertical={false} />
          <XAxis dataKey={String(categoria)} tickLine={false} axisLine={{ stroke: GRAFICO_NEUTRO_HEX.borda }} tick={EIXO} minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} tick={EIXO} tickFormatter={formatarEixo} width={52} domain={dominio} />
          <Tooltip
            cursor={{ stroke: GRAFICO_NEUTRO_HEX.borda, strokeWidth: 1 }}
            content={(p) => <Dica active={p.active} payload={p.payload as readonly ItemDica[]} label={p.label} formatar={formatar} />}
          />
          {series.map((s) => (
            <Line
              key={s.chave}
              dataKey={String(s.chave)}
              name={s.rotulo}
              type="monotone"
              stroke={s.cor}
              strokeWidth={2}
              strokeDasharray={s.tracejada ? '5 4' : undefined}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: VAO }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface Fatia {
  chave: string;
  rotulo: string;
  valor: number;
  cor: string;
}

/**
 * Rosca com o total no meio e a legenda como LISTA de botões ao lado — a
 * fatia de 3% é impossível de acertar com o dedo, o rótulo dela não.
 */
export function GraficoRosca({ fatias, formatar, rotuloTotal, onClicar, ativa, tamanho = 'normal' }: {
  fatias: Fatia[];
  formatar: (v: number) => string;
  rotuloTotal: string;
  onClicar?: (fatia: Fatia) => void;
  /** Fatia já escolhida como filtro — as outras esmaecem. */
  ativa?: string | null;
  tamanho?: TamanhoGrafico;
}) {
  const total = fatias.reduce((t, f) => t + f.valor, 0);
  const visiveis = fatias.filter((f) => f.valor > 0);
  const lado = tamanho === 'expandido' ? 300 : 190;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: lado, height: lado }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie
              data={visiveis}
              dataKey="valor"
              nameKey="rotulo"
              innerRadius="64%"
              outerRadius="100%"
              stroke={VAO}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              onClick={onClicar ? (d: { payload?: unknown }) => d.payload && onClicar(d.payload as Fatia) : undefined}
              cursor={onClicar ? 'pointer' : undefined}
            >
              {visiveis.map((f) => (
                <Cell key={f.chave} fill={f.cor} fillOpacity={ativa && ativa !== f.chave ? 0.35 : 1} />
              ))}
            </Pie>
            <Tooltip content={(p) => <Dica active={p.active} payload={p.payload as readonly ItemDica[]} formatar={formatar} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-2xl font-bold leading-none text-slate-900">{formatar(total)}</span>
          <span className="mt-1 text-2xs font-medium text-slate-500">{rotuloTotal}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1">
        {fatias.map((f) => {
          const pct = total > 0 ? Math.round((f.valor / total) * 100) : 0;
          const conteudo = (
            <>
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: f.cor }} aria-hidden="true" />
                <span className="truncate">{f.rotulo}</span>
              </span>
              <span className="font-mono shrink-0 font-semibold text-slate-900">
                {formatar(f.valor)} <span className="font-medium text-slate-500">· {pct}%</span>
              </span>
            </>
          );
          const classe = `flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs text-slate-800 ${
            ativa === f.chave ? 'bg-blue-50' : ''
          }`;
          return (
            <li key={f.chave}>
              {onClicar ? (
                <button
                  type="button"
                  onClick={() => onClicar(f)}
                  aria-pressed={ativa === f.chave}
                  className={`${classe} text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500`}
                >
                  {conteudo}
                </button>
              ) : (
                <div className={classe}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
