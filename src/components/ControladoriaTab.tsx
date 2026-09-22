import { memo, useMemo } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import type { FontesControladoria } from '../lib/controladoria';
import { montarControladoria } from '../lib/controladoria';
import { formatarDataBR } from '../lib/data';
import { Button, FaixaKpis, Kpi, PaginaAba, Secao, TableWrap, Td, Th } from './ui';

interface Props {
  fontes: FontesControladoria;
  loading: boolean;
  onNavigate: (aba: string, registroId?: string | null) => void;
  onRecarregar: () => Promise<void>;
}

const dinheiro = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function ControladoriaTab({ fontes, loading, onNavigate, onRecarregar }: Props) {
  const quadro = useMemo(() => montarControladoria(fontes), [fontes]);
  const { raiz } = quadro;
  const projetosPorId = useMemo(() => new Map(fontes.projetos.map((projeto) => [projeto.id, projeto.nome])), [fontes.projetos]);

  return (
    <PaginaAba largura="cheia">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900">Visão da empresa</h1>
        <Button variante="secundario" onClick={() => void onRecarregar()} disabled={loading} aria-label="Atualizar dados da empresa">
          <RefreshCw size={15} aria-hidden="true" /> Atualizar
        </Button>
      </header>

      {loading && <p role="status" className="text-sm text-slate-600">Carregando dados da empresa…</p>}
      {!loading && !raiz && (
        <p role="status" className="text-sm text-slate-600">Custos indisponíveis. Use Atualizar para tentar novamente.</p>
      )}

      <Secao titulo="Resultado financeiro" acoes={<Button variante="acao" onClick={() => onNavigate('empresa')}>Abrir razão <ArrowRight size={14} aria-hidden="true" /></Button>}>
        <FaixaKpis>
          <Kpi rotulo="Resultado por competência" valor={raiz ? dinheiro(raiz.receitaLancadaArvore - raiz.despesaLancadaArvore) : '—'} detalhe="Receitas − despesas lançadas" onClick={() => onNavigate('empresa')} />
          <Kpi rotulo="Resultado de caixa" valor={raiz ? dinheiro(raiz.receitaRecebidaArvore - raiz.despesaPagaArvore) : '—'} detalhe="Recebido − pago" onClick={() => onNavigate('empresa')} />
          <Kpi rotulo="Receitas lançadas" valor={raiz ? dinheiro(raiz.receitaLancadaArvore) : '—'} onClick={() => onNavigate('empresa')} />
          <Kpi rotulo="Despesas lançadas" valor={raiz ? dinheiro(raiz.despesaLancadaArvore) : '—'} onClick={() => onNavigate('empresa')} />
        </FaixaKpis>
      </Secao>

      <Secao titulo="Agora">
        <FaixaKpis colunas={3}>
          <Kpi rotulo="Em negociação" valor={dinheiro(quadro.valorEmNegociacao)} detalhe={`${quadro.propostasEnviadas} proposta${quadro.propostasEnviadas === 1 ? '' : 's'} enviada${quadro.propostasEnviadas === 1 ? '' : 's'}`} onClick={() => onNavigate('propostas')} />
          <Kpi rotulo="Obras em execução" valor={quadro.obrasEmExecucao} detalhe={`${quadro.etapasAtrasadas} etapas atrasadas · ${quadro.medicoesPendentes} medições pendentes`} onClick={() => onNavigate('projetos')} />
          <Kpi rotulo="Compromissos ativos" valor={dinheiro(quadro.compromissosAtivos)} detalhe="Ainda não lançados como despesa" onClick={() => onNavigate('empresa')} />
        </FaixaKpis>
      </Secao>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        <Secao className="min-w-0" titulo="Resultado por obra" acoes={<Button variante="acao" onClick={() => onNavigate('projetos')}>Todas as obras <ArrowRight size={14} aria-hidden="true" /></Button>}>
          {quadro.obras.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhuma obra cadastrada.</p>
          ) : (
            <TableWrap>
              <thead><tr><Th fixa>Obra</Th><Th align="right">Orçado</Th><Th align="right">Faturado</Th><Th align="right">Despesa</Th><Th align="right">Resultado</Th><Th>Ação</Th></tr></thead>
              <tbody>
                {quadro.obras.slice(0, 8).map(({ projeto, resultado, resumo, compromissos }) => (
                  <tr key={projeto.id}>
                    <Td fixa><span className="font-semibold text-slate-900">{projeto.nome}</span><span className="block text-2xs text-slate-500">{projeto.situacao}{resumo?.etapasAtrasadas ? ` · ${resumo.etapasAtrasadas} etapas atrasadas` : ''}</span></Td>
                    <Td align="right" mono>{resultado ? dinheiro(resultado.valorOrcado) : '—'}</Td>
                    <Td align="right" mono>{resultado ? dinheiro(resultado.receitaFaturada) : '—'}</Td>
                    <Td align="right" mono>{resultado ? dinheiro(resultado.despesaLancada) : '—'}</Td>
                    <Td align="right" mono>{resultado ? dinheiro(resultado.resultadoCompetencia) : '—'}{compromissos > 0 && <span className="block text-2xs text-slate-500">{dinheiro(compromissos)} comprometidos</span>}</Td>
                    <Td><Button variante="acao" tamanho="sm" onClick={() => onNavigate('projetos', projeto.id)}>Abrir obra</Button></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Secao>

        <div className="space-y-8">
          <Secao titulo="Despesas por área" acoes={<Button variante="acao" onClick={() => onNavigate('empresa')}>Ver centros <ArrowRight size={14} aria-hidden="true" /></Button>}>
            {quadro.grupos.length === 0 ? <p className="text-sm text-slate-600">Sem centros de custo para mostrar.</p> : (
              <div className="space-y-3">
                {quadro.grupos.map((grupo) => (
                  <div key={grupo.centroId} className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-2 text-sm">
                    <span className="text-slate-700">{grupo.nome}</span>
                    <span className="data-font font-semibold text-slate-900">{dinheiro(grupo.despesaLancadaArvore)}</span>
                  </div>
                ))}
              </div>
            )}
          </Secao>
          <Secao titulo="Margem prevista">
            <p className="text-2xl font-bold data-font text-slate-900">{quadro.margemCobertura.completas ? dinheiro(quadro.margemProjetada) : '—'}</p>
            <p className="mt-1 text-xs text-slate-600">{quadro.margemCobertura.completas} de {quadro.margemCobertura.total} obras com análise completa</p>
          </Secao>
        </div>
      </div>

      <Secao titulo="Registros recentes">
        {quadro.fatos.length === 0 ? <p className="text-sm text-slate-600">Nenhum fato recente para mostrar.</p> : (
          <ul className="divide-y divide-slate-200">
            {quadro.fatos.map((fato) => {
              const projeto = fato.projetoId ? projetosPorId.get(fato.projetoId) : undefined;
              const destino = fato.propostaId ? 'propostas' : fato.origem === 'Financeiro' ? 'empresa' : 'projetos';
              const registroId = fato.propostaId ?? (destino === 'projetos' ? fato.projetoId : undefined);
              return (
                <li key={fato.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{fato.titulo}</p>
                    <p className="text-xs text-slate-600">{fato.origem} · {formatarDataBR(fato.data)}{projeto ? ` · ${projeto}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {fato.valor !== undefined && <span className="data-font text-sm font-semibold text-slate-900">{dinheiro(fato.valor)}</span>}
                    <Button variante="acao" tamanho="sm" onClick={() => onNavigate(destino, registroId)} aria-label={`Abrir ${fato.titulo}`}><ArrowRight size={15} aria-hidden="true" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
    </PaginaAba>
  );
}

export default memo(ControladoriaTab);
