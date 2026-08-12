import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, ChevronRight, PlusCircle, Sigma, X } from 'lucide-react';
import {
  AgregadosComposicao,
  ComponenteComposicao,
  InsumoCatalogo,
  LinhaComposicaoExpandida,
  LinhaHH,
} from '../../types';
import { formatBRL } from '../../lib/preco';
import { chavesComFilhos, somarFolhas } from '../../lib/composicao';
import { EstadoComposicao } from '../../services/catalogoService';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Button, Field, Input, Modal } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import ArvoreComposicao, { AvisoArredondamento } from './ArvoreComposicao';
import ResumoComposicao from './ResumoComposicao';
import AjusteIndice from './AjusteIndice';
import BuscaInsumo from './BuscaInsumo';

/**
 * Área de trabalho da composição.
 *
 * Modal em tela cheia e não o drawer de detalhe: o `Drawer` só vai até
 * `max-w-2xl` (672 px) e alargá-lo mexeria também no drawer de documentos, que
 * compartilha o primitivo. `Modal size="full"` é o formato já provado pelo
 * `SinapiAdocaoModal`, incluindo a área rolável única — sem ela a tabela vaza
 * do diálogo.
 *
 * O corpo vive num componente filho montado só quando há composição escolhida.
 * Isso não é organização: é o que faz o estado (nós recolhidos, quantidade,
 * pilha de navegação) NASCER LIMPO a cada abertura. No `SinapiAdocaoModal` o
 * `verNiveis` mora no componente que renderiza sempre, e por isso não zera
 * entre aberturas — o comportamento que não queremos aqui.
 */
interface ModalComposicaoProps {
  insumo: InsumoCatalogo | null;
  aberto: boolean;
  onFechar: () => void;
  jornadaDiaria: number;
  carregarComposicao: (id: string) => Promise<(EstadoComposicao & { hh: LinhaHH[] }) | null>;
  buscarCandidatos: (termo: string, excluirId: string) => Promise<InsumoCatalogo[]>;
  onAddComponente: (
    composicaoId: string,
    entrada: { insumoId: string; coeficiente: number; observacao?: string }
  ) => Promise<EstadoComposicao | null>;
  onUpdateComponente: (
    componenteId: string,
    composicaoId: string,
    patch: { coeficiente: number; observacao?: string }
  ) => Promise<EstadoComposicao | null>;
  onRemoverComponente: (componenteId: string, composicaoId: string) => Promise<EstadoComposicao | null>;
}

export default function ModalComposicao(props: ModalComposicaoProps) {
  const { insumo, aberto, onFechar } = props;
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      size="full"
      title={insumo ? insumo.descricao : 'Composição'}
      description="Composição analítica até os insumos finais, com HH e quebra de custo."
    >
      {insumo && <CorpoComposicao {...props} insumo={insumo} />}
    </Modal>
  );
}

/** Um degrau da navegação para dentro de subcomposições. */
type Degrau = { id: string; descricao: string; unidade: string };

