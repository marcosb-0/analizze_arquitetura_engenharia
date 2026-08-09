import { AnimatePresence, motion } from 'motion/react';
import { Printer } from 'lucide-react';
import { ClausulaContrato, Cliente, Contrato, EmpresaConfig } from '../../types';
import { formatarDataBR } from '../../lib/data';
import { formatarPrazoCurto } from '../../lib/prazo';
import { formatBRL } from '../../lib/preco';
import { corpoEmLinhas, ehLista } from '../../lib/secoesProposta';
import { rotuloClausula } from '../../lib/ordinais';
import { useArmadilhaDeFoco } from '../../hooks/useArmadilhaDeFoco';
import { useEscapeParaFechar } from '../../hooks/useEscapeParaFechar';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  contrato: Contrato;
  clausulas: ClausulaContrato[];
  cliente?: Cliente;
  /** Papel timbrado — o mesmo `empresa_config` da proposta. */
  timbre: EmpresaConfig;
}

/**
 * O contrato impresso.
 *
 * Reusa o CSS de impressão da proposta sem nenhuma mudança em `index.css`:
 * mesmo `#pdf-document-body`, mesmo `.no-print` na barra, mesmo `.quebra-evitar`
 * nos blocos que não podem ser partidos entre páginas. Continua sendo
 * `window.print()` + "Salvar como PDF" — não há biblioteca de PDF no projeto, e
 * acrescentar uma para um segundo documento seria pagar 200 KB por nada.
 *
 * O que muda em relação à proposta é o conteúdo jurídico: qualificação das
 * partes, cláusulas numeradas por extenso, quadro-resumo e testemunhas.
 */
