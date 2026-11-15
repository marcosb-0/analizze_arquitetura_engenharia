import { useMemo } from 'react';
import { Chip, FaixaKpis } from '../../ui';
import { quadroFinanceiro, type LinhaFinanceiraObra } from '../../../lib/indicadores/calculos';
import { dinheiro, dinheiroCurto, plural } from '../../../lib/indicadores/formato';
import { formatarDataBR } from '../../../lib/data';
import type { FaturamentoBI } from '../../../lib/indicadores/tipos';
import BlocoGrafico from '../BlocoGrafico';
import KpiBI from '../KpiBI';
import TabelaBI, { type ColunaBI } from '../TabelaBI';
import { GraficoBarras, GraficoRosca, type Fatia } from '../graficos';
import { SERIE } from '../cores';
import { encurtar, GRADE_GRAFICOS, rolarPara, type ContextoVisao } from '../contexto';

const SEM_RAZAO = 'Sem acesso ao financeiro';
const SEM_CONTRATOS = 'Sem acesso aos contratos';

/**
 * Financeiro: contratado → medido → faturado → recebido, e os dois saldos que
 * a cadeia deixa (o que falta medir do contrato e o que falta receber do
 * faturado). As fórmulas estão em `quadroFinanceiro`; aqui só se escolhe o que
 * cada papel pode ver.
 */
