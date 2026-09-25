import { lazy } from 'react';
import { ArrowRight } from 'lucide-react';
import { useEmpresaConfigDados } from '../../contexts/DadosContext';
import { rolesForTab } from '../../constants/tabAccess';
import RequireRole from '../RequireRole';
import Spinner from '../Spinner';
import { Aviso, PaginaAba } from '../ui';

const EmpresaIdentidade = lazy(() => import('../EmpresaIdentidade'));

/**
 * Só o timbre. Os parâmetros de custo da mão de obra (encargos, rubricas,
 * jornada) saíram daqui em 25/set/2026 para Equipe › Custo da mão de obra,
 * onde ficam junto do custo-hora que produzem.
 */
export default function ConfiguracoesConectadas() {
  const { empresa, loading, handleSaveEmpresa, handleUploadLogo, handleRemoverLogo } = useEmpresaConfigDados();
  // Link antigo (`?secao=custos`) salvo em favorito ou em nota: diz para onde
  // a seção foi em vez de mostrar o timbre como se fosse a resposta.
  const veioDosCustos = new URLSearchParams(window.location.search).get('secao') === 'custos';
  return (
    <RequireRole allow={rolesForTab('configuracoes')}>
      <PaginaAba largura="leitura">
        <header>
          <h1 className="titulo-pagina text-slate-900">Configurações da empresa</h1>
          <p className="mt-1 text-xs text-slate-500 max-w-prose">
            Dados institucionais que assinam propostas e documentos.
          </p>
        </header>
        <Aviso tom={veioDosCustos ? 'atencao' : 'neutro'} icone={<ArrowRight size={14} />}>
          Encargos sociais, tabela de rubricas e jornada agora ficam em{' '}
          <a className="font-semibold text-blue-600 underline" href="/equipe?secao=custos">Equipe › Custo da mão de obra</a>,
          junto do custo por hora que eles produzem.
        </Aviso>
        {loading ? <div role="status" className="flex items-center gap-2 text-xs text-slate-500"><Spinner size={18} /> Carregando configurações…</div> : (
          <EmpresaIdentidade empresa={empresa} onSave={handleSaveEmpresa} onUploadLogo={handleUploadLogo} onRemoverLogo={handleRemoverLogo} />
        )}
      </PaginaAba>
    </RequireRole>
  );
}
