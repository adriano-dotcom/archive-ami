## Objetivo
Atualizar a memória do projeto (`mem://`) para refletir o pivot de **OrbePet/Orbi (pet)** para **Jacometo Corretora / Iris (seguro de cargas)**, removendo/realinhando referências pet que hoje induzem o agente a reintroduzir terminologia e estratégia erradas.

## 1. Reescrever o Core (`mem://index.md`)
Substituir as linhas Core conflitantes:

- **Branding/cores**: `purple primary (#6A0DAD)` → primária navy blue (cor adotada no rebrand em `src/index.css`). Manter dark theme + `bg-background`.
- **Terminologia de domínio**: `'Tutores' / 'Clínicas' / 'Planos'` → `'Transportadores' / 'Empresas' / 'Apólices'`. Incluir presença de CNPJ/RNTRC/tipo de carga.
- **Estratégia**: trocar `OrbePet CRM strategy: No cargo insurance/legacy references. Orbi is a pet health expert.` por: `Jacometo Corretora — foco em seguro de cargas (RCTR-C, RC-DC, RC-V) e regularização ANTT. Assistente virtual = Iris. NÃO usar terminologia pet (tutor/clínica/petshop) nem persona Orbi.`
- Manter regras técnicas que continuam válidas (parseISO, Deno base64, dynamic service_role_key, no Pipedrive).
- **Routing landing page**: revisar a referência `lp.orbepet.com.br` (manter a regra de infraestrutura de subdomínio, ajustando a marca quando aplicável).

## 2. Adicionar memórias novas (Jacometo/Iris)
Criar arquivos de memória refletindo a direção atual:

- `mem://project-direction/jacometo-iris-strategy` (type: feature) — Jacometo Corretora, seguro de cargas, público transportador/embarcador, assistente Iris, âncora de preço (~R$ 900/ano).
- `mem://features/agent/iris-persona` (type: feature) — persona Iris: coberturas (RCTR-C, RC-DC, RC-V), regularização ANTT, regras de carência, limite de idade não se aplica (substitui regras pet).
- `mem://features/tutores/terminology-and-ui-rebranding` (type: preference) — atualizar para Transportador/Empresa/Apólice; manter rota `/tutores` e valores de banco (`pet_tutor`, `clinica_petshop`, `pet_profile`) por compatibilidade, alterando só rótulos visíveis.

## 3. Realinhar/encerrar memórias pet existentes
Atualizar (ou marcar como obsoletas e remover do índice) as memórias que pregam estratégia pet:

- `mem://project-direction/orbepet-crm-strategy` → substituída por jacometo-iris-strategy (remover do índice).
- `mem://features/agent/orbi-persona`, `mem://features/agent/default-identity-update`, `mem://features/agent/qualificacao-e-estilo-orbi`, `mem://features/agent/automacao-follow-up-orbi` → reescrever para Iris / remover referências pet.
- `mem://database/orbepet-data-model`, `mem://features/agent/plans-catalog-source-of-truth`, `mem://features/agent/estrategia-venda-ancoragem-plus`, `mem://features/agent/orbe-360-upsell` → realinhar para catálogo de seguro de cargas (ou remover do índice se não mais aplicáveis).
- `mem://style/branding/orbepet-visual-identity`, `mem://style/branding/email-communication-standard` → atualizar marca para Jacometo Corretora.

## 4. Atualizar descrições no índice
Ajustar os bullets da seção `## Memories` no `mem://index.md` para apontar para as memórias novas/renomeadas e remover os bullets de memórias descontinuadas.

## Observações
- Esta tarefa altera apenas a memória do projeto (`mem://`), não o código.
- Recomendo executar logo após (ou junto com) as correções de UI de remoção de terminologia pet, para que código e memória fiquem consistentes.
- Não removerei regras técnicas ainda válidas (datas, Deno, segurança), apenas as que carregam estratégia/branding pet.