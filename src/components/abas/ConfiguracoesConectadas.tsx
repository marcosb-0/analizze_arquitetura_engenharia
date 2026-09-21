import { lazy, useState } from 'react';
import { useEmpresaConfigDados } from '../../contexts/DadosContext';
import { rolesForTab } from '../../constants/tabAccess';
import RequireRole from '../RequireRole';
import Spinner from '../Spinner';
import { FileiraPilulas, PaginaAba, Pilula } from '../ui';

const EmpresaIdentidade = lazy(() => import('../EmpresaIdentidade'));
const TabelaEncargos = lazy(() => import('../configuracoes/TabelaEncargos'));

export default function ConfiguracoesConectadas() {
  const [secao, setSecao] = useState<'identidade' | 'custos'>(() =>
    new URLSearchParams(window.location.search).get('secao') === 'custos' ? 'custos' : 'identidade');
  const { empresa, rubricas, loading, handleSaveEmpresa, handleSaveRubricas, handleCriarRubrica, handleExcluirRubrica, handleUploadLogo, handleRemoverLogo } =
    useEmpresaConfigDados();
  const mudarSecao = (proxima: 'identidade' | 'custos') => {
    setSecao(proxima);
    const url = new URL(window.location.href);
    if (proxima === 'custos') url.searchParams.set('secao', 'custos');
    else url.searchParams.delete('secao');
    window.history.replaceState(window.history.state, '', url);
  };
  return (
    <RequireRole allow={rolesForTab('configuracoes')}>
      <PaginaAba largura="leitura">
        <header>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Configurações da empresa</h2>
          <p className="mt-1 text-xs text-slate-500 max-w-prose">
            Dados institucionais e parâmetros de custo da mão de obra.
          </p>
        </header>
        <FileiraPilulas rotulo="Área das configurações">
          <Pilula ativo={secao === 'identidade'} onClick={() => mudarSecao('identidade')}>Identidade da empresa</Pilula>
          <Pilula ativo={secao === 'custos'} onClick={() => mudarSecao('custos')}>Custos e encargos</Pilula>
        </FileiraPilulas>
        {loading ? <div role="status" className="flex items-center gap-2 text-xs text-slate-500"><Spinner size={18} /> Carregando configurações…</div> : (
          <>
            <EmpresaIdentidade empresa={empresa} secao={secao} onSave={handleSaveEmpresa} onUploadLogo={handleUploadLogo} onRemoverLogo={handleRemoverLogo} />
            {/* Duas telas, uma tabela cada: a identidade escreve `empresa_config`
                (linha única, incluindo a chave de modo) e esta escreve
                `encargos_rubricas`. É o que permite dois botões Salvar sem um
                sobrescrever o outro. */}
            {secao === 'custos' && <TabelaEncargos
              rubricas={rubricas}
              encargosModo={empresa?.encargosModo ?? 'Direto'}
              onSave={handleSaveRubricas}
              onCreate={handleCriarRubrica}
              onDelete={handleExcluirRubrica}
            />}
          </>
        )}
      </PaginaAba>
    </RequireRole>
  );
}
