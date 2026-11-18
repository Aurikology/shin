// mac/test/expiry-check.test.mjs
// R66 (signing certificate, provisioning profile, App Store Connect key) and R69 (Tailscale key expiry):
// the monthly check that goes loud under 30 days.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  daysLeft, certExpiries, profileExpiry, tailscaleExpiry, ascJwt, classify, runChecks,
} from '../expiry-check.mjs';

const root = mkdtempSync(join(tmpdir(), 'shin-expiry-'));
after(() => rmSync(root, { recursive: true, force: true }));

// A throwaway self-signed certificate (CN "Apple Distribution: Test Person"), valid until 2027-02-16T22:02:54Z.
const PEM = `-----BEGIN CERTIFICATE-----
MIIB4TCCAYegAwIBAgIURfNbXNtbtuxjkz/ZUiO4b/8KhGAwCgYIKoZIzj0EAwIw
RjE1MDMGA1UEAwwsQXBwbGUgRGlzdHJpYnV0aW9uOiBUZXN0IFBlcnNvbiAoQUJD
REUxMjM0NSkxDTALBgNVBAoMBFRlc3QwHhcNMjYxMTE4MjIwMjU0WhcNMjcwMjE2
MjIwMjU0WjBGMTUwMwYDVQQDDCxBcHBsZSBEaXN0cmlidXRpb246IFRlc3QgUGVy
c29uIChBQkNERTEyMzQ1KTENMAsGA1UECgwEVGVzdDBZMBMGByqGSM49AgEGCCqG
SM49AwEHA0IABDMB5ozZ7RbOmHlrIEGK0w8zJ4K0QAwdIA+MsZfmqXMedUKHhhe7
8qRpwpFud73Ysz3yxHa8SlgtqESFeJfKAE+jUzBRMB0GA1UdDgQWBBTguJBXAcbb
yXdIQCjjGV+kkd+WhDAfBgNVHSMEGDAWgBTguJBXAcbbyXdIQCjjGV+kkd+WhDAP
BgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIHQ5RvSwc6gmiui3NrBv
/+yhIaOKqcu7j3+v1R5kOBS2AiEAzZcB3eMpjx/CJBKoMkZpK3Siftuj3JLV0Ryc
BfEdm5k=
-----END CERTIFICATE-----
`;
const NOT_AFTER = Date.parse('2027-02-16T22:02:54Z');

test('daysLeft counts whole days, negative once expired', () => {
  assert.equal(daysLeft(NOT_AFTER, NOT_AFTER - 10.5 * 86400e3), 10);
  assert.equal(daysLeft(NOT_AFTER, NOT_AFTER + 2 * 86400e3), -2);
});

// A second throwaway certificate, CN "Some Other CA": not a signing certificate, must be ignored.
const OTHER_PEM = `-----BEGIN CERTIFICATE-----
MIIBojCCAUmgAwIBAgIUXQ3Urefu/1r96Ji+uQ0HJ+AZXJwwCgYIKoZIzj0EAwIw
JzEWMBQGA1UEAwwNU29tZSBPdGhlciBDQTENMAsGA1UECgwEVGVzdDAeFw0yNjEx
MTgyMjA0MDBaFw0yNzAyMTYyMjA0MDBaMCcxFjAUBgNVBAMMDVNvbWUgT3RoZXIg
Q0ExDTALBgNVBAoMBFRlc3QwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATLYxhw
1lu0U1d+7Y5X9GIoSdHPb0YRaYFEPrM8yRkAPf/Q5IyXvg357oY3gkH6z6dHMohb
8GNo+qrpA4XrWhsZo1MwUTAdBgNVHQ4EFgQUvLQob9iDNNygkKQPtC7+C43UqFAw
HwYDVR0jBBgwFoAUvLQob9iDNNygkKQPtC7+C43UqFAwDwYDVR0TAQH/BAUwAwEB
/zAKBggqhkjOPQQDAgNHADBEAiBirla41hy3It+UBF+QiGSQybOSJz3OsxMw4e/P
FuX2kAIgG2M0h/NaKp3fhzTSLyCw54BNo4iSrhYVpIEDAvMAQxs=
-----END CERTIFICATE-----
`;

test('certExpiries picks signing certificates out of a pile of PEM, ignores other certificates and junk, and de-duplicates', () => {
  const garbage = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n';
  const found = certExpiries(PEM + '\n' + PEM + OTHER_PEM + garbage + '\nnot a cert at all');
  assert.equal(found.length, 1);
  assert.match(found[0].label, /Apple Distribution/);
  assert.equal(found[0].expires, NOT_AFTER);
});

test('profileExpiry reads Name and ExpirationDate out of a .mobileprovision (plist embedded in CMS bytes)', () => {
  const raw = Buffer.concat([
    Buffer.from([0x30, 0x82, 0x01, 0x02, 0xff, 0xfe]),
    Buffer.from('<?xml version="1.0"?><plist><dict><key>Name</key><string>Pexi AppStore</string><key>ExpirationDate</key><date>2027-03-01T10:00:00Z</date></dict></plist>'),
    Buffer.from([0x00, 0x99]),
  ]);
  assert.deepEqual(profileExpiry(raw), { name: 'Pexi AppStore', expires: Date.parse('2027-03-01T10:00:00Z') });
  assert.equal(profileExpiry(Buffer.from('garbage')), null);
});

