// Configuração do app do DP — mesmo projeto Supabase e mesmo login do app Gestão de Pessoas.
// Estes valores são públicos por natureza (ficam no app). A segurança está nas travas do banco (RLS).
window.CRV_CONFIG = {
  SUPABASE_URL: 'https://czyvbqxwkviccdfzuouk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_EeolMYcoC3szvl2R1k_paw_QOJDAyKV',
  DOMINIO_LOGIN: 'crv-gp.app',
  VAPID_PUBLICA: 'BNSqbXya2tXAIM6Zz8Da1zC6BkGQebTleB7gzUPYnYCOza53nkHd2tVQ2NC_T6fdUBZOeBVsqx37wNziw8M6c4Y',
  // dados da empresa no rodapé dos documentos (mesmo padrão das Sanções)
  EMPRESA: ['CRV INDUSTRIAL LTDA - UNIDADE CAPINÓPOLIS | CNPJ 03.937.452/0004-35', 'Rodovia MG-226, s/nº, km 63, Zona Rural, Capinópolis/MG - CEP 38.360-000', 'Telefone: (34) 3263-8100'],
  VERSAO: '1.3.1'
};
