import React, { useState } from 'react';
import { DollarSign } from 'lucide-react';
import { CategoriaCusto, Fornecedor, ItemOrcamento } from '../../types';
import { buildOrcamentoItem } from '../../lib/orcamento';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Modal } from '../ui';

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
  const [categoria, setCategoria] = useState<CategoriaCusto>('Materiais');
  const [descricao, setDescricao] = useState('');
  const [orcado, setOrcado] = useState('');
  const [contratado, setContratado] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao || !orcado) {
      toast.error('Preencha os campos obrigatórios (Descrição, Valor Orçado).');
      return;
    }

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
    <form onSubmit={submeter} className="p-4 space-y-4 text-left">
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Categoria de Custo *
        </label>
        <select
          id="add-bud-cat"
          disabled={salvando}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as CategoriaCusto)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700 font-semibold disabled:bg-slate-50"
        >
          <option value="Materiais">Materiais (Custos Diretos)</option>
          <option value="Mão de Obra">Mão de Obra (Custos Diretos)</option>
          <option value="Equipamentos">Equipamentos (Custos Diretos)</option>
          <option value="Terceiros">Terceiros (Custos Diretos)</option>
          <option value="Deslocamentos">Deslocamentos (Custos Indiretos)</option>
          <option value="Administração">Administração (Custos Indiretos)</option>
          <option value="Contingências">Contingências (Custos Indiretos)</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Insumo / Descrição Técnico *
        </label>
        <input
          id="add-bud-desc"
          type="text"
          required
          disabled={salvando}
          placeholder="Ex: 200m² de Lajotas Cerâmicas de Revestimento"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Valor Orçado (R$) *
          </label>
          <input
            id="add-bud-orcado"
            type="number"
            step="0.01"
            required
            disabled={salvando}
            placeholder="Ex: 5500.00"
            value={orcado}
            onChange={(e) => setOrcado(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Valor Contratado (R$)
          </label>
          <input
            id="add-bud-contratado"
            type="number"
            step="0.01"
            disabled={salvando}
            placeholder="Ex: 5000.00"
            value={contratado}
            onChange={(e) => setContratado(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Fornecedor Vinculado
        </label>
        <select
          id="add-bud-fornecedor"
          disabled={salvando}
          value={fornecedorId}
          onChange={(e) => setFornecedorId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700 disabled:bg-slate-50"
        >
          <option value="">Nenhum fornecedor vinculado</option>
          {fornecedores.map((f) => (
            <option key={f.id} value={f.id}>
              {f.empresa}
            </option>
          ))}
        </select>
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
        <button
          id="submit-budget-item-btn"
          type="submit"
          disabled={salvando}
          className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
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
        </button>
      </div>
    </form>
  );
}
