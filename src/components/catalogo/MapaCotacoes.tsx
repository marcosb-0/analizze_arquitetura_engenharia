import { useState } from 'react';
import { AlertTriangle, ArrowUpCircle, Trash2 } from 'lucide-react';
import { CotacaoFornecedor, Fornecedor, InsumoCatalogo } from '../../types';
import { cotacaoVencida, idadeCotacao, formatBRL } from '../../lib/preco';
import { formatarDataBR, hojeISO } from '../../lib/data';
import { useFeedback } from '../FeedbackContext';
import { Button, Field, IconButton, Input, Select } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { naoEscolhido, vazio } from '../../lib/validacao';

interface MapaCotacoesProps {
  insumo: InsumoCatalogo;
  cotacoes: CotacaoFornecedor[];
  fornecedores: Fornecedor[];
  /** Composição não aceita preço de fora — o banco sobrescreve com a soma dos componentes. */
  ehComposicao: boolean;
  onAddCotacao: (insumoId: string, quote: CotacaoFornecedor) => Promise<CotacaoFornecedor | null>;
  onDesativarCotacao: (insumoId: string, cotacaoId: string) => Promise<void>;
  onAdotarPrecoCotacao: (insumoId: string, preco: number) => Promise<InsumoCatalogo | null>;
  recarregarDetalhe: () => Promise<void>;
}

