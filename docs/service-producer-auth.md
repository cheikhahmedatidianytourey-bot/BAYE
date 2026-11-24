# BAYE v6.7 — Authenticated lifecycle service producers

## Objective

Provide a fail-closed machine-to-machine authentication boundary for services that submit lifecycle events. This is separate from user identity tokens and separate from the event-level HMAC authorization used by the lifecycle evidence recorder.

## Request signature

The producer sends these headers:

- `X-BAYE-Service-Id`
- `X-BAYE-Key-Id`
- `X-BAYE-Timestamp` (Unix milliseconds)
- `X-BAYE-Nonce` (unique, at least 16 URL-safe characters)
- `X-BAYE-Signature` (lowercase hexadecimal HMAC-SHA256)

The signature is HMAC-SHA256 over these newline-separated values in this exact order:

1. HTTP method (uppercase)
2. Exact request target, including query string
3. Timestamp header text
4. Nonce
5. SHA-256 hex digest of the exact raw request body (empty bytes for no body)
6. Service ID
7. Key ID

The server compares signatures in constant time, enforces a bounded timestamp window, checks the service's required scope, and only then atomically consumes a nonce. Nonce keys are namespaced by service and key ID to prevent collisions between producers.

## Registry and permissions

The host constructs the authenticator with an explicit service registry. Each service has one or more key IDs and secrets (minimum 32 bytes), plus an explicit list of scopes. A service without the required scope is denied. Multiple keys support controlled rotation: deploy the new key, switch the producer, then retire the old key. Secrets must be loaded from host-managed secret storage; never ship them to browser code, task payloads, or logs.

Example configuration shape (illustrative only):

```js
const services = {
  'lifecycle-producer': {
    keys: { 'key-2026-01': process.env.BAYE_LIFECYCLE_PRODUCER_KEY },
    scopes: ['lifecycle:evidence:write']
  }
};
```

## Raw-body requirement

The signature binds the exact transmitted body bytes. JSON middleware must capture those bytes before parsing, for example:

```js
app.use(express.json({
  limit: '20kb',
  verify(req, _res, buffer) {
    req.rawBody = Buffer.from(buffer);
  }
}));
```

Do not reconstruct the signed body with `JSON.stringify(req.body)`; serialization can differ from the bytes the producer signed.

## Integration contract

Attach `requireBayeService(authenticateServiceRequest)` only to explicit internal routes that accept service-produced lifecycle events. The verified principal is attached to `req.bayeService`. Keep user-facing routes separate. The injected nonce store must provide atomic single-use consumption (the PostgreSQL nonce adapter is available); nonce-store errors deny authentication.

This PR adds the reusable authenticator, Express middleware, tests, and documentation. It does not add a lifecycle HTTP route, configure production secrets, create service accounts, provision DB grants, or wire the middleware into the running gateway.

## Security limits

- HMAC proves possession of the configured shared secret and integrity of the signed request; it does not prove that an event is factually true.
- A service's scope is an authorization label enforced by this module, not a substitute for per-mission or per-task ownership checks.
- TLS is required in deployment to protect request confidentiality and credentials in transit.
- Rate limiting, key rotation, secret storage, audit retention, and producer compromise response remain host operational responsibilities.
- No task execution, recovery, merge, or deployment is performed by this module.
