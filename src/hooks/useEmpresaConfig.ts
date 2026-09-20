import { useCallback, useMemo, useState } from 'react';
import { EmpresaConfig, RubricaEncargo } from '../types';
import { empresaConfigService } from '../services/empresaConfigService';
import { encargosRubricasService } from '../services/encargosRubricasService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/**
 * Identidade da empresa usada no papel timbrado das propostas.
 *
 * Fica no App e não dentro da aba Empresa porque quem consome é a aba
 * Propostas — o documento impresso. Carregar sob demanda faria o cabeçalho
 * aparecer depois do resto do PDF, na frente do usuário.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useEmpresaConfig(ativo = true) {
  const { toast } = useFeedback();
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null);
  // As rubricas moram aqui, e não num provedor próprio, porque são o mesmo
  // assunto que `empresa_config`: parâmetro de custo da empresa. Quem já
  // consome a empresa (Equipe, para o custo/hora) passa a ter as duas com um
  // estado de carregamento só, sem registrar domínio novo no DadosContext.
  const [rubricas, setRubricas] = useState<RubricaEncargo[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: async () => {
      const [config, linhas] = await Promise.all([
        empresaConfigService.get(),
        encargosRubricasService.listar(),
      ]);
      return { config, linhas };
    },
    aoChegar: ({ config, linhas }) => {
      setEmpresa(config);
      setRubricas(linhas);
    },
    aoLimpar: () => {
      setEmpresa(null);
      setRubricas([]);
    },
    erro: 'Falha ao carregar os dados da empresa.',
  });

  const handleSaveEmpresa = useCallback(async (config: Omit<EmpresaConfig, 'id' | 'logoUrl'>) => {
    try {
      const salva = await empresaConfigService.save(config);
      setEmpresa(salva);
      return salva;
    } catch (err: any) {
      toast.error('Falha ao salvar os dados da empresa.', err.message);
      return null;
    }
  }, [toast]);

  const handleUploadLogo = useCallback(async (file: File) => {
    try {
      const { logoPath, logoUrl } = await empresaConfigService.uploadLogo(file, empresa?.logoPath ?? '');
      setEmpresa((prev) => (prev ? { ...prev, logoPath, logoUrl } : prev));
      return true;
    } catch (err: any) {
      toast.error('Falha ao enviar o logotipo.', err.message);
      return false;
    }
  }, [empresa, toast]);

  const handleRemoverLogo = useCallback(async () => {
    // O caminho do arquivo no bucket é lido ANTES da atualização otimista, que
    // acaba de limpá-lo. A versão anterior capturava dentro do updater de
    // `aplicar` — e o React só executa esse updater na fase de render, depois
    // de a função assíncrona já ter passado pela chamada ao service (é o mesmo
    // mecanismo descrito em `comRollback.desfazer`). Resultado: o service
    // recebia string vazia, o registro era limpo no banco e **o arquivo ficava
    // órfão no bucket**, sem nada na tela indicando isso.
    const logoPathAnterior = empresa?.logoPath;
    if (!logoPathAnterior) return;
    const { aplicar, desfazer } = comRollback(setEmpresa);
    aplicar((prev) => (prev ? { ...prev, logoPath: '', logoUrl: '' } : prev));
    try {
      await empresaConfigService.removerLogo(logoPathAnterior);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao remover o logotipo.', err.message);
    }
  }, [empresa, toast]);

  /**
   * Salva a tabela de rubricas inteira num request só — ver o cabeçalho de
   * `encargosRubricasService`. O banco recusa deixar rubrica ativa sem
   * percentual enquanto o modo for 'Rubricas', e essa recusa chega aqui como
   * erro: a mensagem do guarda já explica o que fazer, então é ela que vai
   * para o toast em vez de um texto genérico.
   */
  const handleSaveRubricas = useCallback(async (novas: readonly RubricaEncargo[]) => {
    try {
      const salvas = await encargosRubricasService.salvar(novas);
      setRubricas(salvas);
      return true;
    } catch (err: any) {
      toast.error('Falha ao salvar a tabela de encargos.', err.message);
      return false;
    }
  }, [toast]);

  return useMemo(
    () => ({
      empresa,
      rubricas,
      loading,
      handleSaveEmpresa,
      handleSaveRubricas,
      handleUploadLogo,
      handleRemoverLogo,
    }),
    [empresa, rubricas, loading, handleSaveEmpresa, handleSaveRubricas, handleUploadLogo, handleRemoverLogo]
  );
}
