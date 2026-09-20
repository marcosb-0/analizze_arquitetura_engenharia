import { useEffect, useMemo, useState } from 'react';
import { usePresenca } from '../../hooks/usePresenca';
import { Printer } from 'lucide-react';
import { Cliente, ComponenteItemProposta, EmpresaConfig, ItemProposta, Proposta, SecaoProposta } from '../../types';
import { Aviso, Button } from '../ui';
import { calcularMateriaisProposta, modalidadeDaProposta, MODALIDADES } from '../../lib/materiaisProposta';
import { formatarDataBR } from '../../lib/data';
import { formatarPrazoCurto } from '../../lib/prazo';
import { formatBRL } from '../../lib/preco';
import { calcularTotaisDocumento } from '../../lib/documentoProposta';
import { SecaoNumerada, corpoEmLinhas, ehLista, montarDocumento } from '../../lib/secoesProposta';
import { useArmadilhaDeFoco } from '../../hooks/useArmadilhaDeFoco';
import { useEscapeParaFechar } from '../../hooks/useEscapeParaFechar';

interface Props {
  aberto: boolean;
  onCarregarComposicao: (itemId: string) => Promise<ComponenteItemProposta[] | null>;
  onFechar: () => void;
  proposta: Proposta;
  itens: ItemProposta[];
  /** O descritivo DESTA proposta — o texto do documento. */
  secoes: SecaoProposta[];
  cliente?: Cliente;
  /** Papel timbrado — vem de empresa_config, com fallback neutro. */
  timbre: EmpresaConfig;
  onAlternarBdiVisivel: (id: string, visivel: boolean) => Promise<void>;
}

/**
 * Um bloco de texto do documento.
 *
 * Corpo de várias linhas vira marcadores — é como "Condições comerciais"
 * continua saindo do jeito que sempre saiu, quando era um `text[]` na
 * configuração da empresa. Uma linha só é parágrafo: um bullet solto na frente
 * do escopo transformaria texto corrido numa lista de um item.
 */
