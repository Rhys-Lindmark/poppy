import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, constants } from 'node:crypto';
import { request } from 'node:https';

export const version = '1.0';
export const operations = '"operations";v="3"';
export const wellKnown = '/.well-known/poppy.json';
export const assertionType = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
export const now = () => Math.floor(Date.now() / 1000);
export const randomId = () => randomBytes(24).toString('base64url');
export const digest = (value) => createHash('sha256').update(value).digest('base64url');

export function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  return { privateKey, jwk, kid: thumbprint(jwk) };
}

export function thumbprint({ crv, kty, x, y }) {
  return digest(JSON.stringify({ crv, kty, x, y }));
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signJwt(key, type, claims, extra = {}) {
  const header = { alg: 'ES256', typ: type, kid: key.kid, ...extra };
  const message = encode(header) + '.' + encode(claims);
  const signature = sign('sha256', Buffer.from(message), { key: key.privateKey, dsaEncoding: 'ieee-p1363' });
  return message + '.' + signature.toString('base64url');
}

export function decodeJwt(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('Invalid JWT');
  const segments = value.split('.');
  if (segments.length !== 3 || segments.some((segment) => !/^[\w-]+$/.test(segment))) {
    throw new Error('Invalid JWT encoding');
  }
  const [header, payload, signature] = segments;
  return {
    header: JSON.parse(Buffer.from(header, 'base64url')),
    claims: JSON.parse(Buffer.from(payload, 'base64url')),
    message: Buffer.from(header + '.' + payload),
    signature: Buffer.from(signature, 'base64url'),
  };
}

export function verifyJwt(jwt, jwk, type, algorithms) {
  const { header, claims, message, signature } = jwt;
  if (header.typ !== type || !algorithms.includes(header.alg) || !jwk || 'd' in jwk) {
    throw new Error('Unexpected JWT type or key');
  }
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const es256 = header.alg === 'ES256' && jwk.kty === 'EC' && jwk.crv === 'P-256';
  const ps384 = header.alg === 'PS384' && jwk.kty === 'RSA';
  if (!es256 && !ps384) throw new Error('Unexpected JWT key type');
  const options = es256
    ? { key, dsaEncoding: 'ieee-p1363' }
    : { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 };
  if (!verify(es256 ? 'sha256' : 'sha384', message, options, signature)) {
    throw new Error('Invalid JWT signature');
  }
  return claims;
}

export function requestUrl(url) {
  const normalized = new URL(url);
  normalized.search = '';
  normalized.hash = '';
  return normalized.href;
}

export function confinedHttp(origin, ca) {
  return async (url, options = {}) => {
    const target = new URL(url);
    if (target.origin !== origin || target.username || target.password || target.hash) {
      throw new Error('Endpoint is outside the configured sandbox');
    }
    const { method = 'GET', headers = {}, body } = options;
    const result = await new Promise((resolve, reject) => {
      const req = request(target, { method, headers, ca, family: 4 }, (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 128 * 1024) res.destroy(new Error('Response exceeds sandbox limit'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      req.setTimeout(5000, () => req.destroy(new Error('Sandbox request timed out')));
      req.on('error', reject);
      req.end(body);
    });
    return { ...result, json: () => JSON.parse(result.text) };
  };
}

export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error('Request exceeds sandbox limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function json(res, status, value, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(value));
}

export const readForm = async (req) => new URLSearchParams(await readBody(req));

export function redirect(res, location) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.end();
}
