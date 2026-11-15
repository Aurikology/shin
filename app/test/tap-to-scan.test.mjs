/**
 * 2026-11-14, owner's note "screen problems from the store", section A: every barcode in view is outlined
 * in green, continuously; tapping one scans it; a detection alone never opens a sheet. The screen's own
 * behaviour is run for real in test/ux/ux-b5-scan.test.mjs (tapCode); this file pins the wiring the stubbed
 * eye cannot show: the drawn outlines are buttons that report their code, and the screen no longer fires on its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const ATTACH = read('../public/js/eye-attach.js');
const CAMERA = read('../public/js/screens/camera.js');
const CSS = read('../public/css/screens/camera.css');

test('every outline the eye draws is a button that reports the code it is drawn on', () => {
  const paint = ATTACH.slice(ATTACH.indexOf('const paintCodes = '), ATTACH.indexOf('Every fall back'));
  assert.match(paint, /document\.createElement\('button'\)/, 'an outline is not a button');
  assert.match(paint, /el\.dataset\.code = String\(mark\.value/, 'the outline does not remember its code');
  assert.match(paint, /handlers\.onCodeTap\?\.\(\{ value: code, format: 'tap'/, 'a tap on the outline reports nothing');
  assert.match(paint, /Math\.max\(44, p\.height\)/, 'the outline is too small to tap');
  assert.doesNotMatch(paint, /aria-hidden/, 'a control hidden from the screen reader');
});

test('the outlines can be tapped and every code in view is green', () => {
  const block = CSS.slice(CSS.indexOf('.code-mark {'), CSS.indexOf('/* Nothing drawn over the feed survives'));
  assert.match(block, /pointer-events: auto;/);
  const dim = block.slice(block.indexOf('.code-mark:not(.is-focus) {'));
  assert.match(dim, /border-color: #38E08B/, 'a code that is not the leader is not green');
  assert.doesNotMatch(block, /good-bright/, 'the outline uses a theme green that goes dark on the light theme');
  assert.doesNotMatch(dim.slice(0, dim.indexOf('}')), /dashed/, 'a code in view is still drawn as a dim dashed box');
});

test('the screen takes a tapped code like a pressed scan, and no longer fires on its own', () => {
  assert.match(CAMERA, /onCodeTap: \(read\) => \{\s+if \(dead \|\| cam\.dataset\.state !== 'idle' \|\| barcodeInFlight \|\| !captureAllowed\(Date\.now\(\), lastCaptureAt\)\) return;/);
  assert.match(CAMERA, /onCodeTap: [\s\S]*?takeRead\(read\);/);
  assert.match(CAMERA, /function takeRead\(read\) \{[\s\S]*?hasValidCheckDigit\(read\.value\)[\s\S]*?onBarcode\(read\);/);
  assert.doesNotMatch(CAMERA, /createAutoFire|autoFire\./, 'the camera still fires a scan by itself when a code settles');
  const ready = CAMERA.slice(CAMERA.indexOf('function onBarcodeReady(ready)'), CAMERA.indexOf('function sayNoBarcode('));
  assert.doesNotMatch(ready, /onBarcode\(|takeRead\(/, 'a settled code starts a scan');
});

test('"No barcode to scan?" waits while a code is outlined, and a standing one gives way when one appears', () => {
  assert.match(CAMERA, /if \(codesInView > 0\) \{\s+hintTimer = setTimeout\(escalate, 2000\);\s+return;/);
  assert.match(CAMERA, /onBarcodes: \(list\) => \{[\s\S]*?codesInView = list\.length;[\s\S]*?hintEscalated = false;\s+showAimHint\(\);/);
});

test('the aim line says to tap the green box, in every voice and in French', async () => {
  const { say } = await import('../public/js/voice.js');
  const fr = read('../public/js/voice-fr.js');
  for (const who of ['deadpan', 'warm', 'blunt']) assert.match(say('cam_aim_barcode', {}, who), /tap/i, `${who} aim line does not say to tap`);
  assert.match(fr, /cam_aim_barcode: \{\s+deadpan: \(\) => "Pointe un code-barres, puis touche son cadre vert\."/);
});
