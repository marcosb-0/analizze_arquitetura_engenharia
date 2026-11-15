import { useMemo } from 'react';
import { FaixaKpis, Trena } from '../../ui';
import { StatusBadge } from '../../../constants/status';
import type { Projeto } from '../../../types';
import { quadroObras, SITUACOES } from '../../../lib/indicadores/calculos';
import { dinheiro, inteiro, percentual } from '../../../lib/indicadores/formato';
import { formatarDataBR } from '../../../lib/data';
import BlocoGrafico from '../BlocoGrafico';
import KpiBI from '../KpiBI';
import TabelaBI, { type ColunaBI } from '../TabelaBI';
import { GraficoBarras, GraficoRosca, type Fatia } from '../graficos';
import { SERIE } from '../cores';
import { encurtar, GRADE_GRAFICOS, rolarPara, type ContextoVisao } from '../contexto';

const COR_SITUACAO: Record<Projeto['situacao'], string> = {
  'Em Execução': SERIE.primaria,
  Finalizado: SERIE.secundaria,
  Planejamento: SERIE.terciaria,
  Pausado: SERIE.outros,
};
const ID_TABELA = 'bi-obras-tabela';

/**
 * Obras: a posição física de hoje. O avanço é o de `v_resumo_obra` — o MESMO
 * número que a lista de obras e o console mostram —, então nada aqui depende do
 * período; quem mostra a evolução no tempo é a visão Prazos.
 */
