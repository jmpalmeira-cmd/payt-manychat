// ============================================
// FUNÇÕES COMPARTILHADAS - PayT V1
// Usa campo customizado "telefone busca" para
// encontrar contatos existentes no ManyChat
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

// Busca contato pelo campo customizado "telefone busca"
// O campo armazena no formato: 5521973863163 (sem +)
export async function buscarSubscriberPorTelefone(telefoneSemMais, apiKey) {
  try {
    const url = "https://api.manychat.com/fb/subscriber/findByCustomField?field_name=telefone busca&field_value=" + encodeURIComponent(telefoneSemMais);
    const resposta = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiKey,
        Accept: "application/json",
      },
    });

    const corpo = await resposta.json();
    console.log("ManyChat findByCustomField [" + resposta.status + "]:", JSON.stringify(corpo));

    if (resposta.ok && corpo?.status === "success" && corpo?.data && corpo.data.length > 0) {
      return corpo.data[0];
    }
    return null;
  } catch (erro) {
    console.error("ERRO buscarSubscriber:", erro.message);
    return null;
  }
}

// Cria contato com whatsapp_phone (formato com +)
export async function criarSubscriber(telefoneComMais, nome, apiKey) {
  const partes = nome.split(" ");
  const resposta = await chamarManyChat(
    "https://api.manychat.com/fb/subscriber/createSubscriber",
    {
      first_name: partes[0] || "",
      last_name: partes.slice(1).join(" ") || "",
      whatsapp_phone: telefoneComMais,
      has_opt_in_sms: false,
      has_opt_in_email: false,
      consent_phrase: "Interação via PayT",
    },
    apiKey
  );
  if (resposta?.status === "success" && resposta?.data) {
    return resposta.data;
  }
  return null;
}

// Estratégia: tenta criar → se falhar (já existe), busca pelo campo customizado
export async function buscarOuCriarSubscriber(telefone, nome, apiKey) {
  // telefone vem no formato +5511957989341
  const telefoneComMais = telefone;
  const telefoneSemMais = telefone.replace("+", ""); // 5511957989341

  let subscriber = await criarSubscriber(telefoneComMais, nome, apiKey);
  let jaExistia = false;

  if (!subscriber) {
    // Contato provavelmente já existe, busca pelo campo customizado (sem +)
    console.log("Subscriber pode já existir. Buscando por telefone busca:", telefoneSemMais);
    subscriber = await buscarSubscriberPorTelefone(telefoneSemMais, apiKey);
    jaExistia = true;
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

  let limpo = telefone.replace(/\D/g, "");

  if (limpo.charAt(0) === "0") {
    limpo = limpo.substring(1);
  }

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
