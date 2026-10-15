import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { criarServidor } from "../server.js";

const endpoints = ["carrinho", "compra", "pix", "expirado", "reembolso", "upsell"];

async function iniciarServidor(t) {
  const servidor = criarServidor();
  await new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  return servidor.address().port;
}

async function requisitar(port, path, method = "GET", body) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" },
    }, (res) => {
      const partes = [];
      res.on("data", (parte) => partes.push(parte));
      res.on("end", () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(partes).toString("utf8"),
      }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end(body);
  });
}

function substituirFetch(t, implementacao) {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = implementacao;
  t.after(() => { globalThis.fetch = fetchOriginal; });
}

function configurarCompra(t) {
  const valores = {
    MANYCHAT_API_KEY: "chave-de-teste",
    TAG_COMPRADOR_ID: "102",
  };
  const originais = Object.fromEntries(Object.keys(valores).map((chave) => [chave, process.env[chave]]));
  Object.assign(process.env, valores);
  t.after(() => {
    for (const [chave, valor] of Object.entries(originais)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  });
}

function respostaManyChat(corpo, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo };
}

test("os seis endpoints mantêm GET e ignoram eventos de teste sem chamar o ManyChat", async (t) => {
  const port = await iniciarServidor(t);
  let chamadas = 0;
  substituirFetch(t, async () => {
    chamadas += 1;
    throw new Error("ManyChat não deve receber eventos de teste");
  });

  for (const endpoint of endpoints) {
    const get = await requisitar(port, `/api/${endpoint}`);
    assert.equal(get.statusCode, 200, endpoint);
    assert.match(get.headers["content-type"], /application\/json/);
    assert.match(JSON.parse(get.body).status, /^Webhook .+ ativo!$/);

    const post = await requisitar(port, `/api/${endpoint}`, "POST", JSON.stringify({ test: true }));
    assert.equal(post.statusCode, 200, endpoint);
    assert.deepEqual(JSON.parse(post.body), { result: "Teste ignorado" });
  }
  assert.equal(chamadas, 0);
});

test("health, rotas desconhecidas, métodos e URLs com query funcionam por HTTP", async (t) => {
  const port = await iniciarServidor(t);
  assert.equal((await requisitar(port, "/health")).statusCode, 200);
  const head = await requisitar(port, "/health", "HEAD");
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, "");
  assert.equal((await requisitar(port, "/api/desconhecido")).statusCode, 404);
  assert.equal((await requisitar(port, "/api/_helpers")).statusCode, 404);
  assert.equal((await requisitar(port, "/api/compra", "PUT")).statusCode, 405);
  assert.equal((await requisitar(port, "/api/compra/?origem=payt")).statusCode, 200);
});

test("compra por HTTP preserva JSON UTF-8 e aplica a tag de comprador", async (t) => {
  configurarCompra(t);
  const chamadas = [];
  substituirFetch(t, async (url, options) => {
    chamadas.push({ url: String(url), payload: JSON.parse(options.body) });
    return respostaManyChat({ status: "success", data: { id: 456 } });
  });
  const port = await iniciarServidor(t);

  const res = await requisitar(port, "/api/compra?origem=payt", "POST", JSON.stringify({
    status: "paid",
    customer: { name: "João Ação", phone: "11999999999", email: "teste@example.com" },
  }));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    result: "OK", evento: "compra_aprovada", subscriber: 456, tags_limpas: false,
  });
  assert.deepEqual(chamadas.find(({ url }) => url.includes("createSubscriber")).payload, {
    first_name: "João", last_name: "Ação", whatsapp_phone: "+5511999999999",
    has_opt_in_sms: false, has_opt_in_email: false, consent_phrase: "Interacao via PayT",
  });
  assert.deepEqual(chamadas.find(({ url }) => url.includes("addTag")).payload, {
    subscriber_id: 456, tag_id: 102,
  });
});

test("falha na aplicação da tag continua retornando HTTP 500", async (t) => {
  configurarCompra(t);
  substituirFetch(t, async (url) => respostaManyChat(String(url).includes("createSubscriber")
    ? { status: "success", data: { id: 456 } }
    : { status: "error" }));
  const port = await iniciarServidor(t);
  const res = await requisitar(port, "/api/compra", "POST", JSON.stringify({
    status: "paid", customer: { name: "Cliente Teste", phone: "11999999999" },
  }));

  assert.equal(res.statusCode, 500);
  assert.deepEqual(JSON.parse(res.body), { error: "Falha ao adicionar tag no ManyChat" });
});

test("corpos inválidos e maiores que 1 MB são rejeitados antes do ManyChat", async (t) => {
  const port = await iniciarServidor(t);
  let chamadas = 0;
  substituirFetch(t, async () => {
    chamadas += 1;
    throw new Error("ManyChat não deve receber corpos inválidos");
  });

  for (const body of ["", "   ", "{", "null", "[]", "[{}]", "42", '"texto"', "true"]) {
    const res = await requisitar(port, "/api/compra", "POST", body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(typeof JSON.parse(res.body).error, "string");
  }
  const grande = await requisitar(port, "/api/compra", "POST", JSON.stringify({
    padding: "a".repeat(1024 * 1024),
  }));
  assert.equal(grande.statusCode, 413);
  assert.equal(chamadas, 0);
});
