import React, { useState } from 'react';
import { Cliente, Contrato, NovoContrato } from '../../types';
import { useFeedback } from '../FeedbackContext';
import { Button, Field, Input, Modal, ModalForm, Select, Textarea } from '../ui';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  clientes: Cliente[];
  /** Ausente = criação avulsa. Presente = edição deste contrato. */
  contrato?: Contrato;
  onSalvar: (patch: NovoContrato) => Promise<unknown | null>;
}

/**
 * Criar e editar usam o MESMO formulário.
 *
 * Ao contrário da proposta — onde criar pede só cliente e escopo, porque valor
 * e prazo se descobrem montando o orçamento —, aqui os campos já são conhecidos
 * no instante em que o contrato nasce: ou vieram da proposta aprovada (e aí a
 * geração nem passa por este diálogo), ou é um avulso cujo negócio já está
 * fechado. Dois formulários idênticos seriam duas cópias da mesma validação.
 */
export default function ModalContrato({ aberto, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      id="contrato-modal"
      open={aberto}
      onClose={onFechar}
      title={resto.contrato ? `Editar ${resto.contrato.numero}` : 'Novo contrato avulso'}
      size="lg"
      bloqueado={salvando}
    >
      <Formulario {...resto} salvando={salvando} setSalvando={setSalvando} onFechar={onFechar} />
    </Modal>
  );
}

/** Número opcional que chega vazio do formulário — '' não é zero, é "não informado". */
function numero(v: string): number | undefined {
  const n = Number(v);
  return v.trim() === '' || Number.isNaN(n) ? undefined : n;
}

