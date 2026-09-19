import test from "node:test";
import assert from "node:assert/strict";

function configurarAmbiente() {
  Object.assign(process.env, {
    MANYCHAT_API_KEY: "chave-de-teste",
    TAG_CARRINHO_ABANDONADO_ID: "101",
    TAG_COMPRADOR_ID: "102",
    TAG_REEMBOLSO_ID: "103",
    TAG_COMPROU_UPSELL_ID: "104",
    TAG_PUP_ID: "105",
    TAG_EXPIRADO_ID: "106",
    FLOW_PUP: "flow-pup",
    FLOW_EXPIRADO: "flow-expirado",
  });
}

function criarResposta() {
  return {
    statusCode: 200,
    body: undefined,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(corpo) {
      this.body = corpo;
      return corpo;
    },
  };
}

function respostaManyChat(corpo, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  };
}

function substituirFetch(t, implementacao) {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = implementacao;
  t.after(() => {
    globalThis.fetch = fetchOriginal;
  });
}

function criarPayload(dados = {}) {
  return {
    customer: {
      name: "Cliente Teste",
      email: "teste@example.com",
      phone: "11999999999",
    },
    product: { name: "Produto Teste" },
    link: { url: "https://example.com/checkout" },
    transaction: { payment_method: "pix", payment_status: "paid" },
    ...dados,
  };
}

async function executar(endpoint, method, body) {
  const { default: handler } = await import(`../api/${endpoint}.js`);
  const res = criarResposta();
  await handler({ method, body }, res);
  return res;
}

test("GET /api/pix informa que o webhook está ativo", async () => {
  const res = await executar("pix", "GET");

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: "Webhook AGUARDANDO PAGAMENTO ativo!" });
});

test("POST /api/carrinho retorna erro quando o ManyChat não aplica a tag", async (t) => {
  configurarAmbiente();
  let chamada = 0;
  substituirFetch(t, async () => {
    chamada += 1;
    return chamada === 1
      ? respostaManyChat({ status: "success", data: { id: 456 } })
      : respostaManyChat({ status: "error" }, 500);
  });

  const res = await executar("carrinho", "POST", criarPayload({ status: "lost_cart" }));

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Falha ao adicionar tag no ManyChat" });
});

test("POST /api/pix retorna erro quando o ManyChat não salva um campo", async (t) => {
  configurarAmbiente();
  let chamada = 0;
  substituirFetch(t, async () => {
    chamada += 1;
    if (chamada === 1) {
      return respostaManyChat({ status: "success", data: { id: 456 } });
    }
    return chamada === 2
      ? respostaManyChat({ status: "success" })
      : respostaManyChat({ status: "error" }, 500);
  });

  const res = await executar("pix", "POST", criarPayload({ status: "waiting_payment" }));

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Falha ao definir campo no ManyChat" });
});

test("POST /api/expirado retorna erro quando o ManyChat não dispara o flow", async (t) => {
  configurarAmbiente();
  let chamada = 0;
  substituirFetch(t, async () => {
    chamada += 1;
    if (chamada === 1) {
      return respostaManyChat({ status: "success", data: { id: 456 } });
    }
    return chamada < 5
      ? respostaManyChat({ status: "success" })
      : respostaManyChat({ status: "error" }, 500);
  });

  const res = await executar("expirado", "POST", criarPayload({
    status: "canceled",
    transaction: { payment_status: "expired" },
  }));

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Falha ao disparar flow no ManyChat" });
});

test("POST /api/compra retorna erro quando o ManyChat não remove uma tag", async (t) => {
  configurarAmbiente();
  let chamada = 0;
  substituirFetch(t, async () => {
    chamada += 1;
    if (chamada === 1) return respostaManyChat({ status: "error" }, 400);
    if (chamada === 2) {
      return respostaManyChat({ status: "success", data: [{ id: 456 }] });
    }
    return respostaManyChat({ status: "error" }, 500);
  });

  const res = await executar("compra", "POST", criarPayload({ status: "paid" }));

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Falha ao remover tag no ManyChat" });
});

test("POST /api/compra retorna erro quando o ManyChat não salva o email", async (t) => {
  configurarAmbiente();
  let chamada = 0;
  substituirFetch(t, async () => {
    chamada += 1;
    return chamada === 1
      ? respostaManyChat({ status: "success", data: { id: 456 } })
      : respostaManyChat({ status: "error" }, 500);
  });

  const res = await executar("compra", "POST", criarPayload({ status: "paid" }));

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Falha ao definir campo no ManyChat" });
});

test("POST /api/carrinho não aceita status de erro do ManyChat como sucesso", async (t) => {
  configurarAmbiente();
  let chamada = 0;
  substituirFetch(t, async () => {
    chamada += 1;
    return respostaManyChat(chamada === 1
      ? { status: "success", data: { id: 456 } }
      : { status: "error", message: "Tag inválida" });
  });

  const res = await executar("carrinho", "POST", criarPayload({ status: "lost_cart" }));

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Falha ao adicionar tag no ManyChat" });
});

test("os seis webhooks processam eventos válidos", async (t) => {
  configurarAmbiente();
  substituirFetch(t, async (url) => respostaManyChat(
    String(url).includes("createSubscriber")
      ? { status: "success", data: { id: 456 } }
      : { status: "success", data: {} }
  ));

  const casos = [
    ["carrinho", { status: "lost_cart" }],
    ["compra", { status: "paid" }],
    ["pix", { status: "waiting_payment" }],
    ["expirado", { status: "canceled", transaction: { payment_status: "expired" } }],
    ["reembolso", { status: "refunded" }],
    ["upsell", { status: "paid", type: "upsell" }],
  ];

  for (const [endpoint, dadosEvento] of casos) {
    const res = await executar(endpoint, "POST", criarPayload(dadosEvento));
    assert.equal(res.statusCode, 200, endpoint);
    assert.equal(res.body.result, "OK", endpoint);
  }
});
