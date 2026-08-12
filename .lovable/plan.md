# Instruções detalhadas para o projeto "Projeto 3 Seguros Obrigatorio" (site oficial)

Estas são as duas alterações exatas que precisam ser feitas no código da landing page
(`rctr-c.rc-dc.rc-v.jacometo.com.br`) para que o link `?proposta=<token>` abra o checkout
já preenchido. Já confirmei o código atual do projeto — as linhas e imports batem.

O backend do CRM já está pronto: o endpoint `proposal-prefill` devolve todos os campos e
responde CORS `*` sem login. Hoje o site simplesmente ignora o parâmetro `?proposta=`.

---

## Endpoint do CRM (já funciona, não mexer)

```
GET https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/proposal-prefill?token=<32 hex>
```

Resposta 200 (exemplo real do Paulo/LSLOG):

```json
{
  "cnpj": "35235302000123",
  "razao_social": "LSLOG TRANSPORTES LTDA",
  "rntrc": "52850644",
  "rntrc_situacao": null,
  "endereco": {
    "logradouro": "OMAR MAZZEI GUIMARAES",
    "numero": "140",
    "complemento": "",
    "bairro": "JARDIM MARIA LUIZA",
    "municipio": "LONDRINA",
    "uf": "PR",
    "cep": "86080511"
  },
  "responsavel": "PAULO RENATO LANDUCCI",
  "cpf": "04023472930",
  "email": "paulo.landucci3@gmail.com",
  "telefone": "554399611414",
  "seguro_vigente": false
}
```

Erros: `400` token inválido · `404` não encontrada · `410` expirada · `409` já transmitida · `429` excesso de requisições.

---

## Alteração 1 — `src/components/landing/CheckoutModal.tsx`

Três pontos neste arquivo. O `maskCpf` já está importado no topo (`import { cpfError, maskCpf } from "@/lib/cnpj"`).

### 1a. Adicionar `cpf` à interface `CheckoutPrefill`

Hoje (linha 120) está assim:

```ts
export interface CheckoutPrefill {
  cnpj?: string;
  razaoSocial?: string;
  rntrc?: string;
  email?: string;
  whatsapp?: string;
  responsavel?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  seguroVigente?: "sim" | "nao";
}
```

Adicionar `cpf?: string;` logo depois de `responsavel?: string;`:

```ts
export interface CheckoutPrefill {
  cnpj?: string;
  razaoSocial?: string;
  rntrc?: string;
  email?: string;
  whatsapp?: string;
  responsavel?: string;
  cpf?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  seguroVigente?: "sim" | "nao";
}
```

### 1b. Aplicar o CPF no useEffect de pré-preenchimento

No `useEffect` que começa com `if (!open || !initialData) return;` (linha 250), logo após a
linha que aplica o responsavel:

```ts
if (initialData.responsavel && !responsavel) setResponsavel(initialData.responsavel);
```

Adicionar:

```ts
if (initialData.cpf && !cpf) setCpf(maskCpf(initialData.cpf.replace(/\D/g, "")));
```

### 1c. Incluir o CPF na checagem de completude

No mesmo useEffect, a checagem que decide abrir direto na Conferência (linha 269) está assim:

```ts
const completo =
  Boolean(initialData.cnpj) &&
  Boolean(initialData.razaoSocial) &&
  Boolean(initialData.email) &&
  Boolean(initialData.whatsapp) &&
  Boolean(initialData.responsavel);
```

Acrescentar o CPF:

```ts
const completo =
  Boolean(initialData.cnpj) &&
  Boolean(initialData.razaoSocial) &&
  Boolean(initialData.email) &&
  Boolean(initialData.whatsapp) &&
  Boolean(initialData.responsavel) &&
  Boolean(initialData.cpf);
```

Isso faz o modal abrir direto no passo 4 ("Conferência") quando todos os campos vieram do CRM.

---

## Alteração 2 — `src/routes/index.tsx`

`useState` e `useEffect` já estão importados no topo (`import { useEffect, useState } from "react"`).
Dentro da função `LandingPage()` (linha 167), que hoje começa assim:

```tsx
function LandingPage() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPrefill, setCheckoutPrefill] = useState<
    import("@/components/landing/CheckoutModal").CheckoutPrefill | undefined
  >(undefined);
  const openCheckout = () => setCheckoutOpen(true);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as
        | import("@/components/landing/CheckoutModal").CheckoutPrefill
        | undefined;
      if (detail) setCheckoutPrefill(detail);
      setCheckoutOpen(true);
    }
    window.addEventListener("jacometo:open-checkout", onOpen);
    return () => window.removeEventListener("jacometo:open-checkout", onOpen);
  }, []);
```

