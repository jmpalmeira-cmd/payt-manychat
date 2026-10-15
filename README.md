# PayT → ManyChat

Webhooks que recebem eventos da PayT e atualizam contatos, tags, campos e flows no ManyChat. O servidor Node roda no Railway e os handlers continuam compatíveis com a Vercel.

## Endpoints

- `GET /api/<evento>`: verifica se o webhook está carregando.
- `GET /health`: verificação de disponibilidade usada pelo Railway.
- `POST /api/carrinho`: carrinho abandonado (`status: lost_cart`).
- `POST /api/compra`: compra aprovada (`status: paid`).
- `POST /api/pix`: pagamento aguardando (`status: waiting_payment`).
- `POST /api/expirado`: PIX ou boleto expirado (`transaction.payment_status: expired`).
- `POST /api/reembolso`: solicitação de reembolso.
- `POST /api/upsell`: upsell aprovado (`status: paid`).

## Configuração

Copie `.env.example` para o ambiente local ou configure as mesmas variáveis no Railway. Nunca versione os valores reais.

- `MANYCHAT_API_KEY`: token da API pública do ManyChat.
- `TAG_*_ID`: IDs das tags usadas por cada automação.
- `FLOW_PUP` e `FLOW_EXPIRADO`: identificadores dos flows do ManyChat.

Os campos personalizados `telefone busca` (`14216638`) e email (`14453438`) ainda usam IDs vinculados à conta atual do ManyChat.

Os webhooks ainda não exigem uma chave própria de autenticação. Para preservar a compatibilidade atual, essa proteção foi deixada para uma próxima etapa.

## Railway

Conecte este repositório ao serviço e configure as variáveis com os mesmos valores da produção. Nas configurações do serviço, use `npm start`, healthcheck `/health` com timeout de 30 segundos, reinício em caso de falha e uma réplica. Mantenha Serverless desativado para receber webhooks sem inicialização após inatividade, e configure 30 segundos de drenagem para concluir requisições durante uma troca de deploy.

O servidor usa a porta `PORT` fornecida pelo Railway, aceita payloads JSON de até 1 MB e registra evento, código HTTP, duração e identificador da requisição. Esses registros não incluem o payload; os logs dos handlers existentes ainda podem conter dados do cliente.

Para executar localmente com as variáveis de ambiente configuradas:

```bash
npm start
```

Antes de trocar as seis URLs na PayT, valide `GET /health`, `GET /api/<evento>` e `POST /api/<evento>` com `{"test":true}`. O modo teste não altera contatos reais. Não envie a mesma compra aos dois hosts: os flows podem ser disparados duas vezes.

Mantenha a Vercel disponível durante a transição. Se houver falha de disponibilidade ou parsing após a troca, restaure as URLs anteriores na PayT. As falhas já existentes da API do ManyChat devem ser investigadas separadamente, usando os logs.

## Testes

Os testes exercitam os handlers HTTP e simulam somente a fronteira externa do ManyChat; nenhum contato real é alterado.

```bash
npm test
```
