import { History } from 'lucide-react';
import { PontoHistoricoPreco } from '../../types';
import { formatBRL } from '../../lib/preco';
import { dataLocal } from '../../lib/data';
import { PREENCHIMENTO_HEX } from '../ui';

/** `h-16` do SVG e o `pt-4` do contêiner, em px — o rótulo é posicionado contra os dois. */
const ALTURA_SVG = 64;
const PADDING_ROTULO = 16;

/** Medido: "ago/26" a 12 px ocupa 40 px, e até 8 pontos ainda sobra folga. */
const MAX_DATAS_NO_EIXO = 8;

const rotuloMes = (data: string) =>
  dataLocal(data)?.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) ?? '—';

/**
 * Linha do preço de referência ao longo do tempo, desenhada à mão em SVG — são
 * poucos pontos e nenhum eixo, não justifica trazer a biblioteca de gráficos
 * para dentro do drawer.
 *
 * ## Por que o RÓTULO é HTML e só a linha é SVG (13/ago/2026)
 *
 * O `viewBox` é 300×60 e o SVG ocupa `w-full h-16` dentro de um drawer
 * `max-w-md`. Medido no navegador: ele renderiza a 396×64, ou seja escala
 * **1,32 na horizontal e 1,067 na vertical** — e com `preserveAspectRatio
 * ="none"` isso vale para tudo que estiver dentro, inclusive texto.
 *
 * O resultado media 8,5 px de altura com as letras **esticadas 1,24×**, e o
 * `<circle r="3">` saía como elipse de 7,9 × 6,4. Nenhum ajuste de `fontSize`
 * conserta: o número escrito aqui não é o número que aparece na tela, porque a
 * escala depende da largura do drawer.
 *
 * Esticar a LINHA é legítimo — é o que um gráfico de linha faz. Esticar a
 * legenda não. Por isso o texto saiu do sistema de coordenadas: os rótulos são
 * HTML posicionados por porcentagem sobre o mesmo eixo, o que lhes devolve o
 * piso de 12 px da escala do app e os tons do `PREENCHIMENTO` — que era o que
 * faltava, já que `fontSize` e `fill` são atributo de SVG e escapam tanto do
 * Tailwind quanto do guarda de escala do `estilo.test.ts`.
 *
 * A data por ponto CONTINUA, e a primeira versão desta correção a tinha tirado
 * por suposição: eu afirmei que seis rótulos não caberiam a 12 px. Medido, o
 * rótulo ocupa 40 px e a série cabe até **8 pontos** — a suposição estava
 * errada e teria custado informação de graça. Acima de 8 o eixo recua para as
 * pontas, e aí a data de cada ponto fica no `title` da bolinha.
 */
export default function GraficoHistorico({ historico }: { historico: PontoHistoricoPreco[] }) {
  if (historico.length < 2) {
    return (
      <div className="h-16 flex items-center justify-center bg-slate-50 border border-slate-100 rounded text-2xs text-slate-500 font-medium px-3 text-center">
        {historico.length === 1
          ? 'Só há o preço inicial. O próximo ponto entra sozinho quando o preço de referência for editado.'
          : 'Nenhuma variação histórica registrada.'}
      </div>
    );
  }

  const precos = historico.map((h) => h.preco);
  const max = Math.max(...precos);
  const min = Math.min(...precos);
  const diff = max - min === 0 ? 1 : max - min;
  const width = 300;
  const height = 60;

  const pontos = historico.map((h, i) => ({
    x: (i / (historico.length - 1)) * (width - 40) + 20,
    y: height - 10 - ((h.preco - min) / diff) * (height - 20),
    ...h,
  }));

  const pathD = pontos.reduce((acc, p, i) => acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), '');
  const variacao = ((precos[precos.length - 1] - precos[0]) / precos[0]) * 100;

  return (
    <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 space-y-1.5 text-left">
      <div className="flex justify-between items-center">
        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
          <History size={11} /> Histórico de preço ({historico.length} pontos)
        </span>
        <span className={`text-2xs font-mono font-bold ${variacao >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
          {variacao >= 0 ? '+' : ''}
          {variacao.toFixed(1)}% no período
        </span>
      </div>
      {/* `pt-4` abre espaço para o rótulo de preço, que fica ACIMA do ponto e
          escaparia do bloco no ponto mais alto da série. */}
      <div className="relative pt-4">
        <svg className="w-full h-16 block" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={pathD} fill="none" stroke={PREENCHIMENTO_HEX.acao} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {pontos.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill={PREENCHIMENTO_HEX.acao} />
          ))}
        </svg>
        {pontos.map((p, i) => (
          <span
            key={i}
            /* `-translate-x-1/2` centraliza no ponto; `-translate-y-full` sobe o
               rótulo para cima dele. A porcentagem é do mesmo eixo do viewBox,
               então os dois acompanham a largura juntos. */
            className="absolute text-2xs font-bold text-slate-800 font-mono whitespace-nowrap -translate-x-1/2 -translate-y-full"
            /* `top` em px e não em %: porcentagem aqui resolveria contra a
               altura do CONTÊINER (padding incluso), e o ponto vive na do SVG.
               ALTURA_SVG é o `h-16` ao lado — os dois têm de mudar juntos. */
            style={{ left: `${(p.x / width) * 100}%`, top: `${PADDING_ROTULO + (p.y / height) * ALTURA_SVG - 4}px` }}
            title={`${dataLocal(p.data)?.toLocaleDateString('pt-BR') ?? '—'} — ${formatBRL(p.preco)}`}
          >
            {p.preco.toFixed(0)}
          </span>
        ))}
      </div>
      {/* Eixo do tempo. Medido a 12 px na largura real do drawer: o rótulo
          "ago/26" ocupa 40 px e a série ainda cabe sem sobrepor até 8 pontos.
          Daí para cima, só as PONTAS — a data de cada ponto continua no `title`
          da bolinha, junto do preço. */}
      {pontos.length <= MAX_DATAS_NO_EIXO ? (
        <div className="relative h-4">
          {pontos.map((p, i) => (
            <span
              key={i}
              className="absolute text-2xs text-slate-500 font-mono whitespace-nowrap -translate-x-1/2"
              style={{ left: `${(p.x / width) * 100}%` }}
            >
              {rotuloMes(p.data)}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex justify-between text-2xs text-slate-500 font-mono">
          <span>{rotuloMes(historico[0].data)}</span>
          <span>{rotuloMes(historico[historico.length - 1].data)}</span>
        </div>
      )}
      <div className="flex justify-between text-2xs text-slate-500 font-mono">
        <span>mín {formatBRL(min)}</span>
        <span>máx {formatBRL(max)}</span>
      </div>
    </div>
  );
}
