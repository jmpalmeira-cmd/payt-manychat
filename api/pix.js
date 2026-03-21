// ============================================
// ENDPOINT: /api/pix
// Evento PayT: status = "waiting_payment"
// (PIX gerado / Boleto gerado)
//
// Fluxo:
//   1. Verifica se status é "waiting_payment"
//   2. Busca ou cria contato no ManyChat
//   3. Adiciona tag "PUP"
//   4. Salva produto e link do checkout
//   5. Dispara Flow de recuperação de PIX
// ============================================

import {
  buscarOuCriarSubscriber,
  adicionarTag,
  definirCampoCustomizado,
  dispararFlow,
  extrairDadosPayT,
  responderErro,
  validarRequest,
  validarTelefone,
} from "./_helpers.js";

export default async function handler(req, res) {
  if (!validarRequest(req, res, "AGUARDANDO PAGAMENTO")) return;

  try {
    const dados = req.body;
    const { nome, telefone, produto, checkoutUrl, status, paymentMethod, test } = extrairDadosPayT(dados);

    if (test) {
      console.log("Modo teste - ignorando");
      return res.status(200).json({ result: "Teste ignorado" });
    }

    // Verifica se é aguardando pagamento
    if (status !== "waiting_payment") {
      console.log("Evento ignorado (pix):", status);
      return res.status(200).json({ result: "Evento ignorado: " + status });
    }

    console.log("=== AGUARDANDO PAGAMENTO ===");
    console.log("Cliente:", nome, "|", telefone, "|", produto);
    console.log("Método:", paymentMethod);

    if (!validarTelefone(telefone, res)) return;

    const API_KEY = process.env.MANYCHAT_API_KEY;
    const TAG_PUP = process.env.TAG_PUP_ID;
    const FLOW_PUP = process.env.FLOW_PUP;

    if (!API_KEY || !TAG_PUP || !FLOW_PUP) {
      return responderErro(res, "Variáveis de ambiente incompletas (pix)");
    }

    // 1. Busca ou cria subscriber
    const { subscriber } = await buscarOuCriarSubscriber(telefone, nome, API_KEY);
    if (!subscriber) return responderErro(res, "Falha ao buscar/criar subscriber");

    const id = subscriber.id;

    // 2. Tag + campos + flow
    await adicionarTag(id, TAG_PUP, API_KEY);
    await definirCampoCustomizado(id, "checkout_url", checkoutUrl, API_KEY);
    await definirCampoCustomizado(id, "ultimo_produto", produto, API_KEY);
    await definirCampoCustomizado(id, "metodo_pagamento", paymentMethod, API_KEY);
    await dispararFlow(id, FLOW_PUP, API_KEY);

    console.log("SUCESSO: Aguardando pagamento →", nome);
    return res.status(200).json({ result: "OK", evento: "aguardando_pagamento", subscriber: id });

  } catch (erro) {
    console.error("ERRO (pix):", erro.message);
    return responderErro(res, erro.message);
  }
}
