import React from 'react';
import {
  Search,
  Database,
  Sigma,
  Package,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Info,
  Download,
  Layers,
  Check,
} from 'lucide-react';
import { REGIMES_SINAPI, RegimeSINAPI, ResultadoAdocao } from '../types';
import { formatBRL } from '../lib/preco';
import { UseSinapi } from '../hooks/useSinapi';
import { SINAPI_PAGINA } from '../services/sinapiService';
import { Modal, Button, Input, Select, TableWrap, Th, Td } from './ui';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

/**
 * Adoção: pesquisar na base do SINAPI e copiar para o catálogo da empresa.
 *
 * A tela existe para tornar visível uma coisa que é fácil de esconder e caro de
 * descobrir depois: **os dois modos de adoção dão preços diferentes**.
 *
 *   "com custo SINAPI"  → grava o custo publicado, idêntico ao oficial.
 *   "expandida"         → cria os componentes, e o preço passa a ser calculado
 *                         pelo catálogo, divergindo em centavos.
 *
 * O SINAPI trunca cada parcela em centavos; o catálogo soma exato e arredonda uma
 * vez (para não acumular erro em composição aninhada). Nenhuma das duas contas
 * está errada — o que seria errado é o usuário descobrir a diferença no meio de
 * uma medição.
 *
 * A diferença de centavos, porém, é a menor das duas consequências. Sem
 * componentes a composição é um preço opaco, e duas coisas deixam de existir:
 *
 *   1. O HH. O coeficiente de mão de obra (PEDREIRO 0,68 H/m²) mora nos
 *      componentes — é dele que sai o dimensionamento de equipe e de prazo.
 *   2. O preço próprio. Composição sem componentes não reage a cotação: o custo
 *      fica congelado no publicado, mesmo que o cimento tenha sido cotado.
 *
 * Por isso "Expandida" é o botão primário e "Custo SINAPI" o secundário — a
 * escolha rápida é legítima (conferir o oficial), mas não é a que serve para
 * planejar nem para orçar com preço de mercado.
 *
 * Também não esconde ausência de preço: item que o SINAPI não precifica naquela
 * UF aparece como "sem preço publicado", não como R$ 0,00.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  sinapi: UseSinapi;
  /** Chamado depois de adotar, para a listagem do catálogo se atualizar. */
  onAdotado: (resultado: ResultadoAdocao) => void;
}

const mesLegivel = (iso: string) => {
  const [ano, mes] = iso.split('-');
  return `${mes}/${ano}`;
};

