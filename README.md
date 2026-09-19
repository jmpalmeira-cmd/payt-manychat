# PayT → ManyChat

Webhooks serverless que recebem eventos da PayT e atualizam contatos, tags, campos e flows no ManyChat.

## Endpoints

- `GET /api/<evento>`: verifica se o webhook está carregando.
- `POST /api/carrinho`: carrinho abandonado (`status: lost_cart`).
- `POST /api/compra`: compra aprovada (`status: paid`).
- `POST /api/pix`: pagamento aguardando (`status: waiting_payment`).
- `POST /api/expirado`: PIX ou boleto expirado (`transaction.payment_status: expired`).
- `POST /api/reembolso`: solicitação de reembolso.
- `POST /api/upsell`: upsell aprovado (`status: paid`).

## Configuração

Copie `.env.example` para o ambiente local ou configure as mesmas variáveis na Vercel. Nunca versione os valores reais.

- `MANYCHAT_API_KEY`: token da API pública do ManyChat.
- `TAG_*_ID`: IDs das tags usadas por cada automação.
- `FLOW_PUP` e `FLOW_EXPIRADO`: identificadores dos flows do ManyChat.

Os campos personalizados `telefone busca` (`14216638`) e email (`14453438`) ainda usam IDs vinculados à conta atual do ManyChat.

Os webhooks ainda não exigem uma chave própria de autenticação. Para preservar a compatibilidade atual, essa proteção foi deixada para uma próxima etapa.

## Testes

Os testes exercitam os handlers HTTP e simulam somente a fronteira externa do ManyChat; nenhum contato real é alterado.

```bash
npm test
```
