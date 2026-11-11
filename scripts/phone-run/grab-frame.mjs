// Usage: node grab.mjs out.png  -> saves the current video frame of the app's WebView (what the barcode decoder sees)
import { writeFileSync } from 'node:fs';
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const ws = new WebSocket(list.find((p) => p.type === 'page').webSocketDebuggerUrl);
await new Promise((ok) => (ws.onopen = ok));
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { returnByValue: true, expression: "(()=>{const v=document.querySelector('video');const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return c.toDataURL('image/png')})()" } }));
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id === 1) { writeFileSync(process.argv[2], Buffer.from(d.result.result.value.split(',')[1], 'base64')); process.exit(0); }
};
