import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Pencil, PlusCircle, Sigma, Trash2, X } from 'lucide-react';
import { ComponenteComposicao, InsumoCatalogo } from '../../types';
import { formatBRL } from '../../lib/preco';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';

interface PainelComposicaoProps {
  insumo: InsumoCatalogo;
  componentes: ComponenteComposicao[];
  buscarCandidatosComponente: (termo: string, excluirId: string) => Promise<InsumoCatalogo[]>;
  onAddComponente: (
    composicaoId: string,
    entrada: { insumoId: string; coeficiente: number; observacao?: string }
  ) => Promise<ComponenteComposicao[] | null>;
  onUpdateComponente: (
    componenteId: string,
    composicaoId: string,
    patch: { coeficiente: number; observacao?: string }
  ) => Promise<ComponenteComposicao[] | null>;
  onRemoverComponente: (componenteId: string, composicaoId: string) => Promise<ComponenteComposicao[] | null>;
  /**
   * Relê o detalhe inteiro. Mexer em componente muda o preço da composição, e
   * mudança de preço vira ponto no histórico — em vez de remendar as duas
   * listas em memória, uma requisição deixa componentes e histórico coerentes
   * entre si. `null` significa que o handler já mostrou o toast de erro.
   */
  aposMexer: (resultado: ComponenteComposicao[] | null) => Promise<boolean>;
}