function CorpoComposicao({
  insumo,
  jornadaDiaria,
  carregarComposicao,
  buscarCandidatos,
  onAddComponente,
  onUpdateComponente,
  onRemoverComponente,
}: ModalComposicaoProps & { insumo: InsumoCatalogo }) {
  const { toast, confirm } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'coeficiente'>();

  // Pilha de navegação: abrir uma subcomposição troca o alvo e empilha o
  // caminho de volta. Sem isso, editar o coeficiente de um insumo dentro da
  // argamassa exigiria fechar tudo e procurar a argamassa na lista.
  const [pilha, setPilha] = useState<Degrau[]>([
    { id: insumo.id, descricao: insumo.descricao, unidade: insumo.unidade },
  ]);
  const alvo = pilha[pilha.length - 1];

  const [arvore, setArvore] = useState<LinhaComposicaoExpandida[]>([]);
  const [componentes, setComponentes] = useState<ComponenteComposicao[]>([]);
  const [agregados, setAgregados] = useState<AgregadosComposicao | undefined>();
  const [hh, setHh] = useState<LinhaHH[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [quantidadeTexto, setQuantidadeTexto] = useState('1');
  const [ajustando, setAjustando] = useState<LinhaComposicaoExpandida | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [candidatoId, setCandidatoId] = useState('');
  const [coefNovo, setCoefNovo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const quantidade = useMemo(() => {
    const n = Number(quantidadeTexto.trim().replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [quantidadeTexto]);

  const aplicar = useCallback((estado: EstadoComposicao & { hh?: LinhaHH[] }) => {
    setArvore(estado.arvore);
    setComponentes(estado.componentes);
    setAgregados(estado.agregados);
    if (estado.hh) setHh(estado.hh);
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setRecolhidos(new Set());
    carregarComposicao(alvo.id)
      .then((estado) => {
        if (cancelado || !estado) return;
        aplicar(estado);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [alvo.id, carregarComposicao, aplicar]);

  const custoTotal = agregados?.custoTotal ?? 0;
  const somaFolhas = useMemo(() => somarFolhas(arvore), [arvore]);
  const comFilhos = useMemo(() => chavesComFilhos(arvore), [arvore]);

  const alternarNo = (chave: string) =>
    setRecolhidos((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });

  const todosRecolhidos = comFilhos.size > 0 && comFilhos.size === recolhidos.size;

  const salvarIndice = async (coeficiente: number, motivo: string) => {
    if (!ajustando) return false;
    const estado = await onUpdateComponente(ajustando.componenteId, alvo.id, {
      coeficiente,
      observacao: motivo || undefined,
    });
    if (!estado) return false;
    // Relê a quebra por cargo junto: mexer no coeficiente do pedreiro muda o
    // HH, e deixar a lista de cargos com o número velho ao lado da árvore nova
    // é exatamente o "meio atualizado" que o serviço existe para evitar.
    const completo = await carregarComposicao(alvo.id);
    if (completo) aplicar(completo);
    else aplicar(estado);
    toast.success('Índice atualizado.', 'Preço, HH e quebra por categoria foram recalculados pelo servidor.');
    return true;
  };

  const adicionar = async () => {
    const coeficiente = Number(coefNovo.trim().replace(',', '.'));
    if (!candidatoId) return;
    if (
      !validar([
        {
          campo: 'coeficiente',
          invalido: !Number.isFinite(coeficiente) || coeficiente <= 0,
          erro: 'Informe um coeficiente maior que zero — é a quantidade por unidade da composição.',
        },
      ])
    ) return;
    setSalvando(true);
    const estado = await onAddComponente(alvo.id, { insumoId: candidatoId, coeficiente });
    setSalvando(false);
    if (!estado) return;
    const completo = await carregarComposicao(alvo.id);
    aplicar(completo ?? estado);
    setAdicionando(false);
    setCandidatoId('');
    setCoefNovo('');
    toast.success('Componente incluído.', 'O preço da composição foi recalculado pelo servidor.');
  };

  const remover = (linha: LinhaComposicaoExpandida) => {
    confirm({
      title: 'Remover componente?',
      message: `"${linha.descricao}" sai desta composição e o preço é recalculado sem ele. O insumo continua no catálogo.`,
      onConfirm: async () => {
        const estado = await onRemoverComponente(linha.componenteId, alvo.id);
        if (!estado) return;
        const completo = await carregarComposicao(alvo.id);
        aplicar(completo ?? estado);
        toast.success('Componente removido.', 'O preço da composição foi recalculado.');
      },
    });
  };

  if (carregando) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={22} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Trilha de volta. Só aparece depois do primeiro mergulho. */}
      {pilha.length > 1 && (
        <nav aria-label="Caminho da composição" className="flex items-center gap-1 flex-wrap text-2xs">
          {pilha.map((d, i) => (
            <span key={d.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={11} className="text-slate-500" aria-hidden />}
              {i === pilha.length - 1 ? (
                <span className="font-bold text-slate-800 truncate max-w-xs">{d.descricao}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPilha((p) => p.slice(0, i + 1))}
                  className="text-indigo-700 hover:text-indigo-900 hover:underline font-semibold truncate max-w-xs"
                >
                  {d.descricao}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-2xs font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
              <Sigma size={12} aria-hidden /> {arvore.length} linha{arvore.length === 1 ? '' : 's'} · {componentes.length} componente{componentes.length === 1 ? '' : 's'} diretos
            </span>

            <div className="flex items-center gap-2">
              {comFilhos.size > 0 && (
                <button
                  type="button"
                  onClick={() => setRecolhidos(todosRecolhidos ? new Set() : new Set(comFilhos))}
                  className="text-2xs font-bold text-indigo-700 hover:text-indigo-900 px-1.5 py-0.5 rounded hover:bg-indigo-50 transition"
                >
                  {todosRecolhidos ? 'Abrir as subcomposições' : 'Fechar as subcomposições'}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setAdicionando((v) => !v); setCandidatoId(''); setCoefNovo(''); }}
                className="text-2xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-indigo-50 transition"
              >
                {adicionando ? <><X size={11} /> Cancelar</> : <><PlusCircle size={11} /> Adicionar insumo</>}
              </button>
            </div>
          </div>

          {adicionando && (
            <div className="bg-white border border-indigo-200 rounded-lg p-3 space-y-2.5">
              <BuscaInsumo
                buscar={buscarCandidatos}
                excluirId={alvo.id}
                selecionadoId={candidatoId}
                onSelecionar={setCandidatoId}
                autoFocus
              />
              <div ref={areaRef as React.RefObject<HTMLDivElement>} className="flex items-end gap-2">
                <Field className="space-y-1 flex-1" id="novo-coef" label={<>Coeficiente por {alvo.unidade}</>} erro={erros.coeficiente} required>
                  {(props) => (
                    <Input
                      {...props}
                      type="text"
                      inputMode="decimal"
                      value={coefNovo}
                      onChange={(e) => { setCoefNovo(e.target.value); limparErro('coeficiente'); }}
                      placeholder="0,35" mono
                    />
                  )}
                </Field>
                <Button onClick={adicionar} disabled={!candidatoId || salvando}>
                  {salvando ? <Spinner size={13} /> : <PlusCircle size={13} />}
                  <span>Incluir</span>
                </Button>
              </div>
              <p className="text-2xs text-slate-500 leading-relaxed">
                Quantidade do insumo por UMA unidade ({alvo.unidade}) desta composição.
              </p>
            </div>
          )}

          {ajustando && (
            <AjusteIndice
              linha={ajustando}
              unidadeTopo={alvo.unidade}
              jornadaDiaria={jornadaDiaria}
              onSalvar={salvarIndice}
              onCancelar={() => setAjustando(null)}
            />
          )}

          {arvore.length === 0 ? (
            <p className="text-2xs text-slate-500 leading-relaxed py-3">
              {insumo.precoFonte === 'SINAPI' ? (
                <>
                  Adotada do SINAPI com o <strong>custo publicado</strong> ({formatBRL(insumo.precoReferencia)}),
                  sem abrir os componentes — o número é idêntico ao oficial. Ao adicionar o primeiro
                  componente o preço passa a ser calculado pelo catálogo e deixa de bater com o SINAPI,
                  porque o SINAPI trunca cada parcela em centavos e o catálogo arredonda uma vez.
                  <strong> É também o que destrava o HH:</strong> sem componentes não há coeficiente de
                  mão de obra.
                </>
              ) : (
                <>
                  Composição sem componentes. Enquanto estiver vazia, o preço é o valor digitado
                  ({formatBRL(insumo.precoReferencia)}); no primeiro componente ele passa a ser calculado.
                </>
              )}
            </p>
          ) : (
            <>
              <ArvoreComposicao
                linhas={arvore}
                unidadeTopo={alvo.unidade}
                custoTotal={custoTotal}
                recolhidos={recolhidos}
                onAlternarNo={alternarNo}
                quantidade={quantidade}
                onAjustarIndice={setAjustando}
                onRemover={remover}
                onAbrirSubcomposicao={(l) =>
                  setPilha((p) => [...p, { id: l.insumoId, descricao: l.descricao, unidade: l.unidade }])
                }
              />
              <AvisoArredondamento soma={somaFolhas} total={custoTotal} />
            </>
          )}
        </div>

        <div className="space-y-4">
          {/* A calculadora é o que responde "quanto de HH esta atividade
              consome": a composição é unitária, e a pergunta real é sempre
              sobre a quantidade da obra. Multiplicação pura, sem escrita. */}
          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
            <label htmlFor="calc-qtd" className="text-2xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Calculator size={11} aria-hidden /> Quantidade da atividade
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="calc-qtd"
                type="text"
                inputMode="decimal"
                value={quantidadeTexto}
                onChange={(e) => setQuantidadeTexto(e.target.value)} mono
              />
              <span className="text-xs font-bold text-slate-600 uppercase shrink-0">{alvo.unidade}</span>
            </div>
            <p className="text-2xs text-slate-500 leading-relaxed">
              A árvore e o resumo passam a mostrar o total para esta quantidade.
            </p>
          </div>

          <ResumoComposicao
            agregados={agregados}
            hh={hh}
            unidade={alvo.unidade}
            quantidade={quantidade}
          />
        </div>
      </div>
    </div>
  );
}
