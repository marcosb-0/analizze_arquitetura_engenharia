import { Layers } from 'lucide-react';
import { CotacaoFornecedor, Fornecedor, InsumoCatalogo, PontoHistoricoPreco } from '../../../types';
import GraficoHistorico from '../GraficoHistorico';
import MapaCotacoes from '../MapaCotacoes';

/**
 * A aba Preço: de onde vem o número, como ele se moveu e quem já cotou.
 *
 * Os dois blocos daqui moravam no drawer lateral, num espaço de 448 px que o
 * gráfico dividia com metadados, ficha técnica e botões. Aqui eles têm a
 * largura da janela.
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
}: AbaPrecoProps) {
  return (
    <div className="space-y-4">
      {/* Aviso antes do gráfico, e não depois: quem vai mexer no preço precisa
          saber do alcance ANTES de decidir, não ao rolar até o fim. */}
      {insumo.usadoEmComposicoes > 0 && (
        <div className="flex items-start gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
          <Layers size={11} className="text-slate-500 mt-0.5 shrink-0" aria-hidden />
          <p className="text-2xs text-slate-600 font-semibold leading-relaxed">
            Este item entra em {insumo.usadoEmComposicoes} composição(ões). Mudar o preço dele
            recalcula todas elas e registra o novo custo no histórico de cada uma.
          </p>
        </div>
      )}

      <GraficoHistorico historico={historico} />

      <MapaCotacoes
        insumo={insumo}
        cotacoes={cotacoes}
        fornecedores={fornecedores}
        ehComposicao={insumo.tipoItem === 'Composicao'}
        onAddCotacao={onAddCotacao}
        onDesativarCotacao={onDesativarCotacao}
        onAdotarPrecoCotacao={onAdotarPrecoCotacao}
        recarregarDetalhe={recarregarDetalhe}
      />
    </div>
  );
}
