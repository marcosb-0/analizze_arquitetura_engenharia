import React, { useMemo, useState } from 'react';
import { FileCheck2, Info } from 'lucide-react';
import {
  AjustePreco,
  CategoriaCusto,
  Fornecedor,
  InsumoCatalogo,
  ItemOrcamento,
  Projeto,
  TipoAjuste,
} from '../../types';
import { buildOrcamentoItem } from '../../lib/orcamento';
import {
  aplicarAjuste,
  ajusteParaPrecoAlvo,
  categoriaCustoDoInsumo,
  cotacaoVencida,
  deltaAjuste,
  descreveAjuste,
  melhorPreco,
  formatBRL,
} from '../../lib/preco';
import { NovoInsumoProjeto } from '../../services/insumosProjetoService';
import { useFeedback } from '../FeedbackContext';
import { Modal } from '../ui';
import Spinner from '../Spinner';

interface ModalVincularObraProps {
  /** Insumo a vincular; `null` mantém o diálogo fechado. */
  insumo: InsumoCatalogo | null;
  projetos: Projeto[];
  fornecedores: Fornecedor[];
  onClose: () => void;
  onAddOrcamentoItem: (item: ItemOrcamento) => Promise<ItemOrcamento | null>;
  onAddInsumoProjeto: (novo: NovoInsumoProjeto) => Promise<unknown>;
}

export default function ModalVincularObra({ insumo, ...resto }: ModalVincularObraProps) {
  return (
    <Modal
      id="bind-insumo-modal"
      open={!!insumo}
      onClose={resto.onClose}
      title="Vincular ao orçamento"
      size="md"
    >
      {insumo && <FormularioVinculo insumo={insumo} {...resto} />}
    </Modal>
  );
}

