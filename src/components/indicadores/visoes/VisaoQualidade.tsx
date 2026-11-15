import { useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Card, FaixaKpis } from '../../ui';
import { quadroQualidade, type QuadroQualidade } from '../../../lib/indicadores/calculos';
import { decimal, inteiro, percentual } from '../../../lib/indicadores/formato';
import { formatarDataBR } from '../../../lib/data';
import KpiBI from '../KpiBI';
import TabelaBI, { type ColunaBI } from '../TabelaBI';
import { rolarPara, type ContextoVisao } from '../contexto';

type Rejeitada = QuadroQualidade['boletins'][number];
const ID_TABELA = 'bi-qualidade-rejeicoes';

/**
 * Qualidade — e o que o banco ainda não sabe responder.
 *
 * O único registro de qualidade que existe hoje é a medição REJEITADA, com o
 * motivo. Não conformidade, retrabalho e inspeção não têm tabela: em vez de
 * aproximar esses números a partir de outra coisa (o que seria inventar
 * métrica), a visão mostra o que existe e diz, com a proposta de estrutura, o
 * que falta.
 */
export default function VisaoQualidade(ctx: ContextoVisao) {
  const { dados, escopo, comparar, rotuloAnterior, nomeObra } = ctx;
  const q = useMemo(() => quadroQualidade(dados, escopo), [dados, escopo]);

  const colunas: ColunaBI<Rejeitada>[] = [
    { id: 'data', titulo: 'Data', render: (m) => formatarDataBR(m.data), ordenar: (m) => m.data, csv: (m) => m.data },
    { id: 'obra', titulo: 'Obra', render: (m) => nomeObra(m.projetoId), ordenar: (m) => nomeObra(m.projetoId), csv: (m) => nomeObra(m.projetoId) },
    { id: 'etapa', titulo: 'Etapa', render: (m) => m.etapaNome ?? '—', ordenar: (m) => m.etapaNome ?? '', csv: (m) => m.etapaNome },
    { id: 'avanco', titulo: 'Avanço informado', align: 'right', render: (m) => percentual(m.percentual, 1), ordenar: (m) => m.percentual, csv: (m) => m.percentual },
    { id: 'quantidade', titulo: 'Quantidade', align: 'right', render: (m) => (m.quantidade === undefined ? '—' : `${decimal(m.quantidade)} ${m.unidade ?? ''}`), csv: (m) => m.quantidade },
    { id: 'motivo', titulo: 'Motivo da rejeição', render: (m) => <span className="whitespace-normal">{m.motivo || '—'}</span>, csv: (m) => m.motivo },
  ];

  return (
    <div className="space-y-5">
      <FaixaKpis colunas={3}>
        <KpiBI
          rotulo="Medições rejeitadas"
          valor={inteiro(q.rejeitadas.atual)}
          comparado={comparar ? q.rejeitadas : null}
          sentido="baixa-boa"
          rotuloAnterior={rotuloAnterior}
          onClick={() => rolarPara(ID_TABELA)}
        />
        <KpiBI
          rotulo="Taxa de rejeição"
          valor={percentual(q.taxaRejeicao)}
          detalhe={q.taxaRejeicao === null ? 'Nenhum boletim decidido no período' : 'Rejeitados ÷ boletins decididos'}
        />
        <KpiBI rotulo="Obras com rejeição" valor={inteiro(q.obrasAfetadas)} detalhe="No período" />
      </FaixaKpis>

      <TabelaBI
        id={ID_TABELA}
        titulo="Medições rejeitadas"
        descricao="O retrabalho que o sistema registra hoje: boletins devolvidos, com o motivo."
        linhas={q.boletins}
        colunas={colunas}
        chave={(m) => m.id}
        onAbrir={(m) => ctx.abrirObra(m.projetoId)}
        rotuloAbrir={(m) => `Abrir obra ${nomeObra(m.projetoId)}`}
        arquivo={`medicoes_rejeitadas_${escopo.intervalo.de}_${escopo.intervalo.ate}.csv`}
        vazio="Nenhuma medição rejeitada no período."
        ordemInicial={{ coluna: 'data', direcao: 'desc' }}
      />

      <Card>
        <section aria-labelledby="bi-qualidade-limite" className="flex gap-4">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-hidden="true">
            <ClipboardCheck size={18} />
          </span>
          <div className="min-w-0 space-y-2 text-xs leading-relaxed text-slate-600">
            <h2 id="bi-qualidade-limite" className="text-sm font-semibold text-slate-900">
              Não conformidades, retrabalho e inspeções ainda não são registrados
            </h2>
            <p>
              O banco de dados não tem onde guardar esses fatos, então esta área não mostra números para eles — calcular a partir
              de outra informação seria inventar a métrica.
            </p>
            <p>Para medir, a sugestão é criar dois cadastros dentro da obra:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b className="text-slate-800">Inspeção</b> — etapa inspecionada, data, responsável, resultado (aprovada, aprovada com
                ressalva, reprovada) e fotos. Daí saem inspeções pendentes e a taxa de aprovação na primeira inspeção.
              </li>
              <li>
                <b className="text-slate-800">Não conformidade</b> — origem (inspeção ou avulsa), gravidade, situação (aberta, em
                tratamento, encerrada), prazo, responsável e custo do retrabalho. Daí saem NCs abertas, tempo médio de
                encerramento e custo de retrabalho por obra.
              </li>
            </ul>
            <p>Com a sua aprovação, essa estrutura pode ser implementada como próximo passo.</p>
          </div>
        </section>
      </Card>
    </div>
  );
}
