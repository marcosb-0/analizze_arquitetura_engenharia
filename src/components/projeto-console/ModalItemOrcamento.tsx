import React, { useState } from 'react';
import { DollarSign } from 'lucide-react';
import { CategoriaCusto, Fornecedor, ItemOrcamento } from '../../types';
import { buildOrcamentoItem } from '../../lib/orcamento';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Button, Field, Input, Modal, Select } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { naoEhNumero, naoEhPositivo, vazio } from '../../lib/validacao';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  projetoId: string;
  fornecedores: Fornecedor[];
  onAdicionar: (item: ItemOrcamento) => Promise<ItemOrcamento | null>;
}

export default function ModalItemOrcamento({ aberto, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      id="add-budget-item-modal"
      open={aberto}
      onClose={onFechar}
      title="Lançamento de Despesa"
      size="sm"
      bloqueado={salvando}
    >
      <Formulario {...resto} salvando={salvando} setSalvando={setSalvando} onFechar={onFechar} />
    </Modal>
  );
}

function Formulario({
  projetoId,
  fornecedores,
  onAdicionar,
  salvando,
  setSalvando,
  onFechar,
}: Omit<Props, 'aberto'> & {
  salvando: boolean;
  setSalvando: (v: boolean) => void;
}) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'descricao' | 'orcado'>();
  const [categoria, setCategoria] = useState<CategoriaCusto>('Materiais');
  const [descricao, setDescricao] = useState('');
  const [orcado, setOrcado] = useState('');
  const [contratado, setContratado] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        { campo: 'descricao', invalido: vazio(descricao), erro: 'Descreva o insumo do item.' },
        { campo: 'orcado', invalido: vazio(orcado), erro: 'Informe o valor orçado.' },
        { campo: 'orcado', invalido: naoEhNumero(orcado), erro: 'O valor precisa ser um número (use ponto decimal).' },
        { campo: 'orcado', invalido: naoEhPositivo(orcado), erro: 'O valor orçado deve ser maior que zero.' },
      ])
    ) return;

    setSalvando(true);

    // Fonte única de criação (mesma usada pela vinculação do catálogo).
    const novo = buildOrcamentoItem({
      projetoId,
      categoria,
      descricao,
      valorOrcado: parseFloat(orcado),
      valorContratado: contratado ? parseFloat(contratado) : 0,
      fornecedorId: fornecedorId || undefined,
    });

    // O aditivo é registrado no servidor por trg_log_item_orcamento_insert, na
    // mesma transação do insert — não há segunda chamada aqui.
    const criado = await onAdicionar(novo);
    setSalvando(false);
    // Falhou: o hook já explicou o motivo no toast de erro. O diálogo fica
    // aberto com os dados preenchidos para o usuário tentar de novo.
    if (!criado) return;

    onFechar();
    toast.success('Item orçamentário registrado.', `Adicionado em ${categoria}.`);
  };

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="p-4 space-y-4 text-left">
      <Field id="add-bud-cat" label="Categoria de Custo">
        {(props) => (
          <Select
            {...props}
            disabled={salvando}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaCusto)} className="font-semibold"
          >
            <option value="Materiais">Materiais (Custos Diretos)</option>
            <option value="Mão de Obra">Mão de Obra (Custos Diretos)</option>
            <option value="Equipamentos">Equipamentos (Custos Diretos)</option>
            <option value="Terceiros">Terceiros (Custos Diretos)</option>
            <option value="Deslocamentos">Deslocamentos (Custos Indiretos)</option>
            <option value="Administração">Administração (Custos Indiretos)</option>
            <option value="Contingências">Contingências (Custos Indiretos)</option>
          </Select>
        )}
      </Field>

      <Field id="add-bud-desc" label="Insumo / Descrição Técnico" erro={erros.descricao} required>
        {(props) => (
          <Input
            {...props}
            type="text"
            disabled={salvando}
            placeholder="Ex: 200m² de Lajotas Cerâmicas de Revestimento"
            value={descricao}
            onChange={(e) => { setDescricao(e.target.value); limparErro('descricao'); }}
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="add-bud-orcado" label="Valor Orçado (R$)" erro={erros.orcado} required>
          {(props) => (
            <Input
              {...props}
              type="number"
              step="0.01"
              disabled={salvando}
              placeholder="Ex: 5500.00"
              value={orcado}
              onChange={(e) => { setOrcado(e.target.value); limparErro('orcado'); }}
            />
          )}
        </Field>
        <Field id="add-bud-contratado" label="Valor Contratado (R$)">
          {(props) => (
            <Input
              {...props}
              type="number"
              step="0.01"
              disabled={salvando}
              placeholder="Ex: 5000.00"
              value={contratado}
              onChange={(e) => setContratado(e.target.value)}
            />
          )}
        </Field>
      </div>

      <Field id="add-bud-fornecedor" label="Fornecedor Vinculado">
        {(props) => (
          <Select
            {...props}
            disabled={salvando}
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
          >
            <option value="">Nenhum fornecedor vinculado</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.empresa}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <Button variante="fantasma" disabled={salvando} onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          id="submit-budget-item-btn"
          type="submit"
          disabled={salvando}
        >
          {salvando ? (
            <>
              <Spinner size={14} />
              <span>Faturando...</span>
            </>
          ) : (
            <>
              <DollarSign size={14} />
              <span>Faturar Item</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
