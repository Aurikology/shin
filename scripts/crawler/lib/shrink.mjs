/**
 * Shrinking: cut a failing tap list down to the shortest one that still fails the same way.
 *
 * Delta debugging (ddmin). Take the steps up to and including the one the failure was seen on, then
 * repeatedly try the list with a chunk removed; keep any cut after which the same cause still
 * happens. When chunks are single steps and none can go, the list is 1-minimal: removing any one
 * step makes the failure disappear.
 *
 * A replay launches the real app again, from the same start state and the same fault plan, and
 * performs the steps as written. A step whose target is not on screen is skipped (removing an
 * earlier step can make a later one meaningless), and skipped steps are dropped from the result.
 *
 * `replay(steps)` returns { failures, steps } of that replay; the caller supplies it so this file needs no
 * app. `budget` caps the number of replays so one stubborn failure cannot eat a crawl.
 */
export async function shrink({ steps, cause, atStep, replay, budget = 160 }) {
  let used = 0;
  const fails = async (list) => {
    used += 1;
    const r = await replay(list);
    return r.failures.some((f) => f.cause === cause);
  };

  let cur = steps.slice(0, Math.max(0, (atStep ?? steps.length - 1) + 1));
  // The cut list must itself reproduce, or there is nothing to shrink: say so rather than guess.
  if (!(await fails(cur))) {
    if (cur.length !== steps.length && (await fails(steps))) cur = steps.slice();
    else return { steps: steps.slice(), reproduced: false, replays: used };
  }

  let n = 2;
  while (cur.length >= 2 && used < budget) {
    const size = Math.ceil(cur.length / n);
    let reduced = false;
    for (let start = 0; start < cur.length && used < budget; start += size) {
      const without = [...cur.slice(0, start), ...cur.slice(start + size)];
      if (without.length === 0) continue;
      if (await fails(without)) {
        cur = without;
        n = Math.max(n - 1, 2);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (n >= cur.length) break;
      n = Math.min(cur.length, n * 2);
    }
  }
  // A single step that alone reproduces: try the empty list too (the failure is at launch).
  if (cur.length === 1 && used < budget && (await fails([]))) cur = [];
  // Drop steps that were skipped for want of a target, if the list still fails without them.
  const final = await replay(cur);
  const clean = final.steps.filter((s) => !s.skipped);
  if (clean.length < cur.length && (await fails(clean))) cur = clean;
  return { steps: cur, reproduced: true, replays: used, exhausted: used >= budget };
}
