import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Printer } from 'lucide-react';
import { Cliente, EmpresaConfig, ItemProposta, Proposta } from '../../types';
import { formatarDataBR } from '../../lib/data';
import { formatarPrazoCurto } from '../../lib/prazo';
import { formatBRL } from '../../lib/preco';
import { calcularTotaisDocumento } from '../../lib/documentoProposta';
import { useArmadilhaDeFoco } from '../../hooks/useArmadilhaDeFoco';
import { useEscapeParaFechar } from '../../hooks/useEscapeParaFechar';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  proposta: Proposta;
  itens: ItemProposta[];
  cliente?: Cliente;
  /** Papel timbrado — vem de empresa_config, com fallback neutro. */
  timbre: EmpresaConfig;
  onAlternarBdiVisivel: (id: string, visivel: boolean) => Promise<void>;
}

/**
 * Pré-visualização de impressão da proposta.
 *
 * Não cabe no primitivo `<Modal>`: a barra de ferramentas ocupa o lugar do
 * cabeçalho e a altura fixa é de que o CSS de impressão depende. Mas o teclado
 * tem de funcionar igual — Esc fecha e o Tab circula dentro do diálogo.
 */
export default function DocumentoProposta({
  aberto,
  onFechar,
  proposta,
  itens,
  cliente,
  timbre,
  onAlternarBdiVisivel,
}: Props) {
  const armadilha = useArmadilhaDeFoco<HTMLDivElement>(aberto);
  useEscapeParaFechar(aberto, onFechar);

  const totais = useMemo(() => calcularTotaisDocumento(proposta, itens), [proposta, itens]);

  return (
    <AnimatePresence>
      {aberto && (
        <div
          id="pdf-print-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização de impressão da proposta"
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
        >
          <motion.div
            ref={armadilha}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-lg shadow-2xl w-full max-w-4xl flex flex-col h-[90vh]"
          >
            {/* Header toolbar — some no papel via .no-print */}
            <div className="no-print p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Printer size={18} className="text-blue-600" />
                  <h3 className="font-bold text-slate-800 text-sm">
                    Visualização de Impressão Comercial
                  </h3>
                </div>

                {/* Fica aqui, e não no cadastro, porque o efeito é visível no
                    documento ao lado no instante em que se marca. */}
                {itens.length > 0 && proposta.bdiPercentual !== 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none border-l border-slate-200 pl-3">
                    <input
                      type="checkbox"
                      checked={proposta.bdiVisivelPdf}
                      onChange={(e) => onAlternarBdiVisivel(proposta.id, e.target.checked)}
                      className="accent-blue-600 cursor-pointer"
                    />
                    <span>
                      Mostrar BDI como linha
                      <span className="block text-2xs text-slate-400 leading-tight">
                        {proposta.bdiVisivelPdf
                          ? 'A margem aparece separada do custo'
                          : 'Embutido nos preços unitários'}
                      </span>
                    </span>
                  </label>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* O cabeçalho não é editável aqui de propósito: ele é o mesmo
                    em todo documento emitido. Sem esta pista o usuário
                    procurava a edição dentro da proposta e não achava. */}
                <span className="text-2xs text-slate-400 leading-tight max-w-[190px] text-right hidden sm:block">
                  Cabeçalho, logo e condições vêm de{' '}
                  <strong className="text-slate-500">Empresa › Dados da Empresa</strong>
                </span>
                <button
                  id="print-proposal-action-btn"
                  onClick={() => window.print()}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition active:scale-95"
                >
                  <Printer size={12} />
                  <span>Imprimir</span>
                </button>
                <button
                  id="close-pdf-btn"
                  onClick={onFechar}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-3 py-1.5 rounded text-xs transition active:scale-95"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Document body simulating technical print layout */}
            <div
              id="pdf-document-body"
              className="flex-1 p-10 bg-white overflow-y-auto font-sans text-slate-800 print:p-0"
            >
              <div className="max-w-3xl mx-auto space-y-6 text-left">
                {/* Cabeçalho: tudo vem de empresa_config, editável na aba
                    Empresa. Antes era constante de código — trocar um telefone
                    no papel entregue ao cliente exigia deploy. */}
                <div className="flex justify-between items-start border-b-2 border-blue-600 pb-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {timbre.logoUrl && (
                      <img
                        src={timbre.logoUrl}
                        alt={`Logotipo de ${timbre.razaoSocial}`}
                        className="h-14 w-auto max-w-[160px] object-contain shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                        {timbre.razaoSocial}
                      </h1>
                      {(timbre.cnpj || timbre.crea) && (
                        <p className="text-xs text-slate-500 font-mono">
                          {[timbre.cnpj && `CNPJ: ${timbre.cnpj}`, timbre.crea && `CREA: ${timbre.crea}`]
                            .filter(Boolean)
                            .join(' | ')}
                        </p>
                      )}
                      {timbre.endereco && <p className="text-xs text-slate-500">{timbre.endereco}</p>}
                      {(timbre.telefone || timbre.email || timbre.site) && (
                        <p className="text-xs text-slate-500">
                          {[timbre.telefone, timbre.email, timbre.site].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      PROPOSTA DE ORÇAMENTO
                    </h2>
                    <span className="text-xs font-mono font-bold text-blue-600 block">
                      {proposta.numero}
                    </span>
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      Emissão: {new Date().toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                {/* Client Box */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Dados do Cliente Solicitante
                  </h4>
                  <p className="text-xs font-bold text-slate-900">
                    {cliente?.nome ?? 'Cliente não encontrado'}
                  </p>
                  {cliente && (
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mt-2">
                      <p>
                        CNPJ/CPF:{' '}
                        <strong className="text-slate-800 font-mono">{cliente.cpfCnpj}</strong>
                      </p>
                      <p>
                        Contato: <strong className="text-slate-800">{cliente.responsavel}</strong>
                      </p>
                      <p className="col-span-2">
                        Endereço: <strong className="text-slate-800">{cliente.endereco}</strong>
                      </p>
                    </div>
                  )}
                </div>

                {/* Scope */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">
                    1. Escopo Técnico e Detalhes
                  </h3>
                  <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                    {proposta.descricao}
                  </p>
                  {timbre.textoEscopo && (
                    <p className="text-xs text-slate-500 leading-relaxed font-light">
                      {timbre.textoEscopo}
                    </p>
                  )}
                </div>

                {/* Commercial specs */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">
                    2. Valores e Prazos
                  </h3>

                  {itens.length > 0 ? (
                    /* A planilha de composição. Antes o documento entregue ao
                       cliente resumia todo o orçamento a uma linha só, mesmo
                       quando a proposta tinha sido montada item a item. */
                    <>
                      <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                        <thead className="bg-slate-50 text-slate-800 uppercase font-bold text-xs">
                          <tr>
                            <th className="p-2 border-b border-slate-200 w-8">#</th>
                            <th className="p-2 border-b border-slate-200">Descrição</th>
                            <th className="p-2 border-b border-slate-200 w-14">Un.</th>
                            <th className="p-2 border-b border-slate-200 text-right w-16">Qtd.</th>
                            <th className="p-2 border-b border-slate-200 text-right w-24">
                              Preço unit.
                            </th>
                            <th className="p-2 border-b border-slate-200 text-right w-28">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {totais.linhas.map((linha, i) => (
                            <tr key={linha.item.id}>
                              <td className="p-2 font-mono text-slate-400">{i + 1}</td>
                              <td className="p-2 font-medium">{linha.item.descricao}</td>
                              <td className="p-2 font-mono text-slate-500">{linha.item.unidade}</td>
                              <td className="p-2 font-mono text-right">{linha.item.quantidade}</td>
                              <td className="p-2 font-mono text-right">
                                {formatBRL(linha.precoUnitario)}
                              </td>
                              <td className="p-2 font-mono font-bold text-right">
                                {formatBRL(linha.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="quebra-evitar">
                          {/* Com o BDI embutido não há subtotal a mostrar: os
                              preços unitários já são os de venda, e uma linha de
                              "subtotal" igual ao total só confundiria. */}
                          {!totais.bdiEmbutido && (
                            <>
                              <tr className="bg-slate-50 border-t border-slate-200">
                                <td colSpan={5} className="p-2 text-right font-semibold">
                                  Subtotal dos serviços
                                </td>
                                <td className="p-2 font-mono font-bold text-right">
                                  {formatBRL(totais.subtotal)}
                                </td>
                              </tr>
                              {proposta.bdiPercentual !== 0 && (
                                <tr className="bg-slate-50">
                                  <td colSpan={5} className="p-2 text-right font-semibold">
                                    BDI ({proposta.bdiPercentual}%)
                                  </td>
                                  <td className="p-2 font-mono font-bold text-right">
                                    {formatBRL(totais.bdiValor)}
                                  </td>
                                </tr>
                              )}
                            </>
                          )}
                          <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                            <td colSpan={5} className="p-2.5 text-right uppercase">
                              Investimento Global Totalizador
                            </td>
                            <td className="p-2.5 font-mono text-right text-emerald-700">
                              {formatBRL(totais.total)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>

                      <div className="grid grid-cols-2 gap-4 pt-2 quebra-evitar">
                        <div className="space-y-1">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Composição por categoria
                          </h4>
                          {totais.porCategoria.map(([categoria, valor]) => (
                            <div
                              key={categoria}
                              className="flex justify-between text-xs border-b border-slate-100 py-0.5"
                            >
                              <span className="text-slate-600">{categoria}</span>
                              <span className="font-mono font-semibold text-slate-800">
                                {formatBRL(valor)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Prazo de execução
                          </h4>
                          <p className="text-xs font-semibold text-slate-800">
                            {formatarPrazoCurto(proposta.prazoExecucaoDias)}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Proposta ainda sem itens: o valor digitado é tudo o que
                       existe, então o resumo de uma linha continua honesto. */
                    <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                      <thead className="bg-slate-50 text-slate-800 uppercase font-bold text-xs">
                        <tr>
                          <th className="p-2.5 border-b border-slate-200">
                            Descrição do Escopo do Serviço
                          </th>
                          <th className="p-2.5 border-b border-slate-200">Prazo Estimado</th>
                          <th className="p-2.5 border-b border-slate-200 text-right">Valor Global</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        <tr>
                          <td className="p-2.5 font-medium">{proposta.descricao}</td>
                          <td className="p-2.5">{formatarPrazoCurto(proposta.prazoExecucaoDias)}</td>
                          <td className="p-2.5 font-mono font-bold text-right">
                            {formatBRL(proposta.valorEstimado)}
                          </td>
                        </tr>
                        <tr className="bg-slate-50 font-bold text-xs">
                          <td colSpan={2} className="p-2.5 text-right uppercase">
                            Investimento Global Totalizador:
                          </td>
                          <td className="p-2.5 font-mono text-right text-emerald-700">
                            {formatBRL(proposta.valorEstimado)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>

                {/* General clauses */}
                <div className="space-y-1 text-slate-500 text-xs leading-relaxed quebra-evitar">
                  <h3 className="text-xs font-bold text-slate-800 uppercase">
                    Observações Legais e Condições
                  </h3>
                  {proposta.dataValidade && (
                    <p>
                      • Validade dos preços expressos:{' '}
                      <strong>
                        Esta proposta expira impreterivelmente em{' '}
                        {formatarDataBR(proposta.dataValidade)}
                      </strong>
                      .
                    </p>
                  )}
                  {timbre.condicoes.map((condicao) => (
                    <p key={condicao}>• {condicao}</p>
                  ))}
                </div>

                {/* Signature blocks */}
                <div className="grid grid-cols-2 gap-10 pt-10 quebra-evitar">
                  <div className="text-center space-y-1.5 border-t border-slate-300 pt-2.5">
                    <p className="text-xs font-bold text-slate-800 uppercase">{timbre.razaoSocial}</p>
                    {timbre.responsavelTecnico && (
                      <p className="text-xs text-slate-500">{timbre.responsavelTecnico}</p>
                    )}
                  </div>
                  <div className="text-center space-y-1.5 border-t border-slate-300 pt-2.5">
                    <p className="text-xs font-bold text-slate-800">CLIENTE SOLICITANTE</p>
                    <p className="text-xs text-slate-500">Assinatura de Aceite e Aprovação</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
