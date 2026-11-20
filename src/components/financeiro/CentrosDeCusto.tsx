import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Lock, Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { CentroCusto, CustoPorCentro, NovoCentroCusto, PatchCentroCusto, UsosCentroCusto } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../FeedbackContext';
import { Abas, Aviso, Button, Card, Checkbox, Chip, FaixaKpis, IconButton, PainelAba } from '../ui';
import { hojeISO } from '../../lib/data';
import { comparar } from '../../lib/indicadores/calculos';
import { dinheiro, dinheiroCurto } from '../../lib/indicadores/formato';
import { formatarIntervalo, intervaloAnterior, intervaloDoPeriodo, ROTULO_ANTERIOR } from '../../lib/indicadores/periodo';
import { SeletorPeriodo, type FiltroPeriodo } from '../indicadores/BarraFiltros';
import BlocoGrafico from '../indicadores/BlocoGrafico';
import KpiBI from '../indicadores/KpiBI';
import TabelaBI, { type ColunaBI } from '../indicadores/TabelaBI';
import { GraficoBarras } from '../indicadores/graficos';
import { SERIE } from '../indicadores/cores';
import { encurtar } from '../indicadores/contexto';
import EstadoDaLista from '../EstadoDaLista';
import ModalCentroCusto from './ModalCentroCusto';

/** O recuo da árvore na tabela. Em `<Td>` o espaço comum não colapsa. */
const RECUO_PX = 18;

type Visao = 'resultado' | 'plano';

/**
 * O fechamento: receita, custo das obras e custo da estrutura, lado a lado.
 *
 * O corte é por `natureza = 'Obra'` e não por "tem projeto_id" porque um
 * centro de obra apagada perde o `projeto_id` (FK set null) mas continua
 * sendo custo de obra no histórico — somá-lo como estrutura mudaria o número
 * de meses já fechados só porque alguém apagou uma obra.
 *
 * Só ANALÍTICOS entram: somar o sintético junto contaria cada real duas vezes,
 * porque o acumulado dele já é a soma dos filhos.
 */
function fechar(linhas: CustoPorCentro[]) {
  const analiticos = linhas.filter((c) => c.tipo === 'Analitico');
  const receita = analiticos.reduce((s, c) => s + c.receitaLancada, 0);
  const obras = analiticos.filter((c) => c.natureza === 'Obra').reduce((s, c) => s + c.despesaLancada, 0);
  const estrutura = analiticos.filter((c) => c.natureza !== 'Obra').reduce((s, c) => s + c.despesaLancada, 0);
  return { receita, obras, estrutura, resultado: receita - obras - estrutura };
}

/** O nome do centro com o recuo da árvore — mesma célula nas duas tabelas. */
function NomeNaArvore({ nivel, codigo, nome, agrupador }: { nivel: number; codigo: string; nome: string; agrupador: boolean }) {
  return (
    <span style={{ paddingLeft: (nivel - 1) * RECUO_PX }} className="inline-block">
      <span className="font-mono text-2xs text-slate-500">{codigo}</span>{' '}
      <span className={agrupador ? 'font-semibold text-slate-800' : 'font-medium'}>{nome}</span>
    </span>
  );
}

interface CentrosDeCustoProps {
  centrosCusto: CentroCusto[];
  loading: boolean;
  onAdd: (centro: NovoCentroCusto) => Promise<boolean>;
  onUpdate: (id: string, patch: PatchCentroCusto) => Promise<boolean>;
  onExcluir: (id: string) => Promise<boolean>;
  /** Consultivo e obrigatório antes de excluir: a tela não tem as contagens. */
  onCarregarUsos: (id: string) => Promise<UsosCentroCusto>;
  /** `null` = o papel não pode ver os números (a RPC recusa, não devolve zero). */
  onCarregarCusto: (de?: string, ate?: string) => Promise<CustoPorCentro[] | null>;
  /** O mesmo período da Visão geral — mora no FinanceiroTab. */
  periodo: FiltroPeriodo;
  onMudarPeriodo: (mudanca: Partial<FiltroPeriodo>) => void;
}