function Formulario({
  clientes,
  contrato,
  onSalvar,
  onFechar,
  salvando,
  setSalvando,
}: Omit<Props, 'aberto'> & { salvando: boolean; setSalvando: (v: boolean) => void }) {
  const { toast } = useFeedback();

  // O corpo do <Modal> só monta quando ele abre, então o estado nasce limpo a
  // cada abertura — não há helper de reset nem efeito de sincronização aqui.
  const [clienteId, setClienteId] = useState(contrato?.clienteId ?? '');
  const [objeto, setObjeto] = useState(contrato?.objeto ?? '');
  const [valorTotal, setValorTotal] = useState(String(contrato?.valorTotal ?? ''));
  const [prazo, setPrazo] = useState(String(contrato?.prazoExecucaoDias ?? ''));
  const [dataInicio, setDataInicio] = useState(contrato?.dataInicio ?? '');
  const [dataAssinatura, setDataAssinatura] = useState(contrato?.dataAssinatura ?? '');
  const [formaPagamento, setFormaPagamento] = useState(contrato?.formaPagamento ?? '');
  const [reajuste, setReajuste] = useState(contrato?.reajuste ?? '');
  const [indiceReajuste, setIndiceReajuste] = useState(contrato?.indiceReajuste ?? '');
  const [multa, setMulta] = useState(String(contrato?.multaPercentual ?? ''));
  const [juros, setJuros] = useState(String(contrato?.jurosMoraPercentual ?? ''));
  const [garantia, setGarantia] = useState(String(contrato?.garantiaMeses ?? ''));
  const [foro, setForo] = useState(contrato?.foro ?? '');
  const [observacoes, setObservacoes] = useState(contrato?.observacoes ?? '');

  // O <select> mostra o primeiro cliente quando nada foi escolhido, então o
  // valor efetivo tem de acompanhá-lo — mesmo cuidado de ModalNovaProposta.
  const clienteEfetivo = clienteId || clientes[0]?.id || '';

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteEfetivo) {
      toast.error('Selecione o contratante.', 'Um contrato precisa de duas partes.');
      return;
    }
    if (!objeto.trim()) {
      toast.error('Descreva o objeto do contrato.', 'É o que as partes estão contratando.');
      return;
    }

    setSalvando(true);
    const ok = await onSalvar({
      clienteId: clienteEfetivo,
      objeto,
      valorTotal: numero(valorTotal) ?? 0,
      prazoExecucaoDias: numero(prazo),
      dataInicio: dataInicio || undefined,
      dataAssinatura: dataAssinatura || undefined,
      formaPagamento,
      reajuste,
      indiceReajuste,
      multaPercentual: numero(multa),
      jurosMoraPercentual: numero(juros),
      garantiaMeses: numero(garantia),
      foro,
      observacoes,
      propostaId: contrato?.propostaId,
      projetoId: contrato?.projetoId,
    });
    setSalvando(false);
    if (ok) onFechar();
  };

  return (
    <ModalForm
      onSubmit={submeter}
      className="space-y-3"
      footer={
        <>
          <Button variante="secundario" type="button" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" carregando={salvando}>
            {contrato ? 'Salvar' : 'Criar contrato'}
          </Button>
        </>
      }
    >
      <Field label="Contratante" required>
        {(props) => (
          <Select
            {...props}
            value={clienteEfetivo}
            onChange={(e) => setClienteId(e.target.value)}
            disabled={!!contrato?.propostaId}
          >
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {contrato?.propostaId && (
        <p className="text-2xs text-slate-500 -mt-2">
          O contratante vem da proposta de origem e não muda aqui.
        </p>
      )}

      <Field label="Objeto" required hint="O que está sendo contratado, em uma frase.">
        {(props) => (
          <Textarea {...props} rows={2} value={objeto} onChange={(e) => setObjeto(e.target.value)} />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor total (R$)">
          {(props) => (
            <Input
              {...props}
              type="number"
              step="0.01"
              min="0"
              value={valorTotal}
              onChange={(e) => setValorTotal(e.target.value)}
            />
          )}
        </Field>
        <Field label="Prazo de execução (dias)">
          {(props) => (
            <Input
              {...props}
              type="number"
              min="1"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
          )}
        </Field>
        <Field label="Início previsto">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Data de assinatura"
          hint="Preenchida sozinha ao marcar o contrato como Assinado."
        >
          {(props) => (
            <Input
              {...props}
              type="date"
              value={dataAssinatura}
              onChange={(e) => setDataAssinatura(e.target.value)}
            />
          )}
        </Field>
      </div>

      <Field label="Forma de pagamento">
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={formaPagamento}
            placeholder="Ex: 30% na assinatura e o saldo em medições mensais, faturadas em 15 dias."
            onChange={(e) => setFormaPagamento(e.target.value)}
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Reajuste">
          {(props) => (
            <Input
              {...props}
              value={reajuste}
              placeholder="Ex: anual, a partir do 13º mês"
              onChange={(e) => setReajuste(e.target.value)}
            />
          )}
        </Field>
        <Field label="Índice">
          {(props) => (
            <Input
              {...props}
              value={indiceReajuste}
              placeholder="Ex: INCC-M"
              onChange={(e) => setIndiceReajuste(e.target.value)}
            />
          )}
        </Field>
        <Field label="Multa (%)">
          {(props) => (
            <Input
              {...props}
              type="number"
              step="0.001"
              value={multa}
              onChange={(e) => setMulta(e.target.value)}
            />
          )}
        </Field>
        <Field label="Juros de mora (% ao mês)">
          {(props) => (
            <Input
              {...props}
              type="number"
              step="0.001"
              value={juros}
              onChange={(e) => setJuros(e.target.value)}
            />
          )}
        </Field>
        <Field label="Garantia (meses)">
          {(props) => (
            <Input
              {...props}
              type="number"
              min="0"
              value={garantia}
              onChange={(e) => setGarantia(e.target.value)}
            />
          )}
        </Field>
        <Field label="Foro">
          {(props) => (
            <Input
              {...props}
              value={foro}
              placeholder="Ex: Comarca de São Paulo - SP"
              onChange={(e) => setForo(e.target.value)}
            />
          )}
        </Field>
      </div>

      <Field label="Observações internas" hint="Não sai no documento impresso.">
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        )}
      </Field>
    </ModalForm>
  );
}
