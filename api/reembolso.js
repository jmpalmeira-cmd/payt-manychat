// ============================================
// ENDPOINT: /api/reembolso
// Evento PayT: Solicitação de Reembolso
//
// Fluxo:
//   1. Busca contato no ManyChat pelo campo "telefone busca"
//   2. Se não encontrar, cria o contato
//   3. Adiciona tag "[PUP] [REEMBOLSO SMIA]"
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
  if (!validarRequest(req, res, "REEMBOLSO")) return;

  try {
    const dados = req.body;
    const { nome, telefone, produto, status, test } = extrairDadosPayT(dados);

    if (test) {
      console.log("Modo teste - ignorando");
      return res.status(200).json({ result: "Teste ignorado" });
    }

    console.log("=== SOLICITAÇÃO DE REEMBOLSO ===");
    console.log("Cliente:", nome, "|", telefone, "|", produto);

    if (!validarTelefone(telefone, res)) return;

    const API_KEY = process.env.MANYCHAT_API_KEY;
    const TAG_REEMBOLSO = process.env.TAG_REEMBOLSO_ID;

    if (!API_KEY || !TAG_REEMBOLSO) {
      return responderErro(res, "Variáveis de ambiente incompletas (reembolso)");
    }

    // 1. Busca ou cria subscriber
    const { subscriber } = await buscarOuCriarSubscriber(telefone, nome, API_KEY);
    if (!subscriber) return responderErro(res, "Falha ao buscar/criar subscriber");

    const id = subscriber.id;

    // 2. Adiciona tag [PUP] [REEMBOLSO SMIA]
    await adicionarTag(id, TAG_REEMBOLSO, API_KEY);

    console.log("SUCESSO: Reembolso solicitado →", nome);
    return res.status(200).json({ result: "OK", evento: "reembolso", subscriber: id });

  } catch (erro) {
    console.error("ERRO (reembolso):", erro.message);
    return responderErro(res, erro.message);
  }
}
