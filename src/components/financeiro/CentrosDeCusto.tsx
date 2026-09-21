import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { CentroCusto, CustoPorCentro, NovoCentroCusto, PatchCentroCusto, UsosCentroCusto } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../FeedbackContext';
import { formatBRL } from '../../lib/preco';
import { Button, Card, Chip, FaixaKpis, IconButton, Input, Kpi, Secao, TableWrap, Td, Th } from '../ui';
import EstadoDaLista from '../EstadoDaLista';
import ModalCentroCusto from './ModalCentroCusto';

/** O recuo da árvore na tabela. Em `<td>` o espaço comum não colapsa. */
const RECUO_PX = 18;

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
}

export default function CentrosDeCusto({
  centrosCusto,
  loading,
  onAdd,
  onUpdate,
  onExcluir,
  onCarregarUsos,
  onCarregarCusto,
}: CentrosDeCustoProps) {
  const { role } = useAuth();
  const { toast, confirm } = useFeedback();
  const podeEditar = role === 'admin';

  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<CentroCusto | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  /** Id do centro cuja consulta de uso está em voo — trava só aquele botão. */
  const [consultando, setConsultando] = useState<string | null>(null);

  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [custo, setCusto] = useState<CustoPorCentro[] | null>(null);
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

  const buscarCusto = useCallback(async () => {
    setCarregandoCusto(true);
    const linhas = await onCarregarCusto(de || undefined, ate || undefined);
    setCustoNegado(linhas === null);
    setCusto(linhas);
    setCarregandoCusto(false);
  }, [onCarregarCusto, de, ate]);

  useEffect(() => { void buscarCusto(); }, [buscarCusto]);

  const visiveis = useMemo(
    () => centrosCusto.filter((c) => mostrarInativos || c.ativo),
    [centrosCusto, mostrarInativos]
  );

  /**
   * O fechamento que o app não conseguia fazer antes: receita, custo das obras
   * e custo da estrutura, lado a lado.
   *
   * O corte é por `natureza = 'Obra'` e não por "tem projeto_id" porque um
   * centro de obra apagada perde o `projeto_id` (FK set null) mas continua
   * sendo custo de obra no histórico — somá-lo como estrutura mudaria o número
   * de meses já fechados só porque alguém apagou uma obra.
   *
   * Só ANALÍTICOS entram: somar o sintético junto contaria cada real duas vezes,
   * porque o acumulado dele já é a soma dos filhos.
   */
  const fechamento = useMemo(() => {
    const analiticos = (custo ?? []).filter((c) => c.tipo === 'Analitico');
    const receita = analiticos.reduce((s, c) => s + c.receitaLancada, 0);
    const obras = analiticos
      .filter((c) => c.natureza === 'Obra')
      .reduce((s, c) => s + c.despesaLancada, 0);
    const estrutura = analiticos
      .filter((c) => c.natureza !== 'Obra')
      .reduce((s, c) => s + c.despesaLancada, 0);
    return { receita, obras, estrutura, resultado: receita - obras - estrutura };
  }, [custo]);

  const semFiltroDePeriodo = !de && !ate;

  return (
    <div className="space-y-8">
      <Secao
        titulo="Resultado por centro"
        descricao="O que cada centro consumiu. Sem rateio: o custo de estrutura para no centro dele e não entra na margem das obras."
        icone={<Network size={16} />}
        acoes={
          <div className="flex items-end gap-2">
            <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider">
              <span className="block mb-1">De</span>
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} fundo="suave" />
            </label>
            <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider">
              <span className="block mb-1">Até</span>
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} fundo="suave" />
            </label>
          </div>
        }
      >
        {custoNegado ? (
          <Card className="p-5 flex items-start gap-3 text-xs text-slate-600">
            <Lock size={16} className="text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              O seu perfil enxerga a árvore de centros, mas não os valores do razão. O custo por
              centro é restrito à administração e ao financeiro.
            </p>
          </Card>
        ) : (
          <>
            <FaixaKpis colunas={4}>
              <Kpi rotulo="Receita lançada" valor={formatBRL(fechamento.receita)} />
              <Kpi rotulo="Custo das obras" valor={formatBRL(fechamento.obras)} />
              <Kpi
                rotulo="Custo da estrutura"
                valor={formatBRL(fechamento.estrutura)}
                detalhe="Administrativo, apoio e comercial"
              />
              <Kpi
                rotulo="Resultado"
                valor={formatBRL(fechamento.resultado)}
                detalhe={semFiltroDePeriodo ? 'Todo o histórico' : 'No período filtrado'}
              />
            </FaixaKpis>

            <Card semPadding className="overflow-hidden mt-4">
              <TableWrap>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-2xs font-extrabold uppercase tracking-wider border-b border-slate-200">
                    <Th>Centro</Th>
                    <Th align="right">Despesa</Th>
                    <Th align="right">Paga</Th>
                    <Th align="right">Receita</Th>
                    <Th align="right">Acumulado na árvore</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {(custo ?? []).map((linha) => {
                    const agrupador = linha.tipo === 'Sintetico';
                    return (
                      <tr key={linha.centroId} className={agrupador ? 'bg-slate-50/50' : undefined}>
                        <Td>
                          <span style={{ paddingLeft: (linha.nivel - 1) * RECUO_PX }} className="inline-block">
                            <span className="font-mono text-2xs text-slate-500">{linha.codigo}</span>{' '}
                            <span className={agrupador ? 'font-bold text-slate-800' : 'font-medium'}>
                              {linha.nome}
                            </span>
                          </span>
                        </Td>
                        {/* O agrupador não tem lançamento próprio: mostrar 0,00 nas
                            colunas diretas sugeriria "nada gastou aqui embaixo". */}
                        <Td align="right">{agrupador ? '—' : formatBRL(linha.despesaLancada)}</Td>
                        <Td align="right">{agrupador ? '—' : formatBRL(linha.despesaPaga)}</Td>
                        <Td align="right">{agrupador ? '—' : formatBRL(linha.receitaLancada)}</Td>
                        <Td align="right" className="font-semibold">
                          {formatBRL(linha.despesaLancadaArvore)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            </Card>
            {carregandoCusto && (
              <p className="text-2xs text-slate-500 mt-2">Somando o razão…</p>
            )}
          </>
        )}
      </Secao>

      <Secao
        titulo="Árvore de centros"
        descricao="A estrutura da empresa. O centro de cada obra nasce e é renomeado junto com ela."
        acoes={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-2xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={mostrarInativos}
                onChange={(e) => setMostrarInativos(e.target.checked)}
              />
              Mostrar inativos
            </label>
            {podeEditar && (
              <Button onClick={() => { setEmEdicao(null); setModalAberto(true); }}>
                <Plus size={14} /> Novo centro
              </Button>
            )}
          </div>
        }
      >
        <EstadoDaLista
          loading={loading}
          total={visiveis.length}
          totalSemFiltro={centrosCusto.length}
          carregandoLabel="Carregando os centros de custo…"
          vazio={{
            icon: Network,
            title: 'Nenhum centro de custo',
            description:
              'A árvore da empresa ainda não foi semeada. Sem um centro analítico não é possível lançar no razão.',
            ...(podeEditar
              ? { actionLabel: 'Novo centro', onAction: () => { setEmEdicao(null); setModalAberto(true); } }
              : {}),
          }}
          semResultado={{
            title: 'Nenhum centro visível',
            description: 'Todos os centros cadastrados estão inativos.',
          }}
          onLimparFiltros={() => setMostrarInativos(true)}
        >
          <Card semPadding className="overflow-hidden">
            <TableWrap>
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-2xs font-extrabold uppercase tracking-wider border-b border-slate-200">
                  <Th>Centro</Th>
                  <Th>Tipo</Th>
                  <Th>Natureza</Th>
                  <Th>Origem</Th>
                  <Th align="center">Ações</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {visiveis.map((c) => (
                  <tr key={c.id} className={c.ativo ? undefined : 'opacity-60'}>
                    <Td>
                      <span style={{ paddingLeft: (c.nivel - 1) * RECUO_PX }} className="inline-block">
                        <span className="font-mono text-2xs text-slate-500">{c.codigo}</span>{' '}
                        <span className={c.tipo === 'Sintetico' ? 'font-bold text-slate-800' : 'font-medium'}>
                          {c.nome}
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <Chip tom={c.tipo === 'Sintetico' ? 'neutro' : 'informativo'}>
                        {c.tipo === 'Sintetico' ? 'Agrupador' : 'Analítico'}
                      </Chip>
                    </Td>
                    <Td>{c.natureza}</Td>
                    <Td className="text-slate-500">
                      {c.projetoId || c.natureza === 'Obra'
                        ? `Obra${c.projetoNome ? `: ${c.projetoNome}` : ' (excluída)'}`
                        : 'Cadastro'}
                    </Td>
                    <Td align="center">
                      {podeEditar ? (
                        <div className="inline-flex items-center gap-1">
                          <IconButton
                            rotulo={`Editar ${c.nome}`}
                            onClick={() => { setEmEdicao(c); setModalAberto(true); }}
                          >
                            <Pencil size={14} />
                          </IconButton>
                          <button
                            type="button"
                            className="text-2xs font-bold text-slate-500 hover:text-blue-700 underline underline-offset-2"
                            onClick={() => void onUpdate(c.id, { ativo: !c.ativo })}
                          >
                            {c.ativo ? 'Desativar' : 'Reativar'}
                          </button>
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
                      ) : (
                        <span aria-hidden="true" className="text-2xs text-slate-500">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>
        </EstadoDaLista>
      </Secao>

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
