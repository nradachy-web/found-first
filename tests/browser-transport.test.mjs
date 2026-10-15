import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import test from 'node:test';
import {browserArgs, denyTransport} from '../tools/browser-transport.mjs';

test('browser transport rejects absolute HTTP and CONNECT without forwarding and closes its listener', async () => {
  const attempts = [], transport = denyTransport((event, host) => attempts.push({event, host}));
  const proxy = new URL((await transport.proxy()).server);
  try {
    const status = await new Promise((resolve, reject) => {
      const request = http.request({hostname: proxy.hostname, port: proxy.port, path: 'http://never-resolve.invalid/private?do-not-log=this', method: 'GET'}, response => {response.resume(); response.on('end', () => resolve(response.statusCode));});
      request.on('error', reject); request.end();
    });
    assert.equal(status, 451);
    const connect = await new Promise((resolve, reject) => {
      const socket = net.connect(Number(proxy.port), proxy.hostname, () => socket.write('CONNECT never-resolve.invalid:443 HTTP/1.1\r\nHost: never-resolve.invalid:443\r\n\r\n'));
      let data = ''; socket.on('data', chunk => {data += chunk;}); socket.on('end', () => resolve(data)); socket.on('error', reject);
    });
    assert.match(connect, /^HTTP\/1.1 451 /);
    assert.deepEqual(attempts, [{event: 'browser.proxy', host: 'never-resolve.invalid'}, {event: 'browser.proxy', host: 'never-resolve.invalid'}]);
    assert.deepEqual(browserArgs(['--no-proxy-server', '--proxy-bypass-list=*', '--proxy-server', 'http://untrusted.invalid', '--headless']), ['--headless']);
  } finally { await transport.close(); }
  await new Promise((resolve, reject) => {
    const socket = net.connect(Number(proxy.port), proxy.hostname);
    socket.on('connect', () => {socket.destroy(); reject(Error('Proxy listener remains open'));});
    socket.on('error', error => {assert.equal(error.code, 'ECONNREFUSED'); resolve();});
  });
});
