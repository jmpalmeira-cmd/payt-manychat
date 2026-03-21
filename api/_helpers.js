// ============================================
// FUNÇÕES COMPARTILHADAS - PayT V1
// Baseado na documentação oficial:
// https://github.com/ventuinha/payt-postback
// ============================================

// ========== MANYCHAT API ==========

export async function chamarManyChat(url, payload, apiKey) {
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const corpo = await resposta.json();
    console.log("ManyChat [" + resposta.status + "]:", JSON.stringify(corpo));

    if (resposta.ok) {
      return corpo;
    } else {
      console.log("ERRO ManyChat: HTTP", resposta.status);
      return null;
    }
  } catch (erro) {
    console.error("ERRO na chamada ManyChat:", erro.message);
    return null;
  }
}

export async function buscarSubscriberPorTelefone(telefone, apiKey) {
  const resposta = await chamarManyChat(
    "https://api.manychat.com/fb/subscriber/findBySystemField",
    { field_name: "whatsapp_phone", field_value: telefone },
    apiKey
  );
  if (resposta?.status === "success" && resposta?.data) {
    return resposta.data;
  }
  return null;
}

export async function criarSubscriber(telefone, nome, apiKey) {
  const partes = nome.split(" ");
  const resposta = await chamarManyChat(
    "https://api.manychat.com/fb/subscriber/createSubscriber",
    {
      phone: telefone,
      first_name: partes[0] || "",
      last_name: partes.slice(1).join(" ") || "",
      whatsapp_phone: telefone,
      consent_phrase: "Interação via PayT",
    },
    apiKey
  );
  if (resposta?.status === "success" && resposta?.data) {
    return resposta.data;
  }
  return null;
}

export async function buscarOuCriarSubscriber(telefone, nome, apiKey) {
  let subscriber = await buscarSubscriberPorTelefone(telefone, apiKey);
  let jaExistia = true;

  if (!subscriber) {
    subscriber = await criarSubscriber(telefone, nome, apiKey);
    jaExistia = false;
  }

  return { subscriber, jaExistia };
}

export async function adicionarTag(subscriberId, tagId, apiKey) {
  if (!tagId) return null;
  const resposta = await chamarManyChat(
    "https://api.manychat.com/fb/subscriber/addTag",
    { subscriber_id: subscriberId, tag_id: parseInt(tagId) },
    apiKey
  );
  console.log("Tag ADICIONADA:", tagId);
  return resposta;
}

export async function removerTag(subscriberId, tagId, apiKey) {
  if (!tagId) return null;
  const resposta = await chamarManyChat(
    "https://api.manychat.com/fb/subscriber/removeTag",
    { subscriber_id: subscriberId, tag_id: parseInt(tagId) },
    apiKey
  );
  console.log("Tag REMOVIDA:", tagId);
  return resposta;
}

export async function dispararFlow(subscriberId, flowId, apiKey) {
  if (!flowId) return null;
  const resposta = await chamarManyChat(
    "https://api.manychat.com/fb/sending/sendFlow",
    { subscriber_id: subscriberId, flow_ns: flowId },
    apiKey
  );
  console.log("Flow DISPARADO:", flowId);
  return resposta;
}

export async function definirCampoCustomizado(subscriberId, campo, valor, apiKey) {
  if (!valor) return null;
  const resposta = await chamarManyChat(
    "https://api.manychat.com/fb/subscriber/setCustomField",
    { subscriber_id: subscriberId, field_name: campo, field_value: valor },
    apiKey
  );
  console.log("Campo:", campo, "=", valor);
  return resposta;
}

// ========== EXTRAÇÃO DE DADOS PayT V1 ==========

export function extrairDadosPayT(dados) {
  // Estrutura PayT V1 conforme documentação oficial
  // customer.name, customer.email, customer.phone
  // product.name
  // link.url (URL do checkout, com cart_id em caso de abandono)
  // status (lost_cart, waiting_payment, paid, canceled, etc.)
  // transaction.payment_status (expired, paid, refused, etc.)

  return {
    nome: dados.customer?.name || "",
    email: dados.customer?.email || "",
    telefone: limparTelefone(dados.customer?.phone || ""),
    produto: dados.product?.name || "Produto",
    checkoutUrl: dados.link?.url || "",
    status: dados.status || "",
    paymentStatus: dados.transaction?.payment_status || "",
    paymentMethod: dados.transaction?.payment_method || "",
    type: dados.type || "",
    test: dados.test || false,
    transactionId: dados.transaction_id || "",
    cartRecovered: dados.cart_recovered || false,
  };
}

// ========== UTILITÁRIOS ==========

export function limparTelefone(telefone) {
  if (!telefone) return "";

  // PayT envia telefone como "apenas números"
  let limpo = telefone.replace(/\D/g, "");

  if (limpo.charAt(0) === "0") {
    limpo = limpo.substring(1);
  }

  // Se não tem código do país (55 = Brasil), adiciona
  if (limpo.length === 10 || limpo.length === 11) {
    limpo = "55" + limpo;
  }

  return "+" + limpo;
}

export function responderErro(res, mensagem, status = 500) {
  console.log("ERRO:", mensagem);
  return res.status(status).json({ error: mensagem });
}

export function validarRequest(req, res, nomeEvento) {
  if (req.method === "GET") {
    res.status(200).json({ status: "Webhook " + nomeEvento + " ativo!" });
    return false;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return false;
  }
  return true;
}

export function validarTelefone(telefone, res) {
  if (!telefone || telefone === "+") {
    responderErro(res, "Telefone não encontrado nos dados", 400);
    return false;
  }
  return true;
}
