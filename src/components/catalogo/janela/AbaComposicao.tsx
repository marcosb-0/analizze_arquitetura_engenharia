import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Plus, PlusCircle, X } from 'lucide-react';
import {
  AgregadosComposicao,
  ComponenteComposicao,
  InsumoCatalogo,
  LinhaComposicaoExpandida,
  NovoInsumoCatalogo,
  LinhaHH,
} from '../../../types';
import { formatBRL } from '../../../lib/preco';
import { chavesComFilhos, somarFolhas } from '../../../lib/composicao';
import { EstadoComposicao } from '../../../services/catalogoService';
import { useFeedback } from '../../FeedbackContext';
import Spinner from '../../Spinner';
import { Button, Field, Input } from '../../ui';
import { useValidacao } from '../../../hooks/useValidacao';
import { lerDecimal } from '../../../lib/validacao';
import ArvoreComposicao, { AvisoArredondamento } from '../ArvoreComposicao';
import ResumoComposicao from '../ResumoComposicao';
import AjusteIndice from '../AjusteIndice';
import BuscaInsumo from '../BuscaInsumo';

/**
 * A aba Composição da janela do insumo — a árvore analítica até as folhas, com
 * HH, quebra de custo e edição de coeficiente.
 *
 * Era um `Modal size="full"` próprio (`ModalComposicao`) que abria POR CIMA do
 * drawer de detalhe, deixando duas superfícies empilhadas para o mesmo item. A
 * casca do modal saiu daqui em 20/set/2026; o corpo, que é o que sempre
 * funcionou, veio inteiro.
 *
 * Quem monta este componente (`JanelaInsumo`) o faz com `key={insumo.id}` e só
 * quando a aba está ativa. Isso não é organização: é o que faz o estado — nós
 * recolhidos, quantidade da calculadora, pilha de navegação — NASCER LIMPO a
 * cada item aberto, sem um `useEffect` de reset para manter em dia.
 */
