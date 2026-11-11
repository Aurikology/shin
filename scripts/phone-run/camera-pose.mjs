#!/usr/bin/env node
// Move or rotate the emulator's virtual-scene camera through the emulator's own gRPC port.
//   GRPC_DIR=<folder holding node_modules/@grpc/grpc-js and @grpc/proto-loader> \
//     node camera-pose.mjs get
//     node camera-pose.mjs pos X Y Z      (metres)
//     node camera-pose.mjs rot X Y Z      (degrees: pitch, yaw, roll)
// Needs one emulator running (it reads %LOCALAPPDATA%\Temp\avd\running\pid_*.ini for the port and token).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const grpcDir = process.env.GRPC_DIR;
const emuHome = process.env.ANDROID_EMULATOR_HOME ?? '';
const SDK = process.env.ANDROID_HOME ?? 'C:\\Android\\Sdk';
if (!grpcDir) { console.error('set GRPC_DIR to a folder where `npm i @grpc/grpc-js @grpc/proto-loader` was run'); process.exit(2); }
const req = createRequire(join(grpcDir, 'x.js'));
const grpc = req('@grpc/grpc-js');
const loader = req('@grpc/proto-loader');

const runDir = join(process.env.LOCALAPPDATA, 'Temp', 'avd', 'running');
const ini = readdirSync(runDir).find((f) => /^pid_\d+\.ini$/.test(f));
if (!ini) { console.error('no running emulator found in ' + runDir); process.exit(2); }
const kv = Object.fromEntries(readFileSync(join(runDir, ini), 'utf8').split(/\r?\n/).map((l) => l.split(/=(.*)/s)).filter((p) => p.length > 1));
const def = loader.loadSync(join(SDK, 'emulator', 'lib', 'emulator_controller.proto'), { keepCase: true, enums: String, defaults: true, includeDirs: [join(SDK, 'emulator', 'lib')] });
const pkg = grpc.loadPackageDefinition(def).android.emulation.control;
const client = new pkg.EmulatorController(`127.0.0.1:${kv['grpc.port']}`, grpc.credentials.createInsecure());
const meta = new grpc.Metadata();
meta.add('authorization', `Bearer ${kv['grpc.token']}`);
const call = (m, body) => new Promise((ok, no) => client[m](body, meta, (e, r) => (e ? no(e) : ok(r))));

const [cmd, ...nums] = process.argv.slice(2);
const target = cmd === 'pos' ? 'POSITION' : cmd === 'rot' ? 'ROTATION' : null;
if (cmd === 'get') {
  for (const t of ['POSITION', 'ROTATION']) console.log(t, JSON.stringify((await call('getPhysicalModel', { target: t })).value.data));
} else if (target && nums.length === 3) {
  await call('setPhysicalModel', { target, value: { data: nums.map(Number) }, interpolation: 'STEP' });
  console.log(`set ${target} ${nums.join(' ')}`);
} else { console.error('usage: camera-pose.mjs get | pos X Y Z | rot X Y Z'); process.exit(2); }
process.exit(0);