export default function VisaoFinanceiro(ctx: ContextoVisao) {
  const { dados, escopo, hoje, acesso, comparar, rotuloAnterior, nomeObra } = ctx;
  const q = useMemo(() => quadroFinanceiro(dados, escopo, hoje), [dados, escopo, hoje]);
  const vigentes = q.porContrato.length;

  const mensal = q.mensal.map((m) => ({ rotulo: m.balde.rotulo, medido: m.medido, recebido: m.recebido }));
  const temMensal = mensal.some((m) => m.medido > 0 || m.recebido > 0);

  const porObra = q.porObra
    .map((l) => ({ id: l.projetoId, nome: encurtar(nomeObra(l.projetoId)), contratado: l.contratado, medido: l.medido }))
    .filter((l) => l.contratado > 0 || l.medido > 0)
    .sort((a, b) => b.contratado + b.medido - (a.contratado + a.medido));

  // Rosca: os três maiores contratos e o resto em "Outros" — uma quinta cor
  // não passaria no validador ao lado das outras.
  const fatias: Fatia[] = useMemo(() => {
    const ordenados = [...q.porContrato].sort((a, b) => b.contrato.valorTotal - a.contrato.valorTotal);
    const cores = [SERIE.primaria, SERIE.secundaria, SERIE.terciaria];
    const topo = ordenados.slice(0, 3).map((c, i) => ({
      chave: c.contrato.id, rotulo: `${c.contrato.numero} · ${nomeObra(c.contrato.projetoId)}`, valor: c.contrato.valorTotal, cor: cores[i],
    }));
    const resto = ordenados.slice(3);
    return resto.length > 0
      ? [...topo, { chave: 'outros', rotulo: `Outros ${resto.length} contratos`, valor: resto.reduce((t, c) => t + c.contrato.valorTotal, 0), cor: SERIE.outros }]
      : topo;
  }, [q.porContrato, nomeObra]);

  const colunasObra: ColunaBI<LinhaFinanceiraObra>[] = [
    { id: 'obra', titulo: 'Obra', render: (l) => nomeObra(l.projetoId), ordenar: (l) => nomeObra(l.projetoId), csv: (l) => nomeObra(l.projetoId) },
    ...(acesso.contratos ? [{ id: 'contratado', titulo: 'Contratado', align: 'right' as const, render: (l: LinhaFinanceiraObra) => dinheiro(l.contratado), ordenar: (l: LinhaFinanceiraObra) => l.contratado, csv: (l: LinhaFinanceiraObra) => l.contratado }] : []),
    { id: 'medido', titulo: 'Medido (acum.)', align: 'right', render: (l) => dinheiro(l.medido), ordenar: (l) => l.medido, csv: (l) => l.medido },
    ...(acesso.razao ? [
      { id: 'faturado', titulo: 'Faturado', align: 'right' as const, render: (l: LinhaFinanceiraObra) => dinheiro(l.faturado), ordenar: (l: LinhaFinanceiraObra) => l.faturado, csv: (l: LinhaFinanceiraObra) => l.faturado },
      { id: 'recebido', titulo: 'Recebido', align: 'right' as const, render: (l: LinhaFinanceiraObra) => dinheiro(l.recebido), ordenar: (l: LinhaFinanceiraObra) => l.recebido, csv: (l: LinhaFinanceiraObra) => l.recebido },
      { id: 'afaturar', titulo: 'A faturar', align: 'right' as const, render: (l: LinhaFinanceiraObra) => dinheiro(l.aFaturar), ordenar: (l: LinhaFinanceiraObra) => l.aFaturar, csv: (l: LinhaFinanceiraObra) => l.aFaturar },
      { id: 'areceber', titulo: 'A receber', align: 'right' as const, render: (l: LinhaFinanceiraObra) => dinheiro(l.aReceber), ordenar: (l: LinhaFinanceiraObra) => l.aReceber, csv: (l: LinhaFinanceiraObra) => l.aReceber },
    ] : []),
    ...(acesso.contratos ? [{ id: 'saldo', titulo: 'Saldo contratual', align: 'right' as const, render: (l: LinhaFinanceiraObra) => (l.saldo === null ? '—' : dinheiro(l.saldo)), ordenar: (l: LinhaFinanceiraObra) => l.saldo ?? -Infinity, csv: (l: LinhaFinanceiraObra) => l.saldo }] : []),
  ];

  const situacaoFat = (l: FaturamentoBI) => (l.pago ? 'Recebido' : l.vencimento < hoje ? 'Vencido' : 'A receber');
  const colunasFat: ColunaBI<FaturamentoBI>[] = [
    { id: 'data', titulo: 'Data', render: (l) => formatarDataBR(l.data), ordenar: (l) => l.data, csv: (l) => l.data },
    { id: 'obra', titulo: 'Obra', render: (l) => nomeObra(l.projetoId), ordenar: (l) => nomeObra(l.projetoId), csv: (l) => nomeObra(l.projetoId) },
    { id: 'descricao', titulo: 'Descrição', render: (l) => l.descricao, csv: (l) => l.descricao },
    { id: 'vencimento', titulo: 'Vencimento', render: (l) => formatarDataBR(l.vencimento), ordenar: (l) => l.vencimento, csv: (l) => l.vencimento },
    {
      id: 'situacao', titulo: 'Situação', render: (l) => {
        const s = situacaoFat(l);
        return <Chip tom={s === 'Recebido' ? 'positivo' : s === 'Vencido' ? 'negativo' : 'atencao'} ponto>{s}</Chip>;
      }, ordenar: situacaoFat, csv: situacaoFat,
    },
    { id: 'valor', titulo: 'Valor', align: 'right', render: (l) => dinheiro(l.valor), ordenar: (l) => l.valor, csv: (l) => l.valor },
  ];

  return (
    <div className="space-y-5">
      <FaixaKpis colunas={3}>
        <KpiBI
          rotulo="Valor contratado"
          valor={acesso.contratos ? dinheiroCurto(q.contratado) : '—'}
          titulo={acesso.contratos ? dinheiro(q.contratado) : undefined}
          detalhe={acesso.contratos ? `${plural(vigentes, 'contrato vigente', 'contratos vigentes')} · posição atual` : SEM_CONTRATOS}
          onClick={acesso.contratos ? () => rolarPara('bi-fin-obras') : undefined}
        />
        <KpiBI
          rotulo="Medido no período"
          valor={dinheiroCurto(q.medido.atual)}
          titulo={dinheiro(q.medido.atual)}
          comparado={comparar ? q.medido : null}
          sentido="alta-boa"
          rotuloAnterior={rotuloAnterior}
          detalhe={`Acumulado: ${dinheiroCurto(q.medidoAcumulado)}`}
          onClick={() => ctx.irPara('medicoes')}
        />
        <KpiBI
          rotulo="Faturado no período"
          valor={acesso.razao ? dinheiroCurto(q.faturado.atual) : '—'}
          titulo={acesso.razao ? dinheiro(q.faturado.atual) : undefined}
          comparado={acesso.razao && comparar ? q.faturado : null}
          sentido="alta-boa"
          rotuloAnterior={rotuloAnterior}
          detalhe={acesso.razao ? `A faturar: ${dinheiroCurto(q.aFaturar)}` : SEM_RAZAO}
          onClick={acesso.razao ? () => rolarPara('bi-fin-faturamentos') : undefined}
        />
        <KpiBI
          rotulo="Recebido no período"
          valor={acesso.razao ? dinheiroCurto(q.recebido.atual) : '—'}
          titulo={acesso.razao ? dinheiro(q.recebido.atual) : undefined}
          comparado={acesso.razao && comparar ? q.recebido : null}
          sentido="alta-boa"
          rotuloAnterior={rotuloAnterior}
          detalhe={acesso.razao ? 'Faturamentos do período já quitados' : SEM_RAZAO}
          onClick={acesso.razao ? () => rolarPara('bi-fin-faturamentos') : undefined}
        />
        <KpiBI
          rotulo="Saldo contratual"
          valor={acesso.contratos ? dinheiroCurto(q.saldoContratual) : '—'}
          titulo={acesso.contratos ? dinheiro(q.saldoContratual) : undefined}
          detalhe={acesso.contratos ? 'Contratado − medido acumulado' : SEM_CONTRATOS}
          onClick={acesso.contratos ? () => rolarPara('bi-fin-obras') : undefined}
        />
        <KpiBI
          rotulo="A receber"
          valor={acesso.razao ? dinheiroCurto(q.aReceber) : '—'}
          titulo={acesso.razao ? dinheiro(q.aReceber) : undefined}
          detalhe={acesso.razao ? (q.vencido > 0 ? `${dinheiroCurto(q.vencido)} já vencido` : 'Nada vencido') : SEM_RAZAO}
          onClick={acesso.razao ? () => rolarPara('bi-fin-faturamentos') : undefined}
        />
      </FaixaKpis>

      <div className={GRADE_GRAFICOS}>
        <BlocoGrafico
          titulo={acesso.razao ? 'Medido × recebido' : 'Valor medido'}
          descricao="Medições aprovadas e faturamentos quitados, pela data de cada um."
          vazio={temMensal ? null : 'Nenhuma medição aprovada nem recebimento no período.'}
          tabela={{
            colunas: acesso.razao ? ['Período', 'Medido', 'Recebido'] : ['Período', 'Medido'],
            linhas: mensal.map((m) => (acesso.razao ? [m.rotulo, dinheiro(m.medido), dinheiro(m.recebido)] : [m.rotulo, dinheiro(m.medido)])),
          }}
        >
          {(tamanho) => (
            <GraficoBarras
              dados={mensal}
              categoria="rotulo"
              tamanho={tamanho}
              formatar={dinheiro}
              formatarEixo={dinheiroCurto}
              series={acesso.razao
                ? [{ chave: 'medido', rotulo: 'Medido', cor: SERIE.primaria }, { chave: 'recebido', rotulo: 'Recebido', cor: SERIE.secundaria }]
                : [{ chave: 'medido', rotulo: 'Medido', cor: SERIE.primaria }]}
            />
          )}
        </BlocoGrafico>

        <BlocoGrafico
          titulo={acesso.contratos ? 'Contratado × medido por obra' : 'Medido por obra'}
          descricao="Posição atual. Clique numa barra para filtrar o painel pela obra."
          vazio={porObra.length > 0 ? null : 'Nenhuma obra com contrato ou medição no recorte.'}
          tabela={{
            colunas: ['Obra', ...(acesso.contratos ? ['Contratado'] : []), 'Medido'],
            linhas: porObra.map((l) => [nomeObra(l.id), ...(acesso.contratos ? [dinheiro(l.contratado)] : []), dinheiro(l.medido)]),
          }}
        >
          {(tamanho) => (
            <GraficoBarras
              dados={tamanho === 'normal' ? porObra.slice(0, 8) : porObra}
              categoria="nome"
              deitado
              tamanho={tamanho}
              formatar={dinheiro}
              formatarEixo={dinheiroCurto}
              onClicar={(l) => ctx.filtrar({ obraId: l.id })}
              series={acesso.contratos
                ? [{ chave: 'contratado', rotulo: 'Contratado', cor: SERIE.primaria }, { chave: 'medido', rotulo: 'Medido', cor: SERIE.secundaria }]
                : [{ chave: 'medido', rotulo: 'Medido', cor: SERIE.primaria }]}
            />
          )}
        </BlocoGrafico>

        {acesso.contratos && (
          <BlocoGrafico
            titulo="Distribuição por contrato"
            descricao="Valor dos contratos vigentes. Clique num contrato para filtrar o painel."
            vazio={fatias.length > 0 ? null : 'Nenhum contrato vigente no recorte.'}
            tabela={{ colunas: ['Contrato', 'Valor'], linhas: fatias.map((f) => [f.rotulo, dinheiro(f.valor)]) }}
          >
            {(tamanho) => (
              <GraficoRosca
                fatias={fatias}
                tamanho={tamanho}
                formatar={dinheiroCurto}
                rotuloTotal="contratado"
                ativa={ctx.filtros.contratoId}
                onClicar={(f) => f.chave !== 'outros' && ctx.filtrar({ contratoId: ctx.filtros.contratoId === f.chave ? null : f.chave })}
              />
            )}
          </BlocoGrafico>
        )}
      </div>

      <TabelaBI
        id="bi-fin-obras"
        titulo="Financeiro por obra"
        descricao="Valores acumulados até hoje (posição), independente do período."
        linhas={q.porObra}
        colunas={colunasObra}
        chave={(l) => l.projetoId}
        onAbrir={(l) => ctx.abrirObra(l.projetoId)}
        rotuloAbrir={(l) => `Abrir obra ${nomeObra(l.projetoId)}`}
        arquivo={`financeiro_por_obra_${escopo.intervalo.ate}.csv`}
        vazio="Nenhuma obra com movimento financeiro no recorte."
        ordemInicial={{ coluna: acesso.contratos ? 'contratado' : 'medido', direcao: 'desc' }}
      />

      {acesso.razao && (
        <TabelaBI
          id="bi-fin-faturamentos"
          titulo="Faturamentos do período"
          descricao="Receitas de faturamento de obra lançadas no período."
          linhas={q.faturamentosDoPeriodo}
          colunas={colunasFat}
          chave={(l) => l.id}
          onAbrir={l => l.projetoId && ctx.abrirObra(l.projetoId)}
          rotuloAbrir={(l) => `Abrir obra ${nomeObra(l.projetoId)}`}
          arquivo={`faturamentos_${escopo.intervalo.de}_${escopo.intervalo.ate}.csv`}
          vazio="Nenhum faturamento lançado no período."
          ordemInicial={{ coluna: 'data', direcao: 'desc' }}
        />
      )}
    </div>
  );
}