function BlocoDeTexto({ secao }: { secao: SecaoNumerada }) {
  return (
    <div className="space-y-1.5 quebra-evitar">
      <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">
        {secao.numero}. {secao.titulo}
      </h3>
      {ehLista(secao.corpo) ? (
        <ul className="space-y-0.5">
          {corpoEmLinhas(secao.corpo).map((linha, i) => (
            <li key={i} className="text-xs text-slate-700 leading-relaxed flex gap-1.5">
              {/* Sem cor própria: herda a do item. Um marcador acinzentado
                  desaparece no papel, que é onde este componente vive. */}
              <span className="shrink-0" aria-hidden>•</span>
              <span>{linha}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{secao.corpo}</p>
      )}
    </div>
  );
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
  onCarregarComposicao,
  onFechar,
  proposta,
  itens,
  secoes,
  cliente,
  timbre,
  onAlternarBdiVisivel,
}: Props) {
  const armadilha = useArmadilhaDeFoco<HTMLDivElement>(aberto);
  useEscapeParaFechar(aberto, onFechar);
  // 150ms é o contrato com `.anim-dialogo-sai` em index.css: menos que isso e o
  // nó é removido no meio da animação de saída.
  const { montado, saindo } = usePresenca(aberto, 150);

  const [tentativa, setTentativa] = useState(0);
  const consultaChave = useMemo(() => ({ aberto, itens, tentativa, onCarregarComposicao }), [aberto, itens, tentativa, onCarregarComposicao]);
  const [consulta, setConsulta] = useState<{ chave: typeof consultaChave; componentes: ComponenteItemProposta[]; erro: boolean } | null>(null);
  const carregandoMateriais = consulta?.chave !== consultaChave;
  const erroMateriais = !carregandoMateriais && consulta?.erro === true;
  const modalidade = modalidadeDaProposta(secoes);
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    async function carregar() {
      try {
        const lista: ComponenteItemProposta[] = [];
        const compostos = itens.filter(i => i.qtdComponentes > 0);
        // Limita concorrência para propostas grandes e não usa o catálogo vivo.
        for (let i = 0; i < compostos.length; i += 4) {
          const grupo = await Promise.all(compostos.slice(i, i + 4).map(item => onCarregarComposicao(item.id)));
          if (!ativo) return;
          if (grupo.some(g => g === null)) throw new Error('Composição indisponível');
          lista.push(...grupo.flatMap(g => g ?? []));
        }
        if (ativo) setConsulta({ chave: consultaChave, componentes: lista, erro: false });
      } catch {
        if (ativo) setConsulta({ chave: consultaChave, componentes: [], erro: true });
      }
    }
    void carregar();
    return () => { ativo = false; };
  }, [aberto, itens, onCarregarComposicao, consultaChave]);
  const levantamento = useMemo(() => calcularMateriaisProposta(itens, consulta?.chave === consultaChave ? consulta.componentes : []), [itens, consulta, consultaChave]);

  const totais = useMemo(() => calcularTotaisDocumento(proposta, itens), [proposta, itens]);

  /**
   * Rede de segurança: proposta sem descritivo nenhum imprime a descrição como
   * seção 1, que é o comportamento que existia antes de 20260810100001. Vale
   * para o instante entre abrir a proposta e o descritivo chegar do servidor —
   * um documento sem escopo algum seria pior do que o de antes.
   */
  const documento = useMemo(
    () =>
      montarDocumento(
        secoes.length > 0
          ? secoes
          : [{ titulo: 'Escopo Técnico e Detalhes', corpo: proposta.descricao, posicao: 'antes', ordem: 0 }]
      ),
    [secoes, proposta.descricao]
  );

  return (
    <>
      {montado && (
        <div
          id="pdf-print-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização de impressão da proposta"
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto"
        >
          <div
            ref={armadilha}
            className={`${saindo ? "anim-dialogo-sai" : "anim-dialogo-entra"} bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col h-[94dvh]`}
          >
            {/* Header toolbar — some no papel via .no-print */}
            <div className="no-print p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-3 justify-between items-center shrink-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Printer size={18} className="text-blue-600" />
                  <h3 className="font-bold text-slate-800 text-sm">
                    Prévia da proposta
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
                      <span className="block text-2xs text-slate-500 leading-tight">
                        {proposta.bdiVisivelPdf
                          ? 'O BDI aparece separado dos serviços'
                          : 'Embutido nos preços unitários'}
                      </span>
                    </span>
                  </label>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* O cabeçalho não é editável aqui de propósito: ele é o mesmo
                    em todo documento emitido. Sem esta pista o usuário
                    procurava a edição dentro da proposta e não achava. */}
                <span className="text-2xs text-slate-500 leading-tight max-w-[210px] text-right hidden sm:block">
                  Cabeçalho e logo vêm de <strong className="text-slate-500">Configurações</strong>; os textos são
                  desta proposta, em <strong className="text-slate-500">Descritivo Técnico</strong>
                </span>
                <Button id="print-proposal-action-btn" disabled={carregandoMateriais || erroMateriais} onClick={() => window.print()}>
                  <Printer size={16} /><span>Salvar PDF / imprimir</span>
                </Button>
                <Button id="close-pdf-btn" variante="secundario" onClick={onFechar}>Fechar</Button>
              </div>
            </div>

            <div className="no-print px-4 py-2 border-b border-slate-200 text-xs text-slate-500">
              {carregandoMateriais ? <p role="status">Calculando os materiais das composições…</p> : erroMateriais ? (
                <Aviso tom="negativo" acoes={<Button variante="secundario" onClick={() => setTentativa(t => t + 1)}>Tentar novamente</Button>}>
                  Não foi possível carregar os materiais. A impressão será liberada após a consulta.
                </Aviso>
              ) : <p>Documento pronto. Na janela de impressão, escolha “Salvar como PDF”.{!modalidade && ' Modalidade não definida: confira o descritivo antes de enviar.'}</p>}
            </div>

            <p className="no-print sm:hidden px-4 py-1 text-2xs text-slate-500">Deslize a folha para os lados para conferir todas as colunas.</p>

            {/* Document body simulating technical print layout */}
            <div
              id="pdf-document-body"
              className="flex-1 min-h-0 p-4 sm:p-8 lg:p-10 bg-white overflow-auto font-sans text-slate-800 print:p-0"
            >
              <div className="proposta-papel max-w-3xl mx-auto space-y-6 text-left">
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
                    <p className="text-xs text-slate-500 mt-1 font-mono">
                      Emissão: {new Date().toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                {/* Client Box */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Preparada para
                  </h4>
                  <p className="text-xs font-bold text-slate-900">
                    {cliente?.nome ?? 'Cliente não encontrado'}
                  </p>
                  {cliente && (
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mt-2">
                      {cliente.cpfCnpj && <p>
                        CNPJ/CPF:{' '}
                        <strong className="text-slate-800 font-mono">{cliente.cpfCnpj}</strong>
                      </p>}
                      <p>
                        Contato: <strong className="text-slate-800">{cliente.responsavel}</strong>
                      </p>
                      <p className="col-span-2">
                        Endereço: <strong className="text-slate-800">{cliente.endereco}</strong>
                      </p>
                    </div>
                  )}
                </div>

                {/* O descritivo desta proposta. Antes eram dois blocos fixos: a
                    descrição da proposta e um parágrafo global da empresa, o
                    mesmo em toda obra. Agora a proposta decide quantas seções
                    tem, o que dizem e onde entram em relação ao preço. */}
                {documento.antes.map((secao) => (
                  <BlocoDeTexto key={`${secao.numero}-${secao.titulo}`} secao={secao} />
                ))}

                {/* Commercial specs */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">
                    {documento.numeroDosValores}. Valores e Prazos
                  </h3>

                  {itens.length > 0 ? (
                    /* A planilha de composição. Antes o documento entregue ao
                       cliente resumia todo o orçamento a uma linha só, mesmo
                       quando a proposta tinha sido montada item a item. */
                    <>
                      <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                        <thead className="bg-slate-50 text-slate-800 uppercase font-bold text-xs">
                          <tr>
                            <th scope="col" className="p-2 border-b border-slate-200 w-8">#</th>
                            <th scope="col" className="p-2 border-b border-slate-200">Descrição</th>
                            <th scope="col" className="p-2 border-b border-slate-200 w-14">Un.</th>
                            <th scope="col" className="p-2 border-b border-slate-200 text-right w-16">Qtd.</th>
                            <th scope="col" className="p-2 border-b border-slate-200 text-right w-24">
                              Preço unit.
                            </th>
                            <th scope="col" className="p-2 border-b border-slate-200 text-right w-28">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {totais.linhas.map((linha, i) => (
                            <tr key={linha.item.id}>
                              <td className="p-2 font-mono text-slate-500">{i + 1}</td>
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
                              Valor total da proposta
                            </td>
                            <td className="p-2.5 font-mono text-right text-emerald-700">
                              {formatBRL(totais.total)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>

                      <div className="grid grid-cols-2 gap-4 pt-2 quebra-evitar">
                        <div className="space-y-1">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
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
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
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
                          <th scope="col" className="p-2.5 border-b border-slate-200">
                            Descrição do Escopo do Serviço
                          </th>
                          <th scope="col" className="p-2.5 border-b border-slate-200">Prazo Estimado</th>
                          <th scope="col" className="p-2.5 border-b border-slate-200 text-right">Valor Global</th>
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
                            Valor total da proposta:
                          </td>
                          <td className="p-2.5 font-mono text-right text-emerald-700">
                            {formatBRL(proposta.valorEstimado)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Seções que vêm depois do preço: garantia, condições, foro. */}
                {!carregandoMateriais && !erroMateriais && (
                  <section className="space-y-3" aria-label="Quantitativos de materiais">
                    <div className="quebra-evitar">
                      <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">Quantitativos de materiais</h3>
                      <p className="mt-2 text-xs text-slate-600">
                        {modalidade === 'mao_de_obra' ? 'Materiais a fornecer pelo cliente.' : modalidade === 'mao_de_obra_material' ? 'Materiais previstos no fornecimento da contratada.' : 'Responsabilidade pelo fornecimento conforme o descritivo desta proposta.'}
                        {' '}Quantidade de cada atividade multiplicada pelos coeficientes de sua composição. Perdas adicionais e conversões de embalagem não são acrescentadas automaticamente.
                      </p>
                      {modalidade && <p className="mt-1 text-xs font-semibold text-slate-900">{MODALIDADES[modalidade].rotulo}</p>}
                    </div>
                    {levantamento.materiais.length > 0 ? (
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-800">
                          <tr><th scope="col" className="p-2">Material</th><th scope="col" className="p-2">Un.</th><th scope="col" className="p-2 text-right">Quantidade</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {levantamento.materiais.map(m => <tr key={m.chave}>
                            <td className="p-2"><span className="font-medium">{m.descricao}</span><span className="block text-2xs text-slate-500">{m.origens.join(' · ')}</span></td>
                            <td className="p-2 font-mono">{m.unidade}</td>
                            <td className="p-2 text-right font-mono">{m.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}</td>
                          </tr>)}
                        </tbody>
                      </table>
                    ) : <p className="text-xs text-slate-600">Nenhum material identificado nos itens e nas composições cadastradas.</p>}
                    {(levantamento.pendencias.length > 0 || itens.length === 0) && <div className="text-xs text-slate-700 space-y-1">
                      <p className="font-bold">Levantamento parcial — requer conferência</p>
                      <p>Serviços sem composição detalhada não permitem determinar todos os materiais necessários.</p>
                      <ul className="list-disc pl-5">{levantamento.pendencias.map(p => <li key={p}>{p}</li>)}</ul>
                    </div>}
                  </section>
                )}

                {documento.depois.map((secao) => (
                  <BlocoDeTexto key={`${secao.numero}-${secao.titulo}`} secao={secao} />
                ))}

                {/* A validade continua sendo linha gerada, e não texto livre:
                    sai de `data_validade`, o mesmo campo que a tela usa para
                    avisar que a proposta venceu. Deixá-la virar seção editável
                    permitiria imprimir uma data diferente da que o sistema
                    controla. */}
                {proposta.dataValidade && (
                  <div className="space-y-1 text-slate-500 text-xs leading-relaxed quebra-evitar">
                    <p>
                      • Validade dos preços expressos:{' '}
                      <strong>
                        Proposta válida até{' '}
                        {formatarDataBR(proposta.dataValidade)}
                      </strong>
                      .
                    </p>
                  </div>
                )}

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
          </div>
        </div>
      )}
    </>
  );
}
