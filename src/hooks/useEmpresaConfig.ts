import { useCallback, useMemo, useState } from 'react';
import { EmpresaConfig, GrupoEncargoDef, RubricaEncargo } from '../types';
import { empresaConfigService } from '../services/empresaConfigService';
import { encargosRubricasService } from '../services/encargosRubricasService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';
import { mensagemDeErro } from '../lib/erros';

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
  const [gruposEncargo, setGruposEncargo] = useState<GrupoEncargoDef[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: async () => {
      const [config, linhas, grupos] = await Promise.all([
        empresaConfigService.get(),
        encargosRubricasService.listar(),
        encargosRubricasService.listarGrupos(),
      ]);
      return { config, linhas, grupos };
    },
    aoChegar: ({ config, linhas, grupos }) => {
      setEmpresa(config);
      setRubricas(linhas);
      setGruposEncargo(grupos);
    },
    aoLimpar: () => {
      setEmpresa(null);
      setRubricas([]);
      setGruposEncargo([]);
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
      // Sem toast de sucesso aqui: a tela salva tabela e modo num gesto só e
      // anuncia uma vez, depois das duas gravações.
      return true;
    } catch (err: any) {
      toast.error('Falha ao salvar a tabela de encargos.', err.message);
      return false;
    }
  }, [toast]);

  const handleCriarRubrica = useCallback(async (
    nova: Pick<RubricaEncargo, 'codigo' | 'grupo' | 'descricao' | 'percentualHorista' | 'percentualMensalista' | 'aplicaHorista' | 'aplicaMensalista'>
  ) => {
    try {
      // Grupo próprio vazio começa depois da ordem do próprio grupo (E = 500,
      // rubricas 510, 520…), para a lista global continuar agrupada.
      const baseGrupo = gruposEncargo.find((g) => g.codigo === nova.grupo)?.ordem ?? 0;
      const ordem = Math.max(baseGrupo, ...rubricas.filter((r) => r.grupo === nova.grupo).map((r) => r.ordem)) + 10;
      await encargosRubricasService.criar(nova, ordem);
      setRubricas(await encargosRubricasService.listar());
      toast.success('Rubrica adicional criada.', 'Ela começa inativa; revise e ative quando estiver pronta.');
      return true;
    } catch (err: any) {
      toast.error('Falha ao criar rubrica.', err.message);
      return false;
    }
  }, [rubricas, gruposEncargo, toast]);

  const handleExcluirRubrica = useCallback(async (codigo: string) => {
    try {
      await encargosRubricasService.excluir(codigo);
      setRubricas(await encargosRubricasService.listar());
      toast.success('Rubrica excluída.', 'Os custos vinculados foram atualizados.');
      return true;
    } catch (err: any) {
      toast.error('Falha ao excluir rubrica.', err.message);
      return false;
    }
  }, [toast]);

  /**
   * Grupo próprio (E, F, …): a próxima letra livre, depois do último. Soma
   * direto no total e nasce vazio, então criar não mexe em preço.
   */
  const handleCriarGrupoEncargo = useCallback(async (titulo: string) => {
    const usados = new Set(gruposEncargo.map((g) => g.codigo));
    const codigo = 'EFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !usados.has(l));
    if (!codigo) {
      toast.error('Não há mais letras livres para grupos.', 'Exclua um grupo próprio vazio antes de criar outro.');
      return null;
    }
    try {
      const ordem = Math.max(400, ...gruposEncargo.map((g) => g.ordem)) + 100;
      const novo = await encargosRubricasService.criarGrupo({ codigo, titulo, ordem });
      setGruposEncargo(await encargosRubricasService.listarGrupos());
      toast.success(`Grupo ${novo.codigo} criado.`, 'Adicione as rubricas dele; o subtotal soma direto no total.');
      return novo;
    } catch (err) {
      toast.error('Falha ao criar o grupo.', mensagemDeErro(err));
      return null;
    }
  }, [gruposEncargo, toast]);

  const handleExcluirGrupoEncargo = useCallback(async (codigo: string) => {
    try {
      await encargosRubricasService.excluirGrupo(codigo);
      setGruposEncargo(await encargosRubricasService.listarGrupos());
      toast.success(`Grupo ${codigo} excluído.`);
      return true;
    } catch (err) {
      toast.error('Falha ao excluir o grupo.', mensagemDeErro(err));
      return false;
    }
  }, [toast]);

  return useMemo(
    () => ({
      empresa,
      rubricas,
      gruposEncargo,
      handleCriarGrupoEncargo,
      handleExcluirGrupoEncargo,
      loading,
      handleSaveEmpresa,
      handleSaveRubricas,
      handleCriarRubrica,
      handleExcluirRubrica,
      handleUploadLogo,
      handleRemoverLogo,
    }),
    [empresa, rubricas, gruposEncargo, handleCriarGrupoEncargo, handleExcluirGrupoEncargo, loading, handleSaveEmpresa, handleSaveRubricas, handleCriarRubrica, handleExcluirRubrica, handleUploadLogo, handleRemoverLogo]
  );
}
