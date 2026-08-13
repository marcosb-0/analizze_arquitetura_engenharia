import React, { useEffect, useState } from 'react';
import { AlertTriangle, Building2, Image as ImageIcon, Trash2, Upload, Save, FileText, Users } from 'lucide-react';
import { EmpresaConfig } from '../types';
import { formatBRL } from '../lib/preco';
import { useFeedback } from './FeedbackContext';
import Spinner from './Spinner';
import { Button, Field, Input, Secao } from './ui';
import { useValidacao } from '../hooks/useValidacao';
import { vazio } from '../lib/validacao';

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

/** Os campos desta tela que a validação nomeia. */
type CampoEmpresa = 'razaoSocial' | 'encargos' | 'jornadaMensal' | 'jornadaDiaria';

export default function EmpresaIdentidade({
  empresa,
  onSave,
  onUploadLogo,
  onRemoverLogo,
}: EmpresaIdentidadeProps) {
  const { toast, confirm } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<CampoEmpresa>();

  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [crea, setCrea] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [site, setSite] = useState('');
  const [responsavelTecnico, setResponsavelTecnico] = useState('');
  // Texto e não número: o campo precisa distinguir "vazio" (não configurado,
  // que desliga a fonte Folha) de "0" (encargos zero, uma resposta válida).
  // Um `number | null` no estado faria os dois casos virarem o mesmo `''`.
  const [encargos, setEncargos] = useState('');
  const [jornadaMensal, setJornadaMensal] = useState('220');
  const [jornadaDiaria, setJornadaDiaria] = useState('8');
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
    setEncargos(empresa.encargosSociaisPercentual == null ? '' : String(empresa.encargosSociaisPercentual));
    setJornadaMensal(String(empresa.jornadaMensalHoras));
    setJornadaDiaria(String(empresa.jornadaDiariaHoras));
  }, [empresa]);

  const encargosNum = encargos.trim() === '' ? null : Number(encargos.replace(',', '.'));
  const jornadaMensalNum = Number(jornadaMensal.replace(',', '.'));
  const jornadaDiariaNum = Number(jornadaDiaria.replace(',', '.'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        {
          campo: 'razaoSocial',
          invalido: vazio(razaoSocial),
          erro: 'Informe a razão social — é o nome que assina o documento entregue ao cliente.',
        },
        {
          campo: 'encargos',
          invalido: encargosNum !== null && (!Number.isFinite(encargosNum) || encargosNum < 0 || encargosNum > 300),
          erro: 'Informe um percentual entre 0 e 300, ou deixe em branco.',
        },
        {
          campo: 'jornadaMensal',
          invalido: !Number.isFinite(jornadaMensalNum) || jornadaMensalNum <= 0,
          erro: 'Precisa ser maior que zero — o padrão CLT é 220 horas.',
        },
        {
          campo: 'jornadaDiaria',
          invalido: !Number.isFinite(jornadaDiariaNum) || jornadaDiariaNum <= 0 || jornadaDiariaNum > 24,
          erro: 'Informe um valor entre 0 e 24 horas.',
        },
      ])
    ) return;
    setSalvando(true);
    const salva = await onSave({
      encargosSociaisPercentual: encargosNum,
      jornadaMensalHoras: jornadaMensalNum,
      jornadaDiariaHoras: jornadaDiariaNum,
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

  /**
   * `nomeCampo` liga o campo à validação. É opcional porque a maioria dos campos
   * desta tela é livre (site, telefone) — quem não valida nada não precisa de
   * nome, e nomear tudo só para preencher a assinatura convidaria ao erro de
   * nomear e esquecer de checar.
   */
  const campo = (
    id: string,
    label: string,
    valor: string,
    setter: (v: string) => void,
    placeholder?: string,
    type = 'text',
    nomeCampo?: CampoEmpresa
  ) => (
    <Field
      className="space-y-1 text-left"
      id={id}
      label={label}
      erro={nomeCampo ? erros[nomeCampo] : undefined}
      required={nomeCampo === 'razaoSocial'}
    >
      {(props) => (
        <Input
          {...props}
          type={type}
          value={valor}
          placeholder={placeholder}
          onChange={(e) => { setter(e.target.value); if (nomeCampo) limparErro(nomeCampo); }} fundo="suave"
        />
      )}
    </Field>
  );

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={handleSubmit} className="space-y-6">
      <Secao
        icone={<Building2 size={15} />}
        titulo="Identidade da Empresa"
        descricao="Cabeçalho, assinatura e condições impressas em toda proposta enviada ao cliente."
      >
        <div className="space-y-5">
          {/* Logotipo */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
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
              {campo('emp-razao', 'Razão Social', razaoSocial, setRazaoSocial, 'Nome que assina a proposta', 'text', 'razaoSocial')}
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
      </Secao>

      {/* Os textos do documento saíram daqui em 20260810100000. Eram lidos ao
          vivo na impressão: toda proposta saía com o mesmo parágrafo e editá-los
          reescrevia retroativamente o papel de propostas já entregues. E esta
          tela vive na aba Financeiro, que a matriz de acesso dá a admin e
          financeiro — quem escreve proposta (gestão) não a alcança. */}
      <Secao
        icone={<FileText size={15} />}
        titulo="Textos do documento"
        descricao="Agora são de cada proposta, não da empresa."
      >
        <div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Escopo, premissas, exclusões e condições comerciais são escritos dentro de cada proposta, em{' '}
            <strong className="text-slate-800">Propostas › Descritivo Técnico</strong>. Os textos que se repetem
            ficam na biblioteca de modelos, na mesma tela, e entram na proposta como ponto de partida editável.
          </p>
          <p className="text-2xs text-slate-500 leading-relaxed mt-2">
            Aqui fica só o timbre: quem emite o documento. Editar um modelo nunca altera proposta já emitida.
          </p>
        </div>
      </Secao>
      {/* Vive aqui porque `empresa_config` é linha única: um segundo editor da
          mesma linha, noutra aba, poria duas telas escrevendo por cima uma da
          outra. O conteúdo é de custo, não de timbre — daí o card separado. */}
      <Secao
        icone={<Users size={15} />}
        titulo="Custo da mão de obra própria"
        descricao="O padrão da empresa. Converte o salário da folha em custo por hora, para o catálogo orçar com o seu custo e não com o do SINAPI — cada ficha pode sobrescrever o que for diferente."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {campo('emp-encargos', 'Encargos sociais (%)', encargos, setEncargos, 'ex.: 80', 'text', 'encargos')}
            {campo('emp-jornada-mes', 'Jornada mensal (h)', jornadaMensal, setJornadaMensal, '220', 'text', 'jornadaMensal')}
            {campo('emp-jornada-dia', 'Jornada diária (h)', jornadaDiaria, setJornadaDiaria, '8', 'text', 'jornadaDiaria')}
          </div>

          {encargosNum === null ? (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle size={13} className="text-amber-700 mt-0.5 shrink-0" aria-hidden />
              <p className="text-2xs text-amber-900 font-semibold leading-relaxed">
                Sem os encargos preenchidos, o custo de mão de obra continua vindo do SINAPI mesmo para cargos
                com funcionário contratado, e a ficha do colaborador não mostra custo por hora. Deixamos em
                branco de propósito em vez de assumir zero — mão de obra sem encargos parece bem mais barata do
                que é, e o número apareceria em toda composição e proposta sem nada indicando que estava
                incompleto. Quem tem poucos casos pode informar o percentual direto em cada ficha, na aba Equipe.
              </p>
            </div>
          ) : (
            <p className="text-2xs text-slate-600 leading-relaxed">
              Um salário de <strong className="text-slate-800">R$ 3.000</strong> sai a{' '}
              <strong className="text-slate-800 font-mono">
                {formatBRL((3000 * (1 + encargosNum / 100)) / (jornadaMensalNum || 220))}
              </strong>{' '}
              por hora, sem benefícios. Vale para cargos com funcionário <strong>ativo</strong> vinculado a um
              insumo de mão de obra do catálogo — o vínculo é feito na ficha do colaborador, na aba Equipe, e é
              lá também que entram vale-transporte, vale-refeição e plano de saúde, que somam ao custo mensal.
              Quando há mais de um no mesmo cargo, entra o <strong>maior custo por hora</strong>: orça pelo pior
              caso. Não é necessariamente o maior salário — meio período custa mais caro por hora.
            </p>
          )}
        </div>
      </Secao>

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
