import { AlertTriangle, ChevronDown, ChevronRight, CornerDownRight, Sigma, SlidersHorizontal, Trash2 } from 'lucide-react';
import { LinhaComposicaoExpandida } from '../../types';
import { formatBRL } from '../../lib/preco';
import { chaveDoNo, linhasVisiveis, participacao } from '../../lib/composicao';
import { Chip, IconButton, TableWrap, Td, Th } from '../ui';
import { corProcedencia, rotuloProcedencia } from './acoesInsumo';

/**
 * A composição analítica, do jeito que um orçamentista lê.
 *
 * REGRA QUE GOVERNA ESTA TABELA: só as linhas com `ehFolha` somam. Uma linha de
 * subcomposição carrega o subtotal da própria subárvore para explicar de onde
 * vêm os R$ 2,15 da argamassa — somá-la junto das folhas contaria o mesmo
 * dinheiro duas vezes. Daí o galho aparecer com o custo em cinza e sem o `%`.
 *
 * A edição de coeficiente vale só no NÍVEL 1: é o único que existe em
 * `composicao_itens` desta composição. Um coeficiente de nível 2 pertence à
 * composição auxiliar, e oferecer um campo aqui mentiria sobre onde o número
 * mora — por isso a linha oferece "abrir esta composição" em vez do campo.
 */
interface ArvoreComposicaoProps {
  linhas: LinhaComposicaoExpandida[];
  unidadeTopo: string;
  custoTotal: number;
  recolhidos: Set<string>;
  onAlternarNo: (chave: string) => void;
  /** Quantidade da calculadora; 1 mostra a composição unitária. */
  quantidade: number;
  onAjustarIndice: (linha: LinhaComposicaoExpandida) => void;
  onRemover: (linha: LinhaComposicaoExpandida) => void;
  /** Navega para dentro de uma subcomposição (a pilha de `AbaComposicao`). */
  onAbrirSubcomposicao: (alvo: { id: string; descricao: string; unidade: string }) => void;
}

const numero = (v: number, casas = 4) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

