import { lazy } from 'react';
import { useEmpresaConfigDados } from '../../contexts/DadosContext';
import { rolesForTab } from '../../constants/tabAccess';
import RequireRole from '../RequireRole';
import Spinner from '../Spinner';
import { PaginaAba } from '../ui';

const EmpresaIdentidade = lazy(() => import('../EmpresaIdentidade'));
const TabelaEncargos = lazy(() => import('../configuracoes/TabelaEncargos'));

export default function ConfiguracoesConectadas() {
  const { empresa, rubricas, loading, handleSaveEmpresa, handleSaveRubricas, handleUploadLogo, handleRemoverLogo } =
    useEmpresaConfigDados();
  return (
    <RequireRole allow={rolesForTab('configuracoes')}>
      <PaginaAba largura="leitura">
        <header>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Configurações da empresa</h2>
          <p className="mt-1 text-xs text-slate-500 max-w-prose">
            Identidade, logotipo e parâmetros de custo usados em todo o app.
            Os textos de cada proposta são editados no seu descritivo técnico.
          </p>
        </header>
        {loading ? <div role="status" className="flex items-center gap-2 text-xs text-slate-500"><Spinner size={18} /> Carregando configurações…</div> : (
          <>
            <EmpresaIdentidade empresa={empresa} onSave={handleSaveEmpresa} onUploadLogo={handleUploadLogo} onRemoverLogo={handleRemoverLogo} />
            {/* Duas telas, uma tabela cada: a identidade escreve `empresa_config`
                (linha única, incluindo a chave de modo) e esta escreve
                `encargos_rubricas`. É o que permite dois botões Salvar sem um
                sobrescrever o outro. */}
            <TabelaEncargos
              rubricas={rubricas}
              encargosModo={empresa?.encargosModo ?? 'Direto'}
              onSave={handleSaveRubricas}
            />
          </>
        )}
      </PaginaAba>
    </RequireRole>
  );
}
