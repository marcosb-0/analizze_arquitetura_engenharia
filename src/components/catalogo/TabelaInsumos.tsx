import { AlertTriangle, Briefcase, Pencil, Sigma, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { IconButton, TableWrap, Td, Th } from '../ui';
import { InsumoCatalogo } from '../../types';
import { melhorPreco, formatBRL } from '../../lib/preco';
import { participacao } from '../../lib/composicao';
import { corCategoria } from './categorias';
import { AcoesInsumo, corProcedencia, estadoComposicao, rotuloProcedencia } from './acoesInsumo';

/**
 * Visão densa do catálogo — a que serve a orçamentação.
 *
 * O cartão mostra ~6 insumos por tela e é ótimo para olhar UM item; orçar é
 * comparar dezenas, e para isso o que conta é linha fina, coluna alinhada e a
 * possibilidade de ordenar. Daí as colunas de **HH/un** e **%MO**, que só
 * existem depois de `catalogo_composicao_agregados` e são a razão principal de
 * a tabela existir: sem elas não dá para responder "qual serviço é intensivo em
 * mão de obra" sem abrir um por um.
 *
 * Composição sem componentes não tem agregados — a coluna mostra `—`, não zero.
 * Zero significaria "não usa mão de obra", que é uma afirmação diferente de
 * "não sabemos porque a estrutura não foi aberta".
 */

const numero = (v: number, casas = 3) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

export default function TabelaInsumos({
  catalogo,
  temProjetos,
  verificandoUsos,
  onAbrirDetalhe,
  onEditar,
  onVincular,
  onSetAtivo,
  onExcluir,
  onAbrirComposicao,
}: AcoesInsumo & { catalogo: InsumoCatalogo[] }) {
  return (
    // `rolagem="propria"` é o que faz o cabeçalho grudar. As dez declarações de
    // `sticky top-0` que estavam aqui não grudavam nada: o contêiner tinha
    // altura automática e nunca rolava (ver o cabeçalho de `ui/Table.tsx`).
    <TableWrap rolagem="propria" className="bg-white rounded-xl border border-slate-200 shadow-xs">
      <thead>
        <tr>
          <Th fixa>Descrição</Th>
          <Th>Código</Th>
          <Th>Un.</Th>
          <Th>Categoria</Th>
          <Th align="right">HH/un</Th>
          <Th align="right">%MO</Th>
          <Th align="right">Preço vigente</Th>
          <Th>Procedência</Th>
          <Th align="right">Obras</Th>
          <Th align="right">Ações</Th>
        </tr>
      </thead>
      <tbody>
        {catalogo.map((item) => {
          const melhor = melhorPreco(item);
          const comp = item.tipoItem === 'Composicao' ? estadoComposicao(item) : null;
          const ag = item.agregados;
          const pctMO = ag ? participacao(ag.custoMaoDeObra, ag.custoTotal) : null;

          return (
            <tr
              key={item.id}
              onClick={() => onAbrirDetalhe(item.id)}
              className={`cursor-pointer hover:bg-blue-50/40 transition ${item.ativo ? '' : 'opacity-60 bg-slate-50'}`}
            >
              <Td fixa className="max-w-md">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-slate-800 truncate" title={item.descricao}>
                    {item.descricao}
                  </span>
                  {comp && (
                    <span
                      className={`text-2xs font-bold shrink-0 border rounded px-1 ${
                        comp.alerta ? 'text-slate-500 border-slate-200' : 'text-indigo-700 border-indigo-200'
                      }`}
                      title={comp.titulo}
                    >
                      {comp.texto}
                    </span>
                  )}
                  {item.temComponenteInativo && (
                    <AlertTriangle
                      size={11}
                      className="text-amber-600 shrink-0"
                      aria-label="Há insumo desativado somando preço nesta composição"
                    />
                  )}
                </div>
              </Td>

              <Td mono className="text-slate-600 whitespace-nowrap">
                {item.tipo === 'SINAPI' ? (item.codigoSINAPI ?? '—') : <span className="text-slate-500">próprio</span>}
              </Td>

              <Td mono className="uppercase text-slate-600">{item.unidade}</Td>

              <Td>
                <span className={`text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 border rounded-full whitespace-nowrap ${corCategoria(item.categoria)}`}>
                  {item.categoria}
                </span>
              </Td>

              {/* `—` e não `0`: composição sem componentes abertos não tem HH
                  conhecido, e zero afirmaria que ela não usa mão de obra. */}
              <Td align="right" mono className={ag && ag.hhPorUnidade > 0 ? 'font-bold text-violet-800' : 'text-slate-500'}>
                {ag && ag.hhPorUnidade > 0 ? (
                  <span title={
                    ag.hhForaDeHora > 0
                      ? `${ag.hhForaDeHora} item(ns) de mão de obra fora de hora (mensalista ou empreitada) não entram neste HH`
                      : undefined
                  }>
                    {numero(ag.hhPorUnidade)}
                    {ag.hhForaDeHora > 0 && <span className="text-amber-600 font-bold">*</span>}
                  </span>
                ) : '—'}
              </Td>

              <Td align="right" mono className="text-slate-600">
                {pctMO != null && pctMO > 0 ? `${numero(pctMO, 0)}%` : '—'}
              </Td>

              <Td align="right" mono className="font-extrabold text-slate-900 whitespace-nowrap">
                {formatBRL(melhor.preco)}
              </Td>

              <Td>
                <span className={`text-2xs font-bold uppercase tracking-wide whitespace-nowrap ${corProcedencia(melhor.nivel)}`}>
                  {rotuloProcedencia(melhor.nivel, melhor.origem)}
                  {melhor.nivel <= 2 && melhor.diasIdade != null && (
                    <span className="text-slate-500 normal-case font-semibold"> · {melhor.diasIdade}d</span>
                  )}
                </span>
              </Td>

              <Td align="right" mono className="text-slate-600">
                {item.obrasUtilizando > 0 ? item.obrasUtilizando : '—'}
              </Td>

              {/* A linha inteira abre o detalhe; a célula de ações precisa
                  parar a propagação ou todo clique aqui abriria o drawer junto. */}
              <Td align="right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  {item.tipoItem === 'Composicao' && (
                    <IconButton rotulo="Abrir composição" tom="acao" tamanho="sm" onClick={() => onAbrirComposicao(item)}>
                      <Sigma size={13} />
                    </IconButton>
                  )}
                  <IconButton rotulo="Editar insumo" tom="acao" tamanho="sm" onClick={() => onEditar(item)}>
                    <Pencil size={13} />
                  </IconButton>
                  <IconButton
                    rotulo={temProjetos ? 'Vincular ao orçamento de uma obra' : 'Nenhuma obra cadastrada'}
                    tom="acao"
                    tamanho="sm"
                    disabled={!temProjetos}
                    onClick={() => onVincular(item)}
                  >
                    <Briefcase size={13} />
                  </IconButton>
                  <IconButton
                    rotulo={item.ativo ? 'Desativar insumo' : 'Reativar insumo'}
                    tamanho="sm"
                    onClick={() => onSetAtivo(item.id, !item.ativo)}
                  >
                    {item.ativo ? <ToggleRight size={15} className="text-blue-600" /> : <ToggleLeft size={15} />}
                  </IconButton>
                  <IconButton
                    rotulo="Excluir insumo do catálogo"
                    tom="perigo"
                    tamanho="sm"
                    carregando={verificandoUsos === item.id}
                    onClick={() => onExcluir(item)}
                    disabled={verificandoUsos === item.id}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}
