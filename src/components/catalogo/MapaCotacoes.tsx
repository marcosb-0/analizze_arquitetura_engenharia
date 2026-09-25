import { useState } from 'react';
import { AlertTriangle, ArrowUpCircle, Plus, Star, Trash2, X } from 'lucide-react';
import { CotacaoFornecedor, Fornecedor, InsumoCatalogo } from '../../types';
import { cotacaoVencida, idadeCotacao, formatBRL } from '../../lib/preco';
import { formatarDataBR, hojeISO } from '../../lib/data';
import { useFeedback } from '../FeedbackContext';
import { Button, Chip, Field, IconButton, Input, Select } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { lerDecimal, naoEscolhido, vazio } from '../../lib/validacao';

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
  const { erros, validar, limparErro, areaRef } = useValidacao<'fornecedor' | 'preco' | 'validade'>();

  const [mostrandoForm, setMostrandoForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [fornecedorId, setFornecedorId] = useState('');
  const [preco, setPreco] = useState('');
  const [prazo, setPrazo] = useState('');
  const [validade, setValidade] = useState('30');
  const [observacao, setObservacao] = useState('');

  const nomeFornecedor = (id?: string) => fornecedores.find((f) => f.id === id)?.empresa ?? 'Não especificado';

  /**
   * O fornecedor nasce VAZIO. Nascia com o primeiro da lista escolhido, e aí a
   * checagem de "escolha o fornecedor" nunca disparava — a cotação ia para quem
   * estivesse no topo em ordem alfabética sem ninguém ter escolhido.
   */
  const abrirForm = () => {
    setFornecedorId('');
    setPreco('');
    setPrazo('');
    setValidade('30');
    setObservacao('');
    setMostrandoForm(true);
  };

  const registrarCotacao = async () => {
    // `lerDecimal` e não `parseFloat`: `parseFloat('12,50')` dá 12, e o campo
    // era `type="number"`, que em parte dos navegadores recusa a vírgula.
    const precoNum = lerDecimal(preco);
    const validadeNum = validade.trim() ? Number(validade) : 30;
    if (
      !validar([
        { campo: 'fornecedor', invalido: naoEscolhido(fornecedorId), erro: 'Escolha o fornecedor da cotação.' },
        { campo: 'preco', invalido: vazio(preco), erro: 'Informe o preço unitário.' },
        {
          campo: 'preco',
          invalido: Number.isNaN(precoNum) || precoNum <= 0,
          erro: 'O preço unitário deve ser um número maior que zero — ex.: 12,50.',
        },
        {
          campo: 'validade',
          invalido: !Number.isInteger(validadeNum) || validadeNum <= 0,
          erro: 'A validade é um número inteiro de dias, maior que zero.',
        },
      ])
    ) return;
    setSalvando(true);
    const criada = await onAddCotacao(insumo.id, {
      fornecedorId,
      precoUnitario: precoNum,
      dataCotacao: hojeISO(),
      prazoEntregaDias: prazo ? parseInt(prazo, 10) : undefined,
      observacao: observacao || undefined,
      validadeDias: validadeNum,
      ativa: true,
    });
    setSalvando(false);
    if (criada) {
      await recarregarDetalhe();
      setMostrandoForm(false);
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
      tone: 'normal',
      confirmLabel: 'Adotar preço',
      onConfirm: async () => {
        const ok = await onAdotarPrecoCotacao(insumo.id, cotacao.precoUnitario);
        if (ok) await recarregarDetalhe();
      },
    });
  };

  const vigentes = cotacoes.filter((c) => c.ativa && !cotacaoVencida(c));
  const menor = vigentes.length ? Math.min(...vigentes.map((c) => c.precoUnitario)) : null;
  // Ativas primeiro, e entre elas a mais barata no topo: é a ordem em que se decide.
  const ordenadas = [...cotacoes].sort(
    (a, b) => Number(b.ativa && !cotacaoVencida(b)) - Number(a.ativa && !cotacaoVencida(a)) || a.precoUnitario - b.precoUnitario
  );

  return (
    <section className="space-y-2.5">
      <div className="flex h-7 items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">
          Cotações{' '}
          {cotacoes.length > 0 && (
            <span className="data-font text-xs font-semibold text-slate-500">
              {vigentes.length} vigente{vigentes.length === 1 ? '' : 's'} de {cotacoes.length}
            </span>
          )}
        </h3>
        {mostrandoForm ? (
          <Button variante="fantasma" tamanho="sm" onClick={() => setMostrandoForm(false)}>
            <X size={13} />
            <span>Cancelar</span>
          </Button>
        ) : (
          <Button
            variante="secundario"
            tamanho="sm"
            onClick={abrirForm}
            disabled={fornecedores.length === 0}
            title={fornecedores.length === 0 ? 'Cadastre um fornecedor na aba Fornecedores primeiro' : undefined}
          >
            <Plus size={13} />
            <span>Nova cotação</span>
          </Button>
        )}
      </div>

      {mostrandoForm && (
        <form
          ref={areaRef as React.RefObject<HTMLFormElement>}
          onSubmit={(e) => { e.preventDefault(); registrarCotacao(); }}
          className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
        >
          <Field className="space-y-1" label="Fornecedor" erro={erros.fornecedor} required>
            {(props) => (
              <Select
                {...props}
                value={fornecedorId}
                onChange={(e) => { setFornecedorId(e.target.value); limparErro('fornecedor'); }}
                autoFocus
              >
                <option value="">Escolha o fornecedor…</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.empresa}</option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Field className="space-y-1" label={`Preço por ${insumo.unidade}`} erro={erros.preco} required>
              {(props) => (
                <Input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={preco}
                  onChange={(e) => { setPreco(e.target.value); limparErro('preco'); }}
                  icone={<span className="text-2xs">R$</span>}
                  mono
                />
              )}
            </Field>
            <Field className="space-y-1" label="Entrega">
              {(props) => (
                <Input
                  {...props}
                  type="text"
                  inputMode="numeric"
                  placeholder="—"
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value.replace(/\D/g, ''))}
                  sufixo="dias"
                  mono
                />
              )}
            </Field>
            <Field className="space-y-1" label="Validade" erro={erros.validade}>
              {(props) => (
                <Input
                  {...props}
                  type="text"
                  inputMode="numeric"
                  value={validade}
                  onChange={(e) => { setValidade(e.target.value.replace(/\D/g, '')); limparErro('validade'); }}
                  sufixo="dias"
                  mono
                />
              )}
            </Field>
          </div>
          <Field className="space-y-1" label="Condição comercial">
            {(props) => (
              <Input
                {...props}
                type="text"
                placeholder="Ex.: preço especial acima de 100 sacos"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            )}
          </Field>
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xs text-slate-500">Depois da validade a cotação para de concorrer a melhor preço.</p>
            <Button type="submit" tamanho="sm" carregando={salvando} disabled={salvando}>
              Salvar cotação
            </Button>
          </div>
        </form>
      )}

      {cotacoes.length === 0 ? (
        !mostrandoForm && (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
            Nenhuma cotação registrada. Uma cotação vigente vira a procedência mais firme do preço.
          </p>
        )
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
          {ordenadas.map((c) => {
            const vencida = cotacaoVencida(c);
            const melhorAtiva = c.ativa && !vencida && c.precoUnitario === menor;
            const diferenca = insumo.precoReferencia - c.precoUnitario;
            return (
              <li key={c.id} className={`px-3.5 py-3 text-xs ${c.ativa ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-semibold text-slate-900">{nomeFornecedor(c.fornecedorId)}</span>
                      {melhorAtiva && (
                        <Chip tom="positivo"><Star size={11} aria-hidden="true" />Menor preço</Chip>
                      )}
                      {!c.ativa && <Chip tom="neutro">Desativada</Chip>}
                      {c.ativa && vencida && (
                        <Chip tom="atencao"><AlertTriangle size={11} aria-hidden="true" />Vencida</Chip>
                      )}
                    </div>
                    <p className="text-2xs text-slate-500">
                      <span className="data-font">{formatarDataBR(c.dataCotacao)}</span> · há {idadeCotacao(c)}d, vale{' '}
                      {c.validadeDias}d · entrega{' '}
                      {c.prazoEntregaDias !== undefined ? `em ${c.prazoEntregaDias}d` : 'sob consulta'}
                    </p>
                    {c.observacao && <p className="text-2xs text-slate-600">{c.observacao}</p>}
                  </div>

                  <div className="shrink-0 text-right">
                    <span className={`data-font block text-base font-bold ${melhorAtiva ? 'text-emerald-700' : 'text-slate-900'}`}>
                      {formatBRL(c.precoUnitario)}
                    </span>
                    {c.ativa && !vencida && Math.abs(diferenca) >= 0.005 && (
                      <span className={`data-font block text-2xs ${diferenca > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {formatBRL(Math.abs(diferenca))} {diferenca > 0 ? 'abaixo' : 'acima'} da referência
                      </span>
                    )}
                  </div>
                </div>

                {c.ativa && (
                  <div className="mt-2 flex items-center justify-end gap-1">
                    {/* Composição não aceita preço de fora: o banco
                        sobrescreve com a soma dos componentes, e o
                        botão "adotaria" um valor que não pega. */}
                    {c.precoUnitario !== insumo.precoReferencia && !ehComposicao && (
                      <Button
                        variante="acao"
                        tamanho="sm"
                        onClick={() => adotarPreco(c)}
                        title="Tornar este o preço de referência global (registra no histórico)"
                      >
                        <ArrowUpCircle size={12} />
                        <span>Adotar como referência</span>
                      </Button>
                    )}
                    <IconButton
                      rotulo="Desativar cotação (preserva o registro)"
                      tom="perigo"
                      tamanho="sm"
                      onClick={() => desativarCotacao(c)}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
