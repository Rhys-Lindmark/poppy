# Run a Poppy interoperability check

**Roles** Evaluator, Personal Agent, and Company  
**Protocol** Poppy 1.0 and Operations 3  
**Prerequisites** Node 22.18 or later, OpenSSL 3, and this repository

```sh
node src/poppyval.mjs
```

The sandbox report should mark its tested agent and store scenario as passing, with an outcome per test. It exercises actual HTTPS requests, signed-out rejection, OAuth scope consent, revision approval, and the resulting order. The report is suitable for processing by another agent.

To add a candidate, record the exact product build and reachable interface. Give it the same delivery request in a Company sandbox that admits its client ID. Use store-side traces for signed requests and account state for the final outcome. Report strengths and gaps per protocol version and keep unavailable capabilities and untested checks visible. The current built-in fixture recognizes the bundled agent. See the [PoppyVal design](../poppyval.md).
