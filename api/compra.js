// ============================================
// ENDPOINT: /api/compra
// Evento PayT: status = "paid"
// (Finalizada/Aprovada)
//
// Fluxo:
//   1. Verifica se status é "paid"
//   2. Busca ou cria contato no ManyChat
//   3. REMOVE todas tags anteriores
//   4. Adiciona tag "comprador"
//   5. Dispara Flow de pós-compra
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
  if (!validarRequest(req, res, "COMPRA APROVADA")) return;

  try {
    const dados = req.body;
    const { nome, telefone, produto, status, test } = extrairDadosPayT(dados);

    if (test) {
      console.log("Modo teste - ignorando");
      return res.status(200).json({ result: "Teste ignorado" });
    }

    // Verifica se é compra aprovada
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
    const TAG_PUP = process.env.TAG_PUP_ID;
    const TAG_EXPIRADO = process.env.TAG_EXPIRADO_ID;
    const FLOW_COMPRA = process.env.FLOW_POS_COMPRA;

    if (!API_KEY || !TAG_COMPRADOR || !FLOW_COMPRA) {
      return responderErro(res, "Variáveis de ambiente incompletas (compra)");
    }

    // 1. Busca ou cria subscriber
    const { subscriber, jaExistia } = await buscarOuCriarSubscriber(telefone, nome, API_KEY);
    if (!subscriber) return responderErro(res, "Falha ao buscar/criar subscriber");

    const id = subscriber.id;

    // 2. Limpa TODAS as tags de recuperação
    if (jaExistia) {
      console.log("Limpando tags anteriores...");
      await removerTag(id, TAG_CARRINHO, API_KEY);
      await removerTag(id, TAG_PUP, API_KEY);
      await removerTag(id, TAG_EXPIRADO, API_KEY);
    }

    // 3. Adiciona tag comprador + produto
    await adicionarTag(id, TAG_COMPRADOR, API_KEY);
    await definirCampoCustomizado(id, "ultimo_produto", produto, API_KEY);

    // 4. Dispara Flow pós-compra
    await dispararFlow(id, FLOW_COMPRA, API_KEY);

    console.log("SUCESSO: Compra aprovada →", nome, "| Tags limpas:", jaExistia);
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
