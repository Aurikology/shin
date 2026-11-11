// Usage: node cdp-log.mjs <seconds> [expression-to-evaluate-first]
// Prints console + network events of the app's WebView (needs: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>)
const secs = Number(process.argv[2] ?? 10);
const expr = process.argv[3];
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list.find((p) => p.type === 'page');
console.log('page', page.url);
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
await new Promise((ok) => (ws.onopen = ok));
send('Runtime.enable'); send('Log.enable'); send('Network.enable');
if (expr) send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.method === 'Runtime.consoleAPICalled') console.log('console.' + d.params.type, d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  else if (d.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', JSON.stringify(d.params.exceptionDetails).slice(0, 400));
  else if (d.method === 'Log.entryAdded') console.log('log', d.params.entry.level, d.params.entry.text.slice(0, 300));
  else if (d.method === 'Network.requestWillBeSent') console.log('net ->', d.params.request.method, d.params.request.url.slice(0, 200));
  else if (d.method === 'Network.responseReceived') console.log('net <-', d.params.response.status, d.params.response.url.slice(0, 200));
  else if (d.method === 'Network.loadingFailed') console.log('net FAIL', d.params.errorText);
  else if (d.result && d.result.result) console.log('eval =>', JSON.stringify(d.result.result.value ?? d.result.result.description).slice(0, 500));
};
setTimeout(() => process.exit(0), secs * 1000);