export default function MapaCotacoes({
  insumo,
  cotacoes,
  fornecedores,
  ehComposicao,
  onAddCotacao,
  onDesativarCotacao,
  onAdotarPrecoCotacao,
  recarregarDetalhe,
}: MapaCotacoesProps) {
  const { toast, confirm } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'fornecedor' | 'preco'>();

  const [mostrandoForm, setMostrandoForm] = useState(false);
  const [fornecedorId, setFornecedorId] = useState('');
  const [preco, setPreco] = useState('');
  const [prazo, setPrazo] = useState('');
  const [validade, setValidade] = useState('30');
  const [observacao, setObservacao] = useState('');

  const nomeFornecedor = (id?: string) => fornecedores.find((f) => f.id === id)?.empresa ?? 'Não especificado';

  const registrarCotacao = async () => {
    const precoNum = parseFloat(preco);
    if (
      !validar([
        { campo: 'fornecedor', invalido: naoEscolhido(fornecedorId), erro: 'Escolha o fornecedor da cotação.' },
        { campo: 'preco', invalido: vazio(preco), erro: 'Informe o preço unitário.' },
        {
          campo: 'preco',
          invalido: Number.isNaN(precoNum) || precoNum <= 0,
          erro: 'O preço unitário deve ser maior que zero.',
        },
      ])
    ) return;
    const validadeNum = parseInt(validade, 10);
    const criada = await onAddCotacao(insumo.id, {
      fornecedorId,
      precoUnitario: precoNum,
      dataCotacao: hojeISO(),
      prazoEntregaDias: prazo ? parseInt(prazo, 10) : undefined,
      observacao: observacao || undefined,
      validadeDias: Number.isFinite(validadeNum) && validadeNum > 0 ? validadeNum : 30,
      ativa: true,
    });
    if (criada) {
      await recarregarDetalhe();
      setMostrandoForm(false);
      setPreco('');
      setPrazo('');
      setObservacao('');
      toast.success('Cotação registrada.');
    }
  };

  const desativarCotacao = (cotacao: CotacaoFornecedor) => {
    if (!cotacao.id) return;
    confirm({
      title: 'Desativar cotação',
      message: `A cotação de ${formatBRL(cotacao.precoUnitario)} de "${nomeFornecedor(cotacao.fornecedorId)}" deixa de concorrer a melhor preço, mas continua no histórico de negociação. Confirmar?`,
      onConfirm: async () => {
        await onDesativarCotacao(insumo.id, cotacao.id!);
        await recarregarDetalhe();
        toast.success('Cotação desativada.', 'O registro foi preservado no histórico.');
      },
    });
  };

  const adotarPreco = (cotacao: CotacaoFornecedor) => {
    confirm({
      title: 'Adotar como preço de referência',
      message: `O preço de referência global de "${insumo.descricao}" passa de ${formatBRL(insumo.precoReferencia)} para ${formatBRL(cotacao.precoUnitario)}. O ponto entra no histórico com origem "Fornecedor". Confirmar?`,
      onConfirm: async () => {
        const ok = await onAdotarPrecoCotacao(insumo.id, cotacao.precoUnitario);
        if (ok) await recarregarDetalhe();
      },
    });
  };

  const vigentes = cotacoes.filter((c) => c.ativa && !cotacaoVencida(c));
  const menor = vigentes.length ? Math.min(...vigentes.map((c) => c.precoUnitario)) : null;

  return (
    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Mapa de cotações</span>
        <button
          type="button"
          onClick={() => {
            setMostrandoForm(!mostrandoForm);
            setFornecedorId(fornecedores[0]?.id ?? '');
            setPreco('');
            setPrazo('');
            setValidade('30');
            setObservacao('');
          }}
          className="text-2xs text-blue-600 hover:text-blue-700 font-bold"
        >
          {mostrandoForm ? 'Cancelar' : '+ Nova cotação'}
        </button>
      </div>

      {mostrandoForm && (
        <div ref={areaRef as React.RefObject<HTMLDivElement>} className="bg-white p-3 rounded-lg border border-slate-200 space-y-2.5 text-xs">
          <Field className="space-y-1" label="Fornecedor" erro={erros.fornecedor} required>
            {(props) => (
              <Select
                {...props}
                value={fornecedorId}
                onChange={(e) => { setFornecedorId(e.target.value); limparErro('fornecedor'); }} fundo="suave"
              >
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.empresa}</option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field className="space-y-1" label="Preço unit. (R$)" erro={erros.preco} required>
              {(props) => (
                <Input
                  {...props}
                  type="number" step="any" min="0.01" value={preco} onChange={(e) => { setPreco(e.target.value); limparErro('preco'); }} mono fundo="suave" className="font-bold"
                />
              )}
            </Field>
            <Field className="space-y-1" label="Entrega (dias)">
              {(props) => (
                <Input
                  {...props}
                  type="number" min="0" value={prazo} onChange={(e) => setPrazo(e.target.value)} fundo="suave"
                />
              )}
            </Field>
            <Field
              className="space-y-1"
              label="Validade (dias)"
              hint="Depois desse prazo a cotação para de concorrer a melhor preço."
            >
              {(props) => (
                <Input
                  {...props}
                  type="number" min="1" value={validade} onChange={(e) => setValidade(e.target.value)} fundo="suave"
                />
              )}
            </Field>
          </div>
          <Field className="space-y-1" label="Condição comercial">
            {(props) => (
              <Input
                {...props}
                type="text" placeholder="Ex: preço especial acima de 100 sacos" value={observacao} onChange={(e) => setObservacao(e.target.value)} fundo="suave"
              />
            )}
          </Field>
          <Button type="button" onClick={registrarCotacao} bloco>
            Salvar cotação
          </Button>
        </div>
      )}

      <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs">
        <div>
          <span className="text-2xs text-slate-500 font-bold block uppercase tracking-wider">Referência do catálogo</span>
          <p className="font-bold text-slate-800">{insumo.precoFonte}</p>
        </div>
        <div className="text-right">
          <span className="font-mono font-bold text-slate-800">{formatBRL(insumo.precoReferencia)}</span>
          <span className="text-2xs text-slate-500 block">por {insumo.unidade}</span>
        </div>
      </div>

      {cotacoes.length === 0 ? (
        <div className="p-4 text-center border border-dashed border-slate-200 rounded-lg text-2xs text-slate-500">
          Nenhuma cotação registrada para este insumo.
        </div>
      ) : (
        cotacoes.map((c) => {
          const vencida = cotacaoVencida(c);
          const melhorAtiva = c.ativa && !vencida && c.precoUnitario === menor;
          return (
            <div
              key={c.id}
              className={`p-2.5 bg-white border rounded-lg text-xs transition ${
                !c.ativa ? 'border-slate-200 opacity-50'
                : melhorAtiva ? 'border-emerald-200 bg-emerald-50/10'
                : vencida ? 'border-amber-200 bg-amber-50/10'
                : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-extrabold text-slate-800 truncate">{nomeFornecedor(c.fornecedorId)}</span>
                    {melhorAtiva && (
                      <span className="bg-emerald-50 text-emerald-700 text-2xs font-extrabold px-1.5 py-0.5 rounded-full border border-emerald-100 shrink-0">
                        ★ Menor preço
                      </span>
                    )}
                    {!c.ativa && (
                      <span className="bg-slate-100 text-slate-500 text-2xs font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                        Desativada
                      </span>
                    )}
                    {c.ativa && vencida && (
                      <span className="bg-amber-50 text-amber-700 text-2xs font-extrabold px-1.5 py-0.5 rounded-full border border-amber-100 shrink-0 flex items-center gap-0.5">
                        <AlertTriangle size={8} /> Vencida
                      </span>
                    )}
                  </div>
                  <div className="text-2xs text-slate-500 font-medium space-x-2">
                    <span>Entrega: {c.prazoEntregaDias !== undefined ? `${c.prazoEntregaDias}d` : 'sob consulta'}</span>
                    <span>•</span>
                    <span>
                      {formatarDataBR(c.dataCotacao)} ({idadeCotacao(c)}d atrás, vale {c.validadeDias}d)
                    </span>
                  </div>
                  {c.observacao && <p className="text-2xs text-slate-500 italic mt-0.5">"{c.observacao}"</p>}
                </div>

                <div className="text-right shrink-0">
                  <span className={`font-mono font-extrabold block ${melhorAtiva ? 'text-emerald-600' : 'text-slate-800'}`}>
                    {formatBRL(c.precoUnitario)}
                  </span>
                  <span className="text-2xs text-slate-500 block">por {insumo.unidade}</span>
                </div>
              </div>

              {c.ativa && (
                <div className="flex items-center justify-end gap-1 mt-1.5 pt-1.5 border-t border-slate-100">
                  {/* Composição não aceita preço de fora: o banco
                      sobrescreve com a soma dos componentes, e o
                      botão "adotaria" um valor que não pega. */}
                  {c.precoUnitario !== insumo.precoReferencia && !ehComposicao && (
                    <button
                      type="button"
                      onClick={() => adotarPreco(c)}
                      className="text-2xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-blue-50 transition"
                      title="Tornar este o preço de referência global (registra no histórico)"
                    >
                      <ArrowUpCircle size={10} /> Adotar como referência
                    </button>
                  )}
                  <IconButton
                    rotulo="Desativar (preserva o registro)"
                    tom="perigo"
                    tamanho="sm"
                    onClick={() => desativarCotacao(c)}
                  >
                    <Trash2 size={11} />
                  </IconButton>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
