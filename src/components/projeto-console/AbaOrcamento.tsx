import { useState } from 'react';
import { DollarSign, History, Plus } from 'lucide-react';
import {
  AjustePreco,
  EtapaOrcamentoVinculo,
  Fornecedor,
  InsumoCatalogo,
  InsumoProjeto,
  ItemOrcamento,
} from '../../types';
import { formatarDataBR } from '../../lib/data';
import { formatBRL } from '../../lib/preco';
import ConfiancaPreco from '../ConfiancaPreco';
import InsumosObra from '../InsumosObra';
import EmptyState from '../EmptyState';
import ModalItemOrcamento from './ModalItemOrcamento';
import ModalVinculo, { AlvoVinculo } from './ModalVinculo';
import type { DadosDaObra } from './useDadosDaObra';

interface Props {
  projetoId: string;
  dados: DadosDaObra;
  fornecedores: Fornecedor[];
  catalogo: InsumoCatalogo[];
  podeGerenciar: boolean;
  onAddOrcamentoItem: (item: ItemOrcamento) => Promise<ItemOrcamento | null>;
  onAjustarPrecoInsumo: (id: string, ajuste: AjustePreco) => Promise<InsumoProjeto | null>;
  onAjustarQuantidadeInsumo: (id: string, quantidade: number) => Promise<InsumoProjeto | null>;
  onRessincronizarBaseInsumo: (id: string, novaBase: number) => Promise<InsumoProjeto | null>;
  onRemoveInsumoProjeto: (id: string) => Promise<boolean>;
  onAddVinculo: (vinculo: EtapaOrcamentoVinculo) => Promise<boolean>;
  onRemoveVinculo: (id: string) => void;
}

