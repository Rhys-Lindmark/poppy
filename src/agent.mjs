import { assertionType, digest, json, keyPair, now, operations, randomId, readForm,
  redirect, requestUrl, signJwt, version, wellKnown } from './protocol.mjs';

function checked(response, status = 200) {
  if (response.status !== status) throw new Error('Unexpected HTTP status ' + response.status);
  return response.json();
}

export function createAgent({ origin, http, render, trace, sponsors }) {
  const root = keyPair();
  const clientId = origin + '/agent.json';
  const callback = origin + '/agent/oauth/callback';
  const pairwise = randomId(); // This sandbox has one Agent user and one configured Company.
  const flows = new Map();

  async function send(flow, url, options = {}) {
    const { method = 'GET', headers = {} } = options;
    const result = await http(url, options);
    const details = {};
    if (headers['Poppy-Version']) details.version = headers['Poppy-Version'];
    if (headers['Poppy-Extensions']) details.extension = 'Operations 3';
    if (headers['Poppy-Session']) details.session = 'Signed, delegated ES256 key';
    if (headers.Authorization) details.account = 'Scoped access token';
    if (headers['Poppy-Approval']) details.approval = 'User approved the proposed revision';
    try {
      const { error } = result.json();
      if (typeof error === 'string') details.result = error;
    } catch { /* HTTP status is still available. */ }
    trace('Agent → Store', method, new URL(url).pathname, result.status, details, flow.id);
    return result;
  }

  async function discover(flow) {
    const doc = checked(await send(flow, origin + wellKnown));
    if (!/^1\.\d+$/.test(doc.protocol_version) || doc.organization?.domain !== new URL(origin).host ||
        doc.auth?.disabled || typeof doc.organization.name !== 'string') throw new Error('Unsupported store discovery');
    if (!doc.extensions?.operations?.some(({ version: offered }) => offered === '3')) {
      throw new Error('Store does not offer Operations 3');
    }

    const protectedMetadata = checked(await send(flow, origin + '/.well-known/oauth-protected-resource'));
    if (protectedMetadata.resource !== origin || protectedMetadata.authorization_servers?.length !== 1 ||
        protectedMetadata.authorization_servers[0] !== origin || (doc.auth?.issuer && doc.auth.issuer !== origin)) {
      throw new Error('Unexpected Company issuer');
    }
    const oauth = checked(await send(flow, origin + '/.well-known/oauth-authorization-server'));
    if (oauth.issuer !== origin || !oauth.protected_resources?.includes(origin) ||
        !oauth.grant_types_supported?.includes('authorization_code') || oauth.require_pushed_authorization_requests) {
      throw new Error('Unsupported Company authorization metadata');
    }

    const api = doc.apis?.find(({ type }) => type === 'openapi');
    if (!api) throw new Error('Missing store API description');
    const openAPI = checked(await send(flow, api.url));
    if (!openAPI.openapi?.startsWith('3.') || openAPI.servers?.[0]?.url !== origin ||
        openAPI.paths?.['/api/delivery']?.post?.operationId !== 'rescheduleDelivery' ||
        openAPI.paths?.['/api/delivery']?.get?.operationId !== 'readDelivery') {
      throw new Error('Store does not advertise the delivery API');
    }

    flow.company = doc.organization;
    flow.oauth = oauth;
  }

  function signedHeaders(flow, method, path, accessToken) {
    const extra = accessToken ? { ath: digest(accessToken) } : {};
    const claims = {
      iss: clientId, aud: flow.oauth.issuer, sid: flow.sid, sub: pairwise,
      htm: method, htu: requestUrl(origin + path), iat: now(), jti: randomId(), ...extra,
    };
    return {
      'Poppy-Session': signJwt(flow.key, 'poppy-session+jwt', claims, { poppy_dlg: flow.delegation }),
      'Poppy-Version': version,
      'Poppy-Extensions': operations,
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
    };
  }

  function api(flow, method, path, options = {}) {
    const headers = signedHeaders(flow, method, path, options.token);
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.approval) headers['Poppy-Approval'] = options.approval;
    return send(flow, origin + path, { method, headers, body: options.body && JSON.stringify(options.body) });
  }

  function oauthForm(flow, endpoint, fields) {
    const iat = now();
    const assertion = signJwt(root, 'JWT', {
      iss: clientId, sub: clientId, aud: flow.oauth.issuer, iat, exp: iat + 120, jti: randomId(),
    });
    const body = new URLSearchParams({ ...fields, client_assertion_type: assertionType, client_assertion: assertion });
    return send(flow, endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    });
  }

  function signInUrl(flow, scopes) {
    const url = new URL(flow.oauth.authorization_endpoint);
    if (url.origin !== origin || url.username || url.password || url.hash) throw new Error('Unexpected sign-in endpoint');
    const query = {
      response_type: 'code', client_id: clientId, redirect_uri: callback, scope: scopes,
      state: flow.state, code_challenge: digest(flow.verifier), code_challenge_method: 'S256', prompt: 'consent',
    };
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.href;
  }

  async function start(req, res, url) {
    const form = await readForm(req);
    const day = form.get('day');
    const readOnly = form.get('task') === 'read';
    if (!readOnly && !['Saturday', 'Monday'].includes(day)) {
      return json(res, 400, { error: 'unsupported_delivery_day' });
    }
    const id = randomId();
    const issuedAt = now();
    for (const [key, flow] of flows) {
      if (flow.expires <= issuedAt) flows.delete(key);
    }
    const key = keyPair();
    const flow = {
      id, day, readOnly, key, analyticsId: randomId(), state: randomId(), verifier: randomId() + randomId(),
      csrf: randomId(), sid: randomId(), expires: issuedAt + 600,
      delegation: signJwt(root, 'poppy-delegation+jwt', {
        iss: clientId, cnf: { jwk: key.jwk }, iat: issuedAt, exp: issuedAt + 600, jti: randomId(),
      }),
    };
    sponsors.record('task_started', flow.analyticsId);
    await discover(flow);
    sponsors.record('store_discovered', flow.analyticsId);
    if (!readOnly) {
      const options = checked(await api(flow, 'GET', '/api/delivery-options'));
      if (!options.available_days.includes(day)) throw new Error('Requested delivery day is unavailable');
    }
    if ((await api(flow, 'GET', '/api/delivery')).status !== 401) throw new Error('Expected sign-in challenge');
    const consentUrl = signInUrl(flow, readOnly ? 'orders:read' : 'orders:read orders:write');
    flows.set(id, flow);
    res.setHeader('Set-Cookie', '__Host-poppy_flow=' + id + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600');
    return redirect(res, consentUrl);
  }

  function currentFlow(req) {
    const id = req.headers.cookie?.split('; ').find((part) => part.startsWith('__Host-poppy_flow='))?.split('=')[1];
    const flow = flows.get(id);
    return flow?.expires > now() ? flow : undefined;
  }

  async function returnFromOAuth(req, res, url) {
    const flow = currentFlow(req);
    if (!flow || flow.phase || url.searchParams.get('iss') !== origin ||
        url.searchParams.get('state') !== flow.state) return render.message(res, 400, 'Sign-in expired or does not match this request.');
    flow.phase = 'authorizing';
    trace('Store → Agent', 'GET', url.pathname, 200, { result: url.searchParams.has('error') ? 'User declined sign-in' : 'Authorization code returned' }, flow.id);
    if (url.searchParams.has('error')) return render.message(res, 403, 'You declined store access.');
    const code = url.searchParams.get('code');
    if (!code) return render.message(res, 400, 'The store returned no authorization code.');
    const grant = checked(await oauthForm(flow, flow.oauth.token_endpoint, {
      grant_type: 'authorization_code', code, redirect_uri: callback, code_verifier: flow.verifier,
    }));
    const scopes = grant.scope?.split(' ') || [];
    if (grant.token_type !== 'Bearer' || !scopes.includes('orders:read') ||
        (!flow.readOnly && !scopes.includes('orders:write'))) {
      return render.message(res, 403, 'The store granted too little access for this task.');
    }
    sponsors.record('access_granted', flow.analyticsId);
    flow.token = grant.access_token;
    flow.refresh = grant.refresh_token;
    flow.current = checked(await api(flow, 'GET', '/api/delivery', { token: flow.token }));
    if (flow.readOnly) {
      flow.phase = 'done';
      return render.result(res, flow.current, flow.id, 'Current delivery');
    }
    const result = checked(await api(flow, 'POST', '/api/delivery', {
      token: flow.token, body: { delivery_day: flow.day },
    }), 403);
    const terms = result.operation?.terms;
    if (result.error !== 'approval_required' || terms?.delivery_day !== flow.day ||
        Object.keys(terms).length !== 4 ||
        terms.order_id !== flow.current.order_id || terms.previous_day !== flow.current.delivery_day ||
        terms.fee?.amount !== '0.00' || terms.fee?.currency !== 'USD' || Object.keys(terms.fee).length !== 2) {
      throw new Error('Store terms differ from the intended delivery change');
    }
    flow.operation = result.operation;
    flow.policyContext = await sponsors.policyContext(flow.analyticsId);
    sponsors.record('change_proposed', flow.analyticsId);
    flow.phase = 'review';
    return redirect(res, origin + '/agent/review');
  }

  async function approve(req, res) {
    const form = await readForm(req);
    const flow = currentFlow(req);
    if (!flow?.operation || form.get('csrf') !== flow.csrf ||
        form.get('revision') !== flow.operation.revision) {
      return render.message(res, 400, 'Approval expired or does not match the current proposal.');
    }
    if (flow.result) return redirect(res, origin + '/agent/result');
    if (flow.phase !== 'review' || Date.parse(flow.operation.expires_at) <= Date.now()) {
      return render.message(res, 400, 'Approval is no longer available.');
    }
    flow.phase = 'done';
    if (form.get('decision') !== 'approve') {
      sponsors.record('change_declined', flow.analyticsId);
      return render.message(res, 200, 'Delivery change declined.');
    }
    sponsors.record('change_approved', flow.analyticsId);
    const { operation_id, revision } = flow.operation;
    if (![operation_id, revision].every((value) => typeof value === 'string' && /^[\w-]+$/.test(value))) {
      throw new Error('Invalid operation references');
    }
    const approval = 'operation_id="' + operation_id + '", revision="' + revision +
      '", approver="user", approved_at=' + now() + ', input_type="tap", reference="' + randomId() + '"';
    const result = checked(await api(flow, 'POST', '/api/delivery', {
      token: flow.token, body: { delivery_day: flow.day }, approval,
    }));
    flow.result = result;
    sponsors.record('delivery_changed', flow.analyticsId);
    return redirect(res, origin + '/agent/result');
  }

  const endpoints = {
    'GET /agent.json': (_req, res) => json(res, 200, {
      client_id: clientId, client_name: 'Poppy Demo', jwks_uri: origin + '/agent/jwks.json',
      redirect_uris: [callback], token_endpoint_auth_method: 'private_key_jwt',
    }),
    'GET /agent/jwks.json': (_req, res) => json(res, 200, { keys: [{ ...root.jwk, kid: root.kid, alg: 'ES256' }] }),
    'POST /agent/start': start,
    'GET /agent/oauth/callback': returnFromOAuth,
    'GET /agent/review': (req, res) => {
      const flow = currentFlow(req);
      return flow?.phase === 'review'
        ? render.review(res, flow)
        : render.message(res, 404, 'This approval is no longer available.');
    },
    'POST /agent/approval': approve,
    'GET /agent/result': (req, res) => {
      const flow = currentFlow(req);
      return flow?.result
        ? render.result(res, flow.result, flow.id, 'Delivery updated')
        : render.message(res, 404, 'No completed delivery change.');
    },
  };
  return {
    clientId,
    async handle(req, res, url) {
      const endpoint = endpoints[req.method + ' ' + url.pathname];
      if (!endpoint) return false;
      await endpoint(req, res, url);
      return true;
    },
  };
}
