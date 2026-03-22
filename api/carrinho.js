// ============================================
// ENDPOINT: /api/carrinho
// Evento PayT: status = "lost_cart"
// (Carrinho Perdido / Abandono de Checkout)
//
// Fluxo:
//   1. Verifica se status é "lost_cart"
//   2. Busca ou cria contato no ManyChat
//   3. Salva nome do produto
//   4. Adiciona tag "[PUP] [ABANDONOU CARRINHO]"
//      (ManyChat dispara o flow automaticamente pela tag)
// ============================================

import {
  buscarOuCriarSubscriber,
  adicionarTag,
  definirCampoCustomizado,
  extrairDadosPayT,
  responderErro,
  validarRequest,
  validarTelefone,
} from "./_helpers.js";

export default async function handler(req, res) {
  if (!validarRequest(req, res, "CARRINHO ABANDONADO")) return;

  try {
    const dados = req.body;
    const { nome, telefone, produto, status, test } = extrairDadosPayT(dados);

    // Ignora testes
    if (test) {
      console.log("Modo teste - ignorando");
      return res.status(200).json({ result: "Teste ignorado" });
    }

    // Verifica se é carrinho abandonado
    if (status !== "lost_cart") {
      console.log("Evento ignorado (carrinho):", status);
      return res.status(200).json({ result: "Evento ignorado: " + status });
    }

    console.log("=== CARRINHO ABANDONADO ===");
    console.log("Cliente:", nome, "|", telefone, "|", produto);

    if (!validarTelefone(telefone, res)) return;

    const API_KEY = process.env.MANYCHAT_API_KEY;
    const TAG_CARRINHO = process.env.TAG_CARRINHO_ABANDONADO_ID;

    if (!API_KEY || !TAG_CARRINHO) {
      return responderErro(res, "Variáveis de ambiente incompletas (carrinho)");
    }

    // 1. Busca ou cria subscriber
    const { subscriber } = await buscarOuCriarSubscriber(telefone, nome, API_KEY);
    if (!subscriber) return responderErro(res, "Falha ao buscar/criar subscriber");

    const id = subscriber.id;

    // 2. Salva nome do produto
    await definirCampoCustomizado(id, "ultimo_produto", produto, API_KEY);

    // 3. Adiciona tag [PUP] [ABANDONOU CARRINHO] (ManyChat dispara o flow automaticamente)
    await adicionarTag(id, TAG_CARRINHO, API_KEY);

    console.log("SUCESSO: Carrinho abandonado →", nome);
    return res.status(200).json({ result: "OK", evento: "carrinho_abandonado", subscriber: id });

  } catch (erro) {
    console.error("ERRO (carrinho):", erro.message);
    return responderErro(res, erro.message);
  }
}
