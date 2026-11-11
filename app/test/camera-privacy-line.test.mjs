/**
 * D-265 (2026-11-11 live walk): the camera's first line told every shopper
 * "Every scan sends a picture ... a barcode read logs its frame either way",
 * while the privacy policy and the store listing say no image is uploaded.
 * The code settles which is true: a barcode read calls beginShutter only when
 * FLAGS.photoId AND photo consent are both on (camera.js, D-147), and photo
 * scanning does not ship (RULINGS, 2026-11-07; FLAGS.photoId false). So with
 * the photo flag off the camera must say what really leaves the phone, the
 * same way the You screen already picks you_data_intro_nophoto.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { say } from '../public/js/voice.js';
import { LINES_FR } from '../public/js/voice-fr.js';
import { FLAGS } from '../public/js/flags.js';

const camera = readFileSync(fileURLToPath(new URL('../public/js/screens/camera.js', import.meta.url)), 'utf8');
const VOICES = ['deadpan', 'warm', 'blunt'];

test('D-265: photo scanning is off in this build, so the line the camera shows must not claim a picture is sent', () => {
  assert.equal(FLAGS.photoId, false, 'this test assumes the shipping flags (photo scanning off)');
  const call = camera.match(/shinSay\('idle',\s*([^,]+),\s*\{\},\s*\{\s*size:\s*64\s*\}\)/);
  assert.ok(call, 'camera.js no longer shows the privacy line through shinSay(idle, ..., {size: 64})');
  assert.match(call[1], /FLAGS\.photoId/, 'the privacy line key must depend on FLAGS.photoId, like the You screen does');
  assert.match(call[1], /cam_privacy_line_nophoto/, 'with photo off the camera must use cam_privacy_line_nophoto');
});

test('D-265: the no-photo line says no picture leaves the phone, in every voice and in French', () => {
  for (const v of VOICES) {
    const line = say('cam_privacy_line_nophoto', {}, v);
    assert.ok(line && typeof line === 'string', `no English line for ${v}`);
    assert.doesNotMatch(line, /sends? a picture|frame logged|logs its frame/i, `${v}: ${line}`);
    assert.match(line, /no picture|never a picture/i, `${v} must say no picture is sent: ${line}`);
    const fr = LINES_FR.cam_privacy_line_nophoto?.[v]?.({});
    assert.ok(fr, `no French line for ${v}`);
    assert.match(fr, /aucune image|jamais (une|d') ?image/i, `${v} fr: ${fr}`);
  }
});