export default function SinapiAdocaoModal({ open, onClose, sinapi, onAdotado }: Props) {
  const {
    publicacoes,
    resultados,
    total,
    loading,
    filtro,
    paginas,
    detalhando,
    detalhe,
    adotando,
    aplicarFiltro,
    abrirDetalhe,
    adotar,
  } = sinapi;

  const [verNiveis, setVerNiveis] = React.useState(false);

  const publicacaoAtual =
    publicacoes.find((p) => p.id === filtro.publicacaoId) ??
    publicacoes.find((p) => p.vigente) ??
    publicacoes[0];

  // Só SD e CD podem ser adotados: `catalogo_insumos.desonerado` é booleano e
  // não representa "sem encargos sociais". O regime segue selecionável para
  // consulta, mas a adoção fica travada com o motivo à vista.
  const regimeAdotavel = filtro.regime !== 'SE';

  const executarAdocao = async (codigo: number, modo: 'item' | 'expandido') => {
    const r = await adotar(codigo, modo);
    if (r) onAdotado(r);
  };

  const linhasNivel1 = detalhe.filter((l) => l.nivel === 1);
  const linhasVisiveis = verNiveis ? detalhe : linhasNivel1;
  // A soma do nível 1 reproduz o custo publicado — exato em 7.506/7.506
  // composições medidas. Fica curta quando algum componente não tem preço na UF,
  // e é isso que o aviso abaixo detecta.
  const somaNivel1 = linhasNivel1.reduce((s, l) => s + (l.custo ?? 0), 0);
  const faltaPreco = linhasNivel1.some((l) => l.custo === null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      id="sinapi-adocao-modal"
      title={
        <span className="flex items-center gap-2">
          <Database size={16} className="text-blue-600" />
          Base SINAPI
        </span>
      }
      description={
        publicacaoAtual ? (
          <>
            Referência <strong>{mesLegivel(publicacaoAtual.mesReferencia)}</strong> · preços de{' '}
            <strong>{filtro.uf}</strong> · adotar copia o item para o seu catálogo, sem criar vínculo
            com esta base.
            <span className="block mt-1 text-2xs text-amber-700">
              Em composição, prefira <strong>Expandida</strong>: é ela que traz os coeficientes de
              mão de obra (base do cálculo de HH, equipe e prazo) e faz o preço acompanhar as suas
              cotações. <strong>Custo SINAPI</strong> copia só o valor publicado.
            </span>
          </>
        ) : (
          'Nenhuma publicação importada.'
        )
      }
      footer={
        resultados.length > 0 ? (
          <div className="flex-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-2xs font-bold text-slate-500">
              {total.toLocaleString('pt-BR')} resultado(s)
              {paginas > 1 && (
                <>
                  {' · '}
                  {(filtro.pagina ?? 0) * SINAPI_PAGINA + 1}–
                  {Math.min(((filtro.pagina ?? 0) + 1) * SINAPI_PAGINA, total)}
                </>
              )}
            </span>
            {paginas > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variante="secundario"
                  tamanho="sm"
                  disabled={(filtro.pagina ?? 0) === 0}
                  onClick={() => aplicarFiltro({ pagina: (filtro.pagina ?? 0) - 1 })}
                >
                  <ChevronLeft size={12} />
                  Anterior
                </Button>
                <span className="text-2xs font-bold text-slate-500 whitespace-nowrap">
                  {(filtro.pagina ?? 0) + 1} / {paginas}
                </span>
                <Button
                  variante="secundario"
                  tamanho="sm"
                  disabled={(filtro.pagina ?? 0) + 1 >= paginas}
                  onClick={() => aplicarFiltro({ pagina: (filtro.pagina ?? 0) + 1 })}
                >
                  Próxima
                  <ChevronRight size={12} />
                </Button>
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      {publicacoes.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Database}
            title="Nenhuma publicação do SINAPI importada"
            description="Rode scripts/sinapi/importar.py com a planilha da Caixa. O passo a passo está em data/sinapi/README.md."
          />
        </div>
      ) : (
        /* `Modal` é `max-h-[90vh] overflow-hidden flex flex-col` e delega a
           rolagem a quem está dentro. Sem esta coluna com `min-h-0` + a área
           rolável abaixo, a lista de 40 itens simplesmente vazava do diálogo e
           era cortada — junto com a paginação, que ficava inalcançável. */
        <div className="flex-1 flex flex-col min-h-0">
          {/* FILTROS — fixos, fora da rolagem */}
          <div className="shrink-0 px-4 pt-4 pb-3 space-y-2 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {/* `Input` com ícone se embrulha numa div própria, então o flex-1
                tem de ficar aqui fora — no `className` ele iria para o <input>. */}
            <div className="flex-1 min-w-[14rem]">
              <Input
                icone={<Search size={13} />}
                tamanho="sm"
                placeholder="Buscar por palavras ou código (ex.: bloco alvenaria, 88316)"
                value={filtro.termo ?? ''}
                onChange={(e) => aplicarFiltro({ termo: e.target.value })}
                aria-label="Buscar na base SINAPI"
              />
            </div>
            <Select
              tamanho="sm"
              className="sm:min-w-[11rem]"
              value={filtro.tipo ?? ''}
              onChange={(e) =>
                aplicarFiltro({ tipo: (e.target.value || undefined) as 'INSUMO' | 'COMPOSICAO' | undefined })
              }
              aria-label="Tipo de item"
            >
              <option value="">Composições e insumos</option>
              <option value="COMPOSICAO">Só composições</option>
              <option value="INSUMO">Só insumos</option>
            </Select>
            <Select
              tamanho="sm"
              className="sm:min-w-[11rem]"
              value={filtro.regime ?? 'SD'}
              onChange={(e) => aplicarFiltro({ regime: e.target.value as RegimeSINAPI })}
              aria-label="Regime de encargos sociais"
            >
              {REGIMES_SINAPI.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.rotulo}
                  {r.adotavel ? '' : ' (consulta)'}
                </option>
              ))}
            </Select>
            {publicacoes.length > 1 && (
              <Select
                tamanho="sm"
                className="sm:min-w-[10rem]"
                value={filtro.publicacaoId ?? publicacaoAtual?.id ?? ''}
                onChange={(e) => aplicarFiltro({ publicacaoId: Number(e.target.value) })}
                aria-label="Mês de referência"
              >
                {publicacoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {mesLegivel(p.mesReferencia)}
                    {p.vigente ? ' (atual)' : ''}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {!regimeAdotavel && (
            <p className="flex items-start gap-1.5 text-2xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              <AlertTriangle size={13} className="shrink-0 mt-px" />
              <span>
                O regime <strong>sem encargos sociais</strong> serve para consulta. Não pode ser adotado
                porque o catálogo registra desoneração como sim/não e não tem como representar um terceiro
                estado.
              </span>
            </p>
          )}
          </div>

          {/* RESULTADOS — a única área que rola */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size={20} />
            </div>
          ) : resultados.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nada encontrado"
              description={
                filtro.termo
                  ? `Nenhum item do SINAPI casa com "${filtro.termo}" nos filtros atuais.`
                  : 'Ajuste os filtros para ver resultados.'
              }
            />
          ) : (
            <>
              <div className="space-y-1.5">
                {resultados.map((r) => {
                  const ehComposicao = r.tipo === 'COMPOSICAO';
                  const expandivel = ehComposicao && r.qtdComponentes > 0;
                  const aberto = detalhando === r.codigo;
                  const ocupado = adotando === r.codigo;

                  return (
                    <div
                      key={r.codigo}
                      className="border border-slate-200/70 rounded-lg bg-white overflow-hidden"
                    >
                      <div className="p-2.5 flex flex-col lg:flex-row lg:items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-extrabold uppercase tracking-wide ${
                                ehComposicao
                                  ? 'bg-violet-50 text-violet-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {ehComposicao ? <Sigma size={9} /> : <Package size={9} />}
                              {ehComposicao ? 'Composição' : 'Insumo'}
                            </span>
                            <span className="font-mono text-2xs font-bold text-slate-500">{r.codigo}</span>
                            {expandivel && (
                              <span className="text-3xs font-bold text-slate-500">
                                {r.qtdComponentes} componente(s)
                              </span>
                            )}
                            {r.situacao === 'SEM CUSTO' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-extrabold bg-amber-50 text-amber-700">
                                <AlertTriangle size={9} />
                                SEM CUSTO
                              </span>
                            )}
                            {r.jaAdotado && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-extrabold bg-emerald-50 text-emerald-700"
                                title="Já existe no seu catálogo com este mesmo código, UF, mês e regime. Adotar de novo reaproveita o item e não sobrescreve o preço."
                              >
                                <Check size={9} />
                                no catálogo
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-800 mt-1 leading-snug">{r.descricao}</p>
                          <p className="text-3xs font-semibold text-slate-500 mt-0.5">
                            {r.unidade ?? 'sem unidade'}
                            {r.grupo && ` · ${r.grupo}`}
                          </p>
                        </div>

                        <div className="lg:text-right shrink-0">
                          {r.preco === null ? (
                            <span className="text-2xs font-bold text-amber-700">
                              sem preço publicado em {filtro.uf}
                            </span>
                          ) : (
                            <>
                              <p className="text-sm font-extrabold text-slate-800 font-mono">
                                {formatBRL(r.preco)}
                              </p>
                              <p className="text-3xs font-bold text-slate-500">por {r.unidade ?? 'un'}</p>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {expandivel && (
                            <Button
                              variante="fantasma"
                              tamanho="sm"
                              onClick={() => abrirDetalhe(r.codigo)}
                              aria-expanded={aberto}
                            >
                              {aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              Composição
                            </Button>
                          )}
                          <Button
                            variante="secundario"
                            tamanho="sm"
                            disabled={!regimeAdotavel || ocupado}
                            carregando={ocupado}
                            onClick={() => executarAdocao(r.codigo, 'item')}
                            title={
                              ehComposicao
                                ? 'Copia com o custo publicado pelo SINAPI, sem abrir os componentes. Sem eles não há coeficiente de mão de obra (nada de HH, equipe ou prazo) e o preço não reage às suas cotações.'
                                : 'Copia o insumo com o preço publicado pelo SINAPI.'
                            }
                          >
                            <Download size={12} />
                            {r.jaAdotado
                              ? 'Reaplicar'
                              : ehComposicao
                                ? 'Custo SINAPI'
                                : 'Adotar'}
                          </Button>
                          {expandivel && (
                            <Button
                              tamanho="sm"
                              disabled={!regimeAdotavel || ocupado}
                              carregando={ocupado}
                              onClick={() => executarAdocao(r.codigo, 'expandido')}
                              title="Copia a composição e os componentes diretos. O preço passa a ser calculado pelo catálogo e diverge do oficial em centavos."
                            >
                              <Layers size={12} />
                              Expandida
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* DETALHAMENTO */}
                      {aberto && (
                        <div className="border-t border-slate-100 bg-slate-50/60 p-2.5 space-y-2">
                          {detalhe.length === 0 ? (
                            <div className="flex justify-center py-4">
                              <Spinner size={16} />
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-3xs font-bold text-slate-500 uppercase tracking-wide">
                                  Composição analítica
                                </p>
                                {detalhe.length > linhasNivel1.length && (
                                  <Button
                                    variante="fantasma"
                                    tamanho="sm"
                                    onClick={() => setVerNiveis((v) => !v)}
                                  >
                                    {verNiveis ? 'Só os componentes diretos' : 'Abrir as subcomposições'}
                                  </Button>
                                )}
                              </div>

                              <TableWrap>
                                <thead>
                                  <tr>
                                    {verNiveis && <Th>Nível</Th>}
                                    <Th>Código</Th>
                                    <Th>Item</Th>
                                    <Th>Un.</Th>
                                    <Th align="right">Coeficiente</Th>
                                    <Th align="right">Preço unit.</Th>
                                    <Th align="right">Custo</Th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {linhasVisiveis.map((l, i) => (
                                    <tr
                                      key={`${l.nivel}-${l.item}-${i}`}
                                      className={l.nivel > 1 ? 'bg-slate-100/50' : undefined}
                                    >
                                      {verNiveis && <Td mono>{l.nivel}</Td>}
                                      <Td mono>{l.item}</Td>
                                      <Td>
                                        <span style={{ paddingLeft: verNiveis ? (l.nivel - 1) * 12 : 0 }}>
                                          {l.descricao}
                                        </span>
                                      </Td>
                                      <Td>{l.unidade ?? '—'}</Td>
                                      <Td align="right" mono>
                                        {l.coeficiente.toLocaleString('pt-BR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 7,
                                        })}
                                      </Td>
                                      <Td align="right" mono>
                                        {l.precoUnitario === null ? (
                                          <span className="text-amber-700 font-bold">sem preço</span>
                                        ) : (
                                          formatBRL(l.precoUnitario)
                                        )}
                                      </Td>
                                      <Td align="right" mono>
                                        {l.custo === null ? '—' : formatBRL(l.custo)}
                                      </Td>
                                    </tr>
                                  ))}
                                </tbody>
                              </TableWrap>

                              <div className="flex items-start justify-between gap-3 flex-wrap text-2xs">
                                <p className="flex items-start gap-1.5 text-slate-500 font-semibold max-w-lg">
                                  <Info size={12} className="shrink-0 mt-px text-blue-500" />
                                  <span>
                                    Só os componentes diretos somam o custo publicado. O SINAPI trunca cada
                                    parcela em centavos — não arredonda.
                                    {verNiveis && ' As subcomposições explicam de onde vem o custo de cada item e não entram na soma.'}
                                  </span>
                                </p>
                                <div className="text-right shrink-0">
                                  <span className="text-3xs font-bold text-slate-500 block">
                                    Soma dos componentes diretos
                                  </span>
                                  <span className="font-mono font-extrabold text-slate-800">
                                    {formatBRL(somaNivel1)}
                                  </span>
                                  {r.preco !== null && Math.abs(somaNivel1 - r.preco) >= 0.01 && (
                                    <span className="block text-3xs font-bold text-amber-700 mt-0.5">
                                      {faltaPreco
                                        ? 'Fica abaixo do publicado porque algum componente não tem preço nesta UF.'
                                        : `Publicado: ${formatBRL(r.preco)}.`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </>
          )}
          </div>
        </div>
      )}
    </Modal>
  );
}
