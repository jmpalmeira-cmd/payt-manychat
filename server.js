import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import carrinho from "./api/carrinho.js";
import compra from "./api/compra.js";
import pix from "./api/pix.js";
import expirado from "./api/expirado.js";
import reembolso from "./api/reembolso.js";
import upsell from "./api/upsell.js";

const handlers = { carrinho, compra, pix, expirado, reembolso, upsell };
const LIMITE_BODY = 1024 * 1024;

export function criarServidor() {
  const pendentes = new Set();
  const processarRequest = async (req, res) => {
    res.status = (codigo) => {
      res.statusCode = codigo;
      return res;
    };
    res.json = (corpo) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(corpo));
    };

    const caminho = req.url.split("?")[0].replace(/\/$/, "");
    if (caminho === "/health" && ["GET", "HEAD"].includes(req.method)) {
      return res.status(200).json({ status: "ok" });
    }

    const evento = caminho.startsWith("/api/") ? caminho.slice(5) : "";
    if (!Object.hasOwn(handlers, evento)) {
      return res.status(404).json({ error: "Endpoint nao encontrado" });
    }

    const inicio = Date.now();
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => console.log(JSON.stringify({
      message: "webhook_response",
      request_id: requestId,
      evento,
      method: req.method,
      status: res.statusCode,
      duration_ms: Date.now() - inicio,
    })));

    try {
      if (req.method === "POST") {
        let tamanho = 0;
        const partes = [];
        for await (const parte of req) {
          tamanho += parte.length;
          if (tamanho <= LIMITE_BODY) partes.push(parte);
        }
        if (tamanho > LIMITE_BODY) {
          return res.status(413).json({ error: "Payload excede o limite de 1 MB" });
        }
        try {
          req.body = JSON.parse(Buffer.concat(partes).toString("utf8"));
        } catch {
          return res.status(400).json({ error: "JSON invalido" });
        }
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
          return res.status(400).json({ error: "O payload deve ser um objeto JSON" });
        }
      }
      await handlers[evento](req, res);
    } catch {
      if (!res.writableEnded) {
        res.status(500).json({ error: "Falha ao processar webhook" });
      }
    }
  };
  const servidor = createServer((req, res) => {
    const processamento = processarRequest(req, res);
    pendentes.add(processamento);
    const remover = () => pendentes.delete(processamento);
    processamento.then(remover, remover);
  });
  servidor.encerrar = async () => {
    await new Promise((resolve) => servidor.close(resolve));
    await Promise.allSettled(pendentes);
  };
  return servidor;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const servidor = criarServidor();
  const port = Number(process.env.PORT || 3000);
  servidor.listen(port, "0.0.0.0", () => console.log("Webhooks ativos na porta", port));
  process.once("SIGTERM", () => {
    servidor.encerrar().then(() => process.exit(0));
    setTimeout(() => process.exit(1), 30000).unref();
  });
}
