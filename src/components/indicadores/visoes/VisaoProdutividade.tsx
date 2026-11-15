import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Aviso, FaixaKpis, FileiraPilulas, Pilula } from '../../ui';
import { quadroProdutividade, type MetaDaEtapa } from '../../../lib/indicadores/calculos';
import { decimal, inteiro, percentual, plural } from '../../../lib/indicadores/formato';
import BlocoGrafico from '../BlocoGrafico';
import KpiBI from '../KpiBI';
import TabelaBI, { type ColunaBI } from '../TabelaBI';
import { GraficoBarras } from '../graficos';
import { SERIE } from '../cores';
import { GRADE_GRAFICOS, rolarPara, type ContextoVisao } from '../contexto';

const ID_TABELA = 'bi-produtividade-metas';

/**
 * Produtividade: o que foi PRODUZIDO (quantidade aprovada nas etapas com meta
 * em m², m³, un…) e o que foi ENTREGUE na pauta (tarefas concluídas).
 *
 * A produção nunca é somada entre unidades — 30 m² + 5 m³ não é 35 de nada.
 * O gráfico mostra uma unidade por vez, escolhida nas pílulas.
 */
export default function VisaoProdutividade(ctx: ContextoVisao) {
  const { dados, tarefas, escopo, comparar, rotuloAnterior, nomeObra, nomeFuncionario } = ctx;
  const q = useMemo(() => quadroProdutividade(dados, tarefas, escopo), [dados, tarefas, escopo]);
  const [unidadeEscolhida, setUnidade] = useState<string | null>(null);
  const unidade = unidadeEscolhida && q.unidades.includes(unidadeEscolhida) ? unidadeEscolhida : q.unidades[0] ?? null;

  const producao = unidade ? q.producao[unidade].map((b) => ({ rotulo: b.balde.rotulo, quantidade: b.quantidade })) : [];
  const tarefasSerie = q.tarefasPorBalde.map((b) => ({ rotulo: b.balde.rotulo, concluidas: b.concluidas }));

  const colunas: ColunaBI<MetaDaEtapa>[] = [
    { id: 'etapa', titulo: 'Etapa', render: (m) => m.etapa.nome, ordenar: (m) => m.etapa.nome, csv: (m) => m.etapa.nome },
    { id: 'obra', titulo: 'Obra', render: (m) => nomeObra(m.etapa.projetoId), ordenar: (m) => nomeObra(m.etapa.projetoId), csv: (m) => nomeObra(m.etapa.projetoId) },
    { id: 'responsavel', titulo: 'Responsável', render: (m) => nomeFuncionario(m.etapa.responsavelId), ordenar: (m) => nomeFuncionario(m.etapa.responsavelId), csv: (m) => nomeFuncionario(m.etapa.responsavelId) },
    { id: 'unidade', titulo: 'Unidade', render: (m) => m.etapa.unidade ?? '—', ordenar: (m) => m.etapa.unidade ?? '', csv: (m) => m.etapa.unidade },
    { id: 'prevista', titulo: 'Prevista', align: 'right', render: (m) => decimal(m.etapa.quantidadePrevista ?? 0), ordenar: (m) => m.etapa.quantidadePrevista ?? 0, csv: (m) => m.etapa.quantidadePrevista },
    { id: 'executada', titulo: 'Executada', align: 'right', render: (m) => decimal(m.etapa.quantidadeExecutada), ordenar: (m) => m.etapa.quantidadeExecutada, csv: (m) => m.etapa.quantidadeExecutada },
    { id: 'pct', titulo: 'Execução', align: 'right', render: (m) => percentual(m.percentual), ordenar: (m) => m.percentual, csv: (m) => m.percentual },
    { id: 'periodo', titulo: 'No período', align: 'right', render: (m) => decimal(m.noPeriodo), ordenar: (m) => m.noPeriodo, csv: (m) => m.noPeriodo },
    { id: 'ritmo', titulo: 'Ritmo (por dia)', align: 'right', render: (m) => decimal(m.ritmo), ordenar: (m) => m.ritmo, csv: (m) => m.ritmo },
  ];

  return (
    <div className="space-y-5">
      <FaixaKpis colunas={4}>
        <KpiBI
          rotulo="Boletins aprovados"
          valor={inteiro(q.boletinsAprovados.atual)}
          comparado={comparar ? q.boletinsAprovados : null}
          sentido="alta-boa"
          rotuloAnterior={rotuloAnterior}
          detalhe="Medições com data no período"
          onClick={() => ctx.irPara('medicoes')}
        />
        <KpiBI
          rotulo="Execução das metas"
          valor={percentual(q.execucaoMetas)}
          detalhe={q.metas.length > 0 ? `Média de ${plural(q.metas.length, 'etapa', 'etapas')} com meta quantitativa` : 'Nenhuma etapa com meta quantitativa'}
          onClick={() => rolarPara(ID_TABELA)}
        />
        <KpiBI
          rotulo="Tarefas concluídas"
          valor={inteiro(q.tarefasConcluidas.atual)}
          comparado={comparar ? q.tarefasConcluidas : null}
          sentido="alta-boa"
          rotuloAnterior={rotuloAnterior}
        />
        <KpiBI
          rotulo="Tarefas no prazo"
          valor={percentual(q.tarefasNoPrazo)}
          detalhe={q.tarefasNoPrazo === null ? 'Nenhuma concluída com prazo no período' : 'Concluídas até o prazo ÷ concluídas com prazo'}
        />
      </FaixaKpis>

      <div className={GRADE_GRAFICOS}>
        <BlocoGrafico
          titulo={unidade ? `Produção aprovada (${unidade})` : 'Produção aprovada'}
          descricao="Quantidade medida nas etapas com meta, por data do boletim aprovado."
          vazio={unidade ? null : 'Nenhuma produção quantitativa aprovada no período.'}
          acoes={q.unidades.length > 1 ? (
            <FileiraPilulas rotulo="Unidade">
              {q.unidades.map((u) => <Pilula key={u} ativo={u === unidade} onClick={() => setUnidade(u)}>{u}</Pilula>)}
            </FileiraPilulas>
          ) : undefined}
          tabela={{ colunas: ['Período', `Quantidade (${unidade ?? ''})`], linhas: producao.map((p) => [p.rotulo, decimal(p.quantidade)]) }}
        >
          {(tamanho) => (
            <GraficoBarras
              dados={producao}
              categoria="rotulo"
              tamanho={tamanho}
              formatar={(v) => `${decimal(v)} ${unidade}`}
              formatarEixo={(v) => decimal(v, 1)}
              series={[{ chave: 'quantidade', rotulo: 'Quantidade', cor: SERIE.primaria }]}
            />
          )}
        </BlocoGrafico>

        <BlocoGrafico
          titulo="Tarefas concluídas"
          descricao="Pela data em que cada tarefa foi para Concluída."
          vazio={q.tarefasConcluidas.atual > 0 ? null : 'Nenhuma tarefa concluída no período.'}
          tabela={{ colunas: ['Período', 'Concluídas'], linhas: tarefasSerie.map((t) => [t.rotulo, t.concluidas]) }}
        >
          {(tamanho) => (
            <GraficoBarras
              dados={tarefasSerie}
              categoria="rotulo"
              tamanho={tamanho}
              formatar={(v) => plural(v, 'tarefa', 'tarefas')}
              formatarEixo={inteiro}
              contagem
              series={[{ chave: 'concluidas', rotulo: 'Concluídas', cor: SERIE.primaria }]}
            />
          )}
        </BlocoGrafico>
      </div>

      <TabelaBI
        id={ID_TABELA}
        titulo="Metas quantitativas por etapa"
        descricao="Executado acumulado (posição) e o que foi produzido no período."
        linhas={q.metas}
        colunas={colunas}
        chave={(m) => m.etapa.id}
        onAbrir={(m) => ctx.abrirObra(m.etapa.projetoId)}
        rotuloAbrir={(m) => `Abrir obra ${nomeObra(m.etapa.projetoId)}`}
        arquivo={`produtividade_${escopo.intervalo.de}_${escopo.intervalo.ate}.csv`}
        vazio="Nenhuma etapa do recorte tem meta em quantidade (m², m³, un). Cadastre a meta na etapa do cronograma."
        ordemInicial={{ coluna: 'periodo', direcao: 'desc' }}
      />

      <Aviso tom="informativo" icone={<Info size={16} />}>
        <b>Produtividade da equipe em homem-hora ainda não é medida.</b> A chamada diária registra presença por pessoa,
        mas não em qual obra ou etapa ela trabalhou — sem isso não há HH realizado para comparar com o HH previsto da composição.
        Para medir, a presença precisaria registrar a obra (e, idealmente, a etapa) do dia.
      </Aviso>
    </div>
  );
}
