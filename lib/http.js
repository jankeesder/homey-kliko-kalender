'use strict';

const https = require('node:https');

const USER_AGENT = 'HomeyAfvalkalender/1.0';

/**
 * Minimal HTTPS request helper.
 * Resolves with { status, body } and rejects on network errors or timeout.
 */
function httpsRequest({ hostname, path, method = 'GET', body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': USER_AGENT };
    if (body !== undefined) {
      headers['Content-Type']   = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(
      { hostname, port: 443, path, method, headers, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

module.exports = { httpsRequest };
