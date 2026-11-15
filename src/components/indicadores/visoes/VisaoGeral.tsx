import React, { useMemo } from 'react';
import { FaixaKpis } from '../../ui';
import { quadroFinanceiro, quadroMedicoes, quadroObras, quadroPrazos } from '../../../lib/indicadores/calculos';
import { dinheiro, dinheiroCurto, inteiro, percentual, plural } from '../../../lib/indicadores/formato';
import BlocoGrafico from '../BlocoGrafico';
import KpiBI from '../KpiBI';
import { GraficoBarras, type Serie } from '../graficos';
import { SERIE } from '../cores';
import { encurtar, GRADE_GRAFICOS, type ContextoVisao } from '../contexto';

/**
 * Visão geral: um número por área, cada um levando à sua categoria, e os dois
 * gráficos que mais respondem "como estão as obras" — dinheiro no tempo e
 * avanço por obra. Os números são os MESMOS das categorias (mesma função de
 * cálculo, mesmo escopo); aqui não há fórmula própria.
 *
 * Abaixo, fora dos filtros, a parte do painel antigo que responde "o que eu
 * preciso fazer agora" (`DashboardOverview`).
 */
export default function VisaoGeral(ctx: ContextoVisao & { foraDosFiltros: React.ReactNode }) {
  const { dados, projetos, resumos, escopo, hoje, acesso, comparar, rotuloAnterior, nomeObra, foraDosFiltros } = ctx;
  const obras = useMemo(() => quadroObras(projetos, resumos, escopo), [projetos, resumos, escopo]);
  const fin = useMemo(() => quadroFinanceiro(dados, escopo, hoje), [dados, escopo, hoje]);
  const med = useMemo(() => quadroMedicoes(dados, escopo), [dados, escopo]);
  const prazos = useMemo(() => quadroPrazos(dados, escopo, hoje), [dados, escopo, hoje]);

  const porId = useMemo(() => new Map(resumos.map((r) => [r.projetoId, r])), [resumos]);
  const avanco = obras.obras
    .filter((o) => (porId.get(o.id)?.etapasTotal ?? 0) > 0)
    .map((o) => ({ id: o.id, nome: encurtar(o.nome), avanco: porId.get(o.id)?.avancoFisico ?? 0 }))
    .sort((a, b) => b.avanco - a.avanco);

  // Sem valor em R$ (campo), o gráfico de tempo conta boletins aprovados.
  // As fatias de `fin` e `med` saem do mesmo `baldesDoIntervalo`, então o
  // índice casa.
  const tempo = fin.mensal.map((m, i) => ({ rotulo: m.balde.rotulo, medido: m.medido, recebido: m.recebido, aprovados: med.evolucao[i]?.Aprovada ?? 0 }));
  const seriesTempo: Serie<(typeof tempo)[number]>[] = acesso.valores
    ? [{ chave: 'medido', rotulo: 'Medido', cor: SERIE.primaria }, ...(acesso.razao ? [{ chave: 'recebido' as const, rotulo: 'Recebido', cor: SERIE.secundaria }] : [])]
    : [{ chave: 'aprovados', rotulo: 'Aprovados', cor: SERIE.primaria }];
  const temTempo = acesso.valores ? fin.mensal.some((m) => m.medido > 0 || m.recebido > 0) : med.aprovadas.atual > 0;

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <FaixaKpis colunas={3}>
          <KpiBI
            rotulo="Obras em execução"
            valor={inteiro(obras.emExecucao)}
            detalhe={`De ${plural(obras.obras.length, 'obra', 'obras')} no recorte`}
            onClick={() => ctx.irPara('obras')}
          />
          <KpiBI
            rotulo="Avanço físico médio"
            valor={percentual(obras.avancoMedio)}
            detalhe={obras.obrasComCronograma > 0 ? `${plural(obras.obrasComCronograma, 'obra', 'obras')} com cronograma` : 'Nenhuma obra com cronograma'}
            onClick={() => ctx.irPara('obras')}
          />
          {acesso.valores ? (
            <KpiBI
              rotulo="Medido no período"
              valor={dinheiroCurto(fin.medido.atual)}
              titulo={dinheiro(fin.medido.atual)}
              comparado={comparar ? fin.medido : null}
              sentido="alta-boa"
              rotuloAnterior={rotuloAnterior}
              onClick={() => ctx.irPara(acesso.razao ? 'financeiro' : 'medicoes')}
            />
          ) : (
            <KpiBI
              rotulo="Boletins aprovados"
              valor={inteiro(med.aprovadas.atual)}
              comparado={comparar ? med.aprovadas : null}
              sentido="alta-boa"
              rotuloAnterior={rotuloAnterior}
              onClick={() => ctx.irPara('medicoes')}
            />
          )}
          {acesso.razao && (
            <KpiBI
              rotulo="Recebido no período"
              valor={dinheiroCurto(fin.recebido.atual)}
              titulo={dinheiro(fin.recebido.atual)}
              comparado={comparar ? fin.recebido : null}
              sentido="alta-boa"
              rotuloAnterior={rotuloAnterior}
              detalhe={`A receber: ${dinheiroCurto(fin.aReceber)}`}
              onClick={() => ctx.irPara('financeiro')}
            />
          )}
          <KpiBI
            rotulo="Etapas atrasadas"
            valor={inteiro(prazos.atrasadas.length)}
            detalhe={prazos.atrasadas.length > 0 ? `Maior atraso: ${plural(prazos.maiorAtraso, 'dia', 'dias')}` : 'Nenhuma etapa vencida'}
            onClick={() => ctx.irPara('prazos')}
          />
          <KpiBI
            rotulo="Medições a aprovar"
            valor={inteiro(med.aguardandoAprovacao)}
            detalhe="Pendentes de qualquer data"
            onClick={() => ctx.irPara('medicoes')}
          />
        </FaixaKpis>

        <div className={GRADE_GRAFICOS}>
          <BlocoGrafico
            titulo={acesso.valores ? (acesso.razao ? 'Medido × recebido' : 'Valor medido') : 'Boletins aprovados'}
            descricao="No período escolhido, pela data de cada registro."
            vazio={temTempo ? null : 'Nada medido nem recebido no período.'}
            tabela={acesso.valores
              ? { colunas: ['Período', 'Medido', ...(acesso.razao ? ['Recebido'] : [])], linhas: fin.mensal.map((m) => [m.balde.rotulo, dinheiro(m.medido), ...(acesso.razao ? [dinheiro(m.recebido)] : [])]) }
              : { colunas: ['Período', 'Aprovados'], linhas: med.evolucao.map((b) => [b.balde.rotulo, b.Aprovada]) }}
          >
            {(tamanho) => (
              <GraficoBarras
                dados={tempo}
                categoria="rotulo"
                tamanho={tamanho}
                formatar={acesso.valores ? dinheiro : (v) => plural(v, 'boletim', 'boletins')}
                formatarEixo={acesso.valores ? dinheiroCurto : inteiro}
                contagem={!acesso.valores}
                series={seriesTempo}
              />
            )}
          </BlocoGrafico>

          <BlocoGrafico
            titulo="Avanço físico por obra"
            descricao="Posição atual. Clique numa barra para filtrar o painel pela obra."
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
        </div>
      </div>

      {foraDosFiltros}
    </div>
  );
}
