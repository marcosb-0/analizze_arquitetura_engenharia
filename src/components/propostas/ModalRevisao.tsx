import React, { useState } from 'react';
import { History } from 'lucide-react';
import { Proposta } from '../../types';
import { formatBRL } from '../../lib/preco';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Aviso, Button, Field, Input, Modal, Textarea } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { vazio } from '../../lib/validacao';

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
  const { erros, validar, limparErro, areaRef } = useValidacao<'valor' | 'alteracoes'>();
  const temItens = qtdItens > 0;
  const [valor, setValor] = useState('');
  const [alteracoes, setAlteracoes] = useState('');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        // Digitar valor só faz sentido quando não existe orçamento montado —
        // por isso a checagem some junto com o campo.
        { campo: 'valor', invalido: !temItens && vazio(valor), erro: 'Informe o novo valor proposto.' },
        { campo: 'alteracoes', invalido: vazio(alteracoes), erro: 'Descreva o que mudou nesta revisão.' },
      ])
    ) return;

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
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="p-4 space-y-4 text-left">
      <div>
        <span className="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
          Proposta Alvo
        </span>
        <p className="text-xs font-semibold text-slate-900">
          {proposta.numero} - {proposta.descricao}
        </p>
      </div>

      {temItens ? (
        /* Com orçamento montado, digitar um valor era exatamente o que
           descolava a revisão dos itens. O total vem do que está na tela e a
           revisão o congela junto com a composição. */
        <Aviso tom="informativo" icone={<History size={13} />}>
          <span className="block font-bold">Congela o orçamento atual</span>
          <p className="text-2xs leading-relaxed">
            Serão guardados {qtdItens} {qtdItens === 1 ? 'item' : 'itens'} com quantidade e preço, o
            BDI de {proposta.bdiPercentual}% e o total de{' '}
            <strong className="data-font">{formatBRL(proposta.valorEstimado)}</strong>. Ajuste o
            orçamento antes, se ainda houver o que mudar.
          </p>
        </Aviso>
      ) : (
        <Field
          id="add-rev-valor"
          label="Novo Valor Proposto (R$)"
          erro={erros.valor}
          hint="Esta proposta não tem itens, então o valor continua sendo digitado."
          required
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              step="0.01"
              disabled={salvando}
              placeholder="Ex: 145000"
              value={valor}
              onChange={(e) => { setValor(e.target.value); limparErro('valor'); }}
            />
          )}
        </Field>
      )}

      <Field id="add-rev-alteracoes" label="Descrição das Modificações" erro={erros.alteracoes} required>
        {(props) => (
          <Textarea
            {...props}
            disabled={salvando}
            placeholder="Ex: Negociamos substituição do revestimento cerâmico e reduzimos mão de obra civil."
            value={alteracoes}
            onChange={(e) => { setAlteracoes(e.target.value); limparErro('alteracoes'); }}
            rows={3}
          />
        )}
      </Field>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <Button variante="fantasma" disabled={salvando} onClick={onFechar}>
          Cancelar
        </Button>
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