### 2a. Adicionar o estado de erro e o endpoint

Logo após `const openCheckout = () => setCheckoutOpen(true);`, adicionar:

```tsx
const PREFILL_ENDPOINT =
  "https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/proposal-prefill";

const [prefillErro, setPrefillErro] = useState("");
```

### 2b. Adicionar o useEffect que lê o token da URL

Logo após o `useEffect` do `jacometo:open-checkout` (que termina com `}, []);`), adicionar:

```tsx
useEffect(() => {
  const token = new URLSearchParams(window.location.search).get("proposta")?.trim();
  if (!token || !/^[a-f0-9]{32}$/i.test(token)) return;

  let cancelado = false;
  (async () => {
    try {
      const res = await fetch(`${PREFILL_ENDPOINT}?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (cancelado) return;

      if (!res.ok) {
        setPrefillErro(
          res.status === 410
            ? "Este link de proposta expirou. Fale com a gente pelo WhatsApp para receber um novo."
            : res.status === 409
              ? "Esta proposta já foi transmitida."
              : "Não foi possível carregar os dados desta proposta. Preencha o formulário normalmente.",
        );
        return;
      }

      const end = data.endereco ?? {};
      setCheckoutPrefill({
        cnpj: data.cnpj ?? undefined,
        razaoSocial: data.razao_social ?? undefined,
        rntrc: data.rntrc ?? undefined,
        email: data.email ?? undefined,
        whatsapp: data.telefone ?? undefined,
        responsavel: data.responsavel ?? undefined,
        cpf: data.cpf ?? undefined,
        logradouro: end.logradouro ?? undefined,
        numero: end.numero ?? undefined,
        complemento: end.complemento ?? undefined,
        bairro: end.bairro ?? undefined,
        municipio: end.municipio ?? undefined,
        uf: end.uf ?? undefined,
        cep: end.cep ?? undefined,
        seguroVigente: data.seguro_vigente ? "sim" : "nao",
      });
      setCheckoutOpen(true);
    } catch {
      if (!cancelado) setPrefillErro("Não foi possível carregar os dados desta proposta.");
    }
  })();

  return () => {
    cancelado = true;
  };
}, []);
```

### 2c. Exibir a faixa de erro (opcional, mas recomendado)

Dentro do `return` de `LandingPage`, logo após `<main id="conteudo">` (ou antes do `<Header>`),
adicionar uma faixa de aviso quando `prefillErro` não estiver vazio:

```tsx
{prefillErro && (
  <div style={{
    background: "#fef3c7",
    color: "#92400e",
    padding: "12px 16px",
    textAlign: "center",
    fontSize: 14,
  }}>
    {prefillErro}
  </div>
)}
```

Coloque no ponto que fizer mais sentido visualmente (topo da página, antes do Header).

---

## Como testar

1. Publicar o projeto.
2. Abrir no navegador:
   `https://rctr-c.rc-dc.rc-v.jacometo.com.br/?proposta=19d4c9846fceb58b363cb17ceb068565`
3. O checkout deve abrir sozinho, já no passo "Conferência", com os dados da LSLOG
   TRANSPORTES LTDA preenchidos (CNPJ, razão social, RNTRC, endereço de Londrina/PR,
   responsável Paulo Renato Landucci, CPF, e-mail e telefone).
4. Abrir sem o parâmetro (`https://rctr-c.rc-dc.rc-v.jacometo.com.br/`) deve continuar
   abrindo a landing normal, sem nenhum comportamento novo.

---

## Etapa opcional (depois)

Ao transmitir com sucesso no checkout, o site pode chamar um endpoint do CRM para marcar o
rascunho como `transmitted`, para o painel do lead refletir a conclusão. Isso é uma melhoria
futura — não bloqueia o pré-preenchimento.

---

## Resumo do que enviar

Se for repassar para outra pessoa ou IA no projeto do site, o essencial é:

1. **Arquivo 1** — `src/components/landing/CheckoutModal.tsx`: adicionar `cpf?: string;` na
   interface `CheckoutPrefill`, aplicar `maskCpf` no useEffect de prefill e incluir o CPF na
   checagem `completo`.
2. **Arquivo 2** — `src/routes/index.tsx`: adicionar o `PREFILL_ENDPOINT`, o estado
   `prefillErro` e o useEffect que lê `?proposta=` da URL, busca no endpoint e abre o checkout
   preenchido.
3. Publicar e testar com o link do Paulo.
