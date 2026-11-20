import { assertionType, decodeJwt, digest, json, now, operations, randomId, readBody, readForm,
  redirect, requestUrl, thumbprint, verifyJwt, version, wellKnown } from './protocol.mjs';

const scopes = {
  'orders:read': 'View the demo delivery',
  'orders:write': 'Change the demo delivery after approval',
};
const scopeNames = Object.keys(scopes);
const account = 'demo-account';
const signingAlgorithms = ['ES256', 'PS384'];

export function createStore({ origin, http, clientId, render, trace, persona }) {
  const order = { order_id: 'demo-order', delivery_day: 'Friday', changes: 0 };
  const pending = new Map();
  const verifications = new Map();
  const codes = new Map();
  const grants = new Map();
  const access = new Map();
  const proposals = new Map();
  const previousAssertions = new Map();

  const tokenEndpoint = origin + '/oauth/token';
  const authorizationEndpoint = origin + '/oauth/authorize';
  const metadataPath = '/.well-known/oauth-protected-resource';
  const company = { name: 'Demo Store', domain: new URL(origin).host };

  async function agentKeys(issuer) {
    if (issuer !== clientId) throw new Error('Client is outside the sandbox allowlist');
    const metadata = await http(clientId);
    const client = metadata.json();
    if (metadata.status !== 200 || client.client_id !== clientId ||
        client.token_endpoint_auth_method !== 'private_key_jwt' ||
        new URL(client.jwks_uri).origin !== origin) throw new Error('Invalid client metadata');
    const publicKeys = await http(client.jwks_uri);
    if (publicKeys.status !== 200 || !Array.isArray(publicKeys.json().keys)) {
      throw new Error('Invalid public key set');
    }
    return { client, keys: publicKeys.json().keys };
  }

  async function assertion(form) {
    if (form.get('client_assertion_type') !== assertionType) throw new Error('Invalid assertion type');
    const jwt = decodeJwt(form.get('client_assertion'));
    const { keys } = await agentKeys(jwt.claims.iss);
    const data = verifyJwt(jwt, keys.find((key) => key.kid === jwt.header.kid), 'JWT', signingAlgorithms);
    const time = now();
    if (data.iss !== data.sub || data.aud !== origin || !Number.isInteger(data.iat) ||
        !Number.isInteger(data.exp) || data.iat > time + 10 || data.exp <= time ||
        data.exp <= data.iat || data.exp - data.iat > 300 || typeof data.jti !== 'string') {
      throw new Error('Invalid client claims');
    }
    for (const [id, expiry] of previousAssertions) {
      if (expiry <= time) previousAssertions.delete(id);
    }
    if (previousAssertions.has(data.jti)) throw new Error('Duplicate client assertion');
    previousAssertions.set(data.jti, data.exp);
    return data.iss;
  }

  async function session(req, url, bearer) {
    const jwt = decodeJwt(req.headers['poppy-session']);
    const delegated = decodeJwt(jwt.header.poppy_dlg);
    const { keys } = await agentKeys(jwt.claims.iss);
    const delegation = verifyJwt(delegated, keys.find((key) => key.kid === delegated.header.kid),
      'poppy-delegation+jwt', signingAlgorithms);
    const time = now();
    if (delegation.iss !== jwt.claims.iss || !Number.isInteger(delegation.iat) ||
        !Number.isInteger(delegation.exp) || delegation.iat > time + 10 ||
        delegation.exp <= time || delegation.exp <= delegation.iat ||
        delegation.exp - delegation.iat > 86400 || typeof delegation.jti !== 'string') {
      throw new Error('Invalid key delegation');
    }
    const jwk = delegation.cnf?.jwk;
    const data = verifyJwt(jwt, jwk, 'poppy-session+jwt', ['ES256']);
    const expectedHash = bearer ? digest(bearer) : undefined;
    if (jwt.header.kid !== thumbprint(jwk) || data.aud !== origin ||
        data.htm !== req.method || data.htu !== requestUrl(url) ||
        !Number.isInteger(data.iat) || Math.abs(time - data.iat) > 60 ||
        ![data.sub, data.sid, data.jti].every((id) => typeof id === 'string' && /^[\w-]{1,128}$/.test(id)) ||
        data.ath !== expectedHash) throw new Error('Invalid session claims');
    return data;
  }

  function issueAccess(res, grant, refresh, grantedScopes = grant.scopes) {
    const token = randomId();
    access.set(token, { grant, scopes: grantedScopes, expires: now() + 600 });
    return json(res, 200, {
      access_token: token, token_type: 'Bearer', expires_in: 600,
      ...(refresh ? { refresh_token: refresh } : {}),
      scope: grantedScopes.join(' '),
    });
  }

  async function authorize(req, res, url) {
    if (req.method === 'GET') {
      const params = url.searchParams;
      if (params.get('client_id') !== clientId || params.get('response_type') !== 'code' ||
          params.get('code_challenge_method') !== 'S256' ||
          !/^[\w-]{43}$/.test(params.get('code_challenge') || '') || !params.get('state')) {
        return json(res, 400, { error: 'invalid_request' });
      }
      const { client } = await agentKeys(clientId);
      const callback = params.get('redirect_uri');
      if (!client.redirect_uris.includes(callback)) return json(res, 400, { error: 'invalid_request' });
      const requested = (params.get('scope') || '').split(' ');
      if (requested.some((scope) => !scopeNames.includes(scope))) return json(res, 400, { error: 'invalid_scope' });
      const ticket = randomId();
      for (const [id, attempt] of verifications) if (attempt.authorization.expires <= now()) verifications.delete(id);
      pending.set(ticket, {
        callback, requested, browser: browserFlow(req), state: params.get('state'), challenge: params.get('code_challenge'), expires: now() + 600,
      });
      return render.signIn(res, ticket, requested.map((scope) => [scope, scopes[scope]]));
    }
    const form = await readForm(req);
    const ticket = form.get('ticket');
    const authorization = pending.get(ticket);
    pending.delete(ticket);
    if (!authorization || authorization.expires <= now()) return json(res, 400, { error: 'invalid_request' });
    const granted = authorization.requested.filter((scope) => form.getAll('scope').includes(scope));
    if (form.get('decision') !== 'allow' || granted.length === 0) return finishAuthorization(res, authorization, []);
    if (!persona || !granted.includes('orders:write')) return finishAuthorization(res, authorization, granted);

    const browser = browserFlow(req);
    if (!browser || browser !== authorization.browser) return json(res, 400, { error: 'invalid_request' });
    try {
      const inquiry = await persona.create(randomId());
      verifications.set(ticket, { authorization, granted, inquiry, browser });
      return render.persona(res, ticket, inquiry.url);
    } catch {
      return render.message(res, 502, 'Persona sandbox verification could not start. Please restart this task.');
    }
  }

  function finishAuthorization(res, authorization, scopes) {
    const callback = new URL(authorization.callback);
    callback.searchParams.set('iss', origin);
    callback.searchParams.set('state', authorization.state);
    if (!scopes.length) {
      callback.searchParams.set('error', 'access_denied');
    } else {
      const code = randomId();
      codes.set(code, { ...authorization, scopes, expires: now() + 60 });
      callback.searchParams.set('code', code);
    }
    return redirect(res, callback.href);
  }

  function browserFlow(req) {
    return req.headers.cookie?.split(/;\s*/).find((part) => part.startsWith('__Host-poppy_flow='))?.split('=')[1];
  }

  async function checkPersona(req, res) {
    const ticket = (await readForm(req)).get('ticket');
    const attempt = verifications.get(ticket);
    if (!attempt || browserFlow(req) !== attempt.browser || attempt.authorization.expires <= now()) {
      return render.message(res, 400, 'This verification request has expired.');
    }
    let status;
    try {
      status = await persona.status(attempt.inquiry);
    } catch {
      return render.persona(res, ticket, attempt.inquiry.url, 'Persona could not be reached. Check again shortly.');
    }
    if (verifications.get(ticket) !== attempt) return render.message(res, 400, 'This verification was already used.');
    if (status === 'approved') {
      verifications.delete(ticket);
      return finishAuthorization(res, attempt.authorization, attempt.granted);
    }
    if (['declined', 'failed', 'expired'].includes(status)) {
      verifications.delete(ticket);
      return finishAuthorization(res, attempt.authorization, []);
    }
    return render.persona(res, ticket, status === 'created' ? attempt.inquiry.url : undefined, 'Verification is still awaiting approval.');
  }

  async function exchange(req, res, revoke) {
    const form = await readForm(req);
    try {
      await assertion(form);
    } catch {
      return json(res, 401, { error: 'invalid_client' });
    }
    if (revoke) {
      const grant = grants.get(form.get('token'));
      if (grant) grant.revoked = true;
      return json(res, 200, {});
    }
    if (form.has('resource') && form.get('resource') !== origin) return json(res, 400, { error: 'invalid_target' });
    if (form.get('grant_type') === 'refresh_token') {
      const grant = grants.get(form.get('refresh_token'));
      if (!grant || grant.revoked || grant.expires <= now()) return json(res, 400, { error: 'invalid_grant' });
      const requested = form.get('scope');
      if (!requested) return issueAccess(res, grant);
      const subset = requested.split(' ');
      if (subset.some((scope) => !grant.scopes.includes(scope))) return json(res, 400, { error: 'invalid_scope' });
      return issueAccess(res, grant, undefined, subset);
    }
    if (form.get('grant_type') !== 'authorization_code') return json(res, 400, { error: 'unsupported_grant_type' });

    const code = form.get('code');
    const data = codes.get(code);
    if (!data || data.expires <= now() || data.callback !== form.get('redirect_uri') ||
        digest(form.get('code_verifier') || '') !== data.challenge) {
      return json(res, 400, { error: 'invalid_grant' });
    }
    codes.delete(code);
    const refresh = randomId();
    const grant = { account, scopes: data.scopes, expires: now() + 3600 };
    grants.set(refresh, grant);
    return issueAccess(res, grant, refresh);
  }

  function challenge(res, status, scope, error) {
    const suffix = error ? 'error="' + error + '", ' : '';
    return json(res, status, {}, {
      'WWW-Authenticate': 'Bearer ' + suffix + 'scope="' + scope + '"',
    });
  }

  async function delivery(req, res, url) {
    if (req.headers['poppy-version'] !== version) return json(res, 400, { error: 'version_unsupported' });
    const bearer = req.headers.authorization?.match(/^Bearer ([\w-]+)$/i)?.[1];
    let identity;
    try {
      identity = await session(req, url, bearer);
    } catch {
      return json(res, 400, { error: 'invalid_session' });
    }

    if (url.pathname === '/api/delivery-options') {
      return json(res, 200, { available_days: ['Saturday', 'Monday'] });
    }
    const scope = req.method === 'GET' ? 'orders:read' : 'orders:write';
    const token = access.get(bearer);
    if (!req.headers.authorization) return challenge(res, 401, scope);
    if (!token || token.expires <= now() || token.grant.revoked) return challenge(res, 401, scope, 'invalid_token');
    if (!token.scopes.includes(scope)) return challenge(res, 403, scope, 'insufficient_scope');
    if (req.method === 'GET') return json(res, 200, { ...order });

    if (req.headers['poppy-extensions'] !== operations) {
      return json(res, 403, { error: 'extension_required', extension: 'operations' });
    }
    const { delivery_day: day } = JSON.parse(await readBody(req));
    if (!['Saturday', 'Monday'].includes(day)) return json(res, 422, { error: 'unavailable_day' });

    const owner = [identity.iss, identity.sub, token.grant.account].join('|');
    const approval = req.headers['poppy-approval'];
    const match = typeof approval === 'string'
      ? /^operation_id="([\w-]+)", revision="([\w-]+)", approver="user", approved_at=(\d+), input_type="tap", reference="([\w-]+)"$/.exec(approval)
      : null;
    const saved = match && proposals.get(match[1]);
    const owned = saved?.owner === owner;
    if (owned && saved.result) return json(res, 200, saved.result);

    if (owned && saved.operation.revision === match[2] &&
        saved.operation.terms.delivery_day === day && saved.originalDay === order.delivery_day &&
        Number(match[3]) <= now() + 10 && Number(match[3]) >= saved.createdAt &&
        Date.parse(saved.operation.expires_at) > Date.now()) {
      order.delivery_day = day;
      order.changes += 1;
      saved.result = { ...order };
      return json(res, 200, saved.result);
    }

    const operation = {
      operation_id: owned ? match[1] : randomId(),
      revision: randomId(),
      summary: 'Move delivery for demo-order from ' + order.delivery_day + ' to ' + day + ' at no charge.',
      terms: { order_id: order.order_id, previous_day: order.delivery_day, delivery_day: day, fee: { amount: '0.00', currency: 'USD' } },
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    };
    proposals.set(operation.operation_id, { operation, owner, originalDay: order.delivery_day, createdAt: now() });
    return json(res, 403, { error: 'approval_required', operation });
  }

  const endpoints = {
    ['GET ' + wellKnown]: (_req, res) => json(res, 200, {
      protocol_version: version, organization: company,
      auth: { scopes },
      apis: [{ type: 'openapi', url: origin + '/openapi.json', description: 'Read and reschedule demo deliveries' }],
      extensions: { operations: [{ version: '3' }] },
    }),
    ['GET ' + metadataPath]: (_req, res) => json(res, 200, {
      resource: origin, authorization_servers: [origin], scopes_supported: scopeNames,
    }),
    'GET /.well-known/oauth-authorization-server': (_req, res) => json(res, 200, {
      issuer: origin, protected_resources: [origin], authorization_endpoint: authorizationEndpoint, token_endpoint: tokenEndpoint,
      revocation_endpoint: origin + '/oauth/revoke', grant_types_supported: ['authorization_code', 'refresh_token'],
      scopes_supported: scopeNames, code_challenge_methods_supported: ['S256'],
      response_types_supported: ['code'], token_endpoint_auth_methods_supported: ['private_key_jwt'],
      token_endpoint_auth_signing_alg_values_supported: signingAlgorithms,
      authorization_response_iss_parameter_supported: true,
    }),
    'GET /openapi.json': (_req, res) => json(res, 200, {
      openapi: '3.1.0', info: { title: 'Demo Store delivery', version },
      servers: [{ url: origin }],
      components: { securitySchemes: { oauth: { type: 'oauth2', flows: {
        authorizationCode: { authorizationUrl: authorizationEndpoint, tokenUrl: tokenEndpoint, scopes },
      } } } },
      paths: {
        '/api/delivery-options': { get: { operationId: 'deliveryOptions', responses: { 200: { description: 'Available days' } } } },
        '/api/delivery': {
          get: { operationId: 'readDelivery', security: [{ oauth: ['orders:read'] }], responses: { 200: { description: 'Current delivery' } } },
          post: {
            operationId: 'rescheduleDelivery', security: [{ oauth: ['orders:write'] }],
            requestBody: { required: true, content: { 'application/json': { schema: {
              type: 'object', required: ['delivery_day'], properties: { delivery_day: { enum: ['Saturday', 'Monday'] } },
            } } } },
            responses: { 200: { description: 'Updated delivery' }, 403: { description: 'Approval or permission required' } },
          },
        },
      },
    }),
    'GET /oauth/authorize': authorize,
    'POST /oauth/authorize': authorize,
    'POST /oauth/persona/check': checkPersona,
    'POST /oauth/token': (req, res) => exchange(req, res, false),
    'POST /oauth/revoke': (req, res) => exchange(req, res, true),
    'GET /api/delivery-options': delivery,
    'GET /api/delivery': delivery,
    'POST /api/delivery': delivery,
  };

  return async (req, res, url) => {
    const endpoint = endpoints[req.method + ' ' + url.pathname];
    if (!endpoint) return false;
    await endpoint(req, res, url);
    if (url.pathname === '/oauth/authorize') {
      const flowId = req.headers.cookie?.split('; ').find((part) => part.startsWith('__Host-poppy_flow='))?.split('=')[1];
      trace('User → Store', req.method, url.pathname, res.statusCode, {}, flowId);
    }
    return true;
  };
}
