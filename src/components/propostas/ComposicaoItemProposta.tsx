import { useEffect, useState } from 'react';
import { AlertTriangle, BookmarkPlus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ComponenteItemProposta, ItemProposta } from '../../types';
import { NovoComponenteItemProposta } from '../../services/itensPropostaService';
import { formatBRL } from '../../lib/preco';
import {
  Aviso,
  Button,
  Chip,
  IconButton,
  Input,
  Select,
  TableWrap,
  Td,
  Th,
} from '../ui';
import Spinner from '../Spinner';

/**
 * A COMPOSIÇÃO DESTA ATIVIDADE NESTA OBRA.
 *
 * ## As três composições, e por que esta existe
 *
 *   SINAPI     referência de mercado, imutável, dado de terceiro.
 *   Catálogo   o padrão da empresa, reutilizável entre propostas.
 *   Esta       o que de fato vai ser executado NESTA obra.
 *
 * A empresa tem pedreiro próprio, compra cimento por outro preço e produz com
 * outra produtividade. Sem esta terceira camada, adaptar a composição ao caso
 * real obrigava a escolher entre dois erros: alterar o catálogo (mudando o
 * padrão de todas as propostas por causa de uma) ou não adaptar nada e vender
 * pelo custo de referência.
 *
 * ## O que a tela precisa deixar evidente
 *
 * Que o número na tela é o DAQUI, e de onde ele partiu. Por isso toda linha
 * ajustada mostra o valor de referência riscado ao lado do editado, e a
 * fileira ganha o selo "ajustada": três meses depois, a pergunta que se faz
 * olhando uma proposta é "por que este item saiu mais barato?", e a resposta
 * tem de estar na mesma linha.
 *
 * O custo é recalculado pelo BANCO (gatilho), não aqui — é a mesma regra que o
 * catálogo já aplica, e duas contas paralelas divergiriam na primeira diferença
 * de arredondamento.
 */

interface Props {
  item: ItemProposta;
  componentes: ComponenteItemProposta[];
  carregando: boolean;
  bloqueado: boolean;
  onAjustar: (
    componenteId: string,
    patch: { coeficiente: number; precoUnitario: number }
  ) => Promise<unknown>;
  onAdd: (novo: NovoComponenteItemProposta) => Promise<unknown>;
  onRemover: (componenteId: string) => Promise<unknown>;
  onSalvarNoCatalogo: () => Promise<unknown>;
}

/** Uma linha está adaptada quando difere da referência — ou não tem referência. */
function ajustada(c: ComponenteItemProposta): boolean {
  if (c.coeficienteReferencia === undefined) return true;
  if (c.coeficiente !== c.coeficienteReferencia) return true;
  return (
    c.precoUnitarioReferencia !== undefined && c.precoUnitario !== c.precoUnitarioReferencia
  );
}

