import { createHmac } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

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

function payloadKiwify(produto) {
  return {
    order_id: "pedido-kiwify-1",
    order_status: "paid",
    sale_type: "producer",
    store_id: "loja-principium",
    webhook_event_type: "order_approved",
    Product: {
      product_id: "produto-oficial",
      product_name: produto,
    },
    Customer: {
      full_name: "Cliente Teste",
      email: "cliente@example.com",
      mobile: "+5511999999999",
    },
    Commissions: { charge_amount: 29700 },
  };
}

function requestAssinado(body, token) {
  const rawBody = JSON.stringify(body);
  const signature = createHmac("sha1", token).update(rawBody).digest("hex");
  return {
    method: "POST",
    body,
    rawBody,
    url: `/api/kiwify?signature=${signature}`,
  };
}

function configurarAmbiente() {
  Object.assign(process.env, {
    KIWIFY_WEBHOOK_TOKEN: "segredo-de-teste",
    MANYCHAT_API_KEY: "chave-de-teste",
    TAG_COMPRADOR_ID: "73956085",
    TAG_COMPRADOR_ACELERA_ID: "89971500",
    TAG_COMPROU_UPSELL_ID: "84641981",
    TAG_CARRINHO_ABANDONADO_ID: "80318141",
    TAG_REEMBOLSO_ID: "84570378",
  });
}

function simularManyChat(t, tagsAtuais) {
  const chamadas = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    chamadas.push({ url: String(url), body: options.body });
    let data = {};
    let status = "success";
    let ok = true;
    if (String(url).includes("createSubscriber")) {
      if (tagsAtuais) {
        status = "error";
        ok = false;
      } else {
        data = { id: 456 };
      }
    } else if (String(url).includes("findByCustomField")) {
      data = [{ id: 456, tags: tagsAtuais || [] }];
    }
    return {
      ok,
      status: ok ? 200 : 400,
      json: async () => ({ status, data }),
    };
  };
  t.after(() => {
    globalThis.fetch = fetchOriginal;
  });
  return chamadas;
}

async function executar(body, token = process.env.KIWIFY_WEBHOOK_TOKEN) {
  const { default: handler } = await import("../api/kiwify.js");
  const res = criarResposta();
  await handler(requestAssinado(body, token), res);
  return res;
}

test("compra aprovada do Acelera na Kiwify aplica a tag de comprador do Acelera", async (t) => {
  configurarAmbiente();
  const chamadas = simularManyChat(t);
  const body = payloadKiwify("Oficial | Acelera Black");
  const res = await executar(body);

  assert.equal(res.statusCode, 200);
  const addTag = chamadas.find((chamada) => chamada.url.includes("/subscriber/addTag"));
  assert.equal(JSON.parse(addTag.body).tag_id, 89971500);
});

test("compra aprovada do SMIA na Kiwify aplica a tag de comprador do SMIA", async (t) => {
  configurarAmbiente();
  const chamadas = simularManyChat(t);

  const res = await executar(payloadKiwify("Oficial | Mentoria Social Media IA"));

  assert.equal(res.statusCode, 200);
  const addTag = chamadas.find((chamada) => chamada.url.includes("/subscriber/addTag"));
  assert.equal(JSON.parse(addTag.body).tag_id, 73956085);
});

test("compra aprovada do Pack na Kiwify aplica a tag de upsell do SMIA", async (t) => {
  configurarAmbiente();
  const chamadas = simularManyChat(t);

  const res = await executar(payloadKiwify("Oficial | Pack Portfólio Profissional"));

  assert.equal(res.statusCode, 200);
  const addTag = chamadas.find((chamada) => chamada.url.includes("/subscriber/addTag"));
  assert.equal(JSON.parse(addTag.body).tag_id, 84641981);
});

test("carrinho abandonado do SMIA na Kiwify aplica a tag de carrinho do SMIA", async (t) => {
  configurarAmbiente();
  const chamadas = simularManyChat(t);
  const body = payloadKiwify("Oficial | Mentoria Social Media IA");
  body.webhook_event_type = "cart_abandoned";
  body.order_status = "abandoned";

  const res = await executar(body);

  assert.equal(res.statusCode, 200);
  const addTag = chamadas.find((chamada) => chamada.url.includes("/subscriber/addTag"));
  assert.equal(JSON.parse(addTag.body).tag_id, 80318141);
});

test("reembolso do SMIA na Kiwify remove comprador e aplica a tag de reembolso", async (t) => {
  configurarAmbiente();
  const chamadas = simularManyChat(t, [{ id: 73956085 }]);
  const body = payloadKiwify("Oficial | Mentoria Social Media IA");
  body.webhook_event_type = "order_refunded";
  body.order_status = "refunded";

  const res = await executar(body);

  assert.equal(res.statusCode, 200);
  const removeTag = chamadas.find((chamada) => chamada.url.includes("/subscriber/removeTag"));
  const addTag = chamadas.find((chamada) => chamada.url.includes("/subscriber/addTag"));
  assert.equal(JSON.parse(removeTag.body).tag_id, 73956085);
  assert.equal(JSON.parse(addTag.body).tag_id, 84570378);
});

test("assinatura inválida não chama o ManyChat", async (t) => {
  configurarAmbiente();
  const chamadas = simularManyChat(t);
  const body = payloadKiwify("Oficial | Acelera Black");

  const res = await executar(body, "token-errado");

  assert.equal(res.statusCode, 401);
  assert.equal(chamadas.length, 0);
});

test("produto não mapeado não recebe tag do SMIA por engano", async (t) => {
  configurarAmbiente();
  const chamadas = simularManyChat(t);

  const res = await executar(payloadKiwify("Outro produto"));

  assert.equal(res.statusCode, 200);
  assert.equal(chamadas.length, 0);
});
