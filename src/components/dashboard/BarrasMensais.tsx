import { PREENCHIMENTO } from '../ui';

/**
 * O gráfico de barras pareadas do mockup "Analizze - App" — duas séries por
 * mês, barra de 16 px com o topo arredondado.
 *
 * ## Por que CSS e não Recharts
 *
 * O app já carrega Recharts no Financeiro, então usá-lo aqui não custaria
 * download novo. O que ele custaria é o desenho: o mockup pede seis pares de
 * retângulos de largura fixa, e reproduzir exatamente isso em `<BarChart>`
 * exige domar `barSize`, `barGap`, `barCategoryGap` e os eixos que a gente
 * esconde em seguida. Doze `<div>` com `height: %` são o gráfico inteiro, e o
 * `PREENCHIMENTO` continua sendo a fonte da cor — que é a regra que o
 * DESIGN.md impõe aos gráficos justamente porque a biblioteca a contornava.
 *
 * ## A escala
 *
 * Todas as barras dividem o MESMO máximo (o maior valor entre as duas séries
 * de todos os meses). Normalizar cada mês pelo próprio máximo faria dois meses
 * de tamanhos opostos desenharem barras iguais — o erro clássico de gráfico
 * feito à mão, e o motivo de a altura sair daqui e não do JSX de quem chama.
 */

export interface MesDoGrafico {
  rotulo: string;
  a: number;
  b: number;
}

interface Props {
  dados: MesDoGrafico[];
  rotuloA: string;
  rotuloB: string;
  /** Formata o valor para o `title` de cada barra (a leitura no hover). */
  formatar: (valor: number) => string;
}

export default function BarrasMensais({ dados, rotuloA, rotuloB, formatar }: Props) {
  const maximo = Math.max(...dados.flatMap((d) => [d.a, d.b]), 0);
  // Sem `|| 1` uma base zerada faria `0/0` e o height sairia `NaN%`.
  const altura = (valor: number) => `${(valor / (maximo || 1)) * 100}%`;

  return (
    <div>
      <div className="flex items-center justify-end gap-3.5 text-2xs font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-[2px] ${PREENCHIMENTO.acao}`} aria-hidden="true" />
          {rotuloA}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[2px] bg-blue-300" aria-hidden="true" />
          {rotuloB}
        </span>
      </div>

      <div className="mt-4 h-[120px] flex items-end gap-4">
        {dados.map((mes) => (
          <div key={mes.rotulo} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div
                className={`w-4 rounded-t-md ${PREENCHIMENTO.acao}`}
                style={{ height: altura(mes.a) }}
                title={`${mes.rotulo} · ${rotuloA}: ${formatar(mes.a)}`}
              />
              <div
                className="w-4 rounded-t-md bg-blue-300"
                style={{ height: altura(mes.b) }}
                title={`${mes.rotulo} · ${rotuloB}: ${formatar(mes.b)}`}
              />
            </div>
            <span className="text-2xs font-semibold text-slate-500">{mes.rotulo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
