/**
 * The door on the public hostname. Plan item 1j.
 *
 * WHAT IT IS FOR, stated narrowly so nobody mistakes it for more. From the day
 * the Cloudflare tunnel goes up, this server is on the open internet under a
 * hostname anybody can reach, and behind it is a vision model with a card on
 * it. Without this, the first scanner that finds the host can spend the model
 * budget. A shared code stops that. It is a bouncer, not a login.
 *
 * WHAT IT IS NOT. It is not authentication: six people share one string, the
 * string is compiled into the wrapper, and anybody who has the app has it.
 * Nothing downstream may treat a request that passed this check as belonging
 * to a particular person, and nothing does: the device id is still the only
 * identity in the product and it is still a random UUID with no claim attached.
 *
 * OFF WHEN THE VARIABLE IS UNSET, and that is the whole reason the check can
 * ship today without a flag day. `SHIN_INVITE_CODE` unset or empty means every
 * request passes, so a laptop, the test suite and the existing screens are
 * untouched. The Mac sets it, and only the Mac has to.
 *
 * A HEADER, NOT A QUERY STRING. `x-shin-invite`. A query parameter would be in
 * every browser history, every referer and every server access log, which for
 * a shared secret is the difference between a bouncer and a sign on the door.
 *
 * CONSTANT TIME, and it is one line so there is no reason not to. The timing
 * of a string comparison leaks the length of the matching prefix, and while a
 * remote timing attack over a Cloudflare tunnel against a six-person beta is
 * not a realistic threat, `timingSafeEqual` costs nothing and removes the need
 * to have this argument.
 */

import { timingSafeEqual } from 'node:crypto';

/** The header the client sends it in. The client lane builds against this name. */
export const INVITE_HEADER = 'x-shin-invite';

/**
 * The code this server requires, or null when it requires none.
 *
 * Trimmed, because a trailing newline in an environment file written by a
 * process manager is the single most common way a secret does not match, and
 * the failure it produces (every request refused, code looks correct on both
 * sides) costs an hour every time.
 */
export function inviteRequired(env: NodeJS.ProcessEnv = process.env): string | null {
  const code = env.SHIN_INVITE_CODE?.trim();
  return code ? code : null;
}

/**
 * Whether a request carrying this header value may proceed.
 *
 * Returns true when no code is configured, which is the local-development and
 * test case and is the only reason this is safe to add to every route at once.
 */
export function inviteAllows(sent: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const required = inviteRequired(env);
  if (required === null) return true;
  if (typeof sent !== 'string') return false;
  const a = Buffer.from(sent.trim(), 'utf8');
  const b = Buffer.from(required, 'utf8');
  // timingSafeEqual throws on a length mismatch, so the length is compared
  // first and does leak. A length is not the secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The sentence sent back to a request with no code or the wrong one.
 *
 * NOT IN THE APP'S VOICE, deliberately, and this is the one place in the
 * product where that is right. The mascot's aggression points at the price,
 * the store or the brand and never at the user (HARD RULE 3), and the person
 * reading this is not a user: it is a scanner, or it is one of the six with a
 * build that was not given the code. Flat and factual serves both.
 */
export const INVITE_REFUSAL = 'This server is in a closed beta and that request did not carry an invite code.';

/**
 * Routes that answer without a code, and why each one is on the list.
 *
 * `/api/health` only. It is the uptime ping (plan item 39c), it is polled by
 * something that is not the app, and it carries nothing: whether the process
 * is up, how long it has been up, and whether the scan log opened. A ping that
 * needs the shared secret is a ping that stops working the day the secret is
 * rotated, which is the day you most want to know the server is alive.
 */
export const INVITE_EXEMPT: readonly string[] = ['/api/health'];
