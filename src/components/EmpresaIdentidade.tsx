import React, { useEffect, useState } from 'react';
import { Building2, Image as ImageIcon, Trash2, Upload, Save, FileText } from 'lucide-react';
import { EmpresaConfig } from '../types';
import { useFeedback } from './FeedbackContext';
import Spinner from './Spinner';
import { Button, Input } from './ui';

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
      <Input
        id={id}
        type={type}
        value={valor}
        placeholder={placeholder}
        onChange={(e) => setter(e.target.value)} fundo="suave"
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

      {/* Os textos do documento saíram daqui em 20260810100000. Eram lidos ao
          vivo na impressão: toda proposta saía com o mesmo parágrafo e editá-los
          reescrevia retroativamente o papel de propostas já entregues. E esta
          tela vive na aba Financeiro, que a matriz de acesso dá a admin e
          financeiro — quem escreve proposta (gestão) não a alcança. */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
          <div className="w-8 h-8 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center">
            <FileText size={15} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 leading-none">Textos do documento</h3>
            <p className="text-2xs text-slate-500 mt-1">
              Agora são de cada proposta, não da empresa.
            </p>
          </div>
        </div>

        <div className="p-5">
          <p className="text-xs text-slate-600 leading-relaxed">
            Escopo, premissas, exclusões e condições comerciais são escritos dentro de cada proposta, em{' '}
            <strong className="text-slate-800">Propostas › Descritivo Técnico</strong>. Os textos que se repetem
            ficam na biblioteca de modelos, na mesma tela, e entram na proposta como ponto de partida editável.
          </p>
          <p className="text-2xs text-slate-500 leading-relaxed mt-2">
            Aqui fica só o timbre: quem emite o documento. Editar um modelo nunca altera proposta já emitida.
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={salvando}
        >
          {salvando ? <><Spinner size={14} /><span>Salvando...</span></> : <><Save size={14} /><span>Salvar dados da empresa</span></>}
        </Button>
      </div>
    </form>
  );
}
