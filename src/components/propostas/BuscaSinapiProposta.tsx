import { useState } from 'react';
import { ChevronLeft, ChevronRight, Database, Layers, Plus, Search } from 'lucide-react';
import { REGIMES_SINAPI, RegimeSINAPI } from '../../types';
import { formatBRL } from '../../lib/preco';
import { UseSinapi } from '../../hooks/useSinapi';
import { SINAPI_PAGINA } from '../../services/sinapiService';
import { Button, Chip, Input, Select } from '../ui';
import EstadoDaLista from '../EstadoDaLista';

/**
 * Buscar na base SINAPI e trazer a atividade DIRETO para a proposta.
 *
 * ## O que esta tela existe para encurtar
 *
 * O caminho era: Catálogo → buscar no SINAPI → **adotar** → voltar à proposta →
 * achar o item adotado → incluir. Oito passos, e a adoção deixava resíduo
 * permanente no catálogo da empresa — que existe para guardar o que a empresa
 * REUSA, não toda referência que alguém consultou.
 *
 * Aqui o clique cria o item na proposta com a composição do nível 1 junto, e
 * `catalogo_insumos` não é tocado. Adotar continua existindo no Catálogo, para
 * quem quer levar a atividade para a base própria antes de orçar.
 *
 * ## Por que não reusa o `SinapiAdocaoModal`
 *
 * Aquele é sobre ADOTAR: a decisão dele é entre dois modos de cópia para o
 * catálogo, e a tela inteira gira em torno de tornar visível que os dois dão
 * preços diferentes. Aqui não há essa escolha — há uma lista e um botão de
 * incluir. Reaproveitar aquele componente exigiria um `modo` que apagasse
 * metade dele, e o que os dois de fato compartilham (busca, paginação, estado)
 * já é compartilhado: os dois consomem o mesmo `useSinapi`.
 */

interface Props {
  sinapi: UseSinapi;
  /** Códigos já presentes na proposta — para a lista não oferecer duplicata cega. */
  codigosNaProposta: Set<string>;
  onAdicionar: (codigo: number, quantidade: number) => Promise<unknown>;
}

export default function BuscaSinapiProposta({ sinapi, codigosNaProposta, onAdicionar }: Props) {
  const { resultados, total, loading, filtro, paginas, aplicarFiltro } = sinapi;
  const [incluindo, setIncluindo] = useState<number | null>(null);

  const pagina = filtro.pagina ?? 0;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={13} />
          <Input
            type="text"
            autoFocus
            aria-label="Buscar atividade ou insumo na base SINAPI"
            placeholder="Buscar na SINAPI por descrição ou código..."
            value={filtro.termo ?? ''}
            onChange={(e) => aplicarFiltro({ termo: e.target.value })}
            className="pl-9 pr-3"
          />
        </div>
        <Select
          aria-label="Tipo de item"
          value={filtro.tipo ?? ''}
          largura="automatica"
          onChange={(e) =>
            aplicarFiltro({ tipo: (e.target.value || undefined) as 'INSUMO' | 'COMPOSICAO' | undefined })
          }
        >
          <option value="">Tudo</option>
          <option value="COMPOSICAO">Composições</option>
          <option value="INSUMO">Insumos</option>
        </Select>
        <Select
          aria-label="Regime de encargos"
          value={filtro.regime ?? 'SD'}
          largura="automatica"
          onChange={(e) => aplicarFiltro({ regime: e.target.value as RegimeSINAPI })}
        >
          {REGIMES_SINAPI.map((r) => (
            <option key={r.valor} value={r.valor}>{r.rotulo}</option>
          ))}
        </Select>
      </div>

      <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
        <EstadoDaLista
          loading={loading}
          total={resultados.length}
          totalSemFiltro={resultados.length}
          carregandoLabel="Buscando na base SINAPI..."
          className="p-6"
          vazio={{
            icon: Database,
            title: 'Nada encontrado na SINAPI',
            description:
              'Ajuste o termo, o tipo ou o regime. A base carregada é a de MG; itens de outras UFs não aparecem aqui.',
          }}
          semResultado={{
            title: 'Nada encontrado na SINAPI',
            description: 'Nenhum item da base corresponde a esta busca.',
          }}
          onLimparFiltros={() => aplicarFiltro({ termo: '', tipo: undefined })}
        >
          {resultados.map((r) => {
            const jaNaProposta = codigosNaProposta.has(String(r.codigo));
            return (
              <div
                key={r.codigo}
                className="flex items-center justify-between gap-3 p-2.5 transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="data-font text-2xs font-bold text-slate-500">{r.codigo}</span>
                    {r.tipo === 'COMPOSICAO' && r.qtdComponentes > 0 && (
                      <Chip tom="informativo" className="px-1.5 py-0">
                        <Layers size={9} /> {r.qtdComponentes}{' '}
                        {r.qtdComponentes === 1 ? 'insumo' : 'insumos'}
                      </Chip>
                    )}
                    {jaNaProposta && (
                      <Chip tom="neutro" className="px-1.5 py-0">já na proposta</Chip>
                    )}
                  </div>
                  <p className="mt-0.5 text-2xs font-semibold text-slate-800 line-clamp-2">
                    {r.descricao}
                  </p>
                  <p className="text-2xs text-slate-500">
                    {r.unidade ?? 'sem unidade'}
                    {r.grupo ? ` · ${r.grupo}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                  <div className="text-right">
                    {/* Sem preço publicado NÃO é R$ 0,00. Dizer zero aqui faria
                        a proposta nascer com uma linha de custo inexistente. */}
                    {r.preco === null ? (
                      <span className="text-2xs text-slate-500">sem preço publicado</span>
                    ) : (
                      <>
                        <span className="data-font block text-xs font-bold text-slate-900">
                          {formatBRL(r.preco)}
                        </span>
                        <span className="text-2xs text-slate-500">referência SINAPI</span>
                      </>
                    )}
                  </div>
                  <Button
                    variante="suave"
                    tamanho="sm"
                    carregando={incluindo === r.codigo}
                    onClick={async () => {
                      setIncluindo(r.codigo);
                      await onAdicionar(r.codigo, 1);
                      setIncluindo(null);
                    }}
                  >
                    {incluindo !== r.codigo && <Plus size={12} />} Incluir
                  </Button>
                </div>
              </div>
            );
          })}
        </EstadoDaLista>
      </div>

      {total > SINAPI_PAGINA && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs text-slate-500" aria-live="polite">
            <strong className="data-font text-slate-700">{total}</strong>{' '}
            {total === 1 ? 'resultado' : 'resultados'} · página {pagina + 1} de {paginas}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variante="secundario"
              tamanho="sm"
              disabled={pagina === 0}
              onClick={() => aplicarFiltro({ pagina: pagina - 1 })}
            >
              <ChevronLeft size={12} /> Anterior
            </Button>
            <Button
              variante="secundario"
              tamanho="sm"
              disabled={pagina + 1 >= paginas}
              onClick={() => aplicarFiltro({ pagina: pagina + 1 })}
            >
              Próxima <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
