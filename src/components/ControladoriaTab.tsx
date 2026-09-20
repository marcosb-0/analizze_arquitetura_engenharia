import { memo, useMemo } from 'react';
import { ArrowRight, Briefcase, FileText, Landmark, RefreshCw, Wallet } from 'lucide-react';
import type { FontesControladoria } from '../lib/controladoria';
import { montarControladoria } from '../lib/controladoria';
import { formatarDataBR } from '../lib/data';
import { Button, Card, Chip, FaixaKpis, Kpi, PaginaAba, Secao, TableWrap, Td, Th } from './ui';

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

  return (
    <PaginaAba largura="cheia">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-xl font-bold text-slate-900">Como está a empresa?</h1>
          <p className="mt-1 text-sm text-slate-600">
            Comercial, obras e financeiro em uma leitura. Valores registrados no sistema; abra o módulo de cada informação para investigar.
          </p>
        </div>
        <Button variante="secundario" onClick={() => void onRecarregar()} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" /> Atualizar custos e compromissos
        </Button>
      </header>

      {loading && <p role="status" className="text-sm text-slate-600">Carregando dados da empresa…</p>}
      {!loading && !raiz && (
        <Card role="status">
          <p className="text-sm font-semibold text-slate-900">Custos por centro indisponíveis</p>
          <p className="mt-1 text-xs text-slate-600">Atualize a tela para reler o razão. Os outros indicadores permanecem visíveis.</p>
        </Card>
      )}

      <Secao titulo="Visão da empresa" descricao="Receitas e despesas lançadas não incluem compromissos; eles aparecem em indicador próprio.">
        <FaixaKpis>
          <Kpi rotulo="Receita lançada" valor={raiz ? dinheiro(raiz.receitaLancadaArvore) : '—'} detalhe="Todos os centros de custo" onClick={() => onNavigate('empresa')} />
          <Kpi rotulo="Despesa lançada" valor={raiz ? dinheiro(raiz.despesaLancadaArvore) : '—'} detalhe="Todos os centros de custo" onClick={() => onNavigate('empresa')} />
          <Kpi rotulo="Resultado por competência" valor={raiz ? dinheiro(raiz.receitaLancadaArvore - raiz.despesaLancadaArvore) : '—'} detalhe="Receita lançada menos despesa lançada" onClick={() => onNavigate('empresa')} />
          <Kpi rotulo="Resultado de caixa" valor={raiz ? dinheiro(raiz.receitaRecebidaArvore - raiz.despesaPagaArvore) : '—'} detalhe="Recebido menos pago" onClick={() => onNavigate('empresa')} />
        </FaixaKpis>
      </Secao>

      <div className="grid gap-6 xl:grid-cols-3">
        <Secao titulo="Comercial" descricao="O que está em negociação" icone={<FileText size={17} />}>
          <div className="space-y-3">
            <p className="text-2xl font-bold data-font text-slate-900">{dinheiro(quadro.valorEmNegociacao)}</p>
            <p className="text-xs text-slate-600">{quadro.propostasEnviadas} proposta{quadro.propostasEnviadas === 1 ? '' : 's'} enviada{quadro.propostasEnviadas === 1 ? '' : 's'}; propostas aprovadas não entram neste valor.</p>
            <Button variante="acao" onClick={() => onNavigate('propostas')}>Abrir propostas <ArrowRight size={14} aria-hidden="true" /></Button>
          </div>
        </Secao>
        <Secao titulo="Operação" descricao="Execução das obras" icone={<Briefcase size={17} />}>
          <div className="space-y-3">
            <p className="text-2xl font-bold data-font text-slate-900">{quadro.obrasEmExecucao} <span className="text-sm font-semibold font-sans">em execução</span></p>
            <div className="flex flex-wrap gap-2">
              <Chip tom="atencao">{quadro.etapasAtrasadas} etapas atrasadas</Chip>
              <Chip tom="informativo">{quadro.medicoesPendentes} medições pendentes</Chip>
            </div>
            <Button variante="acao" onClick={() => onNavigate('projetos')}>Abrir obras <ArrowRight size={14} aria-hidden="true" /></Button>
          </div>
        </Secao>
        <Secao titulo="Financeiro" descricao="Compromissos e desembolsos em estágios diferentes" icone={<Wallet size={17} />}>
          <div className="space-y-3">
            <p className="text-2xl font-bold data-font text-slate-900">{dinheiro(quadro.compromissosAtivos)}</p>
            <p className="text-xs text-slate-600">Compromissos ativos. Não são somados à despesa lançada.</p>
            <Button variante="acao" onClick={() => onNavigate('empresa')}>Abrir financeiro <ArrowRight size={14} aria-hidden="true" /></Button>
          </div>
        </Secao>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <Secao className="min-w-0" titulo="Resultado por obra" descricao="Valores do resultado por obra calculado no banco. Abra uma obra para conferir orçamento, medições e plano." acoes={<Button variante="acao" onClick={() => onNavigate('projetos')}>Todas as obras <ArrowRight size={14} aria-hidden="true" /></Button>}>
          {quadro.obras.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhuma obra cadastrada.</p>
          ) : (
            <TableWrap>
              <thead><tr><Th fixa>Obra</Th><Th align="right">Orçado</Th><Th align="right">Faturado</Th><Th align="right">Despesa lançada</Th><Th align="right">Resultado</Th><Th>Ação</Th></tr></thead>
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
          <Secao titulo="Custos por área" descricao="Acumulado do razão por subárvore. Cada despesa aparece em um único centro." icone={<Landmark size={17} />}>
            {quadro.grupos.length === 0 ? <p className="text-sm text-slate-600">Sem centros de custo para mostrar.</p> : (
              <div className="space-y-3">
                {quadro.grupos.map((grupo) => (
                  <div key={grupo.centroId} className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-2 text-sm">
                    <span className="text-slate-700">{grupo.nome}</span>
                    <span className="data-font font-semibold text-slate-900">{dinheiro(grupo.despesaLancadaArvore)}</span>
                  </div>
                ))}
                <Button variante="acao" onClick={() => onNavigate('empresa')}>Ver centros de custo <ArrowRight size={14} aria-hidden="true" /></Button>
              </div>
            )}
          </Secao>
          <Secao titulo="Margem prevista" descricao="Estimativa do orçamento, separada do resultado financeiro realizado.">
            <p className="text-2xl font-bold data-font text-slate-900">{quadro.margemCobertura.completas ? dinheiro(quadro.margemProjetada) : '—'}</p>
            <p className="mt-2 text-xs text-slate-600">Custos conhecidos em {quadro.margemCobertura.completas} de {quadro.margemCobertura.total} obras com análise de margem. Obras incompletas ficam fora da soma.</p>
          </Secao>
        </div>
      </div>

      <Secao titulo="Fatos recentes" descricao="Registros atuais de propostas, medições, compromissos e razão. Os valores aqui não formam um total." acoes={<Button variante="acao" onClick={() => onNavigate('empresa')}>Abrir razão <ArrowRight size={14} aria-hidden="true" /></Button>}>
        {quadro.fatos.length === 0 ? <p className="text-sm text-slate-600">Nenhum fato recente para mostrar.</p> : (
          <div className="grid gap-2 md:grid-cols-2">
            {quadro.fatos.map((fato) => {
              const projeto = fontes.projetos.find((item) => item.id === fato.projetoId);
              const destino = fato.propostaId ? 'propostas' : fato.origem === 'Financeiro' ? 'empresa' : 'projetos';
              const registroId = fato.propostaId ?? (destino === 'projetos' ? fato.projetoId : undefined);
              return (
                <Card key={fato.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{fato.titulo}</p>
                    <p className="mt-1 text-2xs text-slate-600">{fato.origem} · {formatarDataBR(fato.data)}{projeto ? ` · ${projeto.nome}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {fato.valor !== undefined && <span className="data-font text-xs font-bold text-slate-900">{dinheiro(fato.valor)}</span>}
                    <Button variante="acao" tamanho="sm" onClick={() => onNavigate(destino, registroId)}>
                      Abrir {destino === 'propostas' ? 'proposta' : destino === 'projetos' ? 'obra' : 'razão'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Secao>
    </PaginaAba>
  );
}

export default memo(ControladoriaTab);
