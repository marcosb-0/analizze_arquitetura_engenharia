import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { EtapaCronograma, EtapaOrcamentoVinculo, ItemOrcamento } from '../../types';
import { useFeedback } from '../FeedbackContext';
import { Button, Field, IconButton, Input, Modal, Select } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { naoEscolhido, vazio } from '../../lib/validacao';

/**
 * O alvo do vínculo: o lado que já está fixo quando o diálogo abre.
 *
 * O mesmo modal atende os dois sentidos do N:N — partindo da etapa ("de quais
 * linhas esta etapa consome verba") ou partindo do item de orçamento ("em quais
 * etapas este item é aplicado": cimento em fundação, alvenaria e reboco).
 */
export type AlvoVinculo = { modo: 'etapa'; etapaId: string } | { modo: 'item'; itemId: string };

interface Props {
  alvo: AlvoVinculo | null;
  onFechar: () => void;
  etapas: EtapaCronograma[];
  itens: ItemOrcamento[];
  vinculos: EtapaOrcamentoVinculo[];
  /** Quanto do valor de cada item já está alocado a etapas (0–100). */
  pesoAlocadoPorItem: Map<string, number>;
  onAdicionar: (vinculo: EtapaOrcamentoVinculo) => Promise<boolean>;
  onRemover: (id: string) => void;
}

export default function ModalVinculo({ alvo, onFechar, ...resto }: Props) {
  const { etapas, itens } = resto;
  return (
    <Modal
      id="vinculo-etapa-modal"
      open={!!alvo}
      onClose={onFechar}
      title={alvo?.modo === 'etapa' ? 'Vincular Orçamento' : 'Distribuir entre Etapas'}
      description={
        alvo
          ? alvo.modo === 'etapa'
            ? etapas.find((s) => s.id === alvo.etapaId)?.nome
            : itens.find((i) => i.id === alvo.itemId)?.descricao
          : undefined
      }
      size="sm"
    >
      {/* O corpo só monta quando o diálogo abre (o Modal renderiza `children`
          dentro do AnimatePresence), então o formulário nasce limpo a cada
          abertura em vez de depender de um helper que lembre de zerar — §3.6. */}
      {alvo && <Corpo alvo={alvo} {...resto} />}
    </Modal>
  );
}