export default function ArvoreComposicao({
  linhas,
  unidadeTopo,
  custoTotal,
  recolhidos,
  onAlternarNo,
  quantidade,
  onAjustarIndice,
  onRemover,
  onAbrirSubcomposicao,
}: ArvoreComposicaoProps) {
  const visiveis = linhasVisiveis(linhas, recolhidos);

  /**
   * A composição onde o coeficiente de uma linha de nível ≥ 2 MORA é a do pai
   * (`paiId`), não a da própria linha. O atalho abria `l.insumoId` — numa folha
   * isso levava ao próprio insumo, uma árvore vazia sem o coeficiente que a
   * pessoa queria editar.
   */
  const abrirPai = (l: LinhaComposicaoExpandida) => {
    const pai = linhas.find((p) => p.insumoId === l.paiId && !p.ehFolha);
    if (pai) onAbrirSubcomposicao({ id: pai.insumoId, descricao: pai.descricao, unidade: pai.unidade });
  };
  const abrir = (l: LinhaComposicaoExpandida) =>
    onAbrirSubcomposicao({ id: l.insumoId, descricao: l.descricao, unidade: l.unidade });

  return (
    <TableWrap className="border border-slate-200 rounded-lg">
      <thead>
        {/* Seis colunas no máximo, para caber sem rolagem lateral: unidade e
            coeficiente acumulado moram sob o coeficiente, procedência sob o
            preço e o % sob o custo. O nível virou só o recuo (e texto para
            leitor de tela). */}
        <tr>
          <Th className="w-full">Item</Th>
          <Th align="right">Coef.</Th>
          {quantidade !== 1 && <Th align="right">Qtd. total</Th>}
          <Th align="right">Preço unit.</Th>
          <Th align="right">Custo</Th>
          <Th align="right"><span className="sr-only">Ações</span></Th>
        </tr>
      </thead>
      <tbody>
        {visiveis.map((l) => {
          const chave = chaveDoNo(l);
          const recolhido = recolhidos.has(chave);
          const ajustado = !!l.observacao;

          return (
            <tr key={chave} className={l.ehFolha ? '' : 'bg-slate-50'}>
              {/* `w-full` + `max-w-0`: a coluna do nome fica com a sobra e
                  trunca, em vez de alargar a tabela além da janela. */}
              <Td className="w-full max-w-0">
                {/* Indentação por padding e não por espaços: leitor de tela
                    ignora o recuo visual, e a coluna "Nv" carrega a
                    profundidade em texto para quem não vê o alinhamento. */}
                <div className="flex items-center gap-1 min-w-0" style={{ paddingLeft: `${(l.nivel - 1) * 16}px` }}>
                  <span className="sr-only">Nível {l.nivel}: </span>
                  {!l.ehFolha ? (
                    <button
                      type="button"
                      onClick={() => onAlternarNo(chave)}
                      aria-expanded={!recolhido}
                      aria-label={recolhido ? `Abrir ${l.descricao}` : `Recolher ${l.descricao}`}
                      className="p-0.5 rounded-lg hover:bg-slate-200 text-slate-800 shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      {recolhido ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    </button>
                  ) : l.nivel > 1 ? (
                    <CornerDownRight size={12} className="text-slate-500 shrink-0" aria-hidden />
                  ) : (
                    <span className="w-[13px] shrink-0" aria-hidden />
                  )}

                  {/* O código antes do nome torna a árvore conferível: duas
                      linhas com descrição parecida em ramos diferentes são o
                      mesmo insumo se — e só se — o código for o mesmo. */}
                  <span className="text-xs font-mono font-semibold text-slate-500 shrink-0">{l.codigo}</span>

                  {/* O nome da subcomposição leva para dentro dela — é o alvo
                      que a mão procura; o ícone Σ na coluna de ações continua
                      para quem navega pela tabela. */}
                  {l.ehFolha ? (
                    <span className="truncate text-slate-800" title={l.descricao}>
                      {l.descricao}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => abrir(l)}
                      className="truncate font-semibold text-slate-900 hover:text-blue-600 hover:underline text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      title={`Abrir ${l.descricao}`}
                    >
                      {l.descricao}
                    </button>
                  )}

                  {l.ehHora && (
                    <Chip tom="destaque" className="shrink-0" title="Entra no cálculo de HH">HH</Chip>
                  )}
                  {ajustado && (
                    <Chip tom="atencao" className="shrink-0" title={`Índice ajustado: ${l.observacao}`}>ajustado</Chip>
                  )}
                  {!l.ativo && (
                    <Chip tom="atencao" className="shrink-0" title="Insumo desativado, mas o preço dele continua somando">inativo</Chip>
                  )}
                </div>
              </Td>

              {/* Coeficiente acumulado só faz sentido a partir do nível 2: no
                  nível 1 ele é igual ao direto. */}
              <Td align="right" className="whitespace-nowrap">
                <span className="font-mono text-slate-800">{numero(l.coeficiente)}</span>{' '}
                <span className="text-xs text-slate-500">{l.unidade}</span>
                {l.nivel > 1 && (
                  <span className="block font-mono text-xs text-slate-500" title="Coeficiente acumulado">
                    acum. {numero(l.coefAcumulado, 6)}
                  </span>
                )}
              </Td>

              {quantidade !== 1 && (
                <Td align="right" mono className="font-semibold text-slate-800 whitespace-nowrap">
                  {numero(l.coefAcumulado * quantidade, 2)}
                </Td>
              )}

              <Td align="right" className="whitespace-nowrap">
                <span className="font-mono text-slate-800">{formatBRL(l.precoUnitario)}</span>
                <span className={`block text-xs font-semibold ${corProcedencia(l.precoNivel)}`}>
                  {rotuloProcedencia(l.precoNivel, l.precoFonte)}
                </span>
              </Td>

              {/* Galho não tem `%`: o percentual dele já está distribuído entre
                  as folhas que ele contém, e mostrar os dois somaria 200%. */}
              <Td align="right" className="whitespace-nowrap">
                <span className={`font-mono ${l.ehFolha ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                  {formatBRL(l.custo * quantidade)}
                </span>
                {l.ehFolha && (
                  <span className="block font-mono text-xs text-slate-500">
                    {participacao(l.custo, custoTotal).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                  </span>
                )}
              </Td>

              <Td align="right">
                <div className="flex items-center justify-end gap-1">
                  {l.nivel === 1 ? (
                    <>
                      <IconButton rotulo="Ajustar índice pela produtividade" tom="acao" tamanho="sm" onClick={() => onAjustarIndice(l)}>
                        <SlidersHorizontal size={12} />
                      </IconButton>
                      <IconButton rotulo="Remover da composição" tom="perigo" tamanho="sm" onClick={() => onRemover(l)}>
                        <Trash2 size={12} />
                      </IconButton>
                    </>
                  ) : (
                    <IconButton
                      rotulo="Abrir a composição onde este coeficiente mora"
                      tom="acao"
                      tamanho="sm"
                      onClick={() => abrirPai(l)}
                    >
                      <Sigma size={12} />
                    </IconButton>
                  )}
                </div>
              </Td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <Td colSpan={quantidade !== 1 ? 4 : 3} className="border-t-2 border-slate-300 font-semibold text-slate-800 text-xs">
            Custo {quantidade === 1 ? `por ${unidadeTopo}` : `de ${numero(quantidade, 2)} ${unidadeTopo}`}
          </Td>
          <Td align="right" mono className="border-t-2 border-slate-300 font-semibold text-slate-900 text-base">
            {formatBRL(custoTotal * quantidade)}
          </Td>
          <Td className="border-t-2 border-slate-300" />
        </tr>
      </tfoot>
    </TableWrap>
  );
}

/**
 * Aviso de que a soma visível não fecha com o total do servidor.
 *
 * Fica fora da tabela porque não é um dado da composição: é uma explicação de
 * arredondamento. Cada linha arredonda em centavos; `fn_custo_composicao`
 * arredonda uma vez, no fim, depois de expandir tudo até as folhas.
 */
export function AvisoArredondamento({ soma, total }: { soma: number; total: number }) {
  if (Math.abs(soma - total) < 0.005) return null;
  return (
    <div className="flex items-start gap-1.5 text-xs text-slate-500 leading-relaxed">
      <AlertTriangle size={12} className="text-slate-500 mt-0.5 shrink-0" aria-hidden />
      <p>
        A soma das folhas dá {formatBRL(soma)} e o total é {formatBRL(total)}. Aqui cada linha
        arredonda em centavos; o total arredonda uma vez só, depois de expandir tudo — a
        diferença é de arredondamento, não de preço.
      </p>
    </div>
  );
}