export default function VisaoObras(ctx: ContextoVisao) {
  const { projetos, resumos, escopo, acesso, nomeCliente, nomeObra } = ctx;
  const q = useMemo(() => quadroObras(projetos, resumos, escopo), [projetos, resumos, escopo]);
  const porId = useMemo(() => new Map(resumos.map((r) => [r.projetoId, r])), [resumos]);

  const avanco = q.obras
    .filter((o) => (porId.get(o.id)?.etapasTotal ?? 0) > 0)
    .map((o) => ({ id: o.id, nome: encurtar(o.nome), avanco: porId.get(o.id)?.avancoFisico ?? 0, situacao: o.situacao }))
    .sort((a, b) => b.avanco - a.avanco);
  const fatias: Fatia[] = SITUACOES.map((s) => ({
    chave: s, rotulo: s, valor: q.porSituacao.find((x) => x.situacao === s)?.obras ?? 0, cor: COR_SITUACAO[s],
  }));

  const r = (o: Projeto) => porId.get(o.id);
  const colunas: ColunaBI<Projeto>[] = [
    { id: 'obra', titulo: 'Obra', render: (o) => o.nome, ordenar: (o) => o.nome, csv: (o) => o.nome },
    { id: 'cliente', titulo: 'Cliente', render: (o) => nomeCliente(o.clienteId), ordenar: (o) => nomeCliente(o.clienteId), csv: (o) => nomeCliente(o.clienteId) },
    { id: 'responsavel', titulo: 'Responsável', render: (o) => o.responsavelInterno || '—', ordenar: (o) => o.responsavelInterno, csv: (o) => o.responsavelInterno },
    { id: 'situacao', titulo: 'Situação', render: (o) => <StatusBadge type="projeto" status={o.situacao} />, ordenar: (o) => o.situacao, csv: (o) => o.situacao },
    { id: 'inicio', titulo: 'Início', render: (o) => formatarDataBR(o.dataInicio), ordenar: (o) => o.dataInicio, csv: (o) => o.dataInicio },
    { id: 'fim', titulo: 'Término', render: (o) => formatarDataBR(o.dataFim), ordenar: (o) => o.dataFim, csv: (o) => o.dataFim },
    {
      id: 'avanco', titulo: 'Avanço físico', align: 'right',
      render: (o) => (r(o)?.etapasTotal ? (
        <span className="inline-flex items-center gap-2">
          <Trena className="w-16" altura={6} percentual={r(o)!.avancoFisico} rotulo={`Avanço de ${o.nome}`} />
          {percentual(r(o)!.avancoFisico)}
        </span>
      ) : 'Sem cronograma'),
      ordenar: (o) => (r(o)?.etapasTotal ? r(o)!.avancoFisico : -1),
      csv: (o) => (r(o)?.etapasTotal ? r(o)!.avancoFisico : null),
    },
    { id: 'etapas', titulo: 'Etapas concluídas', align: 'right', render: (o) => `${inteiro(r(o)?.etapasConcluidas ?? 0)} de ${inteiro(r(o)?.etapasTotal ?? 0)}`, ordenar: (o) => r(o)?.etapasConcluidas ?? 0, csv: (o) => r(o)?.etapasConcluidas ?? 0 },
    { id: 'atrasadas', titulo: 'Etapas atrasadas', align: 'right', render: (o) => inteiro(r(o)?.etapasAtrasadas ?? 0), ordenar: (o) => r(o)?.etapasAtrasadas ?? 0, csv: (o) => r(o)?.etapasAtrasadas ?? 0 },
    { id: 'pendentes', titulo: 'Medições a aprovar', align: 'right', render: (o) => inteiro(r(o)?.medicoesPendentes ?? 0), ordenar: (o) => r(o)?.medicoesPendentes ?? 0, csv: (o) => r(o)?.medicoesPendentes ?? 0 },
    ...(acesso.valores ? [{
      id: 'orcado', titulo: 'Orçado', align: 'right' as const, render: (o: Projeto) => dinheiro(r(o)?.valorOrcado ?? 0),
      ordenar: (o: Projeto) => r(o)?.valorOrcado ?? 0, csv: (o: Projeto) => r(o)?.valorOrcado ?? 0,
    }] : []),
  ];

  return (
    <div className="space-y-5">
      <FaixaKpis colunas={4}>
        <KpiBI
          rotulo="Obras no recorte"
          valor={inteiro(q.obras.length)}
          detalhe={`${inteiro(q.emExecucao)} em execução`}
          onClick={() => rolarPara(ID_TABELA)}
        />
        <KpiBI
          rotulo="Avanço físico médio"
          valor={percentual(q.avancoMedio)}
          detalhe={q.obrasComCronograma > 0 ? `Média de ${inteiro(q.obrasComCronograma)} ${q.obrasComCronograma === 1 ? 'obra' : 'obras'} com cronograma` : 'Nenhuma obra com cronograma'}
          onClick={() => ctx.irPara('prazos')}
        />
        <KpiBI
          rotulo="Etapas concluídas"
          valor={`${inteiro(q.etapasConcluidas)} de ${inteiro(q.etapasTotal)}`}
          detalhe={q.etapasTotal > 0 ? percentual((q.etapasConcluidas / q.etapasTotal) * 100) + ' das etapas' : 'Sem etapas cadastradas'}
        />
        <KpiBI
          rotulo="Obras com atraso"
          valor={inteiro(q.obrasComAtraso)}
          detalhe="Ao menos uma etapa vencida · ver Prazos"
          onClick={() => ctx.irPara('prazos')}
        />
      </FaixaKpis>

      <div className={GRADE_GRAFICOS}>
        <BlocoGrafico
          titulo="Avanço físico por obra"
          descricao="Ponderado pelo orçamento, como no console da obra. Clique para filtrar o painel."
          vazio={avanco.length > 0 ? null : 'Nenhuma obra do recorte tem cronograma.'}
          tabela={{ colunas: ['Obra', 'Avanço'], linhas: avanco.map((a) => [nomeObra(a.id), percentual(a.avanco)]) }}
        >
          {(tamanho) => (
            <GraficoBarras
              dados={tamanho === 'normal' ? avanco.slice(0, 8) : avanco}
              categoria="nome"
              deitado
              dominio={[0, 100]}
              tamanho={tamanho}
              formatar={(v) => percentual(v)}
              onClicar={(a) => ctx.filtrar({ obraId: a.id })}
              series={[{ chave: 'avanco', rotulo: 'Avanço físico', cor: SERIE.primaria }]}
            />
          )}
        </BlocoGrafico>

        <BlocoGrafico
          titulo="Obras por situação"
          descricao="Clique numa situação para filtrar o painel."
          vazio={q.obras.length > 0 ? null : 'Nenhuma obra no recorte.'}
          tabela={{ colunas: ['Situação', 'Obras'], linhas: fatias.map((f) => [f.rotulo, f.valor]) }}
        >
          {(tamanho) => (
            <GraficoRosca
              fatias={fatias}
              tamanho={tamanho}
              formatar={inteiro}
              rotuloTotal="obras"
              ativa={ctx.filtros.situacao}
              onClicar={(f) => ctx.filtrar({ situacao: ctx.filtros.situacao === f.chave ? null : (f.chave as Projeto['situacao']) })}
            />
          )}
        </BlocoGrafico>
      </div>

      <TabelaBI
        id={ID_TABELA}
        titulo="Obras"
        descricao="Posição atual de cada obra do recorte."
        linhas={q.obras}
        colunas={colunas}
        chave={(o) => o.id}
        onAbrir={(o) => ctx.abrirObra(o.id)}
        rotuloAbrir={(o) => `Abrir obra ${o.nome}`}
        arquivo={`obras_${escopo.intervalo.ate}.csv`}
        vazio="Nenhuma obra corresponde aos filtros."
        ordemInicial={{ coluna: 'avanco', direcao: 'desc' }}
      />
    </div>
  );
}
