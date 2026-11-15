import { useMemo, useState } from 'react';
import { Chip, FaixaKpis, FileiraPilulas, Pilula, type TomChip } from '../../ui';
import { quadroMedicoes } from '../../../lib/indicadores/calculos';
import { decimal, dinheiro, dinheiroCurto, inteiro, percentual, plural } from '../../../lib/indicadores/formato';
import { formatarDataBR } from '../../../lib/data';
import type { MedicaoBI } from '../../../lib/indicadores/tipos';
import BlocoGrafico from '../BlocoGrafico';
import KpiBI from '../KpiBI';
import TabelaBI, { type ColunaBI } from '../TabelaBI';
import { GraficoBarras, GraficoRosca } from '../graficos';
import { ESTADO, SERIE } from '../cores';
import { encurtar, GRADE_GRAFICOS, rolarPara, type ContextoVisao } from '../contexto';

type Status = MedicaoBI['status'];
const STATUS: Status[] = ['Aprovada', 'Pendente', 'Rejeitada'];
const COR_STATUS: Record<Status, string> = { Aprovada: ESTADO.positivo, Pendente: ESTADO.atencao, Rejeitada: ESTADO.negativo };
const TOM_STATUS: Record<Status, TomChip> = { Aprovada: 'positivo', Pendente: 'atencao', Rejeitada: 'negativo' };
const ID_TABELA = 'bi-medicoes-boletins';

/**
 * Medições: quantos boletins, em que estado e quanto valeram. O status é cor de
 * ESTADO (verde/âmbar/vermelho) e nunca aparece sem o nome ao lado.
 */