export default function DocumentoContrato({
  aberto,
  onFechar,
  contrato,
  clausulas,
  cliente,
  timbre,
}: Props) {
  const armadilha = useArmadilhaDeFoco<HTMLDivElement>(aberto);
  useEscapeParaFechar(aberto, onFechar);

  // Cláusula sem texto não vira cláusula no papel — e, o que importa mais, não
  // consome um número. "CLÁUSULA TERCEIRA" seguida de nada é defeito visível.
  const impressas = [...clausulas]
    .filter((c) => c.corpo.trim() !== '')
    .sort((a, b) => a.ordem - b.ordem);

  const resumo: [string, string][] = [
    ['Valor total', formatBRL(contrato.valorTotal)],
    ['Prazo de execução', formatarPrazoCurto(contrato.prazoExecucaoDias)],
    ...(contrato.dataInicio
      ? ([['Início previsto', formatarDataBR(contrato.dataInicio)]] as [string, string][])
      : []),
    ...(contrato.formaPagamento
      ? ([['Forma de pagamento', contrato.formaPagamento]] as [string, string][])
      : []),
    ...(contrato.reajuste
      ? ([['Reajuste', [contrato.reajuste, contrato.indiceReajuste].filter(Boolean).join(' · ')]] as [string, string][])
      : []),
    ...(contrato.multaPercentual != null
      ? ([['Multa por inadimplemento', `${contrato.multaPercentual}%`]] as [string, string][])
      : []),
    ...(contrato.jurosMoraPercentual != null
      ? ([['Juros de mora', `${contrato.jurosMoraPercentual}% ao mês`]] as [string, string][])
      : []),
    ...(contrato.garantiaMeses
      ? ([['Garantia', `${contrato.garantiaMeses} meses`]] as [string, string][])
      : []),
  ];

  return (
    <AnimatePresence>
      {aberto && (
        <div
          id="pdf-print-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização de impressão do contrato"
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
            <div className="no-print p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">Visualização do Contrato</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-slate-500 leading-tight max-w-[210px] text-right hidden sm:block">
                  Cabeçalho e logo vêm de <strong className="text-slate-500">Empresa</strong>; as
                  cláusulas são deste contrato
                </span>
                <button
                  id="print-contract-action-btn"
                  onClick={() => window.print()}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition active:scale-95"
                >
                  <Printer size={12} />
                  <span>Imprimir</span>
                </button>
                <button
                  id="close-contract-pdf-btn"
                  onClick={onFechar}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-3 py-1.5 rounded text-xs transition active:scale-95"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div
              id="pdf-document-body"
              className="flex-1 p-10 bg-white overflow-y-auto font-sans text-slate-800 print:p-0"
            >
              <div className="max-w-3xl mx-auto space-y-6 text-left">
                {/* Timbre */}
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
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Contrato de Prestação de Serviços
                    </h2>
                    <span className="text-xs font-mono font-bold text-blue-600 block">
                      {contrato.numero}
                    </span>
                    {contrato.propostaNumero && (
                      <p className="text-2xs text-slate-500 mt-1 font-mono">
                        Proposta {contrato.propostaNumero}
                      </p>
                    )}
                  </div>
                </div>

                {/* Qualificação das partes. É o que separa contrato de proposta:
                    a proposta se dirige a um cliente, o contrato nomeia duas
                    partes que se obrigam. */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">
                    Das Partes
                  </h3>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <strong>CONTRATADA:</strong> {timbre.razaoSocial}
                    {timbre.cnpj && `, inscrita no CNPJ sob o nº ${timbre.cnpj}`}
                    {timbre.endereco && `, com sede em ${timbre.endereco}`}
                    {timbre.responsavelTecnico && `, neste ato representada por ${timbre.responsavelTecnico}`}.
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <strong>CONTRATANTE:</strong> {cliente?.nome ?? 'Cliente não encontrado'}
                    {cliente?.cpfCnpj && `, inscrito(a) sob o nº ${cliente.cpfCnpj}`}
                    {cliente?.endereco && `, com endereço em ${cliente.endereco}`}
                    {cliente?.responsavel && `, representado(a) por ${cliente.responsavel}`}.
                  </p>
                </div>

                {/* Objeto */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">
                    Do Objeto
                  </h3>
                  <p className="text-xs text-slate-700 leading-relaxed">{contrato.objeto}</p>
                </div>

                {/* Quadro-resumo: o que o cliente confere antes de assinar, sem
                    caçar dentro das cláusulas. */}
                <div className="quebra-evitar">
                  <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider mb-2">
                    Quadro-Resumo
                  </h3>
                  <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                    <tbody className="divide-y divide-slate-200">
                      {resumo.map(([rotulo, valor]) => (
                        <tr key={rotulo}>
                          <th
                            scope="row"
                            className="p-2 bg-slate-50 font-semibold text-slate-600 w-56 align-top"
                          >
                            {rotulo}
                          </th>
                          <td className="p-2 font-medium">{valor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Cláusulas */}
                {impressas.map((clausula, i) => (
                  <div key={clausula.id} className="space-y-1.5 quebra-evitar">
                    <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">
                      {rotuloClausula(i + 1)} — {clausula.titulo}
                    </h3>
                    {ehLista(clausula.corpo) ? (
                      <ul className="space-y-0.5">
                        {corpoEmLinhas(clausula.corpo).map((linha, j) => (
                          <li key={j} className="text-xs text-slate-700 leading-relaxed flex gap-1.5">
                            <span className="shrink-0" aria-hidden>•</span>
                            <span>{linha}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                        {clausula.corpo}
                      </p>
                    )}
                  </div>
                ))}

                {contrato.foro && (
                  <div className="space-y-1.5 quebra-evitar">
                    <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">
                      Do Foro
                    </h3>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      Fica eleito o foro da {contrato.foro} para dirimir quaisquer controvérsias
                      oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado
                      que seja.
                    </p>
                  </div>
                )}

                {/* Data e local. `dataAssinatura` quando existe: um contrato
                    assinado reimpresso tem de mostrar a data em que foi
                    assinado, não a de hoje. */}
                <p className="text-xs text-slate-700 pt-2">
                  E por estarem assim justas e contratadas, as partes assinam o presente instrumento
                  em duas vias de igual teor
                  {contrato.dataAssinatura && `, em ${formatarDataBR(contrato.dataAssinatura)}`}.
                </p>

                {/* Assinaturas */}
                <div className="grid grid-cols-2 gap-10 pt-10 quebra-evitar">
                  <div className="text-center space-y-1.5 border-t border-slate-300 pt-2.5">
                    <p className="text-xs font-bold text-slate-800 uppercase">{timbre.razaoSocial}</p>
                    <p className="text-xs text-slate-500">CONTRATADA</p>
                  </div>
                  <div className="text-center space-y-1.5 border-t border-slate-300 pt-2.5">
                    <p className="text-xs font-bold text-slate-800 uppercase">
                      {cliente?.nome ?? 'CONTRATANTE'}
                    </p>
                    <p className="text-xs text-slate-500">CONTRATANTE</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-10 pt-8 quebra-evitar">
                  {[1, 2].map((n) => (
                    <div key={n} className="text-center space-y-1.5 border-t border-slate-300 pt-2.5">
                      <p className="text-xs font-bold text-slate-800">TESTEMUNHA {n}</p>
                      <p className="text-2xs text-slate-500">Nome e CPF</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
