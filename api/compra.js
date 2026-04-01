// ============================================
// ENDPOINT: /api/compra
// Evento PayT: status = "paid"
// (Finalizada/Aprovada)
//
// Fluxo:
//   1. Verifica se status é "paid"
//   2. Busca ou cria contato no ManyChat
//   3. Remove tag "[PUP] [ABANDONOU CARRINHO]"
//   4. Remove tag "[PUP] [REEMBOLSO SMIA]"
//   5. Adiciona tag "[PUP] [COMPRADORES SMIA]"
// ============================================

import {
  buscarOuCriarSubscriber,
  adicionarTag,
  removerTag,
  extrairDadosPayT,
  responderErro,
  validarRequest,
  validarTelefone,
} from "./_helpers.js";

export default async function handler(req, res) {
  if (!validarRequest(req, res, "COMPRA APROVADA")) return;

  try {
    const dados = req.body;
    const { nome, telefone, produto, status, test } = extrairDadosPayT(dados);

    if (test) {
      console.log("Modo teste - ignorando");
      return res.status(200).json({ result: "Teste ignorado" });
    }

    if (status !== "paid") {
      console.log("Evento ignorado (compra):", status);
      return res.status(200).json({ result: "Evento ignorado: " + status });
    }

    console.log("=== COMPRA APROVADA ===");
    console.log("Cliente:", nome, "|", telefone, "|", produto);

    if (!validarTelefone(telefone, res)) return;

    const API_KEY = process.env.MANYCHAT_API_KEY;
    const TAG_COMPRADOR = process.env.TAG_COMPRADOR_ID;
    const TAG_CARRINHO = process.env.TAG_CARRINHO_ABANDONADO_ID;
    const TAG_REEMBOLSO = process.env.TAG_REEMBOLSO_ID;

    if (!API_KEY || !TAG_COMPRADOR) {
      return responderErro(res, "Variveis de ambiente incompletas (compra)");
    }

    const { subscriber, jaExistia } = await buscarOuCriarSubscriber(telefone, nome, API_KEY);
    if (!subscriber) return responderErro(res, "Falha ao buscar/criar subscriber");

    const id = subscriber.id;

    if (jaExistia) {
      console.log("Limpando tags anteriores...");
      if (TAG_CARRINHO) await removerTag(id, TAG_CARRINHO, API_KEY);
      if (TAG_REEMBOLSO) await removerTag(id, TAG_REEMBOLSO, API_KEY);
    }

    await adicionarTag(id, TAG_COMPRADOR, API_KEY);

    console.log("SUCESSO: Compra aprovada ->", nome, "| Tags limpas:", jaExistia);
    return res.status(200).json({
      result: "OK",
      evento: "compra_aprovada",
      subscriber: id,
      tags_limpas: jaExistia,
    });

  } catch (erro) {
    console.error("ERRO (compra):", erro.message);
    return responderErro(res, erro.message);
  }
}