test('tailscaleExpiry: a date, expiry disabled, and an unreadable answer are three different results', () => {
  assert.deepEqual(tailscaleExpiry({ BackendState: 'Running', Self: { KeyExpiry: '2027-01-10T00:00:00Z' } }), { state: 'date', expires: Date.parse('2027-01-10T00:00:00Z') });
  assert.deepEqual(tailscaleExpiry({ BackendState: 'Running', Self: {} }), { state: 'disabled' });
  assert.deepEqual(tailscaleExpiry({ BackendState: 'Running', Self: { KeyExpiry: '0001-01-01T00:00:00Z' } }), { state: 'disabled' });
  assert.equal(tailscaleExpiry({ BackendState: 'NeedsLogin' }).state, 'unknown');
  assert.equal(tailscaleExpiry(null).state, 'unknown');
});

test('classify: under 30 days or expired is loud, otherwise ok', () => {
  assert.equal(classify(31, 30), 'ok');
  assert.equal(classify(30, 30), 'ok');
  assert.equal(classify(29, 30), 'warn');
  assert.equal(classify(-1, 30), 'expired');
});

test('ascJwt builds an ES256 token Apple accepts the shape of, signed with the key', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const tok = ascJwt({ keyId: 'ABC123DEFG', issuerId: '69a6de70-0000-0000-0000-000000000000', pem, now: 1_800_000_000 });
  const [h, p, s] = tok.split('.');
  const dec = (x) => JSON.parse(Buffer.from(x, 'base64url').toString());
  assert.deepEqual(dec(h), { alg: 'ES256', kid: 'ABC123DEFG', typ: 'JWT' });
  const claims = dec(p);
  assert.equal(claims.iss, '69a6de70-0000-0000-0000-000000000000');
  assert.equal(claims.aud, 'appstoreconnect-v1');
  assert.equal(claims.exp - claims.iat, 600);
  const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  assert.equal(ok, true);
});

function fakeHome() {
  const home = join(root, 'home-' + Math.random().toString(16).slice(2));
  mkdirSync(join(home, 'Library', 'MobileDevice', 'Provisioning Profiles'), { recursive: true });
  return home;
}
const profileBytes = (name, iso) => Buffer.from(`<plist><dict><key>Name</key><string>${name}</string><key>ExpirationDate</key><date>${iso}</date></dict></plist>`);

test('runChecks: a profile 10 days from expiry writes certs.FAILED; healthy ones clear it', async () => {
  const now = Date.parse('2027-01-01T00:00:00Z');
  const home = fakeHome();
  writeFileSync(join(home, 'Library', 'MobileDevice', 'Provisioning Profiles', 'a.mobileprovision'), profileBytes('Pexi AppStore', '2027-01-11T00:00:00Z'));
  // an old, already-expired copy of the SAME profile must not alarm while a newer one exists
  writeFileSync(join(home, 'Library', 'MobileDevice', 'Provisioning Profiles', 'old.mobileprovision'), profileBytes('Pexi Dev', '2026-01-01T00:00:00Z'));
  writeFileSync(join(home, 'Library', 'MobileDevice', 'Provisioning Profiles', 'new.mobileprovision'), profileBytes('Pexi Dev', '2027-09-01T00:00:00Z'));
  const health = join(root, 'h1');
  const env = { SHIN_HEALTH_DIR: health, WORKER_STATEDIR: join(root, 's1'), SHIN_HEALTH_MAIL: 'off' };
  const exec = () => null; // no security / tailscale on this box
  const r = await runChecks({ home, env, now, exec, offline: true, warnDays: 30 });
  assert.equal(r.ok, false);
  assert.ok(existsSync(join(health, 'certs.FAILED')));
  assert.match(readFileSync(join(health, 'certs.FAILED'), 'utf8'), /Pexi AppStore/);
  assert.doesNotMatch(readFileSync(join(health, 'certs.FAILED'), 'utf8'), /Pexi Dev/);
  // renew it
  writeFileSync(join(home, 'Library', 'MobileDevice', 'Provisioning Profiles', 'a.mobileprovision'), profileBytes('Pexi AppStore', '2028-01-11T00:00:00Z'));
  const r2 = await runChecks({ home, env, now, exec, offline: true, warnDays: 30 });
  assert.equal(r2.ok, true);
  assert.ok(!existsSync(join(health, 'certs.FAILED')));
});

test('runChecks: tailscale key 12 days out is loud; things it could not read are listed as unknown, not silently ok', async () => {
  const now = Date.parse('2027-01-01T00:00:00Z');
  const home = fakeHome();
  const env = { SHIN_HEALTH_DIR: join(root, 'h2'), WORKER_STATEDIR: join(root, 's2'), SHIN_HEALTH_MAIL: 'off' };
  const exec = (cmd, args) => (/ailscale/.test(cmd) && args[0] === 'status' ? JSON.stringify({ BackendState: 'Running', Self: { KeyExpiry: '2027-01-13T00:00:00Z' } }) : null);
  const r = await runChecks({ home, env, now, exec, offline: true, warnDays: 30, tailscaleBin: '/x/tailscale' });
  assert.equal(r.ok, false);
  assert.ok(r.items.some((i) => i.kind === 'tailscale' && i.status === 'warn' && i.days === 12));
  assert.ok(r.unknown.length >= 1, 'no signing certificate / no profile / no ASC key found must be reported as unknown');
});
