import { useMemo, useState } from 'react';
import { FaixaKpis, FileiraPilulas, Pilula } from '../../ui';
import { JANELA_VENCIMENTO, quadroPrazos, type EtapaComPrazo } from '../../../lib/indicadores/calculos';
import { inteiro, percentual, plural } from '../../../lib/indicadores/formato';
import { formatarDataBR } from '../../../lib/data';
import BlocoGrafico from '../BlocoGrafico';
import KpiBI from '../KpiBI';
import TabelaBI, { type ColunaBI } from '../TabelaBI';
import { GraficoBarras, GraficoLinhas } from '../graficos';
import { ESTADO, SERIE } from '../cores';
import { encurtar, GRADE_GRAFICOS, rolarPara, type ContextoVisao } from '../contexto';

type Recorte = 'atrasadas' | 'vencendo' | 'reprogramadas';
const ROTULO: Record<Recorte, string> = {
  atrasadas: 'Atrasadas',
  vencendo: `Vencem em ${JANELA_VENCIMENTO} dias`,
  reprogramadas: 'Reprogramadas',
};
const COLUNA_DIAS: Record<Recorte, string> = {
  atrasadas: 'Dias de atraso',
  vencendo: 'Dias para vencer',
  reprogramadas: 'Dias além da linha de base',
};
const ID_TABELA = 'bi-prazos-etapas';

/**
 * Prazos: a curva física prevista × realizada e as etapas que pedem conversa.
 *
 * O previsto é LINEAR entre o início e o fim de cada etapa — é o que o
 * cronograma promete sem curva de distribuição cadastrada (o banco não guarda
 * uma). O realizado é o executado acumulado pelos boletins aprovados até cada
 * dia, e no dia de hoje bate com o avanço físico da obra.
 */
