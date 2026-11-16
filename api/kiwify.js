import { createHmac, timingSafeEqual } from "node:crypto";

import carrinho from "./carrinho.js";
import compra from "./compra.js";
import reembolso from "./reembolso.js";

function assinaturaValida(rawBody, signature, token) {
  if (!token || !signature || !/^[a-f0-9]{40}$/i.test(signature)) return false;
  const esperada = createHmac("sha1", token).update(rawBody).digest();
  const recebida = Buffer.from(signature, "hex");
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
}

function assinaturaDaUrl(url) {
  return new URL(url || "/api/kiwify", "https://payt-manychat.local")
    .searchParams.get("signature");
}

function paraPayloadPayt(evento, status) {
  const cliente = evento.Customer || evento.customer || {};
  const produto = evento.Product || evento.product || {};
  return {
    status,
    type: "order",
    test: false,
    customer: {
      name: cliente.full_name || cliente.name || "",
      email: cliente.email || "",
      phone: cliente.mobile || cliente.phone || "",
    },
    product: {
      name: produto.product_name || produto.name || "Produto",
    },
    link: {
      url: evento.checkout_link || evento.checkout_url || "",
    },
    transaction: {
      payment_method: evento.payment_method || "",
      payment_status: status,
    },
    transaction_id: evento.order_id || evento.order_ref || "",
  };
}

function tipoProduto(evento) {
  const produto = evento.Product || evento.product || {};
  const nome = String(produto.product_name || produto.name || "").toLowerCase();
  if (nome.includes("social media") || nome.includes("smia")) return "smia";
  if (nome.includes("acelera")) return "acelera";
  if (nome.includes("pack") && nome.includes("port")) return "pack";
  return null;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ status: "Webhook KIWIFY → MANYCHAT ativo!" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo nao permitido" });
  }

  const rawBody = req.rawBody
    ? Buffer.from(req.rawBody).toString("utf8")
    : JSON.stringify(req.body || {});
  const token = process.env.KIWIFY_WEBHOOK_TOKEN;
  if (!assinaturaValida(rawBody, assinaturaDaUrl(req.url), token)) {
    return res.status(401).json({ error: "Assinatura invalida" });
  }

  const evento = req.body || JSON.parse(rawBody);
  if (evento.test === true || evento.is_test === true) {
    return res.status(200).json({ result: "Teste ignorado" });
  }

  const tipo = String(evento.webhook_event_type || "").toLowerCase();
  const status = String(evento.order_status || "").toLowerCase();
  const produto = tipoProduto(evento);
  if (produto && tipo === "order_approved" && status === "paid") {
    return compra({ method: "POST", body: paraPayloadPayt(evento, "paid") }, res);
  }
  if (produto === "smia" && (tipo.includes("abandon") || status.includes("abandon"))) {
    return carrinho({ method: "POST", body: paraPayloadPayt(evento, "lost_cart") }, res);
  }
  if (produto === "smia" && (
    tipo.includes("refund")
    || tipo.includes("chargeback")
    || status === "refunded"
    || status === "chargedback"
  )) {
    return reembolso({ method: "POST", body: paraPayloadPayt(evento, "refunded") }, res);
  }

  return res.status(200).json({ result: `Evento ignorado: ${tipo || status || "desconhecido"}` });
}
