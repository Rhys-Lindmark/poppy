# Approve a delivery change

**Roles** User, Personal Agent, and Company  
**Protocol** Poppy 1.0 and Operations 3 over OpenAPI  
**Prerequisites** Node 22.18 or later, OpenSSL 3, and this repository

```sh
npm start -- "Move my delivery to Saturday"
```

Start rescheduling, then grant the demo store’s read and change scopes. The write request should produce HTTP 403 with `approval_required`. Review the order, Friday-to-Saturday change, and USD 0.00 fee in the agent. Choose **Approve change**. The request trace should show a second write returning 200 and the result should say Saturday.

Run the controlled tests for both approval and decline:

```sh
npm test
```

The store holds the proposal until a matching revision receives user approval. The tests verify the old delivery window before approval and the resulting state after approval. See [Operations 3](https://personalagentprotocol.org/docs/1.0/extensions/operations).
