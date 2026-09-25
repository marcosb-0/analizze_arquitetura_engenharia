import { AlertTriangle, Briefcase, Pencil, Sigma } from 'lucide-react';
import { Chip, IconButton, TableWrap, Td, Th } from '../ui';
import { InsumoCatalogo } from '../../types';
import { melhorPreco, formatBRL } from '../../lib/preco';
import { participacao } from '../../lib/composicao';
import { AcoesInsumo, estadoComposicao, rotuloProcedencia, tomProcedencia } from './acoesInsumo';

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
  onAbrirDetalhe,
  onEditar,
  onVincular,
}: Pick<AcoesInsumo, 'temProjetos' | 'onAbrirDetalhe' | 'onEditar' | 'onVincular'> & { catalogo: InsumoCatalogo[] }) {
  return (
    // `rolagem="propria"` é o que faz o cabeçalho grudar. As dez declarações de
    // `sticky top-0` que estavam aqui não grudavam nada: o contêiner tinha
    // altura automática e nunca rolava (ver o cabeçalho de `ui/Table.tsx`).
    <TableWrap rolagem="propria" className="bg-superficie rounded-lg border border-slate-200 shadow-sm">
      <thead>
        <tr>
          <Th>Código</Th>
          <Th fixa>Descrição</Th>
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
              /* A linha é o alvo principal — e tem de ser alcançável sem mouse.
                 Enter/Espaço abrem a janela como o clique; o evento que vem de
                 um botão da célula de ações não chega aqui (stopPropagation). */
              tabIndex={0}
              aria-label={`Abrir ${item.codigo} — ${item.descricao}`}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrirDetalhe(item.id); }
              }}
              className={`cursor-pointer hover:bg-slate-50 transition focus-visible:outline-none focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${item.ativo ? '' : 'opacity-60'}`}
            >
              {/* O código antes da descrição, e monoespaçado: é a coluna que
                  se lê em varredura vertical, e com fonte proporcional os
                  dígitos não alinham. */}
              <Td mono className="text-slate-500 font-bold whitespace-nowrap">{item.codigo}</Td>
              <Td fixa className="max-w-md">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-slate-900 truncate" title={item.descricao}>
                    {item.descricao}
                  </span>
                  {comp && (
                    <Chip tom="informativo" className="shrink-0" title={comp.titulo}>
                      <Sigma size={11} aria-hidden="true" />
                      {comp.texto}
                    </Chip>
                  )}
                  {!item.ativo && <Chip tom="atencao" className="shrink-0">inativo</Chip>}
                  {item.temComponenteInativo && (
                    <AlertTriangle
                      size={11}
                      className="text-amber-600 shrink-0"
                      aria-label="Há insumo desativado somando preço nesta composição"
                    />
                  )}
                </div>
              </Td>

              <Td mono className="uppercase text-slate-600">{item.unidade}</Td>

              <Td>
                <span className="text-xs text-slate-600 whitespace-nowrap">{item.categoria}</span>
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
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Chip tom={tomProcedencia(melhor.nivel)}>{rotuloProcedencia(melhor.nivel, melhor.origem)}</Chip>
                  {melhor.nivel <= 2 && melhor.diasIdade != null && (
                    <span className="data-font text-2xs text-slate-500">{melhor.diasIdade}d</span>
                  )}
                </span>
              </Td>

              <Td align="right" mono className="text-slate-600">
                {item.obrasUtilizando > 0 ? item.obrasUtilizando : '—'}
              </Td>

              {/* A linha inteira abre a janela do item; a célula de ações
                  precisa parar a propagação ou todo clique aqui a abriria junto. */}
              <Td align="right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  {/* Só as duas ações de USO. Desativar e excluir saíram da
                      linha em 25/set/2026 e vivem na janela do item (e no
                      cartão), com confirmação: quatro ícones por linha
                      disputavam o clique principal, e o alternador de ativo
                      trocava a situação do item sem perguntar. */}
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
                </div>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}
