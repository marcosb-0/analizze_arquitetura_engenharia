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
import ConsumoInsumos from './ConsumoInsumos';
import EmptyState from '../EmptyState';
import ModalItemOrcamento from './ModalItemOrcamento';
import ModalVinculo, { AlvoVinculo } from './ModalVinculo';
import type { DadosDaObra } from './useDadosDaObra';
import { ALVO, Button, CHIP, CONTROLE_GRUPO, CONTROLE_GRUPO_ITEM, Card, Chip, FOCO, FaixaKpis, IconButton, Kpi, SECAO_ESPACO, Secao, TableWrap, Td, Th } from '../ui';

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
    <div id="tab-pane-orcamento" className={`${SECAO_ESPACO} text-left`}>
      {/* OS NÚMEROS DA OBRA.
          Eram CINCO pares rótulo/valor escritos à mão numa caixa `slate-50`,
          com o rótulo em 14px maiúsculo (a escala manda 12px) e o valor em 14px
          — o KPI do app é 20px em mono, e esta é a tela onde o número mais
          importa. Cinco viraram quatro: "saldo a comprometer" é orçado menos
          CONTRATADO, então ele é o detalhe do contratado, não um quinto número
          solto do mesmo tamanho. */}
      <Secao
        titulo="Resumo financeiro da obra"
        acoes={
          podeGerenciar && (
            <Button id="console-add-budget-item-btn" onClick={() => setNovoItem(true)}>
              <Plus size={14} />
              <span>Novo item</span>
            </Button>
          )
        }
      >
        <FaixaKpis colunas={4}>
          <Kpi rotulo="Total orçado" valor={formatBRL(totalOrcado)} />
          <Kpi
            rotulo="Total contratado"
            valor={formatBRL(totalContratado)}
            detalhe={`${formatBRL(saldoAComprometer)} ainda a comprometer`}
          />
          <Kpi rotulo="Total executado" valor={formatBRL(totalExecutado)} />
          <Kpi
            rotulo="Saldo a executar"
            valor={
              <span className={saldoDisponivel >= 0 ? '' : 'text-rose-600'}>
                {formatBRL(saldoDisponivel)}
              </span>
            }
            detalhe="Orçado menos executado — o que ainda falta medir."
          />
        </FaixaKpis>
      </Secao>

      {/* Cost Breakdown Tables */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-200 pb-2">
          <h2 className="text-sm font-bold text-slate-900">
            Planilha orçamentária detalhada
          </h2>
          {/* Era a QUARTA grafia do alternador segmentado do app — moldura
              `slate-100` com borda, ativo em branco com `shadow-xs`, 26px de
              altura ao lado de um botão de 40. `CONTROLE_GRUPO` existe desde
              14/ago justamente para os três que já existiam; este passou
              despercebido porque mora dentro de uma tabela. */}
          <div id="orcamento-agrupamento" className={CONTROLE_GRUPO}>
            {(
              [
                { valor: 'categoria' as const, label: 'Por categoria' },
                { valor: 'etapa' as const, label: 'Por etapa' },
              ]
            ).map((opcao) => (
              <button
                key={opcao.valor}
                id={`orcamento-agrupamento-${opcao.valor}`}
                aria-pressed={agrupamento === opcao.valor}
                onClick={() => setAgrupamento(opcao.valor)}
                className={`${CONTROLE_GRUPO_ITEM.base} ${ALVO.md} ${
                  agrupamento === opcao.valor
                    ? CONTROLE_GRUPO_ITEM.ativo
                    : CONTROLE_GRUPO_ITEM.inativo
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
            {/* As duas tabelas desta tela eram `<table>` cruas dentro de um
                `bg-white rounded-lg shadow-sm` escrito à mão — as últimas do app
                fora de `TableWrap`, com o cabeçalho em 14px maiúsculo (o resto
                do app usa 12px) e o raio antigo de 8px. */}
            <Card semPadding className="overflow-hidden">
              <TableWrap>
                  <thead>
                    <tr>
                      <Th>Etapa</Th>
                      <Th align="center">Itens</Th>
                      <Th align="right">Orçado alocado</Th>
                      <Th align="right">Contratado</Th>
                      <Th align="right">Executado</Th>
                      <Th align="right">Saldo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {alocacaoPorEtapa.linhas.length === 0 && (
                      <tr>
                        <Td colSpan={6} align="center" className="py-6 italic text-slate-500">
                          Nenhuma etapa cadastrada — monte o cronograma para ver o custo por frente de
                          serviço.
                        </Td>
                      </tr>
                    )}
                    {alocacaoPorEtapa.linhas.map((linha) => {
                      const saldo = linha.orcado - linha.executado;
                      return (
                        <tr key={linha.etapa.id} className="hover:bg-slate-50/40 transition">
                          <Td>
                            {podeGerenciar ? (
                              <IconButton
                                rotulo="Ver e editar os itens de orçamento desta etapa"
                                tom="acao"
                                id={`alocacao-etapa-${linha.etapa.id}`}
                                onClick={() => setAlvoVinculo({ modo: 'etapa', etapaId: linha.etapa.id })}
                                className="font-bold text-slate-900 cursor-pointer text-left"
                              >
                                {linha.etapa.nome}
                              </IconButton>
                            ) : (
                              <span className="font-bold text-slate-900">{linha.etapa.nome}</span>
                            )}
                            <div className="text-2xs text-slate-500 font-semibold mt-0.5">
                              {linha.etapa.percentualExecutado}% medido
                            </div>
                          </Td>
                          <Td align="center">
                            {linha.vinculos === 0 ? (
                              <span className="text-2xs font-bold text-amber-700">sem vínculo</span>
                            ) : (
                              <span className="font-mono font-bold text-slate-700">{linha.vinculos}</span>
                            )}
                          </Td>
                          <Td align="right" mono>{formatBRL(linha.orcado)}</Td>
                          <Td align="right" mono className="text-blue-700">{formatBRL(linha.contratado)}</Td>
                          <Td align="right" mono className="text-emerald-700">{formatBRL(linha.executado)}</Td>
                          <Td
                            align="right"
                            mono
                            className={`font-bold ${saldo >= 0 ? 'text-slate-900' : 'text-rose-600'}`}
                          >
                            {formatBRL(saldo)}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200">
                    {alocacaoPorEtapa.naoAlocado.itens > 0 && (
                      <tr style={{ background: CHIP.atencao.fundo, color: CHIP.atencao.texto }}>
                        <Td className="text-inherit">
                          <span className="font-bold">Não alocado a nenhuma etapa</span>
                          <div className="text-2xs font-semibold mt-0.5">
                            Verba que nenhuma medição vai alcançar enquanto não for vinculada.
                          </div>
                        </Td>
                        <Td align="center" mono className="font-bold text-inherit">
                          {alocacaoPorEtapa.naoAlocado.itens}
                        </Td>
                        <Td align="right" mono className="font-bold text-inherit">
                          {formatBRL(alocacaoPorEtapa.naoAlocado.orcado)}
                        </Td>
                        <Td align="right" mono className="text-inherit">
                          {formatBRL(alocacaoPorEtapa.naoAlocado.contratado)}
                        </Td>
                        <Td align="right" mono className="text-inherit">—</Td>
                        <Td align="right" mono className="text-inherit">—</Td>
                      </tr>
                    )}
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <Td className="uppercase text-2xs tracking-wider font-bold text-slate-900">Total da obra</Td>
                      <Td align="center" mono className="font-bold text-slate-900">{itens.length}</Td>
                      <Td align="right" mono className="font-bold text-slate-900">{formatBRL(totalOrcado)}</Td>
                      <Td align="right" mono className="font-bold text-blue-700">{formatBRL(totalContratado)}</Td>
                      <Td align="right" mono className="font-bold text-emerald-700">{formatBRL(totalExecutado)}</Td>
                      <Td align="right" mono className="font-bold text-slate-900">{formatBRL(saldoDisponivel)}</Td>
                    </tr>
                  </tfoot>
              </TableWrap>
            </Card>
            <p className="text-2xs text-slate-500 leading-relaxed">
              Cada etapa recebe a fatia do item de orçamento definida no vínculo — o mesmo rateio que a
              medição aplica. Um item pode alimentar várias etapas (cimento na fundação, na alvenaria e no
              reboco), e as fatias por etapa somadas ao não alocado fecham o total da obra.
            </p>
          </div>
        ) : (
          <Card semPadding className="overflow-hidden">
            <TableWrap>
                  <thead>
                  <tr>
                    <Th>Categoria</Th>
                    <Th>Descrição do insumo / atividade</Th>
                    <Th>Etapas</Th>
                    <Th align="right">Orçado base</Th>
                    <Th align="right">Contratado</Th>
                    <Th align="right">Executado</Th>
                    <Th align="right">Saldo</Th>
                  </tr>
                </thead>
                <tbody>
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
                        <Td>
                          <Chip tom="neutro" className="px-2 py-0.5">{item.categoria}</Chip>
                        </Td>
                        <Td>
                          <div className="font-bold text-slate-800 leading-normal">{item.descricao}</div>
                          {fornecedor && (
                            <Chip tom="informativo" className="mt-1 px-2 py-0.5">
                              {fornecedor}
                            </Chip>
                          )}
                        </Td>
                        <Td>
                          {podeGerenciar ? (
                            <button
                              id={`alocacao-item-${item.id}`}
                              onClick={() => setAlvoVinculo({ modo: 'item', itemId: item.id })}
                              aria-label={`${alocacaoTitulo} Clique para distribuir este item entre as etapas.`}
                              title={`${alocacaoTitulo} Clique para distribuir este item entre as etapas.`}
                              className={`${ALVO.sm} inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-bold transition hover:brightness-95 ${FOCO}`}
                              style={{
                                background: CHIP[alocacaoIncompleta ? 'atencao' : 'neutro'].fundo,
                                color: CHIP[alocacaoIncompleta ? 'atencao' : 'neutro'].texto,
                              }}
                            >
                              {alocacaoLabel}
                            </button>
                          ) : (
                            <Chip
                              tom={alocacaoIncompleta ? 'atencao' : 'neutro'}
                              title={alocacaoTitulo}
                              className="px-2.5 py-1"
                            >
                              {alocacaoLabel}
                            </Chip>
                          )}
                        </Td>
                        <Td align="right" mono>{formatBRL(item.valorOrcado)}</Td>
                        <Td align="right" mono className="text-blue-700">{formatBRL(item.valorContratado)}</Td>
                        <Td align="right" mono className="text-emerald-700">{formatBRL(item.valorExecutado)}</Td>
                        <Td
                          align="right"
                          mono
                          className={`font-bold ${saldo >= 0 ? 'text-slate-900' : 'text-rose-600'}`}
                        >
                          {formatBRL(saldo)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
            </TableWrap>
          </Card>
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

      {/* A lista acima é o que foi CONTRATADO; esta é o que será CONSUMIDO.
          Para composição as duas divergem por inteiro — "alvenaria 300 m²" é
          uma linha lá e vira 22 mil tijolos, 582 h de pedreiro e 8,4 m³ de
          argamassa aqui. Só aparece quando há algo a explodir. */}
      <ConsumoInsumos projetoId={projetoId} recarregarEm={insumos} />

      {/* O histórico de aditivos. */}
      <Secao
        icone={<History size={15} />}
        titulo={`Registro de ajustes e aditivos orçamentários (${alteracoes.length})`}
      >
        {alteracoes.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhum aditivo financeiro cadastrado para esta obra.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {alteracoes.map((alt) => (
              <div key={alt.id} className="flex justify-between items-center gap-4 py-2.5 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Chip tom={alt.tipo === 'Aumento' ? 'negativo' : 'positivo'} className="px-2 py-0.5">
                      {alt.tipo}
                    </Chip>
                    <span className="font-semibold text-slate-900 truncate">{alt.item}</span>
                  </div>
                  <p className="text-2xs text-slate-500 leading-normal italic">"{alt.descricao}"</p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`data-font font-bold block ${alt.tipo === 'Aumento' ? 'text-rose-600' : 'text-emerald-700'}`}
                  >
                    {alt.tipo === 'Aumento' ? '+' : '-'}
                    {formatBRL(alt.valor)}
                  </span>
                  <span className="text-2xs text-slate-500">{formatarDataBR(alt.data)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Secao>

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
