# Pré-preenchimento do formulário pelo link `?proposta=<token>`

Este documento contém as alterações que precisam ser feitas no **projeto da landing page**
("Projeto 3 Seguros Obrigatorio" — site `rctr-c.rc-dc.rc-v.jacometo.com.br`). O código do site
não faz parte deste projeto (CRM), por isso as mudanças precisam ser aplicadas lá.

## Endpoint já pronto no backend do CRM

```
GET https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/proposal-prefill?token=<32 hex>
```

Público (CORS `*`, sem login). Resposta 200:

```json
{
  "cnpj": "35235302000123",
  "razao_social": "LSLOG TRANSPORTES LTDA",
  "rntrc": "52850644",
  "rntrc_situacao": null,
  "endereco": { "logradouro": "OMAR MAZZEI GUIMARAES", "numero": "140", "complemento": "",
                "bairro": "JARDIM MARIA LUIZA", "municipio": "LONDRINA", "uf": "PR", "cep": "86080511" },
  "responsavel": "PAULO RENATO LANDUCCI",
  "cpf": "04023472930",
  "email": "paulo.landucci3@gmail.com",
  "telefone": "554399611414",
  "seguro_vigente": false
}
```

Erros: `400` token inválido, `404` não encontrada, `410` expirada, `409` já transmitida, `429` excesso de requisições.

## Alteração 1 — `src/components/landing/CheckoutModal.tsx`

Adicionar `cpf` à interface de prefill:

```ts
export interface CheckoutPrefill {
  cnpj?: string;
  razaoSocial?: string;
  rntrc?: string;
  email?: string;
  whatsapp?: string;
  responsavel?: string;
  cpf?: string;            // <— novo
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

No `useEffect` que aplica `initialData` (o que começa com `if (!open || !initialData) return;`),
incluir o CPF logo após o `responsavel`:

```ts
if (initialData.cpf && !cpf) setCpf(maskCpf(initialData.cpf.replace(/\D/g, "")));
```

E incluir o CPF na checagem de completude, para abrir direto na Conferência:

```ts
const completo =
  Boolean(initialData.cnpj) &&
  Boolean(initialData.razaoSocial) &&
  Boolean(initialData.email) &&
  Boolean(initialData.whatsapp) &&
  Boolean(initialData.responsavel) &&
  Boolean(initialData.cpf);
```

## Alteração 2 — `src/routes/index.tsx`

Dentro de `LandingPage()`, adicionar um efeito que lê o token da URL, busca os dados e
abre o checkout já preenchido:

```tsx
const PREFILL_ENDPOINT =
  "https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/proposal-prefill";

const [prefillErro, setPrefillErro] = useState("");

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

Exibir `prefillErro` como faixa de aviso no topo da página (quando não vazio) e manter todo o
comportamento atual quando não houver `?proposta=` na URL.

## Teste

Abrir `https://rctr-c.rc-dc.rc-v.jacometo.com.br/?proposta=19d4c9846fceb58b363cb17ceb068565`:
o checkout deve abrir sozinho, na etapa "Conferência", com os dados da LSLOG TRANSPORTES LTDA.

## Etapa opcional (depois)

Ao transmitir com sucesso, o site chamar um endpoint do CRM para marcar o rascunho como
`transmitted`, para o painel do lead refletir a conclusão.