export default function CentrosDeCusto({
  centrosCusto,
  loading,
  onAdd,
  onUpdate,
  onExcluir,
  onCarregarUsos,
  onCarregarCusto,
  periodo,
  onMudarPeriodo,
}: CentrosDeCustoProps) {
  const { role } = useAuth();
  const { toast, confirm } = useFeedback();
  const podeEditar = role === 'admin';

  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<CentroCusto | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  /** Id do centro cuja consulta de uso está em voo — trava só aquele botão. */
  const [consultando, setConsultando] = useState<string | null>(null);

  const [visao, setVisao] = useState<Visao>('resultado');
  const [custo, setCusto] = useState<CustoPorCentro[] | null>(null);
  const [custoAnterior, setCustoAnterior] = useState<CustoPorCentro[] | null>(null);
  const [custoNegado, setCustoNegado] = useState(false);
  const [carregandoCusto, setCarregandoCusto] = useState(true);

  /**
   * A árvore não sabe quantos lançamentos ou colaboradores prendem um centro —
   * são duas contagens que a tela não carrega. Em vez de adivinhar (e oferecer
   * um botão que vai falhar, ou esconder um que funcionaria), pergunta ao banco
   * no clique e decide com a resposta dele.
   *
   * Quando não dá para excluir, o caminho é um toast com o motivo, não um
   * diálogo de confirmação: não há nada a confirmar, só a explicação e a saída.
   */
  const pedirExclusao = useCallback(async (centro: CentroCusto) => {
    setConsultando(centro.id);
    try {
      const usos = await onCarregarUsos(centro.id);
      if (!usos.podeExcluir) {
        // A saída vem junto com a recusa. Sem ela o usuário lê só o "não" e não
        // tem por que ligar o botão "Desativar" ao lado à pergunta que fez —
        // e `podeDesativar` é falso justamente onde desativar pioraria.
        toast.error(
          `"${centro.nome}" não pode ser excluído.`,
          usos.podeDesativar
            ? `${usos.motivo} Você pode desativá-lo: ele sai dos seletores e o histórico continua mostrando o nome dele.`
            : usos.motivo
        );
        return;
      }
      confirm({
        title: `Excluir o centro "${centro.nome}"?`,
        message:
          'Este centro nunca recebeu lançamento, não tem centros abaixo dele e ninguém está lotado nele. Esta ação é irreversível.',
        onConfirm: async () => {
          if (await onExcluir(centro.id)) toast.success('Centro de custo excluído.');
        },
      });
    } catch (err: any) {
      // Sem resposta não se oferece exclusão: cair no ramo "pode" aqui seria
      // decidir destruir com base numa consulta que não voltou.
      toast.error('Não foi possível verificar o centro de custo.', err.message);
    } finally {
      setConsultando(null);
    }
  }, [onCarregarUsos, onExcluir, confirm, toast]);

  const hoje = hojeISO();
  const { intervalo, anterior } = useMemo(() => {
    const intervalo = intervaloDoPeriodo(periodo.periodo, hoje, periodo.personalizado);
    return { intervalo, anterior: intervaloAnterior(periodo.periodo, intervalo) };
  }, [periodo.periodo, periodo.personalizado, hoje]);

  useEffect(() => {
    // `vivo`: trocar de período rápido não pode deixar a resposta antiga por cima da nova.
    let vivo = true;
    setCarregandoCusto(true);
    void Promise.all([
      onCarregarCusto(intervalo.de, intervalo.ate),
      periodo.comparar ? onCarregarCusto(anterior.de, anterior.ate) : Promise.resolve(null),
    ]).then(([atual, antes]) => {
      if (!vivo) return;
      setCustoNegado(atual === null);
      setCusto(atual);
      setCustoAnterior(antes);
      setCarregandoCusto(false);
    });
    return () => { vivo = false; };
  }, [onCarregarCusto, intervalo.de, intervalo.ate, anterior.de, anterior.ate, periodo.comparar]);

  const visiveis = useMemo(
    () => centrosCusto.filter((c) => mostrarInativos || c.ativo),
    [centrosCusto, mostrarInativos]
  );

  const kpis = useMemo(() => {
    const atual = fechar(custo ?? []);
    const antes = custoAnterior ? fechar(custoAnterior) : null;
    const comp = (chave: keyof typeof atual) => (antes ? comparar(atual[chave], antes[chave]) : null);
    return { atual, receita: comp('receita'), obras: comp('obras'), estrutura: comp('estrutura'), resultado: comp('resultado') };
  }, [custo, custoAnterior]);

  const porCentro = useMemo(
    () => (custo ?? [])
      .filter((c) => c.tipo === 'Analitico' && c.despesaLancada > 0)
      .sort((a, b) => b.despesaLancada - a.despesaLancada)
      .map((c) => ({ id: c.centroId, nome: encurtar(`${c.codigo} ${c.nome}`), completo: `${c.codigo} ${c.nome}`, lancada: c.despesaLancada, paga: c.despesaPaga })),
    [custo]
  );

  // Sem `ordenar` de propósito: a ordem é a da árvore, e reordenar quebraria o recuo.
  const colunasResultado: ColunaBI<CustoPorCentro>[] = [
    { id: 'centro', titulo: 'Centro', render: (l) => <NomeNaArvore nivel={l.nivel} codigo={l.codigo} nome={l.nome} agrupador={l.tipo === 'Sintetico'} />, csv: (l) => `${l.codigo} ${l.nome}` },
    // O agrupador não tem lançamento próprio: 0,00 sugeriria "nada gastou aqui embaixo".
    { id: 'despesa', titulo: 'Despesa', align: 'right', render: (l) => (l.tipo === 'Sintetico' ? '—' : dinheiro(l.despesaLancada)), csv: (l) => l.despesaLancada },
    { id: 'paga', titulo: 'Paga', align: 'right', render: (l) => (l.tipo === 'Sintetico' ? '—' : dinheiro(l.despesaPaga)), csv: (l) => l.despesaPaga },
    { id: 'receita', titulo: 'Receita', align: 'right', render: (l) => (l.tipo === 'Sintetico' ? '—' : dinheiro(l.receitaLancada)), csv: (l) => l.receitaLancada },
    { id: 'arvore', titulo: 'Acumulado na árvore', align: 'right', render: (l) => <b>{dinheiro(l.despesaLancadaArvore)}</b>, csv: (l) => l.despesaLancadaArvore },
  ];

  const novoCentro = () => { setEmEdicao(null); setModalAberto(true); };

  const colunasPlano: ColunaBI<CentroCusto>[] = [
    { id: 'centro', titulo: 'Centro', render: (c) => <NomeNaArvore nivel={c.nivel} codigo={c.codigo} nome={c.nome} agrupador={c.tipo === 'Sintetico'} />, csv: (c) => `${c.codigo} ${c.nome}` },
    { id: 'tipo', titulo: 'Tipo', render: (c) => <Chip tom={c.tipo === 'Sintetico' ? 'neutro' : 'informativo'}>{c.tipo === 'Sintetico' ? 'Agrupador' : 'Analítico'}</Chip>, csv: (c) => (c.tipo === 'Sintetico' ? 'Agrupador' : 'Analítico') },
    { id: 'natureza', titulo: 'Natureza', render: (c) => c.natureza, csv: (c) => c.natureza },
    {
      id: 'origem', titulo: 'Origem',
      render: (c) => <span className="text-slate-500">{origem(c)}</span>,
      csv: origem,
    },
    { id: 'situacao', titulo: 'Situação', render: (c) => <Chip tom={c.ativo ? 'positivo' : 'neutro'} ponto>{c.ativo ? 'Ativo' : 'Inativo'}</Chip>, csv: (c) => (c.ativo ? 'Ativo' : 'Inativo') },
    ...(podeEditar ? [{
      id: 'acoes', titulo: 'Ações', align: 'right' as const,
      render: (c: CentroCusto) => (
        <div className="inline-flex items-center gap-1">
          <IconButton rotulo={`Editar ${c.nome}`} onClick={() => { setEmEdicao(c); setModalAberto(true); }}>
            <Pencil size={14} />
          </IconButton>
          <Button variante="fantasma" tamanho="sm" onClick={() => void onUpdate(c.id, { ativo: !c.ativo })}>
            {c.ativo ? 'Desativar' : 'Reativar'}
          </Button>
          <IconButton
            rotulo={`Excluir ${c.nome}`}
            dica={`Excluir ${c.nome} — só se nunca tiver sido usado`}
            tom="perigo"
            carregando={consultando === c.id}
            onClick={() => void pedirExclusao(c)}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      ),
    }] : []),
  ];

  const rotuloAnterior = ROTULO_ANTERIOR[periodo.periodo];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Abas
          secundaria
          abas={[
            { id: 'resultado', rotulo: 'Resultado por centro', icone: <BarChart3 size={14} /> },
            { id: 'plano', rotulo: 'Plano de centros', icone: <Network size={14} />, contagem: centrosCusto.filter((c) => c.ativo).length },
          ]}
          ativa={visao}
          onTrocar={setVisao}
          rotulo="Centros de custo"
          prefixo="centros"
        />
        {visao === 'plano' && podeEditar && (
          <Button onClick={novoCentro}><Plus size={14} aria-hidden="true" /> Novo centro</Button>
        )}
      </div>

      <PainelAba prefixo="centros" ativa={visao} className="space-y-5">
        {visao === 'resultado' && (
          <>
            <Card className="space-y-4">
              <SeletorPeriodo filtros={periodo} onMudar={onMudarPeriodo} />
              <p className="border-t border-slate-100 pt-3 text-2xs text-slate-500">
                <span className="font-semibold text-slate-800">{formatarIntervalo(intervalo)}</span>
                {periodo.comparar && <> · comparado com {formatarIntervalo(anterior)}</>}
                {' '}· sem rateio: o custo de estrutura fica no centro dele e não entra na margem das obras
                {carregandoCusto && <> · somando o razão…</>}
              </p>
            </Card>

            {custoNegado ? (
              <Aviso tom="neutro" icone={<Lock size={16} />}>
                O seu perfil enxerga o plano de centros, mas não os valores do razão. O custo por
                centro é restrito à administração e ao financeiro.
              </Aviso>
            ) : (
              <>
                <FaixaKpis colunas={4}>
                  <KpiBI rotulo="Receita lançada" valor={dinheiroCurto(kpis.atual.receita)} titulo={dinheiro(kpis.atual.receita)} comparado={kpis.receita} sentido="alta-boa" rotuloAnterior={rotuloAnterior} />
                  <KpiBI rotulo="Custo das obras" valor={dinheiroCurto(kpis.atual.obras)} titulo={dinheiro(kpis.atual.obras)} comparado={kpis.obras} sentido="baixa-boa" rotuloAnterior={rotuloAnterior} />
                  <KpiBI rotulo="Custo da estrutura" valor={dinheiroCurto(kpis.atual.estrutura)} titulo={dinheiro(kpis.atual.estrutura)} comparado={kpis.estrutura} sentido="baixa-boa" rotuloAnterior={rotuloAnterior} detalhe="Administrativo, apoio e comercial" />
                  <KpiBI rotulo="Resultado" valor={dinheiroCurto(kpis.atual.resultado)} titulo={dinheiro(kpis.atual.resultado)} comparado={kpis.resultado} sentido="alta-boa" rotuloAnterior={rotuloAnterior} detalhe="Receita − obras − estrutura" />
                </FaixaKpis>

                <BlocoGrafico
                  titulo="Despesa por centro"
                  descricao="Centros analíticos com despesa no período: lançada e já paga."
                  vazio={porCentro.length > 0 ? null : 'Nenhuma despesa lançada no período.'}
                  tabela={{ colunas: ['Centro', 'Lançada', 'Paga'], linhas: porCentro.map((c) => [c.completo, dinheiro(c.lancada), dinheiro(c.paga)]) }}
                >
                  {(tamanho) => (
                    <GraficoBarras
                      dados={tamanho === 'normal' ? porCentro.slice(0, 8) : porCentro}
                      categoria="nome"
                      deitado
                      tamanho={tamanho}
                      formatar={dinheiro}
                      formatarEixo={dinheiroCurto}
                      series={[
                        { chave: 'lancada', rotulo: 'Lançada', cor: SERIE.primaria },
                        { chave: 'paga', rotulo: 'Paga', cor: SERIE.secundaria },
                      ]}
                    />
                  )}
                </BlocoGrafico>

                <TabelaBI
                  titulo="Resultado por centro"
                  descricao="O que cada centro consumiu no período. O agrupador soma os centros abaixo dele."
                  linhas={custo ?? []}
                  colunas={colunasResultado}
                  chave={(l) => l.centroId}
                  arquivo="resultado-por-centro"
                  vazio="Nenhum centro de custo cadastrado."
                />
              </>
            )}
          </>
        )}

        {visao === 'plano' && (
          <EstadoDaLista
            loading={loading}
            total={visiveis.length}
            totalSemFiltro={centrosCusto.length}
            carregandoLabel="Carregando os centros de custo…"
            vazio={{
              icon: Network,
              title: 'Nenhum centro de custo',
              description:
                'O plano da empresa ainda não foi semeado. Sem um centro analítico não é possível lançar no razão.',
              ...(podeEditar ? { actionLabel: 'Novo centro', onAction: novoCentro } : {}),
            }}
            semResultado={{
              title: 'Nenhum centro visível',
              description: 'Todos os centros cadastrados estão inativos.',
            }}
            onLimparFiltros={() => setMostrarInativos(true)}
          >
            <TabelaBI
              titulo="Plano de centros"
              descricao="A estrutura da empresa. O centro de cada obra nasce e é renomeado junto com ela."
              linhas={visiveis}
              colunas={colunasPlano}
              chave={(c) => c.id}
              arquivo="plano-de-centros"
              vazio="Nenhum centro visível."
              recortes={
                <Checkbox checked={mostrarInativos} onChange={setMostrarInativos} className="inline-flex items-center gap-1.5 text-2xs font-semibold text-slate-500">
                  Mostrar inativos
                </Checkbox>
              }
            />
          </EstadoDaLista>
        )}
      </PainelAba>

      <ModalCentroCusto
        open={modalAberto}
        centro={emEdicao}
        centros={centrosCusto}
        onClose={() => setModalAberto(false)}
        onAdd={onAdd}
        onUpdate={onUpdate}
      />
    </div>
  );
}

function origem(c: CentroCusto): string {
  return c.projetoId || c.natureza === 'Obra' ? `Obra${c.projetoNome ? `: ${c.projetoNome}` : ' (excluída)'}` : 'Cadastro';
}
