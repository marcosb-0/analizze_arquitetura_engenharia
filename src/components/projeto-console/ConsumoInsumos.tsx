import { useEffect, useState } from 'react';
import { Clock, Package, ShoppingCart } from 'lucide-react';
import { LinhaExplosaoInsumo } from '../../types';
import { explosaoService } from '../../services/explosaoService';
import { formatBRL } from '../../lib/preco';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { TableWrap, Td, Th } from '../ui';
import { corProcedencia, nivelDaFonte, rotuloProcedencia } from '../catalogo/acoesInsumo';

/**
 * Consumo real de insumos da obra.
 *
 * A curva ABC ao lado responde "quais ITENS DE ORÇAMENTO concentram o custo".
 * Esta tabela responde outra coisa: "o que eu preciso comprar e quanta hora eu
 * preciso ter em obra". Para uma composição as duas divergem completamente —
 * "alvenaria 300 m²" é uma linha do orçamento e vira 22.047 tijolos, 581,7 h de
 * pedreiro e 8,4 m³ de argamassa aqui.
 *
 * Os números vêm a PREÇO DE HOJE (`fn_preco_vigente`), não com o preço
 * congelado no orçamento. É deliberado e está dito na tela: a pergunta de
 * compras é sobre o que vai custar comprar, não sobre o que foi orçado.
 */

const numero = (v: number, casas = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

const CLASSE = {
  A: 'bg-rose-100 text-rose-800 border-rose-200',
  B: 'bg-amber-100 text-amber-800 border-amber-200',
  C: 'bg-slate-100 text-slate-600 border-slate-200',
} as const;

interface ConsumoInsumosProps {
  projetoId: string;
  /** Muda para forçar releitura depois de mexer nos insumos da obra. */
  recarregarEm?: unknown;
}

export default function ConsumoInsumos({ projetoId, recarregarEm }: ConsumoInsumosProps) {
  const { toast } = useFeedback();
  const [linhas, setLinhas] = useState<LinhaExplosaoInsumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    explosaoService
      .daObra(projetoId)
      .then((l) => {
        if (!cancelado) setLinhas(l);
      })
      .catch((err: any) => {
        if (!cancelado) toast.error('Falha ao calcular o consumo de insumos.', err.message);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [projetoId, recarregarEm, toast]);

  if (carregando) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 flex justify-center">
        <Spinner size={18} />
      </div>
    );
  }

  if (linhas.length === 0) return null;

  const custoTotal = linhas.reduce((acc, l) => acc + l.custo, 0);
  const hhTotal = linhas.reduce((acc, l) => acc + l.hh, 0);
  const custoMO = linhas.reduce((acc, l) => (l.categoria === 'Mão de Obra' ? acc + l.custo : acc), 0);
  const custoMaterial = linhas.reduce((acc, l) => (l.categoria === 'Material' ? acc + l.custo : acc), 0);
  const pct = (v: number) => (custoTotal > 0 ? (v / custoTotal) * 100 : 0);
  const classeA = linhas.filter((l) => l.classeAbc === 'A').length;

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div className="w-8 h-8 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center shrink-0">
          <ShoppingCart size={15} aria-hidden />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-900 leading-none">Consumo real de insumos</h4>
          <p className="text-2xs text-slate-500 mt-1 leading-relaxed">
            As composições explodidas até o insumo final. É o que se compra e as horas que se
            precisa ter em obra — a preço de hoje, não com o preço congelado no orçamento.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-slate-100">
        <div>
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Clock size={10} aria-hidden /> HH previsto
          </span>
          <span className="block mt-0.5 text-base font-extrabold text-violet-900 font-mono leading-none">
            {numero(hhTotal, 1)} h
          </span>
        </div>
        <div>
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Mão de obra</span>
          <span className="block mt-0.5 text-base font-extrabold text-slate-900 font-mono leading-none">
            {numero(pct(custoMO), 0)}%
          </span>
          <span className="text-2xs text-slate-500 font-mono">{formatBRL(custoMO)}</span>
        </div>
        <div>
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Material</span>
          <span className="block mt-0.5 text-base font-extrabold text-slate-900 font-mono leading-none">
            {numero(pct(custoMaterial), 0)}%
          </span>
          <span className="text-2xs text-slate-500 font-mono">{formatBRL(custoMaterial)}</span>
        </div>
        <div>
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Package size={10} aria-hidden /> Itens
          </span>
          <span className="block mt-0.5 text-base font-extrabold text-slate-900 font-mono leading-none">
            {linhas.length}
          </span>
          <span className="text-2xs text-slate-500">{classeA} concentram 80% do custo</span>
        </div>
      </div>

      <TableWrap>
        <thead>
          <tr>
            {/* 1.069 px de tabela em 960 de console: rolar até "Custo" apagava
                o nome do insumo, e as quatro colunas de dinheiro ficavam sem
                dono. A coluna de identidade acompanha a rolagem. */}
            <Th fixa>Insumo</Th>
            <Th align="right">Quantidade</Th>
            <Th>Un.</Th>
            <Th align="right">Preço unit.</Th>
            <Th>Procedência</Th>
            <Th align="right">Custo</Th>
            <Th align="right">%</Th>
            <Th align="center">ABC</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.insumoId} className="hover:bg-slate-50/60 transition">
              <Td fixa className="max-w-md">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate text-slate-800 font-semibold" title={l.descricao}>
                    {l.descricao}
                  </span>
                  {/* Um insumo consumido por várias linhas do orçamento: útil
                      para saber que negociar este preço mexe em mais de um item. */}
                  {l.origens > 1 && (
                    <span
                      className="text-2xs font-bold text-slate-600 border border-slate-200 rounded px-1 shrink-0"
                      title={`Consumido por ${l.origens} itens do orçamento`}
                    >
                      {l.origens}×
                    </span>
                  )}
                </div>
              </Td>
              <Td align="right" mono className="font-bold text-slate-900">{numero(l.quantidade, 3)}</Td>
              <Td mono className="uppercase text-slate-600">{l.unidade}</Td>
              <Td align="right" mono className="text-slate-600">{formatBRL(l.precoUnitario)}</Td>
              <Td>
                <span className={`text-2xs font-bold uppercase tracking-wide whitespace-nowrap ${corProcedencia(nivelDaFonte(l.precoFonte))}`}>
                  {rotuloProcedencia(nivelDaFonte(l.precoFonte), l.precoFonte)}
                </span>
              </Td>
              <Td align="right" mono className="font-extrabold text-slate-900">{formatBRL(l.custo)}</Td>
              <Td align="right" mono className="text-slate-600">{numero(l.participacao, 1)}%</Td>
              <Td align="center">
                <span className={`text-2xs font-extrabold px-1.5 py-0.5 rounded border ${CLASSE[l.classeAbc]}`}>
                  {l.classeAbc}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
