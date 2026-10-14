import { extractQualificationFromMessages } from "./index.ts";
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
Deno.test("'não tenho CT-e próprio' não vira contratado", () => {
  const r = extractQualificationFromMessages(["não tenho CT-e próprio"]);
  assertEquals(r.tipo_transportador, "subcontratado");
  assertEquals(r._emissao_explicita, undefined);
});
Deno.test("'quem emite o CT-e é a transportadora' não vira contratado", () => {
  const r = extractQualificationFromMessages(["quem emite o CT-e é a transportadora"]);
  assertNotEquals(r.tipo_transportador, "contratado");
  assertEquals(r._emissao_explicita, undefined);
});
Deno.test("'emito meu CT-e' continua contratado", () => {
  const r = extractQualificationFromMessages(["eu emito meu CT-e"]);
  assertEquals(r.tipo_transportador, "contratado");
});
