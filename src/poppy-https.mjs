import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

const globalIPv6 = new BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');
const excluded = new BlockList();
for (const [network, mask] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3],
]) excluded.addSubnet(network, mask);
for (const [network, mask] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) {
  excluded.addSubnet(network, mask, 'ipv6');
}

export function publicUrl(value, base) {
  if (typeof value !== 'string' || !value || value.length > 4096) throw new Error('Expected a public HTTPS URL.');
  const url = new URL(value, base);
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
      isIP(host) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(host)) {
    throw new Error('Use a public HTTPS domain on port 443.');
  }
  return url;
}

export function isPublicAddress({ address, family }) {
  if (family === 4) return !excluded.check(address);
  return family === 6 && globalIPv6.check(address, 'ipv6') && !excluded.check(address, 'ipv6');
}

export async function poppyHttps(value, { headers = {}, signal = AbortSignal.timeout(8000), limit = 512 * 1024 } = {}) {
  const url = publicUrl(value);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || !addresses.every(isPublicAddress)) throw new Error('The Company points to a non-public address.');
  const address = addresses.find(({ family }) => family === 4) ?? addresses[0];
  // Pin the checked address for this request and keep TLS verification on the original hostname.
  return new Promise((resolve, reject) => {
    const req = request(url, {
      agent: false, family: address.family, signal,
      lookup: (_host, options, callback) => options.all ? callback(null, [address]) : callback(null, address.address, address.family),
      headers: { Accept: 'application/json, application/*+json', 'Accept-Encoding': 'identity', ...headers },
    }, (res) => {
      const status = res.statusCode;
      if (status >= 300 && status < 400) {
        res.destroy();
        resolve({ status, headers: res.headers, text: '' });
        return;
      }
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > limit) res.destroy(new Error('The Company response exceeds the size limit.'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ status, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}