interface AbaComposicaoProps {
  insumo: InsumoCatalogo;
  jornadaDiaria: number;
  /** Insumo simples que a pessoa pediu para transformar: nasce com a busca aberta. */
  iniciarAdicionando?: boolean;
  carregarComposicao: (id: string) => Promise<(EstadoComposicao & { hh: LinhaHH[] }) | null>;
  buscarCandidatos: (termo: string, excluirId: string) => Promise<InsumoCatalogo[]>;
  /**
   * Cadastra um insumo sem sair daqui e devolve o item criado para ser
   * selecionado. Sem isto, não encontrar o insumo na busca era um beco sem
   * saída: fechar a composição, cadastrar na aba, reabrir e procurar de novo.
   */
  onCriarInsumo: (novo: NovoInsumoCatalogo) => Promise<InsumoCatalogo | null>;
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

/** Um degrau da navegação para dentro de subcomposições. */
type Degrau = { id: string; descricao: string; unidade: string };

export default function AbaComposicao({
  insumo,
  jornadaDiaria,
  iniciarAdicionando = false,
  carregarComposicao,
  buscarCandidatos,
  onCriarInsumo,
  onAddComponente,
  onUpdateComponente,
  onRemoverComponente,
}: AbaComposicaoProps) {
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
  const [adicionando, setAdicionando] = useState(iniciarAdicionando);
  const [candidatoId, setCandidatoId] = useState('');
  const [coefNovo, setCoefNovo] = useState('');
  const [salvando, setSalvando] = useState(false);
  /**
   * Remonta a busca a cada inclusão. Montar composição é trabalho em SÉRIE —
   * cimento, areia, cal, pedreiro, servente —, e fechar o formulário depois de
   * cada item obrigava a reabri-lo quatro vezes. A remontagem limpa o termo e
   * devolve o foco à busca para o próximo.
   */
  const [rodadaBusca, setRodadaBusca] = useState(0);

  const quantidade = useMemo(() => {
    const n = lerDecimal(quantidadeTexto);
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

  const selecionarCandidato = (id: string) => {
    setCandidatoId(id);
    // Escolhido o insumo, a próxima coisa a digitar é o coeficiente.
    // Por id e não por ref: `Input` não encaminha ref, e o id é o do `Field`.
    requestAnimationFrame(() => document.getElementById('novo-coef')?.focus());
  };

  const fecharFormulario = () => {
    setAdicionando(false);
    setCandidatoId('');
    setCoefNovo('');
    limparErro('coeficiente');
  };

  const adicionar = async () => {
    const coeficiente = lerDecimal(coefNovo);
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
    setCandidatoId('');
    setCoefNovo('');
    setRodadaBusca((r) => r + 1);
    toast.success('Componente incluído.', 'O preço foi recalculado. Busque o próximo ou feche o formulário.');
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
        <nav aria-label="Caminho da composição" className="flex items-center gap-1 flex-wrap text-xs">
          {pilha.map((d, i) => (
            <span key={d.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-slate-500" aria-hidden />}
              {i === pilha.length - 1 ? (
                <span aria-current="location" className="font-semibold text-slate-900 truncate max-w-xs">{d.descricao}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPilha((p) => p.slice(0, i + 1))}
                  className="text-blue-600 hover:underline font-semibold truncate max-w-xs rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {d.descricao}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Barra da árvore: o que ela contém, a calculadora e as duas ações.
          A calculadora morava num cartão próprio no alto da coluna lateral,
          empurrando o resumo — que é o que a coluna existe para mostrar —
          para baixo da dobra. Aqui ela fica junto da tabela que ela muda. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-600">
          <strong className="data-font font-semibold text-slate-900">{componentes.length}</strong>{' '}
          componente{componentes.length === 1 ? '' : 's'} direto{componentes.length === 1 ? '' : 's'}
          {arvore.length > componentes.length && (
            <> · <span className="data-font">{arvore.length}</span> linhas abertas</>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {arvore.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span>Calcular para</span>
              {/* A largura vem do invólucro: o campo não declara `w-` (regra do portão). */}
              <span className="block w-32">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={quantidadeTexto}
                  onChange={(e) => setQuantidadeTexto(e.target.value)}
                  tamanho="sm"
                  mono
                  sufixo={alvo.unidade}
                  aria-label={`Quantidade da atividade, em ${alvo.unidade}`}
                />
              </span>
            </label>
          )}
          {comFilhos.size > 0 && (
            <Button
              variante="fantasma"
              tamanho="sm"
              onClick={() => setRecolhidos(todosRecolhidos ? new Set() : new Set(comFilhos))}
            >
              {todosRecolhidos ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
              <span>{todosRecolhidos ? 'Abrir subcomposições' : 'Recolher subcomposições'}</span>
            </Button>
          )}
          {adicionando ? (
            <Button variante="secundario" tamanho="sm" onClick={fecharFormulario}>
              <X size={13} />
              <span>Fechar</span>
            </Button>
          ) : (
            <Button tamanho="sm" onClick={() => setAdicionando(true)}>
              <Plus size={13} />
              <span>Adicionar componente</span>
            </Button>
          )}
        </div>
      </div>

      {adicionando && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
          <BuscaInsumo
            key={rodadaBusca}
            buscar={buscarCandidatos}
            excluirId={alvo.id}
            selecionadoId={candidatoId}
            onSelecionar={selecionarCandidato}
            /* Os filhos DIRETOS do alvo, não a árvore inteira: a unique do
               banco é (composicao_id, insumo_id), então repetir um insumo
               que aparece dentro de uma SUBcomposição é legítimo. Marcar a
               árvore toda desabilitaria escolhas válidas. */
            jaUsados={componentes.map((c) => c.insumoId)}
            onCriarInsumo={onCriarInsumo}
            autoFocus
          />
          <div ref={areaRef as React.RefObject<HTMLDivElement>} className="flex flex-wrap items-end gap-2">
            <Field
              className="space-y-1 flex-1 min-w-48"
              id="novo-coef"
              label={<>Coeficiente — quantidade por 1 {alvo.unidade}</>}
              erro={erros.coeficiente}
              required
            >
              {(props) => (
                <Input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  value={coefNovo}
                  disabled={!candidatoId}
                  onChange={(e) => { setCoefNovo(e.target.value); limparErro('coeficiente'); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
                  placeholder={candidatoId ? '0,35' : 'Escolha um insumo acima'}
                  mono
                />
              )}
            </Field>
            <Button onClick={adicionar} disabled={!candidatoId || salvando} carregando={salvando}>
              {!salvando && <PlusCircle size={13} />}
              <span>Incluir</span>
            </Button>
          </div>
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
        /* O texto fala do ITEM, e não de "uma composição vazia": só chega aqui
           o insumo simples que a pessoa pediu para transformar — ele vira
           composição no primeiro componente, não antes. */
        !adicionando && (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-500">
            Ainda sem componentes — o preço é o valor digitado ({formatBRL(insumo.precoReferencia)}). Ao
            receber o primeiro, o item vira composição e o preço passa a ser calculado.
          </p>
        )
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-2">
            <ArvoreComposicao
              linhas={arvore}
              unidadeTopo={alvo.unidade}
              custoTotal={custoTotal}
              recolhidos={recolhidos}
              onAlternarNo={alternarNo}
              quantidade={quantidade}
              onAjustarIndice={setAjustando}
              onRemover={remover}
              onAbrirSubcomposicao={(d) => setPilha((p) => [...p, d])}
            />
            <AvisoArredondamento soma={somaFolhas} total={custoTotal} />
          </div>

          <ResumoComposicao
            agregados={agregados}
            hh={hh}
            unidade={alvo.unidade}
            quantidade={quantidade}
          />
        </div>
      )}
    </div>
  );
}