export default function PainelComposicao({
  insumo,
  componentes,
  buscarCandidatosComponente,
  onAddComponente,
  onUpdateComponente,
  onRemoverComponente,
  aposMexer,
}: PainelComposicaoProps) {
  const { toast, confirm } = useFeedback();

  const somaComponentes = useMemo(
    () => componentes.reduce((acc, c) => acc + c.custoTotal, 0),
    [componentes]
  );

  const [adicionando, setAdicionando] = useState(false);
  const [busca, setBusca] = useState('');
  const [candidatos, setCandidatos] = useState<InsumoCatalogo[]>([]);
  const [buscandoCandidatos, setBuscandoCandidatos] = useState(false);
  const [candidatoId, setCandidatoId] = useState('');
  const [coefNovo, setCoefNovo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [editandoComponenteId, setEditandoComponenteId] = useState<string | null>(null);
  const [coefEdicao, setCoefEdicao] = useState('');

  // Busca de candidatos no servidor, com a mesma pausa da busca principal.
  useEffect(() => {
    if (!adicionando) return;
    if (busca.trim() === '') {
      setCandidatos([]);
      return;
    }
    let cancelado = false;
    setBuscandoCandidatos(true);
    const t = setTimeout(() => {
      buscarCandidatosComponente(busca, insumo.id)
        .then((lista) => {
          if (!cancelado) setCandidatos(lista);
        })
        .finally(() => {
          if (!cancelado) setBuscandoCandidatos(false);
        });
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [busca, adicionando, insumo.id]);

  const limparInclusao = () => {
    setBusca('');
    setCandidatos([]);
    setCandidatoId('');
    setCoefNovo('');
  };

  const adicionarComponente = async () => {
    if (!candidatoId) return;
    const coeficiente = parseFloat(coefNovo);
    if (isNaN(coeficiente) || coeficiente <= 0) {
      toast.error('Informe um coeficiente maior que zero.', 'É a quantidade do insumo por unidade da composição.');
      return;
    }
    setSalvando(true);
    const ok = await aposMexer(await onAddComponente(insumo.id, { insumoId: candidatoId, coeficiente }));
    setSalvando(false);
    if (ok) {
      setAdicionando(false);
      limparInclusao();
      toast.success('Componente incluído.', 'O preço da composição foi recalculado pelo servidor.');
    }
  };

  const salvarCoeficiente = async (comp: ComponenteComposicao) => {
    const coeficiente = parseFloat(coefEdicao);
    if (isNaN(coeficiente) || coeficiente <= 0) {
      toast.error('O coeficiente deve ser maior que zero.');
      return;
    }
    if (coeficiente === comp.coeficiente) {
      setEditandoComponenteId(null);
      return;
    }
    setSalvando(true);
    const ok = await aposMexer(
      await onUpdateComponente(comp.id, comp.composicaoId, { coeficiente, observacao: comp.observacao })
    );
    setSalvando(false);
    if (ok) {
      setEditandoComponenteId(null);
      toast.success('Coeficiente atualizado.', 'O preço da composição foi recalculado.');
    }
  };

  const removerComponente = (comp: ComponenteComposicao) => {
    confirm({
      title: 'Remover componente?',
      message: `"${comp.insumoDescricao}" sai desta composição e o preço é recalculado sem ele. O insumo continua no catálogo.`,
      onConfirm: async () => {
        const ok = await aposMexer(await onRemoverComponente(comp.id, comp.composicaoId));
        if (ok) toast.success('Componente removido.', 'O preço da composição foi recalculado.');
      },
    });
  };

  return (
    <div className="bg-indigo-50/30 p-3.5 rounded-xl border border-indigo-100 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
          <Sigma size={12} /> Composição · {componentes.length} componente{componentes.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() => {
            setAdicionando((v) => !v);
            limparInclusao();
          }}
          className="text-2xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-indigo-100 transition"
        >
          {adicionando ? <><X size={11} /> Cancelar</> : <><PlusCircle size={11} /> Adicionar insumo</>}
        </button>
      </div>

      {adicionando && (
        <div className="bg-white border border-indigo-100 rounded-lg p-2.5 space-y-2">
          <div className="space-y-1">
            <label className="text-2xs font-bold text-slate-500 uppercase">Buscar insumo ou composição</label>
            <input
              type="text"
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="cimento, argamassa, servente..."
              className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus:border-indigo-600"
            />
          </div>

          {buscandoCandidatos ? (
            <div className="flex justify-center py-2"><Spinner size={13} /></div>
          ) : candidatos.length > 0 ? (
            <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-md divide-y divide-slate-50">
              {candidatos.map((cand) => (
                <button
                  key={cand.id}
                  type="button"
                  onClick={() => setCandidatoId(cand.id)}
                  className={`w-full text-left px-2 py-1.5 text-2xs transition ${
                    candidatoId === cand.id ? 'bg-indigo-50 font-bold text-indigo-900' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="block truncate">{cand.descricao}</span>
                  <span className="text-slate-500 font-mono">
                    {formatBRL(cand.precoReferencia)} / {cand.unidade}
                    {cand.tipoItem === 'Composicao' && ' · composição'}
                  </span>
                </button>
              ))}
            </div>
          ) : busca.trim() !== '' ? (
            <p className="text-2xs text-slate-500 py-1">Nenhum insumo ativo encontrado.</p>
          ) : null}

          <div className="flex items-end gap-2">
            <div className="space-y-1 flex-1">
              <label className="text-2xs font-bold text-slate-500 uppercase">
                Coeficiente por {insumo.unidade}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={coefNovo}
                onChange={(e) => setCoefNovo(e.target.value)}
                placeholder="0,35"
                className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus:border-indigo-600"
              />
            </div>
            <button
              type="button"
              disabled={!candidatoId || salvando}
              onClick={adicionarComponente}
              className="bg-indigo-600 text-white text-2xs font-bold px-3 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              {salvando ? <Spinner size={11} /> : <Check size={11} />} Incluir
            </button>
          </div>
          <p className="text-2xs text-slate-500 leading-relaxed">
            Quantidade do insumo por UMA unidade ({insumo.unidade}) desta composição.
          </p>
        </div>
      )}

      {componentes.length === 0 ? (
        <p className="text-2xs text-slate-500 leading-relaxed py-1">
          {insumo.precoFonte === 'SINAPI' ? (
            <>
              Adotada do SINAPI com o <strong>custo publicado</strong> (
              {formatBRL(insumo.precoReferencia)}), sem abrir os componentes — o número
              é idêntico ao oficial. Ao adicionar o primeiro componente o preço passa a ser
              calculado pelo catálogo e deixa de bater com o SINAPI, porque o SINAPI trunca
              cada parcela em centavos e o catálogo arredonda uma vez.
            </>
          ) : (
            <>
              Composição sem componentes. Enquanto estiver vazia, o preço é o valor digitado
              ({formatBRL(insumo.precoReferencia)}); no primeiro componente ele passa a
              ser calculado.
            </>
          )}
        </p>
      ) : (
        <>
          <div className="divide-y divide-indigo-100/70">
            {componentes.map((comp) => (
              <div key={comp.id} className="py-2 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 truncate">{comp.insumoDescricao}</span>
                    {comp.insumoTipoItem === 'Composicao' && (
                      <span className="text-2xs font-bold text-indigo-600 border border-indigo-200 rounded px-1 shrink-0">
                        composição
                      </span>
                    )}
                    {!comp.insumoAtivo && (
                      <span className="text-2xs font-bold text-amber-700 border border-amber-200 bg-amber-50 rounded px-1 shrink-0">
                        inativo
                      </span>
                    )}
                  </div>
                  {editandoComponenteId === comp.id ? (
                    <div className="flex items-end gap-1.5 mt-1">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        autoFocus
                        value={coefEdicao}
                        onChange={(e) => setCoefEdicao(e.target.value)}
                        className="w-24 bg-white border border-indigo-200 rounded-md p-1.5 text-2xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                      />
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => salvarCoeficiente(comp)}
                        className="p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-40 transition"
                        title="Salvar coeficiente"
                      >
                        <Check size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoComponenteId(null)}
                        className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"
                        title="Cancelar"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-2xs text-slate-500 font-mono block mt-0.5">
                      {comp.coeficiente} {comp.insumoUnidade} × {formatBRL(comp.insumoPrecoReferencia)}
                    </span>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <span className="font-mono font-extrabold text-slate-800 block text-xs">
                    {formatBRL(comp.custoTotal)}
                  </span>
                  {editandoComponenteId !== comp.id && (
                    <div className="flex items-center justify-end gap-0.5 mt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditandoComponenteId(comp.id);
                          setCoefEdicao(String(comp.coeficiente));
                        }}
                        className="p-1 hover:bg-indigo-100 text-slate-500 hover:text-indigo-700 rounded transition"
                        title="Editar coeficiente"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removerComponente(comp)}
                        className="p-1 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded transition"
                        title="Remover da composição"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t-2 border-indigo-200">
            <span className="text-2xs font-bold text-indigo-900 uppercase tracking-wider">
              Custo por {insumo.unidade}
            </span>
            <span className="font-mono font-extrabold text-indigo-900">
              {formatBRL(insumo.precoReferencia)}
            </span>
          </div>

          {/* A soma das linhas pode não fechar com o total quando há
              composição auxiliar: o total expande até as folhas em uma
              passada, enquanto cada linha usa o preço já arredondado
              do filho. Diferença de centavos, mas melhor avisar. */}
          {somaComponentes !== insumo.precoReferencia && (
            <p className="text-2xs text-indigo-700/70 leading-relaxed">
              A soma das linhas dá {formatBRL(somaComponentes)}. O total é calculado expandindo
              as composições auxiliares até os insumos finais, por isso a diferença de
              arredondamento.
            </p>
          )}

          {insumo.temComponenteInativo && (
            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2">
              <AlertTriangle size={11} className="text-amber-700 mt-0.5 shrink-0" />
              <p className="text-2xs text-amber-900 font-semibold leading-relaxed">
                Há insumo desativado nesta composição. O preço dele continua entrando na conta —
                troque ou remova o componente.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
