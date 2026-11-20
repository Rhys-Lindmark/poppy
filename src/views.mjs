import { coverageMarkup, escapeHtml as escape } from './report-views.mjs';

function page(res, status, title, content) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end('<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="description" content="Poppy sandbox for delivery tasks and ecommerce discovery evidence.">' +
    '<title>' + escape(title) + ' | Poppy demo</title><link rel="stylesheet" href="/styles.css">' +
    '</head><body><header><nav aria-label="Main"><a href="/">Poppy demo</a><a href="/coverage">Sales coverage</a></nav></header>' +
    '<main>' + content + '</main></body></html>');
}

function hidden(name, value) {
  return '<input type="hidden" name="' + name + '" value="' + escape(value) + '">';
}

export function traceTable(entries) {
  if (!entries.length) return '<p class="muted">Start a delivery task to see the protocol requests.</p>';
  const rows = entries.map(({ actor, method, path, status, details }) => {
    const items = Object.entries(details || {}).map(([name, value]) => '<dt>' + escape(name) + '</dt><dd>' + escape(value) + '</dd>');
    const pathLabel = '<code>' + escape(method + ' ' + path) + '</code>';
    const entry = items.length
      ? '<details><summary>' + pathLabel + '</summary><dl>' + items.join('') + '</dl></details>'
      : pathLabel;
    return '<tr><td>' + escape(actor) + '</td><td>' + entry + '</td><td>' + escape(status) + '</td></tr>';
  });
  return '<table><thead><tr><th scope="col">From → to</th><th scope="col">Request</th>' +
    '<th scope="col">HTTP</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
}

export function createViews(entriesFor) {
  const trail = (id) => '<section aria-labelledby="trace"><h2 id="trace">Protocol trace</h2>' +
    traceTable(entriesFor(id)) + '</section>';

  return {
    home(res, selectedDay) {
      const choices = ['Saturday', 'Monday'].map((day) =>
        '<option' + (selectedDay === day ? ' selected' : '') + '>' + day + '</option>').join('');
      return page(res, 200, 'Delivery rescheduling',
        '<section><h1>Delivery rescheduling</h1><p>Use a Personal Agent to change an order at the demo store.</p>' +
        '<form class="actions" method="post" action="/agent/start"><label>New delivery day' +
        '<select name="day">' + choices + '</select></label>' +
        '<button class="primary" name="task" value="reschedule">Start rescheduling</button>' +
        '<button name="task" value="read">Look up delivery</button></form></section>' + trail());
    },
    coverage(res) {
      return page(res, 200, 'Ecommerce sales coverage', coverageMarkup('/storefront-results.json'));
    },
    signIn(res, ticket, scopes) {
      const choices = scopes.map(([id, label]) => '<label class="choice"><input type="checkbox" name="scope" value="' +
        escape(id) + '" checked> ' + escape(label) + '</label>').join('');
      return page(res, 200, 'Demo Store sign-in',
        '<section><h1>Sign in at Demo Store</h1><p>Use the seeded demo account and select the access you want to grant.</p>' +
        '<form method="post" action="/oauth/authorize">' + hidden('ticket', ticket) +
        '<fieldset><legend>Access requested by Poppy Demo</legend>' + choices + '</fieldset><div class="actions">' +
        '<button class="primary" name="decision" value="allow">Sign in and grant access</button>' +
        '<button name="decision" value="decline">Decline</button></div></form></section>');
    },
    persona(res, ticket, url, message) {
      const link = url ? '<p><a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer">Open Persona Sandbox</a></p>' : '';
      return page(res, 200, 'Store verification',
        '<h1>Verify store access</h1><p>' + escape(message || 'Complete the Persona sandbox check in a new tab, then return here.') +
        '</p>' + link + '<form method="post" action="/oauth/persona/check">' + hidden('ticket', ticket) +
        '<button class="primary">Check verification</button></form>');
    },
    review(res, flow) {
      const { order_id, previous_day, delivery_day, fee } = flow.operation.terms;
      const sources = flow.policyContext.map(({ provider, title, text, rankedBy }) =>
        '<li><strong>' + escape(provider + ' — ' + title) + '</strong><p>' + escape(text) + '</p>' +
        (rankedBy ? '<p class="muted">Ranked by ' + escape(rankedBy) + '.</p>' : '') + '</li>').join('');
      const context = sources ? '<section><h2>Policy context</h2><ul>' + sources + '</ul></section>' : '';
      return page(res, 200, 'Approve delivery change',
        '<section><h1>Approve delivery change</h1><p>' + escape(flow.company.name) + '</p>' +
        '<dl><dt>Order</dt><dd>' + escape(order_id) + '</dd><dt>Delivery</dt><dd>' +
        escape(previous_day + ' → ' + delivery_day) + '</dd><dt>Extra charge</dt><dd>' +
        escape(fee.currency + ' ' + fee.amount) + '</dd></dl>' +
        '<form class="actions" method="post" action="/agent/approval">' + hidden('csrf', flow.csrf) +
        hidden('revision', flow.operation.revision) +
        '<button class="primary" name="decision" value="approve">Approve change</button>' +
        '<button name="decision" value="decline">Decline</button></form></section>' + context + trail(flow.id));
    },
    result(res, result, id, title) {
      return page(res, 200, title, '<section><h1>' + escape(title) + '</h1><p>Order ' +
        escape(result.order_id) + ' is scheduled for <strong>' + escape(result.delivery_day) +
        '</strong>.</p><p><a href="/">Start another task</a></p>' +
        (title === 'Delivery updated' ? '<p><a href="/agent/trace.json">Download request trace</a></p>' : '') +
        '</section>' + trail(id));
    },
    message(res, status, message) {
      return page(res, status, 'Delivery task', '<h1>' + escape(message) +
        '</h1><p><a href="/">Return to the demo</a></p>');
    },
  };
}