export default function VisaoMedicoes(ctx: ContextoVisao) {
  const { dados, escopo, acesso, comparar, rotuloAnterior, nomeObra } = ctx;
  const q = useMemo(() => quadroMedicoes(dados, escopo), [dados, escopo]);
  const [recorte, setRecorte] = useState<Status | null>(null);
  const escolher = (s: Status | null) => {
    setRecorte(s);
    rolarPara(ID_TABELA);
  };

  const evolucao = q.evolucao.map((b) => ({ rotulo: b.balde.rotulo, Aprovada: b.Aprovada, Pendente: b.Pendente, Rejeitada: b.Rejeitada }));
  const porStatus = STATUS.map((s) => ({ chave: s, rotulo: s, valor: q.boletins.filter((m) => m.status === s).length, cor: COR_STATUS[s] }));
  const porObra = q.valorPorObra.map((l) => ({ id: l.projetoId, nome: encurtar(nomeObra(l.projetoId)), valor: l.valor, boletins: l.boletins }));
  const boletins = recorte ? q.boletins.filter((m) => m.status === recorte) : q.boletins;

  const colunas: ColunaBI<MedicaoBI>[] = [
    { id: 'data', titulo: 'Data', render: (m) => formatarDataBR(m.data), ordenar: (m) => m.data, csv: (m) => m.data },
    { id: 'obra', titulo: 'Obra', render: (m) => nomeObra(m.projetoId), ordenar: (m) => nomeObra(m.projetoId), csv: (m) => nomeObra(m.projetoId) },
    { id: 'etapa', titulo: 'Etapa', render: (m) => m.etapaNome ?? '—', ordenar: (m) => m.etapaNome ?? '', csv: (m) => m.etapaNome },
    { id: 'avanco', titulo: 'Avanço', align: 'right', render: (m) => percentual(m.percentual, 1), ordenar: (m) => m.percentual, csv: (m) => m.percentual },
    {
      id: 'quantidade', titulo: 'Quantidade', align: 'right',
      render: (m) => (m.quantidade === undefined ? '—' : `${decimal(m.quantidade)} ${m.unidade ?? ''}`),
      ordenar: (m) => m.quantidade ?? -1, csv: (m) => m.quantidade,
    },
    { id: 'status', titulo: 'Status', render: (m) => <Chip tom={TOM_STATUS[m.status]} ponto>{m.status}</Chip>, ordenar: (m) => m.status, csv: (m) => m.status },
    ...(acesso.valores ? [{
      id: 'valor', titulo: 'Valor', align: 'right' as const, render: (m: MedicaoBI) => (m.status === 'Aprovada' ? dinheiro(m.valor) : '—'),
      ordenar: (m: MedicaoBI) => m.valor, csv: (m: MedicaoBI) => (m.status === 'Aprovada' ? m.valor : null),
    }] : []),
  ];

  return (
    <div className="space-y-5">
      <FaixaKpis colunas={4}>
        <KpiBI
          rotulo="Boletins no período"
          valor={inteiro(q.total.atual)}
          comparado={comparar ? q.total : null}
          rotuloAnterior={rotuloAnterior}
          detalhe={`${inteiro(q.aprovadas.atual)} aprovados · ${inteiro(q.pendentes)} pendentes · ${inteiro(q.rejeitadas)} rejeitados`}
          onClick={() => escolher(null)}
        />
        {acesso.valores && (
          <KpiBI
            rotulo="Valor aprovado"
            valor={dinheiroCurto(q.valorAprovado.atual)}
            titulo={dinheiro(q.valorAprovado.atual)}
            comparado={comparar ? q.valorAprovado : null}
            sentido="alta-boa"
            rotuloAnterior={rotuloAnterior}
            onClick={() => escolher('Aprovada')}
          />
        )}
        <KpiBI
          rotulo="Taxa de aprovação"
          valor={percentual(q.taxaAprovacao)}
          detalhe={q.taxaAprovacao === null ? 'Nenhum boletim decidido no período' : 'Aprovados ÷ (aprovados + rejeitados)'}
          onClick={() => escolher('Rejeitada')}
        />
        <KpiBI
          rotulo="Aguardando aprovação"
          valor={inteiro(q.aguardandoAprovacao)}
          detalhe="Pendentes de qualquer data · posição atual"
          onClick={() => escolher('Pendente')}
        />
      </FaixaKpis>

      <div className={GRADE_GRAFICOS}>
        <BlocoGrafico
          titulo="Evolução das medições"
          descricao="Boletins por data de medição, empilhados por status."
          vazio={q.total.atual > 0 ? null : 'Nenhum boletim registrado no período.'}
          tabela={{ colunas: ['Período', ...STATUS], linhas: evolucao.map((b) => [b.rotulo, b.Aprovada, b.Pendente, b.Rejeitada]) }}
        >
          {(tamanho) => (
            <GraficoBarras
              dados={evolucao}
              categoria="rotulo"
              empilhado
              tamanho={tamanho}
              formatar={(v) => plural(v, 'boletim', 'boletins')}
              formatarEixo={inteiro}
              contagem
              series={STATUS.map((s) => ({ chave: s, rotulo: s, cor: COR_STATUS[s] }))}
            />
          )}
        </BlocoGrafico>

        <BlocoGrafico
          titulo="Boletins por status"
          descricao="Clique num status para recortar a tabela abaixo."
          vazio={q.total.atual > 0 ? null : 'Nenhum boletim registrado no período.'}
          tabela={{ colunas: ['Status', 'Boletins'], linhas: porStatus.map((f) => [f.rotulo, f.valor]) }}
        >
          {(tamanho) => (
            <GraficoRosca
              fatias={porStatus}
              tamanho={tamanho}
              formatar={inteiro}
              rotuloTotal="boletins"
              ativa={recorte}
              onClicar={(f) => escolher(recorte === f.chave ? null : (f.chave as Status))}
            />
          )}
        </BlocoGrafico>

        <BlocoGrafico
          titulo={acesso.valores ? 'Valor aprovado por obra' : 'Boletins por obra'}
          descricao="No período. Clique numa barra para filtrar o painel pela obra."
          vazio={porObra.length > 0 ? null : 'Nenhuma obra com boletim no período.'}
          tabela={{
            colunas: ['Obra', 'Boletins', ...(acesso.valores ? ['Valor aprovado'] : [])],
            linhas: porObra.map((l) => [nomeObra(l.id), l.boletins, ...(acesso.valores ? [dinheiro(l.valor)] : [])]),
          }}
          className="xl:col-span-2"
        >
          {(tamanho) => (
            <GraficoBarras
              dados={tamanho === 'normal' ? porObra.slice(0, 10) : porObra}
              categoria="nome"
              deitado
              tamanho={tamanho}
              formatar={acesso.valores ? dinheiro : (v) => plural(v, 'boletim', 'boletins')}
              formatarEixo={acesso.valores ? dinheiroCurto : inteiro}
                contagem={!acesso.valores}
              onClicar={(l) => ctx.filtrar({ obraId: l.id })}
              series={[acesso.valores
                ? { chave: 'valor', rotulo: 'Valor aprovado', cor: SERIE.primaria }
                : { chave: 'boletins', rotulo: 'Boletins', cor: SERIE.primaria }]}
            />
          )}
        </BlocoGrafico>
      </div>

      <TabelaBI
        id={ID_TABELA}
        titulo="Boletins do período"
        linhas={boletins}
        colunas={colunas}
        chave={(m) => m.id}
        onAbrir={(m) => ctx.abrirObra(m.projetoId)}
        rotuloAbrir={(m) => `Abrir obra ${nomeObra(m.projetoId)}`}
        arquivo={`medicoes_${escopo.intervalo.de}_${escopo.intervalo.ate}.csv`}
        vazio={recorte ? `Nenhum boletim ${recorte.toLowerCase()} no período.` : 'Nenhum boletim registrado no período.'}
        ordemInicial={{ coluna: 'data', direcao: 'desc' }}
        recortes={
          <FileiraPilulas rotulo="Status do boletim">
            <Pilula ativo={recorte === null} onClick={() => setRecorte(null)}>Todos</Pilula>
            {STATUS.map((s) => (
              <Pilula key={s} ativo={recorte === s} onClick={() => setRecorte(s)}>{s}</Pilula>
            ))}
          </FileiraPilulas>
        }
      />
    </div>
  );
}
