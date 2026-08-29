import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const clientBundle = readFileSync(join(import.meta.dirname, '..', 'lib', 'client.js'), 'utf8');

test('registers Billing only inside Extensions while preserving pricing settings', () => {
	assert.match(clientBundle, /extension\.manager\.section/);
	assert.match(clientBundle, /id:\s*['"]billing['"]/);
	assert.match(clientBundle, /label:\s*function \(\) \{ return ['"]Billing['"]; \}/);
	assert.match(clientBundle, /settings\.section/);
	assert.doesNotMatch(clientBundle, /conversation\.session\.header\.utilities/);
	assert.doesNotMatch(clientBundle, /conversation\.view/);
	assert.doesNotMatch(clientBundle, /data-testid['"]:\s*['"]sb-badge/);
	assert.match(clientBundle, /data-testid['"]:\s*['"]billing-dashboard['"]/);
	assert.match(clientBundle, /Token 用量/);
	assert.doesNotMatch(clientBundle, /影子计费，非真实账单/);
	assert.match(clientBundle, /调用明细/);
	assert.match(clientBundle, /bl-chartTooltip/);
	assert.match(clientBundle, /data-billing-bar/);
	assert.match(clientBundle, /deepseek-v4-flash-0731/);
	assert.match(clientBundle, /Qwen3\.8-Flash-Next-FP8/);
	assert.match(clientBundle, /Qwen3\.8 Flash Next 价目表/);
	assert.match(clientBundle, /阿里云百炼华北 2 官方原价/);
	assert.match(clientBundle, /bl-modelBrandGeneric/);
	assert.match(clientBundle, /['"]aria-label['"]:\s*provider/);
	assert.match(clientBundle, /bl-modelBrand svg/);
	assert.doesNotMatch(clientBundle, /kind\.slice\(0,\s*1\)/);
	assert.match(clientBundle, /¥1\.50/);
	assert.match(clientBundle, /¥4\.50/);
});
