import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { ApiError } from '../lib/state.js';
import { inject, makeHandler } from '../lib/index.js';

function request(method, body) {
	const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
	req.method = method;
	return req;
}

async function invoke(handler, method, body) {
	let status = null;
	let headers = null;
	let payload = '';
	const res = {
		writeHead(nextStatus, nextHeaders) { status = nextStatus; headers = nextHeaders; },
		end(value) { payload += value || ''; },
	};
	await handler(request(method, body), res);
	return { status, headers, body: JSON.parse(payload) };
}

test('Host waits for webServer and exposes the manager envelope', async () => {
	assert.deepEqual(inject, ['webServer']);
	const calls = [];
	const handler = makeHandler({ manager: { async call(op, body) { calls.push({ op, body }); return { apiVersion: 1 }; } } });
	const answer = await invoke(handler, 'POST', JSON.stringify({ op: 'capabilities' }));
	assert.equal(answer.status, 200);
	assert.equal(answer.headers['cache-control'], 'no-store');
	assert.deepEqual(answer.body, { ok: true, value: { apiVersion: 1 } });
	assert.equal(calls[0].op, 'capabilities');
});

test('Host rejects methods, malformed JSON, oversized bodies, and preserves typed API errors', async () => {
	const handler = makeHandler({ manager: { async call() { throw new ApiError(409, '缺少环境变量', 'ENV_REQUIRED'); } } });
	assert.equal((await invoke(handler, 'GET')).status, 405);
	assert.equal((await invoke(handler, 'POST', '{')).body.error.code, 'BODY_INVALID');
	assert.equal((await invoke(handler, 'POST', JSON.stringify({ op: 'setEnabled' }))).body.error.code, 'ENV_REQUIRED');
	const large = JSON.stringify({ value: 'x'.repeat(129 * 1024) });
	const answer = await invoke(handler, 'POST', large);
	assert.equal(answer.status, 413);
	assert.equal(answer.body.error.code, 'BODY_TOO_LARGE');
});
