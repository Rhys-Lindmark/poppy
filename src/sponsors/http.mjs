export function sponsorClient(fetcher = fetch) {
  return async (provider, url, { headers = {}, body, timeout = 3500 } = {}) => {
    let response;
    try {
      response = await fetcher(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new Error(provider + ' could not be reached.');
    }
    if (!response.ok) {
      if (response.body) await response.body.cancel().catch(() => {});
      throw new Error(provider + ' returned HTTP ' + response.status + '.');
    }
    try {
      return response.status === 204 ? {} : await response.json();
    } catch {
      throw new Error(provider + ' returned an invalid response.');
    }
  };
}
