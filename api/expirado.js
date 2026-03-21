// ============================================
// ENDPOINT: /api/expirado
// Evento PayT: transaction.payment_status = "expired"
// (PIX expirou / Boleto expirou)
//
// Na PayT, "Pagamento Expirado" chega como status
// "canceled" com payment_status "expired"
//
// Fluxo:
//   1. Verifica se payment_status é "expired"
//   2. Busca ou cria contato no ManyChat
//   3. Remove tag "PUP" (mata flow anterior)
//   4. Adiciona tag "EXPIRADO"
//   5. Dispara Flow de pagamento expirado
// ============================================

import {
  buscarOuCriarSubscriber,
  adicionarTag,
  removerTag,
  definirCampoCustomizado,
  dispararFlow,
  extrairDadosPayT,
  responderErro,
  validarRequest,
  validarTelefone,
} from "./_helpers.js";

export default async function handler(req, res) {
  if (!validarRequest(req, res, "PAGAMENTO EXPIRADO")) return;

  try {
    const dados = req.body;
    const { nome, telefone, produto, checkoutUrl, status, paymentStatus, test } = extrairDadosPayT(dados);

    if (test) {
      console.log("Modo teste - ignorando");
      return res.status(200).json({ result: "Teste ignorado" });
    }

    // PayT envia pagamento expirado com payment_status = "expired"
    if (paymentStatus !== "expired") {
      console.log("Evento ignorado (expirado):", status, "|", paymentStatus);
      return res.status(200).json({ result: "Evento ignorado: " + paymentStatus });
    }

    console.log("=== PAGAMENTO EXPIRADO ===");
    console.log("Cliente:", nome, "|", telefone, "|", produto);

    if (!validarTelefone(telefone, res)) return;

    const API_KEY = process.env.MANYCHAT_API_KEY;
    const TAG_PUP = process.env.TAG_PUP_ID;
    const TAG_EXPIRADO = process.env.TAG_EXPIRADO_ID;
    const FLOW_EXPIRADO = process.env.FLOW_EXPIRADO;

    if (!API_KEY || !TAG_EXPIRADO || !FLOW_EXPIRADO) {
      return responderErro(res, "Variáveis de ambiente incompletas (expirado)");
    }

    // 1. Busca ou cria subscriber
    const { subscriber, jaExistia } = await buscarOuCriarSubscriber(telefone, nome, API_KEY);
    if (!subscriber) return responderErro(res, "Falha ao buscar/criar subscriber");

    const id = subscriber.id;

    // 2. Remove tag PUP (mata flow de aguardando)
    if (jaExistia && TAG_PUP) {
      await removerTag(id, TAG_PUP, API_KEY);
    }

    // 3. Adiciona tag EXPIRADO + campos + flow
    await adicionarTag(id, TAG_EXPIRADO, API_KEY);
    await definirCampoCustomizado(id, "checkout_url", checkoutUrl, API_KEY);
    await definirCampoCustomizado(id, "ultimo_produto", produto, API_KEY);
    await dispararFlow(id, FLOW_EXPIRADO, API_KEY);

    console.log("SUCESSO: Pagamento expirado →", nome);
    return res.status(200).json({ result: "OK", evento: "pagamento_expirado", subscriber: id });

  } catch (erro) {
    console.error("ERRO (expirado):", erro.message);
    return responderErro(res, erro.message);
  }
}
