import { useState } from 'react';
import { InsumoCatalogo } from '../../types';
import { UsosInsumo, ResultadoExclusao } from '../../services/catalogoService';
import { useFeedback } from '../FeedbackContext';

const listaBloqueios = (u: UsosInsumo) =>
  [
    u.itensOrcamento > 0 && `${u.itensOrcamento} item${u.itensOrcamento > 1 ? 'ns' : ''} de orçamento`,
    u.insumosProjeto > 0 && `${u.insumosProjeto} insumo${u.insumosProjeto > 1 ? 's' : ''} de obra`,
    u.itensProposta > 0 && `${u.itensProposta} item${u.itensProposta > 1 ? 'ns' : ''} de proposta`,
    u.emComposicoes > 0 && `${u.emComposicoes} composiç${u.emComposicoes > 1 ? 'ões' : 'ão'} que o usa como componente`,
  ]
    .filter(Boolean)
    .join(', ');

/** O que a exclusão leva junto — só aparece quando existe. */
const listaCascata = (u: UsosInsumo) =>
  [
    u.pontosHistorico > 0 && `${u.pontosHistorico} ponto${u.pontosHistorico > 1 ? 's' : ''} de histórico de preço`,
    u.cotacoes > 0 && `${u.cotacoes} cotaç${u.cotacoes > 1 ? 'ões' : 'ão'} de fornecedor`,
    u.componentes > 0 && `${u.componentes} componente${u.componentes > 1 ? 's' : ''} da composição`,
  ]
    .filter(Boolean)
    .join(', ');

interface Deps {
  carregarUsosInsumo: (id: string) => Promise<UsosInsumo | null>;
  onExcluirCatalogoItem: (id: string) => Promise<ResultadoExclusao | null>;
  onSetAtivoCatalogoItem: (id: string, ativo: boolean) => Promise<void>;
  /** Fecha o detalhe: o item pode ter acabado de sumir ou de ser desativado. */
  aoSumir: () => void;
}

/**
 * Exclusão definitiva de insumo — vive num hook porque a listagem e o rodapé do
 * detalhe oferecem o mesmo botão, e o estado de "consultando usos" é do par
 * inteiro, não de cada tela.
 *
 * Desativar continua sendo o caminho normal: insumo que já entrou em orçamento
 * não pode sumir sem levar junto a procedência da linha que ele originou. A
 * exclusão existe para o outro caso — item digitado errado, duplicado ou de
 * teste, que nunca foi usado e só suja a busca.
 *
 * Quem decide é o banco (`catalogo_excluir_insumo` recusa e explica). A consulta
 * de usos aqui serve para o diálogo já dizer o que vai acontecer ANTES do
 * clique, em vez de oferecer um botão que falha depois.
 */
export function useExclusaoInsumo({
  carregarUsosInsumo,
  onExcluirCatalogoItem,
  onSetAtivoCatalogoItem,
  aoSumir,
}: Deps) {
  const { toast, confirm } = useFeedback();
  const [verificandoUsos, setVerificandoUsos] = useState<string | null>(null);

  const pedirExclusao = async (item: InsumoCatalogo) => {
    setVerificandoUsos(item.id);
    const usos = await carregarUsosInsumo(item.id);
    setVerificandoUsos(null);
    if (!usos) return;

    if (!usos.podeExcluir) {
      confirm({
        title: 'Este insumo não pode ser excluído',
        message: item.ativo
          ? `"${item.descricao}" já foi usado em ${listaBloqueios(usos)}. Excluir apagaria a ligação entre o que foi orçado e o item que originou o valor. Quer desativá-lo? Ele sai das buscas e dos novos orçamentos, e continua onde já está.`
          : `"${item.descricao}" já foi usado em ${listaBloqueios(usos)}. Excluir apagaria a ligação entre o que foi orçado e o item que originou o valor. Ele já está desativado — é o mais longe que dá para ir sem perder a procedência.`,
        confirmLabel: item.ativo ? 'Desativar insumo' : 'Entendi',
        tone: 'normal',
        onConfirm: async () => {
          if (!item.ativo) return;
          await onSetAtivoCatalogoItem(item.id, false);
          aoSumir();
        },
      });
      return;
    }

    const cascata = listaCascata(usos);
    confirm({
      title: 'Excluir definitivamente',
      message:
        `"${item.descricao}" será apagado do catálogo` +
        (cascata ? `, junto com ${cascata}` : '') +
        '. Não dá para desfazer. Como este item nunca foi usado em orçamento, obra, proposta ou composição, nada mais é afetado.',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        const resultado = await onExcluirCatalogoItem(item.id);
        if (!resultado) return;
        aoSumir();
        toast.success('Insumo excluído do catálogo.', `"${resultado.descricao}" não estava em uso em lugar nenhum.`);
      },
    });
  };

  return { verificandoUsos, pedirExclusao };
}
