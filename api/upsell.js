// ============================================
// ENDPOINT: /api/upsell
// Evento PayT: Compra do Upsell
//
// Fluxo:
//   1. Busca ou cria contato no ManyChat
//   2. Adiciona tag "[PUP] [COMPROU UPSELL SMIA]"
// ============================================

import {
  buscarOuCriarSubscriber,
  adicionarTag,
  extrairDadosPayT,
  responderErro,
  validarRequest,
  validarTelefone,
} from "./_helpers.js";

export default async function handler(req, res) {
  if (!validarRequest(req, res, "UPSELL")) return;

  try {
    const dados = req.body;
    const { nome, telefone, produto, status, test } = extrairDadosPayT(dados);

    if (test) {
      console.log("Modo teste - ignorando");
      return res.status(200).json({ result: "Teste ignorado" });
    }

    if (status !== "paid") {
      console.log("Evento ignorado (upsell):", status);
      return res.status(200).json({ result: "Evento ignorado: " + status });
    }

    console.log("=== UPSELL COMPRADO ===");
    console.log("Cliente:", nome, "|", telefone, "|", produto);

    if (!validarTelefone(telefone, res)) return;

    const API_KEY = process.env.MANYCHAT_API_KEY;
    const TAG_UPSELL = process.env.TAG_COMPROU_UPSELL_ID;

    if (!API_KEY || !TAG_UPSELL) {
      return responderErro(res, "Variaveis de ambiente incompletas (upsell)");
    }

    const { subscriber } = await buscarOuCriarSubscriber(telefone, nome, API_KEY);
    if (!subscriber) return responderErro(res, "Falha ao buscar/criar subscriber");

    const id = subscriber.id;

    await adicionarTag(id, TAG_UPSELL, API_KEY);

    console.log("SUCESSO: Upsell comprado ->", nome);
    return res.status(200).json({ result: "OK", evento: "upsell_comprado", subscriber: id });

  } catch (erro) {
    console.error("ERRO (upsell):", erro.message);
    return responderErro(res, erro.message);
  }
}