export default function AbaOrcamento({
  projetoId,
  dados,
  fornecedores,
  catalogo,
  podeGerenciar,
  onAddOrcamentoItem,
  onAjustarPrecoInsumo,
  onAjustarQuantidadeInsumo,
  onRessincronizarBaseInsumo,
  onRemoveInsumoProjeto,
  onAddVinculo,
  onRemoveVinculo,
}: Props) {
  const {
    itens,
    insumos,
    alteracoes,
    etapas,
    vinculos,
    pesoAlocadoPorItem,
    etapasPorItem,
    alocacaoPorEtapa,
    totalOrcado,
    totalContratado,
    totalExecutado,
    saldoDisponivel,
    saldoAComprometer,
  } = dados;

  const [novoItem, setNovoItem] = useState(false);
  const [alvoVinculo, setAlvoVinculo] = useState<AlvoVinculo | null>(null);

  // Como a planilha orçamentária é agrupada. "Categoria" é a visão contábil
  // (Materiais, Mão de Obra…); "Etapa" é a visão de obra — quanto custa a
  // fundação —, derivada dos mesmos vínculos que a medição usa para ratear.
  const [agrupamento, setAgrupamento] = useState<'categoria' | 'etapa'>('categoria');

  return (
    <div id="tab-pane-orcamento" className="space-y-4 text-left">
      {/* Financial indicators header */}
      <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-1">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase block">Total Orçado</span>
            <span className="font-mono text-xs font-bold text-slate-900">{formatBRL(totalOrcado)}</span>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase block">Total Contratado</span>
            <span className="font-mono text-xs font-bold text-blue-700">{formatBRL(totalContratado)}</span>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase block">Total Executado</span>
            <span className="font-mono text-xs font-bold text-emerald-600">{formatBRL(totalExecutado)}</span>
          </div>
          <div className="space-y-1">
            <span
              className="text-xs font-bold text-slate-500 uppercase block"
              title="Orçado menos executado — o que ainda falta medir/entregar."
            >
              Saldo a Executar
            </span>
            <span
              className={`font-mono text-xs font-bold block ${saldoDisponivel >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {formatBRL(saldoDisponivel)}
            </span>
          </div>
          <div className="space-y-1">
            <span
              className="text-xs font-bold text-slate-500 uppercase block"
              title="Orçado menos contratado — o que ainda falta comprometer em contratos/pedidos."
            >
              Saldo a Comprometer
            </span>
            <span
              className={`font-mono text-xs font-bold block ${saldoAComprometer >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {formatBRL(saldoAComprometer)}
            </span>
          </div>
        </div>

        {podeGerenciar && (
          <button
            id="console-add-budget-item-btn"
            onClick={() => setNovoItem(true)}
            className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition shadow-sm"
          >
            <Plus size={14} />
            <span>Novo Item</span>
          </button>
        )}
      </div>

      {/* Cost Breakdown Tables */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Planilha Orçamentária Detalhada
          </h4>
          <div
            id="orcamento-agrupamento"
            className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200"
          >
            {(
              [
                { valor: 'categoria' as const, label: 'Por categoria' },
                { valor: 'etapa' as const, label: 'Por etapa' },
              ]
            ).map((opcao) => (
              <button
                key={opcao.valor}
                id={`orcamento-agrupamento-${opcao.valor}`}
                onClick={() => setAgrupamento(opcao.valor)}
                className={`px-2.5 py-1 rounded-md text-2xs font-bold uppercase tracking-wider transition ${
                  agrupamento === opcao.valor
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </div>

        {itens.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="Planilha vazia"
            description="Adicione insumos, materiais ou taxas para compor a estrutura orçamentária."
            actionLabel={podeGerenciar ? 'Novo Item' : undefined}
            onAction={podeGerenciar ? () => setNovoItem(true) : undefined}
          />
        ) : agrupamento === 'etapa' ? (
          <div className="space-y-2">
            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white">
              <div className="w-full overflow-x-auto">
                <table id="budget-by-etapa-table" className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-xs">
                    <tr>
                      <th scope="col" className="p-3">Etapa</th>
                      <th scope="col" className="p-3 text-center">Itens</th>
                      <th scope="col" className="p-3 text-right">Orçado Alocado</th>
                      <th scope="col" className="p-3 text-right">Contratado</th>
                      <th scope="col" className="p-3 text-right">Executado</th>
                      <th scope="col" className="p-3 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {alocacaoPorEtapa.linhas.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-xs text-slate-500 italic">
                          Nenhuma etapa cadastrada — monte o cronograma para ver o custo por frente de
                          serviço.
                        </td>
                      </tr>
                    )}
                    {alocacaoPorEtapa.linhas.map((linha) => {
                      const saldo = linha.orcado - linha.executado;
                      return (
                        <tr key={linha.etapa.id} className="hover:bg-slate-50/40 transition">
                          <td className="p-3">
                            {podeGerenciar ? (
                              <button
                                id={`alocacao-etapa-${linha.etapa.id}`}
                                onClick={() => setAlvoVinculo({ modo: 'etapa', etapaId: linha.etapa.id })}
                                title="Ver e editar os itens de orçamento desta etapa"
                                className="font-bold text-slate-900 hover:text-blue-700 transition cursor-pointer text-left"
                              >
                                {linha.etapa.nome}
                              </button>
                            ) : (
                              <span className="font-bold text-slate-900">{linha.etapa.nome}</span>
                            )}
                            <div className="text-2xs text-slate-500 font-semibold mt-0.5">
                              {linha.etapa.percentualExecutado}% medido
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            {linha.vinculos === 0 ? (
                              <span className="text-2xs font-bold text-amber-600">sem vínculo</span>
                            ) : (
                              <span className="font-mono font-bold text-slate-700">{linha.vinculos}</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono font-medium">{formatBRL(linha.orcado)}</td>
                          <td className="p-3 text-right font-mono text-blue-700">{formatBRL(linha.contratado)}</td>
                          <td className="p-3 text-right font-mono text-emerald-600">{formatBRL(linha.executado)}</td>
                          <td
                            className={`p-3 text-right font-mono font-bold ${saldo >= 0 ? 'text-slate-900' : 'text-rose-600'}`}
                          >
                            {formatBRL(saldo)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200">
                    {alocacaoPorEtapa.naoAlocado.itens > 0 && (
                      <tr className="bg-amber-50/60">
                        <td className="p-3">
                          <span className="font-bold text-amber-800">Não alocado a nenhuma etapa</span>
                          <div className="text-2xs text-amber-700 font-semibold mt-0.5">
                            Verba que nenhuma medição vai alcançar enquanto não for vinculada.
                          </div>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-amber-800">
                          {alocacaoPorEtapa.naoAlocado.itens}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-amber-800">
                          {formatBRL(alocacaoPorEtapa.naoAlocado.orcado)}
                        </td>
                        <td className="p-3 text-right font-mono text-amber-800">
                          {formatBRL(alocacaoPorEtapa.naoAlocado.contratado)}
                        </td>
                        <td className="p-3 text-right font-mono text-amber-800">—</td>
                        <td className="p-3 text-right font-mono text-amber-800">—</td>
                      </tr>
                    )}
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <td className="p-3 uppercase text-2xs tracking-wider">Total da obra</td>
                      <td className="p-3 text-center font-mono">{itens.length}</td>
                      <td className="p-3 text-right font-mono">{formatBRL(totalOrcado)}</td>
                      <td className="p-3 text-right font-mono text-blue-700">{formatBRL(totalContratado)}</td>
                      <td className="p-3 text-right font-mono text-emerald-600">{formatBRL(totalExecutado)}</td>
                      <td className="p-3 text-right font-mono">{formatBRL(saldoDisponivel)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <p className="text-2xs text-slate-500 leading-relaxed">
              Cada etapa recebe a fatia do item de orçamento definida no vínculo — o mesmo rateio que a
              medição aplica. Um item pode alimentar várias etapas (cimento na fundação, na alvenaria e no
              reboco), e as fatias por etapa somadas ao não alocado fecham o total da obra.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white">
            <div className="w-full overflow-x-auto">
              <table id="budget-items-table" className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-xs">
                  <tr>
                    <th scope="col" className="p-3">Categoria</th>
                    <th scope="col" className="p-3">Descrição do Insumo / Atividade</th>
                    <th scope="col" className="p-3">Etapas</th>
                    <th scope="col" className="p-3 text-right">Orçado Base</th>
                    <th scope="col" className="p-3 text-right">Contratado</th>
                    <th scope="col" className="p-3 text-right">Executado</th>
                    <th scope="col" className="p-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {itens.map((item) => {
                    const saldo = item.valorOrcado - item.valorExecutado;
                    const fornecedor = item.fornecedorId
                      ? fornecedores.find((f) => f.id === item.fornecedorId)?.empresa
                      : null;
                    // Peso sobrando é verba que nenhuma medição vai alcançar:
                    // fica em âmbar até o item estar 100% distribuído.
                    const alocado = pesoAlocadoPorItem.get(item.id) ?? 0;
                    const nEtapas = etapasPorItem.get(item.id) ?? 0;
                    const alocacaoIncompleta = alocado < 100;
                    const alocacaoLabel =
                      nEtapas === 0
                        ? 'Não alocado'
                        : `${nEtapas} ${nEtapas === 1 ? 'etapa' : 'etapas'} · ${alocado}%`;
                    const alocacaoTitulo =
                      nEtapas === 0
                        ? 'Nenhuma etapa consome este item — o valor nunca entra numa medição.'
                        : alocacaoIncompleta
                          ? `${100 - alocado}% do valor deste item não está em nenhuma etapa e não será medido.`
                          : 'Valor totalmente distribuído entre as etapas.';

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/40 transition">
                        <td className="p-3 font-semibold text-xs">
                          <span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-xs">
                            {item.categoria}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          <div className="font-bold text-slate-800 leading-normal">{item.descricao}</div>
                          {fornecedor && (
                            <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-md text-2xs font-extrabold bg-blue-50 text-blue-700 border border-blue-100/50 uppercase tracking-wide">
                              Fornecedor: {fornecedor}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {podeGerenciar ? (
                            <button
                              id={`alocacao-item-${item.id}`}
                              onClick={() => setAlvoVinculo({ modo: 'item', itemId: item.id })}
                              title={`${alocacaoTitulo} Clique para distribuir este item entre as etapas.`}
                              className={`px-2 py-0.5 rounded text-2xs font-bold border transition active:scale-95 cursor-pointer ${
                                alocacaoIncompleta
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              {alocacaoLabel}
                            </button>
                          ) : (
                            <span
                              title={alocacaoTitulo}
                              className={`px-2 py-0.5 rounded text-2xs font-bold border ${
                                alocacaoIncompleta
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {alocacaoLabel}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono font-medium">{formatBRL(item.valorOrcado)}</td>
                        <td className="p-3 text-right font-mono text-blue-700">{formatBRL(item.valorContratado)}</td>
                        <td className="p-3 text-right font-mono text-emerald-600">{formatBRL(item.valorExecutado)}</td>
                        <td
                          className={`p-3 text-right font-mono font-bold ${saldo >= 0 ? 'text-slate-900' : 'text-rose-600'}`}
                        >
                          {formatBRL(saldo)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* De onde veio cada real: cotação firme, praticado, estimado ou
          referência. Fica acima do quantitativo porque é a leitura que
          decide margem — e a lista de insumos é o detalhe dela. */}
      <ConfiancaPreco projetoId={projetoId} recarregarEm={insumos} />

      {/* Quantitativo de insumos — quantidade, preço base e o ajuste desta obra */}
      <InsumosObra
        insumos={insumos}
        catalogo={catalogo}
        fornecedores={fornecedores}
        somenteLeitura={!podeGerenciar}
        onAjustarPreco={onAjustarPrecoInsumo}
        onAjustarQuantidade={onAjustarQuantidadeInsumo}
        onRessincronizarBase={onRessincronizarBaseInsumo}
        onRemover={onRemoveInsumoProjeto}
      />

      {/* Log of revisions (Histórico de Alterações) */}
      <div className="space-y-3 pt-4 border-t border-slate-200">
        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
          <History size={14} className="text-slate-500 shrink-0" />
          <span>Registro de Ajustes e Aditivos Orçamentários ({alteracoes.length})</span>
        </h4>

        {alteracoes.length === 0 ? (
          <p className="text-xs text-slate-500 pl-1">Nenhum aditivo financeiro cadastrado para esta obra.</p>
        ) : (
          <div className="space-y-2">
            {alteracoes.map((alt) => (
              <div
                key={alt.id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                        alt.tipo === 'Aumento' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {alt.tipo}
                    </span>
                    <span className="font-semibold text-slate-900">{alt.item}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-normal italic">"{alt.descricao}"</p>
                </div>
                <div className="text-right ml-4 shrink-0 font-mono">
                  <span
                    className={`font-bold block ${alt.tipo === 'Aumento' ? 'text-rose-600' : 'text-emerald-600'}`}
                  >
                    {alt.tipo === 'Aumento' ? '+' : '-'}
                    {formatBRL(alt.valor)}
                  </span>
                  <span className="text-xs text-slate-500">{formatarDataBR(alt.data)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModalItemOrcamento
        aberto={novoItem}
        onFechar={() => setNovoItem(false)}
        projetoId={projetoId}
        fornecedores={fornecedores}
        onAdicionar={onAddOrcamentoItem}
      />

      <ModalVinculo
        alvo={alvoVinculo}
        onFechar={() => setAlvoVinculo(null)}
        etapas={etapas}
        itens={itens}
        vinculos={vinculos}
        pesoAlocadoPorItem={pesoAlocadoPorItem}
        onAdicionar={onAddVinculo}
        onRemover={onRemoveVinculo}
      />
    </div>
  );
}
