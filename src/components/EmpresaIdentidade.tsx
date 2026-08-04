import React, { useEffect, useState } from 'react';
import { Building2, Image as ImageIcon, Plus, Trash2, Upload, Save, FileText } from 'lucide-react';
import { EmpresaConfig } from '../types';
import { useFeedback } from './FeedbackContext';
import Spinner from './Spinner';

/**
 * Papel timbrado das propostas.
 *
 * Tudo o que aparece no documento entregue ao cliente e não vem da proposta em
 * si: razão social, CNPJ, CREA, endereço, contatos, logotipo, o parágrafo de
 * abertura do escopo e as condições comerciais. Antes eram constantes de
 * código — trocar um telefone no papel exigia deploy, e logotipo não existia.
 */

interface EmpresaIdentidadeProps {
  empresa: EmpresaConfig | null;
  onSave: (config: Omit<EmpresaConfig, 'id' | 'logoUrl'>) => Promise<EmpresaConfig | null>;
  onUploadLogo: (file: File) => Promise<boolean>;
  onRemoverLogo: () => Promise<void>;
}

export default function EmpresaIdentidade({
  empresa,
  onSave,
  onUploadLogo,
  onRemoverLogo,
}: EmpresaIdentidadeProps) {
  const { toast, confirm } = useFeedback();

  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [crea, setCrea] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [site, setSite] = useState('');
  const [responsavelTecnico, setResponsavelTecnico] = useState('');
  const [textoEscopo, setTextoEscopo] = useState('');
  const [condicoes, setCondicoes] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);

  // A configuração chega por fetch, depois do primeiro render. Sem este efeito
  // o formulário ficaria em branco sobre uma empresa já cadastrada.
  useEffect(() => {
    if (!empresa) return;
    setRazaoSocial(empresa.razaoSocial);
    setCnpj(empresa.cnpj);
    setCrea(empresa.crea);
    setEndereco(empresa.endereco);
    setTelefone(empresa.telefone);
    setEmail(empresa.email);
    setSite(empresa.site);
    setResponsavelTecnico(empresa.responsavelTecnico);
    setTextoEscopo(empresa.textoEscopo);
    setCondicoes(empresa.condicoes);
  }, [empresa]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!razaoSocial.trim()) {
      toast.error('A razão social é obrigatória.', 'É o nome que assina o documento entregue ao cliente.');
      return;
    }
    setSalvando(true);
    const salva = await onSave({
      razaoSocial,
      cnpj,
      crea,
      endereco,
      telefone,
      email,
      site,
      responsavelTecnico,
      textoEscopo,
      condicoes,
      // O logo é gravado no próprio upload; repeti-lo aqui só preserva o que
      // já está lá quando o formulário é salvo depois de trocar a imagem.
      logoPath: empresa?.logoPath ?? '',
    });
    setSalvando(false);
    if (salva) toast.success('Dados da empresa salvos.', 'As próximas propostas já saem com este cabeçalho.');
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // O input é limpo sempre: sem isso, escolher o mesmo arquivo de novo depois
    // de uma falha não dispararia o evento change.
    e.target.value = '';
    if (!file) return;
    setEnviandoLogo(true);
    const ok = await onUploadLogo(file);
    setEnviandoLogo(false);
    if (ok) toast.success('Logotipo atualizado.');
  };

  const campo = (
    id: string,
    label: string,
    valor: string,
    setter: (v: string) => void,
    placeholder?: string,
    type = 'text'
  ) => (
    <div className="space-y-1 text-left">
      <label htmlFor={id} className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={valor}
        placeholder={placeholder}
        onChange={(e) => setter(e.target.value)}
        className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 transition text-slate-800"
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
          <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
            <Building2 size={15} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 leading-none">Identidade da Empresa</h3>
            <p className="text-2xs text-slate-500 mt-1">
              Cabeçalho, assinatura e condições impressas em toda proposta enviada ao cliente.
            </p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Logotipo */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="w-32 h-20 bg-white border border-dashed border-slate-200 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
              {empresa?.logoUrl ? (
                <img src={empresa.logoUrl} alt="Logotipo da empresa" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImageIcon size={22} className="text-slate-300" aria-hidden />
              )}
            </div>
            <div className="space-y-1.5 flex-1">
              <p className="text-xs font-bold text-slate-800">Logotipo</p>
              <p className="text-2xs text-slate-500 leading-relaxed">
                Aparece no alto da proposta, ao lado da razão social. PNG, JPG, WEBP ou SVG de até 2 MB;
                fundo transparente imprime melhor.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <label className={`inline-flex items-center gap-1.5 text-2xs font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                  enviandoLogo
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-wait'
                    : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                }`}>
                  {enviandoLogo ? <Spinner size={12} /> : <Upload size={12} />}
                  <span>{empresa?.logoUrl ? 'Trocar logotipo' : 'Enviar logotipo'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={enviandoLogo}
                    onChange={handleLogoChange}
                  />
                </label>
                {empresa?.logoUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      confirm({
                        title: 'Remover logotipo',
                        message: 'As próximas propostas saem apenas com a razão social em texto. O arquivo é apagado.',
                        onConfirm: onRemoverLogo,
                      })
                    }
                    className="inline-flex items-center gap-1.5 text-2xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition"
                  >
                    <Trash2 size={12} /> Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Dados cadastrais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              {campo('emp-razao', 'Razão Social *', razaoSocial, setRazaoSocial, 'Nome que assina a proposta')}
            </div>
            {campo('emp-cnpj', 'CNPJ', cnpj, setCnpj, '00.000.000/0001-00')}
            {campo('emp-crea', 'CREA / CAU', crea, setCrea, 'Registro profissional')}
            <div className="md:col-span-2">
              {campo('emp-endereco', 'Endereço', endereco, setEndereco, 'Rua, número - Bairro, Cidade - UF')}
            </div>
            {campo('emp-telefone', 'Telefone', telefone, setTelefone, '(00) 0000-0000')}
            {campo('emp-email', 'E-mail', email, setEmail, 'contato@empresa.com.br', 'email')}
            {campo('emp-site', 'Site', site, setSite, 'www.empresa.com.br')}
            {campo('emp-rt', 'Responsável Técnico', responsavelTecnico, setResponsavelTecnico, 'Eng. Fulano • CREA 000000')}
          </div>
          <p className="text-2xs text-slate-500 leading-relaxed">
            Campos em branco simplesmente não são impressos — o cabeçalho se ajusta ao que existe, sem deixar
            rótulos vazios no documento.
          </p>
        </div>
      </div>

      {/* Textos do documento */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
          <div className="w-8 h-8 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center">
            <FileText size={15} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 leading-none">Textos Padrão da Proposta</h3>
            <p className="text-2xs text-slate-500 mt-1">
              Valem para toda proposta. O escopo específico de cada obra continua sendo o da própria proposta.
            </p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-1 text-left">
            <label htmlFor="emp-escopo" className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
              Parágrafo de abertura do escopo
            </label>
            <textarea
              id="emp-escopo"
              rows={4}
              value={textoEscopo}
              placeholder="O que a proposta contempla de forma geral: insumos, mão de obra, impostos, supervisão técnica..."
              onChange={(e) => setTextoEscopo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 transition text-slate-800 leading-relaxed"
            />
            <p className="text-2xs text-slate-500">
              Impresso logo abaixo da descrição da obra. Deixe vazio para omiti-lo.
            </p>
          </div>

          <div className="space-y-2 text-left">
            <div className="flex items-center justify-between">
              <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider">
                Condições comerciais ({condicoes.length})
              </label>
              <button
                type="button"
                onClick={() => setCondicoes((prev) => [...prev, ''])}
                className="text-2xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded transition flex items-center gap-1"
              >
                <Plus size={12} /> Adicionar condição
              </button>
            </div>

            {condicoes.length === 0 ? (
              <p className="text-2xs text-slate-500 italic py-2">
                Nenhuma condição cadastrada — a seção de observações sai só com a validade da proposta.
              </p>
            ) : (
              <div className="space-y-2">
                {condicoes.map((condicao, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-slate-300 font-bold pt-2 text-xs shrink-0" aria-hidden>•</span>
                    <textarea
                      rows={2}
                      value={condicao}
                      aria-label={`Condição comercial ${i + 1}`}
                      placeholder="Ex: Forma de pagamento: medições a cada 30 dias, faturadas via boleto."
                      onChange={(e) =>
                        setCondicoes((prev) => prev.map((c, idx) => (idx === i ? e.target.value : c)))
                      }
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 transition text-slate-800 leading-relaxed"
                    />
                    <button
                      type="button"
                      aria-label={`Remover condição ${i + 1}`}
                      onClick={() => setCondicoes((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-slate-500 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition shrink-0 mt-0.5"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-2xs text-slate-500">
              Cada linha vira um marcador na seção "Observações Legais e Condições". Linhas em branco são descartadas ao salvar.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={salvando}
          className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {salvando ? <><Spinner size={14} /><span>Salvando...</span></> : <><Save size={14} /><span>Salvar dados da empresa</span></>}
        </button>
      </div>
    </form>
  );
}
