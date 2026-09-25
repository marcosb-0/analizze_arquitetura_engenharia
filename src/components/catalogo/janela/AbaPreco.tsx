import { Layers, Sigma } from 'lucide-react';
import { CotacaoFornecedor, Fornecedor, InsumoCatalogo, PontoHistoricoPreco } from '../../../types';
import { Aviso, Button } from '../../ui';
import GraficoHistorico from '../GraficoHistorico';
import MapaCotacoes from '../MapaCotacoes';
import OrigemFolha from './OrigemFolha';

/**
 * A aba Preço: de onde vem o número, como ele se moveu e quem já cotou.
 *
 * Em tela larga o histórico e as cotações ficam lado a lado — são as duas
 * metades da mesma pergunta ("este preço ainda vale?") e, empilhados, o mapa de
 * cotações caía para baixo da dobra.
 */
interface AbaPrecoProps {
  insumo: InsumoCatalogo;
  fornecedores: Fornecedor[];
  historico: PontoHistoricoPreco[];
  cotacoes: CotacaoFornecedor[];
  onAddCotacao: (insumoId: string, quote: CotacaoFornecedor) => Promise<CotacaoFornecedor | null>;
  onDesativarCotacao: (insumoId: string, cotacaoId: string) => Promise<void>;
  onAdotarPrecoCotacao: (insumoId: string, preco: number) => Promise<InsumoCatalogo | null>;
  recarregarDetalhe: () => Promise<void>;
  /** Só para insumo simples: abre a aba Composição pronta para o 1º componente. */
  onTransformarEmComposicao?: () => void;
}

export default function AbaPreco({
  insumo,
  fornecedores,
  historico,
  cotacoes,
  onAddCotacao,
  onDesativarCotacao,
  onAdotarPrecoCotacao,
  recarregarDetalhe,
  onTransformarEmComposicao,
}: AbaPrecoProps) {
  const ehComposicao = insumo.tipoItem === 'Composicao';

  return (
    <div className="space-y-4">
      {/* Avisos antes do gráfico, e não depois: quem vai mexer no preço precisa
          saber do alcance ANTES de decidir, não ao rolar até o fim. */}
      {ehComposicao && (
        <Aviso tom="informativo" icone={<Sigma size={14} />}>
          O preço desta composição é a soma dos componentes — muda quando um coeficiente ou o
          preço de um componente muda. Cotação aqui fica como registro, mas não substitui o cálculo.
        </Aviso>
      )}
      <OrigemFolha insumo={insumo} />
      {insumo.usadoEmComposicoes > 0 && (
        <Aviso tom="neutro" icone={<Layers size={14} />}>
          Este item entra em {insumo.usadoEmComposicoes} composiç{insumo.usadoEmComposicoes > 1 ? 'ões' : 'ão'}.
          Mudar o preço dele recalcula todas e registra o novo custo no histórico de cada uma.
        </Aviso>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="space-y-2.5">
          <h3 className="flex h-7 items-center text-sm font-bold text-slate-900">Histórico de preço</h3>
          <GraficoHistorico historico={historico} />
        </section>

        <MapaCotacoes
          insumo={insumo}
          cotacoes={cotacoes}
          fornecedores={fornecedores}
          ehComposicao={ehComposicao}
          onAddCotacao={onAddCotacao}
          onDesativarCotacao={onDesativarCotacao}
          onAdotarPrecoCotacao={onAdotarPrecoCotacao}
          recarregarDetalhe={recarregarDetalhe}
        />
      </div>

      {onTransformarEmComposicao && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="max-w-prose text-xs text-slate-600">
            <strong className="font-semibold text-slate-800">Este item é um serviço montado de outros?</strong>{' '}
            Ao receber o primeiro componente ele vira uma composição e o preço passa a ser calculado.
          </p>
          <Button variante="secundario" tamanho="sm" onClick={onTransformarEmComposicao}>
            <Sigma size={13} />
            <span>Transformar em composição</span>
          </Button>
        </div>
      )}
    </div>
  );
}
