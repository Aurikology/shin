/**
 * The only place the client talks to the server.
 *
 * A refusal comes back as a normal 200 with `kind: "refusal"`, because it is a
 * correct answer. Nothing here may turn one into a thrown error: the moment a
 * refusal looks like a failure, every caller starts retrying around the one
 * safety mechanism in the product.
 */

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

async function get(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

/** Returns a Verdict or a Refusal. Both are success. */
export function price(query) {
  return post('/api/price', query);
}

export function catalogue() {
  return get('/api/catalogue');
}

export function categories() {
  return get('/api/categories');
}