function FormularioVinculo({
  insumo,
  projetos,
  fornecedores,
  onClose,
  onAddOrcamentoItem,
  onAddInsumoProjeto,
}: ModalVincularObraProps & { insumo: InsumoCatalogo }) {
  const { toast } = useFeedback();

  // O melhor preço é a base de partida, e sai da mesma função que o card usa.
  const melhor = useMemo(() => melhorPreco(insumo), [insumo]);

  const [projetoId, setProjetoId] = useState(projetos[0]?.id ?? '');
  const [quantidade, setQuantidade] = useState('1');
  const [categoria, setCategoria] = useState<CategoriaCusto>(categoriaCustoDoInsumo(insumo.categoria));
  const [fornecedorId, setFornecedorId] = useState(melhor.fornecedorId ?? '');
  const [precoBase, setPrecoBase] = useState(melhor.preco);
  const [ajusteTipo, setAjusteTipo] = useState<TipoAjuste>('Nenhum');
  const [ajusteValor, setAjusteValor] = useState('0');
  const [ajusteMotivo, setAjusteMotivo] = useState('');
  const [jaContratado, setJaContratado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const ajuste: AjustePreco = useMemo(
    () => ({
      tipo: ajusteTipo,
      valor: parseFloat(ajusteValor) || 0,
      motivo: ajusteMotivo || undefined,
    }),
    [ajusteTipo, ajusteValor, ajusteMotivo]
  );

  const precoFinal = aplicarAjuste(precoBase, ajuste);
  const total = (parseFloat(quantidade) || 0) * precoFinal;

  /** Trocar de fornecedor recarrega a BASE, preservando o ajuste já digitado. */
  const trocarFornecedor = (novoId: string) => {
    setFornecedorId(novoId);
    const cotacao = (insumo.cotacoesFornecedores ?? []).find((q) => q.fornecedorId === novoId);
    setPrecoBase(cotacao ? cotacao.precoUnitario : insumo.precoReferencia);
  };

  /** Deixa digitar o preço final desejado e converte no ajuste equivalente. */
  const definirPrecoAlvo = (valor: string) => {
    const alvo = parseFloat(valor);
    if (isNaN(alvo)) return;
    const equivalente = ajusteParaPrecoAlvo(precoBase, alvo, 'Valor');
    setAjusteTipo(equivalente.tipo);
    setAjusteValor(String(equivalente.valor));
  };

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projetoId) return;

    const qtd = parseFloat(quantidade);
    if (isNaN(qtd) || qtd <= 0) {
      toast.error('A quantidade deve ser maior que zero.');
      return;
    }
    if (precoFinal <= 0) {
      toast.error('O desconto zerou o preço.', 'Reveja o ajuste — o preço final precisa ser maior que zero.');
      return;
    }

    setSalvando(true);

    // O item de orçamento nasce com o total; logo em seguida a linha de
    // insumos_projeto assume o cálculo e a trigger no banco mantém
    // valor_orcado = quantidade × preço ajustado daqui para a frente.
    const item = buildOrcamentoItem({
      projetoId,
      categoria,
      descricao: `${insumo.descricao} (${qtd} ${insumo.unidade})`,
      valorOrcado: qtd * precoFinal,
      valorContratado: jaContratado ? qtd * precoFinal : 0,
      fornecedorId: fornecedorId || undefined,
      catalogoInsumoId: insumo.id,
    });

    const criado = await onAddOrcamentoItem(item);
    if (criado) {
      await onAddInsumoProjeto({
        projetoId,
        catalogoInsumoId: insumo.id,
        itemOrcamentoId: criado.id,
        quantidade: qtd,
        precoUnitarioBase: precoBase,
        ajuste,
        fornecedorId: fornecedorId || undefined,
      });

      const obra = projetos.find((p) => p.id === projetoId);
      toast.success(
        'Insumo vinculado ao orçamento.',
        `${formatBRL(qtd * precoFinal)} em "${obra?.nome}"${
          ajuste.tipo !== 'Nenhum' && ajuste.valor !== 0
            ? ` — com ${descreveAjuste(precoBase, ajuste)}. O preço de referência do catálogo não mudou.`
            : ''
        }`
      );
    }

    setSalvando(false);
    onClose();
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-4 overflow-y-auto">
      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
        <span className="text-2xs text-slate-500 font-bold uppercase tracking-wider block">Insumo</span>
        <p className="font-extrabold text-slate-800 mt-1">{insumo.descricao}</p>
        <p className="text-2xs text-slate-500 mt-0.5">
          Referência do catálogo: {formatBRL(insumo.precoReferencia)} / {insumo.unidade}
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-2xs font-bold text-slate-500 uppercase">Obra de destino</label>
        <select value={projetoId} onChange={(e) => setProjetoId(e.target.value)} required className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 font-medium">
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-2xs font-bold text-slate-500 uppercase">Fornecedor / base de preço</label>
        <select value={fornecedorId} onChange={(e) => trocarFornecedor(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 font-medium">
          <option value="">Preço de referência: {formatBRL(insumo.precoReferencia)} (sem fornecedor)</option>
          {fornecedores.map((f) => {
            const q = (insumo.cotacoesFornecedores ?? []).find((x) => x.fornecedorId === f.id);
            return (
              <option key={f.id} value={f.id}>
                {f.empresa} {q ? `— cotação ${formatBRL(q.precoUnitario)}${cotacaoVencida(q) ? ' (vencida)' : ''}` : '— sem cotação, usa referência'}
              </option>
            );
          })}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Quantidade ({insumo.unidade})</label>
          <input type="number" required min="0.001" step="any" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono font-bold" />
        </div>
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Preço base (R$)</label>
          <input type="number" value={precoBase} readOnly className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-500 font-mono font-bold cursor-not-allowed" title="Vem do catálogo ou da cotação do fornecedor escolhido" />
        </div>
      </div>

      {/* AJUSTE DESTE ORÇAMENTO */}
      <div className="bg-blue-50/30 border border-blue-100 rounded-lg p-3 space-y-2.5">
        <div className="flex items-start gap-1.5">
          <Info size={12} className="text-blue-600 mt-0.5 shrink-0" />
          <p className="text-2xs text-blue-900 font-semibold leading-relaxed">
            Acréscimo ou desconto <strong>só desta obra</strong>. O preço de referência global do catálogo
            não é alterado — a base fica registrada para você saber de onde partiu.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-2xs font-bold text-slate-500 uppercase">Tipo de ajuste</label>
            <select value={ajusteTipo} onChange={(e) => setAjusteTipo(e.target.value as TipoAjuste)} className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-medium">
              <option value="Nenhum">Sem ajuste</option>
              <option value="Percentual">Percentual (%)</option>
              <option value="Valor">Valor por unidade (R$)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-2xs font-bold text-slate-500 uppercase">
              {ajusteTipo === 'Percentual' ? 'Percentual (− desconto)' : 'Valor (− desconto)'}
            </label>
            <input
              type="number"
              step="any"
              disabled={ajusteTipo === 'Nenhum'}
              value={ajusteValor}
              onChange={(e) => setAjusteValor(e.target.value)}
              placeholder="Ex: -10"
              className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-mono font-bold disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Ou digite o preço final desejado</label>
          <input
            type="number"
            step="any"
            min="0"
            placeholder={String(precoBase)}
            onBlur={(e) => e.target.value && definirPrecoAlvo(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-mono"
            title="Convertido automaticamente no ajuste equivalente, preservando a base"
          />
        </div>

        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Motivo do ajuste</label>
          <input type="text" value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)} placeholder="Ex: frete incluso, negociação por volume" className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50" />
        </div>

        {ajusteTipo !== 'Nenhum' && (
          <div className="flex items-center justify-between bg-white rounded-md p-2 border border-slate-200 text-2xs">
            <span className="font-semibold text-slate-500">
              {formatBRL(precoBase)} → <strong className="text-slate-900">{formatBRL(precoFinal)}</strong>
            </span>
            <span className={`font-mono font-bold ${deltaAjuste(precoBase, ajuste) >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {descreveAjuste(precoBase, ajuste)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-2xs font-bold text-slate-500 uppercase">Categoria no orçamento</label>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCusto)} className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-medium">
          <option value="Materiais">Materiais</option>
          <option value="Mão de Obra">Mão de Obra</option>
          <option value="Equipamentos">Equipamentos</option>
          <option value="Terceiros">Terceiros</option>
          <option value="Deslocamentos">Deslocamentos</option>
          <option value="Administração">Administração</option>
          <option value="Contingências">Contingências</option>
        </select>
      </div>

      <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex justify-between items-center text-xs">
        <span className="font-bold text-blue-800 uppercase">Total orçado</span>
        <span className="font-mono font-extrabold text-blue-900 text-sm">{formatBRL(total)}</span>
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
        <input type="checkbox" checked={jaContratado} onChange={(e) => setJaContratado(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-blue-600" />
        <span>
          Já contratado com este fornecedor
          <span className="block text-2xs text-slate-500">Sem marcar, entra apenas como <strong>orçado</strong> (contratado = R$ 0).</span>
        </span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2 px-4 rounded-lg text-xs transition">
          Cancelar
        </button>
        <button type="submit" disabled={salvando} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2 px-4 rounded-lg text-xs transition flex items-center gap-1.5">
          {salvando ? <Spinner size={12} /> : <FileCheck2 size={13} />}
          <span>Vincular</span>
        </button>
      </div>
    </form>
  );
}
