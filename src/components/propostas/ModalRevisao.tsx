import React, { useState } from 'react';
import { History } from 'lucide-react';
import { Proposta } from '../../types';
import { formatBRL } from '../../lib/preco';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Button, Input, Modal, Textarea } from '../ui';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  proposta: Proposta;
  qtdItens: number;
  onRegistrar: (id: string, alteracoes: string, valor?: number) => Promise<boolean>;
}

export default function ModalRevisao({ aberto, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      id="add-revision-modal"
      open={aberto}
      onClose={onFechar}
      title="Registrar nova revisão"
      size="sm"
      bloqueado={salvando}
    >
      <Formulario {...resto} salvando={salvando} setSalvando={setSalvando} onFechar={onFechar} />
    </Modal>
  );
}

function Formulario({
  proposta,
  qtdItens,
  onRegistrar,
  onFechar,
  salvando,
  setSalvando,
}: Omit<Props, 'aberto'> & {
  salvando: boolean;
  setSalvando: (v: boolean) => void;
}) {
  const { toast } = useFeedback();
  const temItens = qtdItens > 0;
  const [valor, setValor] = useState('');
  const [alteracoes, setAlteracoes] = useState('');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alteracoes) {
      toast.error('Descreva o que mudou nesta revisão.');
      return;
    }
    // Digitar valor só faz sentido quando não existe orçamento montado.
    if (!temItens && !valor) {
      toast.error('Informe o novo valor proposto.');
      return;
    }

    setSalvando(true);
    // Versão, data e total são do servidor: com itens o total é o do orçamento
    // vigente, e a versão sai de max(versao) + 1 sob lock da proposta.
    const ok = await onRegistrar(proposta.id, alteracoes, temItens ? undefined : parseFloat(valor));
    setSalvando(false);
    if (!ok) return;

    onFechar();
    toast.success(
      'Nova revisão registrada.',
      temItens
        ? 'O orçamento vigente foi congelado nesta versão.'
        : 'O novo valor passou a valer para a proposta.'
    );
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-4 text-left">
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Proposta Alvo
        </label>
        <p className="text-xs font-semibold text-slate-900">
          {proposta.numero} - {proposta.descricao}
        </p>
      </div>

      {temItens ? (
        /* Com orçamento montado, digitar um valor era exatamente o que
           descolava a revisão dos itens. O total vem do que está na tela e a
           revisão o congela junto com a composição. */
        <div className="p-3 bg-blue-50 border border-blue-200/60 rounded-lg space-y-1.5">
          <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
            <History size={13} className="text-blue-600" />
            <span>Congela o orçamento atual</span>
          </p>
          <p className="text-2xs text-blue-800 leading-relaxed">
            Serão guardados {qtdItens} {qtdItens === 1 ? 'item' : 'itens'} com quantidade e preço, o
            BDI de {proposta.bdiPercentual}% e o total de{' '}
            <strong className="font-mono">{formatBRL(proposta.valorEstimado)}</strong>. Ajuste o
            orçamento antes, se ainda houver o que mudar.
          </p>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Novo Valor Proposto (R$) *
          </label>
          <Input
            id="add-rev-valor"
            type="number"
            step="0.01"
            required
            disabled={salvando}
            placeholder="Ex: 145000"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          <p className="text-2xs text-slate-500 mt-1 leading-tight">
            Esta proposta não tem itens, então o valor continua sendo digitado.
          </p>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Descrição das Modificações *
        </label>
        <Textarea
          id="add-rev-alteracoes"
          required
          disabled={salvando}
          placeholder="Ex: Negociamos substituição do revestimento cerâmico e reduzimos mão de obra civil."
          value={alteracoes}
          onChange={(e) => setAlteracoes(e.target.value)}
          rows={3}
        />
      </div>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <button
          type="button"
          disabled={salvando}
          onClick={onFechar}
          className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
        >
          Cancelar
        </button>
        <Button
          id="submit-add-rev-btn"
          type="submit"
          disabled={salvando}
        >
          {salvando ? (
            <>
              <Spinner size={14} />
              <span>Reajustando...</span>
            </>
          ) : (
            <>
              <History size={14} />
              {/* A versão é atribuída pelo banco sob lock; prometer um número
                  aqui seria chute quando há outra sessão. */}
              <span>Registrar revisão</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
