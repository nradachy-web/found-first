// Generic synthetic-browser transport. Never forwards, resolves or connects to a destination.
import fs from 'node:fs';
import http from 'node:http';

export function denyTransport(record) {
  let server, ready, address;
  const sockets = new Set();
  const reject = (value, response) => {
    let host = ''; try { host = new URL(value).hostname; } catch {}
    record('browser.proxy', host);
    response.writeHead(451, {'Content-Length': '0', Connection: 'close'}).end();
  };
  return {
    async proxy() {
      if (!ready) ready = new Promise((resolve, rejectReady) => {
        server = http.createServer((request, response) => reject(request.url, response));
        server.on('connect', (request, socket) => {
          let host = ''; try { host = new URL('http://' + request.url).hostname; } catch {}
          record('browser.proxy', host);
          socket.end('HTTP/1.1 451 Fixture destination blocked\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
        });
        server.on('upgrade', (request, socket) => {
          let host = ''; try { host = new URL(request.url, 'http://' + request.headers.host).hostname; } catch {}
          record('browser.proxy', host);
          socket.end('HTTP/1.1 451 Fixture destination blocked\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
        });
        server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', error => { if (!['ECONNRESET', 'EPIPE'].includes(error.code)) record('browser.proxy-error', 'local-listener'); }); });
        server.once('error', rejectReady);
        server.listen(0, '127.0.0.1', () => {
          address = `http://127.0.0.1:${server.address().port}`;
          server.unref(); resolve();
        });
      });
      await ready;
      return {server: address, bypass: '<-loopback>,localhost,127.0.0.1,[::1]'};
    },
    async close() {
      if (!ready) return;
      await ready;
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await new Promise((resolve, rejectClose) => server.close(error => error ? rejectClose(error) : resolve()));
    },
  };
}
export function browserArgs(values) {
  const result = []; let skipValue = false;
  for (const value of values || []) {
    if (skipValue && !value.startsWith('--')) { skipValue = false; continue; }
    skipValue = false;
    if (/^--(?:no-proxy|proxy)/.test(value)) skipValue = !value.includes('=') && !['--no-proxy-server', '--proxy-auto-detect'].includes(value);
    else result.push(value);
  }
  return result;
}
export function attemptRecorder(attempts) {
  return (event, host) => {
    const item = {event, host}; attempts.push(item);
    if (process.env.FF_NETWORK_GUARD_LOG) fs.appendFileSync(process.env.FF_NETWORK_GUARD_LOG, JSON.stringify(item) + '\n');
  };
}