function Corpo({
  alvo,
  etapas,
  itens,
  vinculos,
  pesoAlocadoPorItem,
  onAdicionar,
  onRemover,
}: Omit<Props, 'alvo' | 'onFechar'> & { alvo: AlvoVinculo }) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'item' | 'etapa' | 'peso'>();
  const modoEtapa = alvo.modo === 'etapa';

  const pesoUsadoDoItem = (itemId: string) => pesoAlocadoPorItem.get(itemId) ?? 0;

  const vinculosDoAlvo = modoEtapa
    ? vinculos.filter((v) => v.etapaId === alvo.etapaId)
    : vinculos.filter((v) => v.itemOrcamentoId === alvo.itemId);
  const pesoUsado = vinculosDoAlvo.reduce((sum, v) => sum + v.pesoPercentual, 0);
  const etapasJaVinculadas = new Set(vinculosDoAlvo.map((v) => v.etapaId));
  const itensJaVinculados = new Set(vinculosDoAlvo.map((v) => v.itemOrcamentoId));
  const restanteDoItem = modoEtapa ? null : Math.max(0, 100 - pesoUsado);

  const [itemId, setItemId] = useState('');
  const [etapaAlvoId, setEtapaAlvoId] = useState('');
  // Partindo do item, o peso que falta alocar é quase sempre o que se quer
  // lançar na próxima etapa — pré-preenche o restante.
  const [peso, setPeso] = useState(() =>
    modoEtapa ? '100' : restanteDoItem && restanteDoItem > 0 ? String(restanteDoItem) : ''
  );

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    const idEtapa = alvo.modo === 'etapa' ? alvo.etapaId : etapaAlvoId;
    const idItem = alvo.modo === 'item' ? alvo.itemId : itemId;
    const valor = parseFloat(peso);
    // Este é o invariante que não pode estourar: `fn_apply_medicao` aplica o
    // peso contra o valor orçado do ITEM, então duas etapas reivindicando 70%
    // do mesmo item aplicariam 140% do orçamento dele ao serem concluídas.
    const usadoNoItem = idItem ? pesoUsadoDoItem(idItem) : 0;

    if (
      !validar([
        // Antes eram `return` mudos: o botão respondia e nada acontecia.
        { campo: 'item', invalido: naoEscolhido(idItem), erro: 'Escolha o item de orçamento.' },
        { campo: 'etapa', invalido: naoEscolhido(idEtapa), erro: 'Escolha a etapa do cronograma.' },
        { campo: 'peso', invalido: vazio(peso), erro: 'Informe o peso.' },
        {
          campo: 'peso',
          invalido: Number.isNaN(valor) || valor <= 0 || valor > 100,
          erro: 'O peso deve ser um percentual entre 1 e 100.',
        },
        {
          campo: 'peso',
          invalido: !Number.isNaN(valor) && usadoNoItem + valor > 100,
          erro: `Este item já tem ${usadoNoItem}% alocado a outras etapas — disponível: ${100 - usadoNoItem}%.`,
        },
      ])
    ) return;

    const ok = await onAdicionar({
      id: crypto.randomUUID(),
      etapaId: idEtapa,
      itemOrcamentoId: idItem,
      pesoPercentual: valor,
    });
    if (!ok) return;

    setItemId('');
    setEtapaAlvoId('');
    // Distribuindo um item entre etapas, o próximo lançamento parte do que
    // ainda sobrou dele — não de 100%, que só erraria de novo.
    const restante = Math.max(0, 100 - (usadoNoItem + valor));
    setPeso(alvo.modo === 'item' ? (restante > 0 ? String(restante) : '') : '100');
    toast.success('Item de orçamento vinculado à etapa.');
  };

  return (
    <div className="p-4 space-y-3 overflow-y-auto flex-1">
      <p className="text-2xs text-slate-500 leading-relaxed">
        {modoEtapa
          ? 'Defina de quais linhas do orçamento esta etapa consome verba, e em qual peso. Quando uma medição for lançada para esta etapa, o valor será aplicado proporcionalmente a cada linha vinculada.'
          : 'Distribua o valor deste item entre as etapas em que ele é aplicado — o mesmo material pode entrar em várias frentes. A soma dos pesos não pode passar de 100%; o que sobrar não entra em nenhuma medição.'}
      </p>

      {!modoEtapa && (
        <div
          className={`p-2 rounded border text-2xs font-bold ${
            restanteDoItem === 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          {restanteDoItem === 0
            ? 'Item 100% distribuído entre as etapas.'
            : `${restanteDoItem}% do valor deste item ainda não está em nenhuma etapa.`}
        </div>
      )}

      {vinculosDoAlvo.length > 0 && (
        <div className="space-y-1.5">
          {vinculosDoAlvo.map((v) => {
            const rotulo = modoEtapa
              ? (itens.find((i) => i.id === v.itemOrcamentoId)?.descricao ?? 'Item removido')
              : (etapas.find((s) => s.id === v.etapaId)?.nome ?? 'Etapa removida');
            return (
              <div
                key={v.id}
                className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded text-xs"
              >
                <span className="font-semibold text-slate-700 truncate pr-2">{rotulo}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono font-bold text-blue-600">{v.pesoPercentual}%</span>
                  <IconButton
                    rotulo={`Remover o vínculo com ${rotulo}`}
                    tom="perigo"
                    onClick={() => onRemover(v.id)}
                  >
                    <Trash2 size={12} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="pt-3 border-t border-slate-200 space-y-2.5">
        {modoEtapa ? (
          <Field id="vinculo-item-select" label="Item de Orçamento" erro={erros.item} required>
            {(props) => (
            <Select
              {...props}
              value={itemId}
              onChange={(e) => { setItemId(e.target.value); limparErro('item'); }}
            >
              <option value="">Selecione...</option>
              {itens.map((item) => {
                const disponivel = 100 - pesoUsadoDoItem(item.id);
                const jaNaEtapa = itensJaVinculados.has(item.id);
                return (
                  <option key={item.id} value={item.id} disabled={jaNaEtapa || disponivel <= 0}>
                    {item.descricao} ({item.categoria}) —{' '}
                    {jaNaEtapa ? 'já vinculado' : `${disponivel}% disponível`}
                  </option>
                );
              })}
            </Select>
            )}
          </Field>
        ) : (
          <div>
            <Field id="vinculo-etapa-select" label="Etapa do Cronograma" erro={erros.etapa} required>
              {(props) => (
              <Select
                {...props}
                value={etapaAlvoId}
                onChange={(e) => { setEtapaAlvoId(e.target.value); limparErro('etapa'); }}
              >
              <option value="">Selecione...</option>
              {etapas.map((step) => (
                <option key={step.id} value={step.id} disabled={etapasJaVinculadas.has(step.id)}>
                  {step.nome}
                  {etapasJaVinculadas.has(step.id) ? ' — já vinculada' : ''}
                </option>
              ))}
              </Select>
              )}
            </Field>
            {etapas.length === 0 && (
              <p className="text-2xs text-amber-600 font-semibold mt-1">
                Nenhuma etapa cadastrada — monte o cronograma antes de distribuir o orçamento.
              </p>
            )}
          </div>
        )}
        <Field
          id="vinculo-peso-input"
          label={
            modoEtapa
              ? `Peso (%) — nesta etapa: ${pesoUsado}%${itemId ? ` · disponível no item: ${100 - pesoUsadoDoItem(itemId)}%` : ''}`
              : `Peso (%) — já distribuído: ${pesoUsado}% · disponível: ${restanteDoItem}%`
          }
          erro={erros.peso}
          required
        >
          {(props) => (
          <Input
            {...props}
            type="number"
            min="1"
            max="100"
            value={peso}
            onChange={(e) => { setPeso(e.target.value); limparErro('peso'); }}
          />
          )}
        </Field>
        <Button
          id="submit-vinculo-btn"
          type="submit" bloco
        >
          Adicionar Vínculo
        </Button>
      </form>
    </div>
  );
}