export default function ComposicaoItemProposta({
  item,
  componentes,
  carregando,
  bloqueado,
  onAjustar,
  onAdd,
  onRemover,
  onSalvarNoCatalogo,
}: Props) {
  const [salvandoCatalogo, setSalvandoCatalogo] = useState(false);
  const [mostrarNovo, setMostrarNovo] = useState(false);

  // Soma exata e arredonda uma vez — a mesma conta do banco. Somar a coluna
  // `custo` (que já vem arredondada por linha) daria um total diferente do
  // gravado, e a tela mostraria dois números para a mesma coisa.
  const total = Math.round(
    componentes.reduce((s, c) => s + c.coeficiente * c.precoUnitario, 0) * 100
  ) / 100;

  const qtdAjustadas = componentes.filter(ajustada).length;
  const semPreco = componentes.filter((c) => c.precoUnitario === 0).length;

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-4 text-2xs text-slate-500">
        <Spinner size={14} /> Carregando a composição...
      </div>
    );
  }

  return (
    <div className="space-y-3 py-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">
            Composição desta obra
          </span>
          {qtdAjustadas > 0 ? (
            <Chip tom="informativo" className="px-2 py-0.5">
              {qtdAjustadas === 1 ? '1 linha adaptada' : `${qtdAjustadas} linhas adaptadas`}
            </Chip>
          ) : (
            <Chip tom="neutro" className="px-2 py-0.5">Igual à referência</Chip>
          )}
        </div>
        {!bloqueado && (
          <div className="flex items-center gap-2">
            <Button variante="secundario" tamanho="sm" onClick={() => setMostrarNovo((v) => !v)}>
              <Plus size={12} /> Insumo
            </Button>
            {/* A ação EXPLÍCITA. Nada do que se edita aqui chega ao catálogo
                sozinho — o catálogo é o padrão da empresa, e uma obra com
                condição específica não pode redefini-lo em silêncio. */}
            <Button
              variante="secundario"
              tamanho="sm"
              carregando={salvandoCatalogo}
              title="Cria (ou atualiza) um item do catálogo da empresa com esta composição ajustada. A referência SINAPI não é alterada."
              onClick={async () => {
                setSalvandoCatalogo(true);
                await onSalvarNoCatalogo();
                setSalvandoCatalogo(false);
              }}
            >
              {!salvandoCatalogo && <BookmarkPlus size={12} />} Salvar no catálogo
            </Button>
          </div>
        )}
      </div>

      {semPreco > 0 && (
        <Aviso tom="atencao" icone={<AlertTriangle size={13} />}>
          <span className="text-2xs leading-relaxed">
            {semPreco === 1
              ? '1 insumo entrou sem preço'
              : `${semPreco} insumos entraram sem preço`}{' '}
            — o SINAPI não publica valor para eles nesta UF. Informe o preço praticado, senão
            eles somam zero ao custo.
          </span>
        </Aviso>
      )}

      <TableWrap>
        <thead>
          <tr>
            <Th>Código</Th>
            <Th>Insumo</Th>
            <Th>Un.</Th>
            <Th align="right">Coeficiente</Th>
            <Th align="right">Preço unit.</Th>
            <Th align="right">Custo</Th>
            <Th align="right" className="w-8" />
          </tr>
        </thead>
        <tbody>
          {componentes.length === 0 ? (
            <tr>
              <Td colSpan={7} align="center" className="py-6 italic text-slate-500">
                Esta atividade não tem composição detalhada.
              </Td>
            </tr>
          ) : (
            componentes.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/50 transition">
                <Td mono className="text-2xs text-slate-500">
                  {c.codigoSINAPI ?? '—'}
                </Td>
                <Td>
                  <div className="font-semibold text-slate-800 leading-snug">{c.descricao}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-2xs text-slate-500">{c.categoria}</span>
                    {ajustada(c) && (
                      <Chip tom="informativo" className="px-1.5 py-0">ajustada</Chip>
                    )}
                  </div>
                </Td>
                <Td mono className="text-2xs text-slate-500">{c.unidade}</Td>

                <Td align="right">
                  <CampoDaComposicao
                    valor={c.coeficiente}
                    referencia={c.coeficienteReferencia}
                    bloqueado={bloqueado}
                    rotulo={`Coeficiente de ${c.descricao}`}
                    formatar={(v) => String(v)}
                    onConfirmar={(v) =>
                      onAjustar(c.id, { coeficiente: v, precoUnitario: c.precoUnitario })
                    }
                  />
                </Td>

                <Td align="right">
                  <CampoDaComposicao
                    valor={c.precoUnitario}
                    referencia={c.precoUnitarioReferencia}
                    bloqueado={bloqueado}
                    rotulo={`Preço unitário de ${c.descricao}`}
                    formatar={formatBRL}
                    onConfirmar={(v) =>
                      onAjustar(c.id, { coeficiente: c.coeficiente, precoUnitario: v })
                    }
                  />
                </Td>

                <Td align="right" mono className="font-bold text-slate-900">
                  {formatBRL(c.custo)}
                </Td>

                <Td align="right">
                  {!bloqueado && (
                    <IconButton
                      rotulo={`Remover ${c.descricao} da composição`}
                      tom="perigo"
                      tamanho="sm"
                      onClick={() => onRemover(c.id)}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  )}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </TableWrap>

      {mostrarNovo && !bloqueado && (
        <NovoInsumoDaComposicao
          onCancelar={() => setMostrarNovo(false)}
          onAdicionar={async (novo) => {
            await onAdd(novo);
            setMostrarNovo(false);
          }}
        />
      )}

      {/* O fecho da conta, e os TRÊS preços lado a lado — é aqui que a regra
          "não misturar preço SINAPI, preço do catálogo e preço aplicado" deixa
          de ser texto e vira coisa que se lê. */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-t border-slate-200 pt-2.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-2xs">
          {item.precoReferenciaSinapi !== undefined && (
            <span className="text-slate-500">
              Referência SINAPI{' '}
              <strong className="data-font font-bold text-slate-700">
                {formatBRL(item.precoReferenciaSinapi)}
              </strong>
            </span>
          )}
          <span className="text-slate-500">
            Custo desta composição{' '}
            <strong className="data-font font-bold text-slate-900">{formatBRL(total)}</strong>
          </span>
          <span className="text-slate-500">
            Preço aplicado{' '}
            <strong className="data-font font-bold text-blue-700">
              {formatBRL(item.precoUnitario)}
            </strong>
            <span className="text-slate-500"> / {item.unidade}</span>
          </span>
        </div>
        {item.precoReferenciaSinapi !== undefined &&
          Math.abs(total - item.precoReferenciaSinapi) > 0.005 && (
            <span className="text-2xs text-slate-500">
              {total > item.precoReferenciaSinapi ? '+' : '−'}
              <strong className="data-font">
                {formatBRL(Math.abs(total - item.precoReferenciaSinapi))}
              </strong>{' '}
              sobre a referência
            </span>
          )}
      </div>
    </div>
  );
}

/**
 * Um número da composição, editável no lugar.
 *
 * Mesmo comportamento dos campos de quantidade e preço da tabela de itens:
 * controlado, confirmado no blur ou no Enter, revertido ao valor do registro se
 * a escrita falhar. Sem isso o campo continuaria exibindo o que foi digitado
 * enquanto o banco guarda outra coisa — o defeito que `InputQuantidade` já
 * documenta.
 *
 * O extra daqui é a REFERÊNCIA: quando o valor difere do publicado, o original
 * aparece riscado embaixo. É o que responde "de onde este número saiu" sem
 * precisar abrir a base do SINAPI ao lado.
 */
function CampoDaComposicao({
  valor,
  referencia,
  bloqueado,
  rotulo,
  formatar,
  onConfirmar,
}: {
  valor: number;
  referencia?: number;
  bloqueado: boolean;
  rotulo: string;
  formatar: (v: number) => string;
  onConfirmar: (v: number) => Promise<unknown>;
}) {
  const [texto, setTexto] = useState(String(valor));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setTexto(String(valor)), [valor]);

  const desviado = referencia !== undefined && valor !== referencia;

  const confirmar = async () => {
    const n = parseFloat(texto);
    if (Number.isNaN(n) || n < 0 || n === valor) {
      setTexto(String(valor));
      return;
    }
    setSalvando(true);
    await onConfirmar(n);
    setSalvando(false);
    // O valor volta pelo `useEffect` quando a escrita chega; se ela falhar, o
    // registro não mudou e o efeito devolve o número anterior.
  };

  if (bloqueado) {
    return (
      <div className="text-right">
        <span className="data-font font-semibold text-slate-800">{formatar(valor)}</span>
        {desviado && (
          <span className="block text-2xs text-slate-500 line-through">{formatar(referencia!)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <Input
        type="number"
        step="any"
        min="0"
        aria-label={rotulo}
        disabled={salvando}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setTexto(String(valor));
        }}
        mono
        tamanho="sm"
        largura="dinheiro"
        className="text-right"
      />
      {desviado && (
        <span
          className="flex items-center gap-1 text-2xs text-slate-500"
          title="Valor publicado na referência. Clique para voltar a ele."
        >
          <button
            type="button"
            aria-label={`Voltar ${rotulo} ao valor de referência`}
            onClick={() => onConfirmar(referencia!)}
            className="inline-flex items-center gap-1 hover:text-blue-600 transition"
          >
            <RotateCcw size={9} aria-hidden="true" />
            <span className="data-font line-through">{formatar(referencia!)}</span>
          </button>
        </span>
      )}
    </div>
  );
}

const CATEGORIAS_INSUMO = ['Material', 'Mão de Obra', 'Equipamento', 'Serviço', 'Taxa'] as const;

/**
 * Acrescentar um insumo que a referência não tem — andaime próprio, taxa de
 * mobilização, o que a obra exigir. Nasce SEM referência, de propósito: ele não
 * partiu de lugar nenhum, e marcar uma referência igual ao valor digitado faria
 * a tela dizer que a linha está "igual ao SINAPI".
 */
function NovoInsumoDaComposicao({
  onCancelar,
  onAdicionar,
}: {
  onCancelar: () => void;
  onAdicionar: (novo: NovoComponenteItemProposta) => Promise<void>;
}) {
  const [descricao, setDescricao] = useState('');
  const [unidade, setUnidade] = useState('un');
  const [categoria, setCategoria] =
    useState<NovoComponenteItemProposta['categoria']>('Material');
  const [coeficiente, setCoeficiente] = useState('1');
  const [preco, setPreco] = useState('');
  const [salvando, setSalvando] = useState(false);

  const coef = parseFloat(coeficiente);
  const pu = parseFloat(preco);
  const valido = descricao.trim() !== '' && coef > 0 && !Number.isNaN(pu) && pu >= 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <span className="block text-2xs font-bold uppercase tracking-wider text-slate-500">
        Insumo próprio desta composição
      </span>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
        <Input
          aria-label="Descrição do insumo"
          placeholder="Descrição"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          fundo="branco"
          className="md:col-span-5"
        />
        <Select
          aria-label="Categoria do insumo"
          value={categoria}
          onChange={(e) =>
            setCategoria(e.target.value as NovoComponenteItemProposta['categoria'])
          }
          fundo="branco"
          className="md:col-span-3"
        >
          {CATEGORIAS_INSUMO.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <Input
          aria-label="Unidade"
          placeholder="un"
          value={unidade}
          onChange={(e) => setUnidade(e.target.value)}
          fundo="branco"
          mono
          className="md:col-span-1"
        />
        <Input
          aria-label="Coeficiente"
          type="number"
          step="any"
          min="0.0000001"
          placeholder="Coef."
          value={coeficiente}
          onChange={(e) => setCoeficiente(e.target.value)}
          fundo="branco"
          mono
          className="md:col-span-1"
        />
        <Input
          aria-label="Preço unitário"
          type="number"
          step="any"
          min="0"
          placeholder="R$"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          fundo="branco"
          mono
          className="md:col-span-2"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variante="fantasma" tamanho="sm" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button
          tamanho="sm"
          disabled={!valido}
          carregando={salvando}
          onClick={async () => {
            setSalvando(true);
            await onAdicionar({
              descricao: descricao.trim(),
              unidade: unidade.trim() || 'un',
              categoria,
              coeficiente: coef,
              precoUnitario: pu,
            });
            setSalvando(false);
          }}
        >
          Acrescentar
        </Button>
      </div>
    </div>
  );
}