export default function VisaoPrazos(ctx: ContextoVisao) {
  const { dados, escopo, hoje, nomeObra, nomeFuncionario } = ctx;
  const q = useMemo(() => quadroPrazos(dados, escopo, hoje), [dados, escopo, hoje]);
  const [recorte, setRecorte] = useState<Recorte>('atrasadas');
  const escolher = (r: Recorte) => {
    setRecorte(r);
    rolarPara(ID_TABELA);
  };

  const curva = q.curva.map((c) => ({ rotulo: c.balde.rotulo, previsto: c.previsto, realizado: c.realizado }));
  const temCurva = curva.some((c) => c.previsto !== null || c.realizado !== null);
  const porObra = q.atrasosPorObra.map((l) => ({ id: l.projetoId, nome: encurtar(nomeObra(l.projetoId)), etapas: l.etapas, maiorAtraso: l.maiorAtraso }));
  const obrasAtrasadas = q.atrasosPorObra.length;
  const linhas = q[recorte];
  const desvioTom = q.desvioHoje === null ? '' : q.desvioHoje < 0 ? 'abaixo do previsto' : 'acima do previsto';

  const colunas: ColunaBI<EtapaComPrazo>[] = [
    { id: 'etapa', titulo: 'Etapa', render: (l) => l.etapa.nome, ordenar: (l) => l.etapa.nome, csv: (l) => l.etapa.nome },
    { id: 'obra', titulo: 'Obra', render: (l) => nomeObra(l.etapa.projetoId), ordenar: (l) => nomeObra(l.etapa.projetoId), csv: (l) => nomeObra(l.etapa.projetoId) },
    { id: 'responsavel', titulo: 'Responsável', render: (l) => nomeFuncionario(l.etapa.responsavelId), ordenar: (l) => nomeFuncionario(l.etapa.responsavelId), csv: (l) => nomeFuncionario(l.etapa.responsavelId) },
    ...(recorte === 'reprogramadas' ? [{
      id: 'base', titulo: 'Fim na linha de base', render: (l: EtapaComPrazo) => formatarDataBR(l.etapa.baselineFim),
      ordenar: (l: EtapaComPrazo) => l.etapa.baselineFim ?? '', csv: (l: EtapaComPrazo) => l.etapa.baselineFim,
    }] : []),
    { id: 'fim', titulo: 'Término', render: (l) => formatarDataBR(l.etapa.dataFim), ordenar: (l) => l.etapa.dataFim ?? '', csv: (l) => l.etapa.dataFim },
    { id: 'dias', titulo: COLUNA_DIAS[recorte], align: 'right', render: (l) => inteiro(l.dias), ordenar: (l) => l.dias, csv: (l) => l.dias },
    { id: 'avanco', titulo: 'Avanço', align: 'right', render: (l) => percentual(l.etapa.percentualExecutado), ordenar: (l) => l.etapa.percentualExecutado, csv: (l) => l.etapa.percentualExecutado },
  ];

  return (
    <div className="space-y-5">
      <FaixaKpis colunas={4}>
        <KpiBI
          rotulo="Etapas atrasadas"
          valor={inteiro(q.atrasadas.length)}
          detalhe={q.atrasadas.length > 0 ? `Em ${plural(obrasAtrasadas, 'obra', 'obras')} · maior atraso ${plural(q.maiorAtraso, 'dia', 'dias')}` : 'Nenhuma etapa vencida'}
          onClick={() => escolher('atrasadas')}
        />
        <KpiBI
          rotulo={`Vencem em ${JANELA_VENCIMENTO} dias`}
          valor={inteiro(q.vencendo.length)}
          detalhe="Etapas não concluídas com término próximo"
          onClick={() => escolher('vencendo')}
        />
        <KpiBI
          rotulo="Desvio físico hoje"
          valor={q.desvioHoje === null ? '—' : `${q.desvioHoje > 0 ? '+' : q.desvioHoje < 0 ? '−' : ''}${Math.abs(Math.round(q.desvioHoje))} p.p.`}
          detalhe={q.desvioHoje === null
            ? 'Sem etapas com datas no recorte'
            : `Previsto ${percentual(q.previstoHoje)} · realizado ${percentual(q.realizadoHoje)} · ${desvioTom}`}
        />
        <KpiBI
          rotulo="Reprogramadas"
          valor={inteiro(q.reprogramadas.length)}
          detalhe="Término depois da linha de base"
          onClick={() => escolher('reprogramadas')}
        />
      </FaixaKpis>

      <div className={GRADE_GRAFICOS}>
        <BlocoGrafico
          titulo="Previsto × realizado"
          descricao="Avanço físico acumulado. Previsto linear pelas datas de cada etapa; realizado pelos boletins aprovados."
          vazio={temCurva ? null : 'Nenhuma etapa com cronograma no recorte.'}
          tabela={{
            colunas: ['Período', 'Previsto', 'Realizado'],
            linhas: curva.map((c) => [c.rotulo, percentual(c.previsto), percentual(c.realizado)]),
          }}
        >
          {(tamanho) => (
            <GraficoLinhas
              dados={curva}
              categoria="rotulo"
              dominio={[0, 100]}
              tamanho={tamanho}
              formatar={(v) => percentual(v, 1)}
              formatarEixo={(v) => `${v}%`}
              series={[
                { chave: 'previsto', rotulo: 'Previsto', cor: SERIE.outros, tracejada: true },
                { chave: 'realizado', rotulo: 'Realizado', cor: SERIE.primaria },
              ]}
            />
          )}
        </BlocoGrafico>

        <BlocoGrafico
          titulo="Etapas atrasadas por obra"
          descricao="Posição atual. Clique numa barra para filtrar o painel pela obra."
          vazio={porObra.length > 0 ? null : 'Nenhuma etapa atrasada no recorte.'}
          tabela={{ colunas: ['Obra', 'Etapas atrasadas', 'Maior atraso (dias)'], linhas: porObra.map((l) => [nomeObra(l.id), l.etapas, l.maiorAtraso]) }}
        >
          {(tamanho) => (
            <GraficoBarras
              dados={tamanho === 'normal' ? porObra.slice(0, 8) : porObra}
              categoria="nome"
              deitado
              tamanho={tamanho}
              formatar={(v) => plural(v, 'etapa', 'etapas')}
              formatarEixo={inteiro}
              contagem
              onClicar={(l) => ctx.filtrar({ obraId: l.id })}
              series={[{ chave: 'etapas', rotulo: 'Etapas atrasadas', cor: ESTADO.negativo }]}
            />
          )}
        </BlocoGrafico>
      </div>

      <TabelaBI
        // Cada recorte tem a sua coluna de dias e a sua ordem natural.
        key={recorte}
        id={ID_TABELA}
        titulo="Etapas"
        descricao="Posição atual do cronograma."
        linhas={linhas}
        colunas={colunas}
        chave={(l) => l.etapa.id}
        onAbrir={(l) => ctx.abrirObra(l.etapa.projetoId)}
        rotuloAbrir={(l) => `Abrir obra ${nomeObra(l.etapa.projetoId)}`}
        arquivo={`etapas_${recorte}_${hoje}.csv`}
        vazio={`Nenhuma etapa ${ROTULO[recorte].toLowerCase()} no recorte.`}
        ordemInicial={{ coluna: 'dias', direcao: recorte === 'vencendo' ? 'asc' : 'desc' }}
        recortes={
          <FileiraPilulas rotulo="Recorte das etapas">
            {(Object.keys(ROTULO) as Recorte[]).map((r) => (
              <Pilula key={r} ativo={recorte === r} onClick={() => setRecorte(r)}>
                {ROTULO[r]} <span className="data-font">· {q[r].length}</span>
              </Pilula>
            ))}
          </FileiraPilulas>
        }
      />
    </div>
  );
}
