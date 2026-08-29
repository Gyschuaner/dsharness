import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '..');

async function powershellExecutable(): Promise<string | null> {
	for (const candidate of process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['pwsh', 'powershell']) {
		try {
			await execFileAsync(candidate, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()']);
			return candidate;
		} catch { /* try the next executable */ }
	}
	return null;
}

async function nativeBashExecutable(): Promise<string | null> {
	const candidates = process.platform === 'win32'
		? [
			join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
			join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
		]
		: ['/bin/bash', '/usr/bin/bash'];
	for (const candidate of candidates) {
		try { await access(candidate); return candidate; } catch { /* try next */ }
	}
	return null;
}

function quotePowerShellLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

test('PowerShell operations scripts parse and never delegate interpolated commands to another shell', async (t) => {
	const powershell = await powershellExecutable();
	if (powershell === null) return t.skip('PowerShell is unavailable');
	for (const relativePath of ['restart-dsh-web.ps1', 'dev/install-dsh-source.ps1', 'dev/verify-dsh-source.ps1', 'dev/setup-plugin-junction.ps1']) {
		const path = join(repositoryRoot, relativePath);
		const command = [
			'$tokens = $null; $errors = $null;',
			`[void][System.Management.Automation.Language.Parser]::ParseFile(${quotePowerShellLiteral(path)}, [ref]$tokens, [ref]$errors);`,
			'if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }',
		].join(' ');
		await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command]);
		const source = await readFile(path, 'utf8');
		assert.doesNotMatch(source, /\bcmd(?:\.exe)?\s+\/c\b|powershell(?:\.exe)?\s+-Command/i);
	}
});

test('restart scripts verify listener ownership before stopping a process', async () => {
	const windowsSource = await readFile(join(repositoryRoot, 'restart-dsh-web.ps1'), 'utf8');
	assert.match(windowsSource, /function Test-DshWebProcess/);
	assert.match(windowsSource, /if \(-not \(Test-DshWebProcess \$listener\)\)[\s\S]*?refuse|拒绝停止/);
	assert.doesNotMatch(windowsSource, /Get-CimInstance Win32_Process\s*\|/);

	const macSource = await readFile(join(repositoryRoot, 'restart-dsh-web.command'), 'utf8');
	assert.match(macSource, /is_dsh_web_pid/);
	assert.match(macSource, /if ! command_line="\$\(is_dsh_web_pid "\$pid"\)"; then/);
	assert.match(macSource, /kill "\$pid"/);
	assert.doesNotMatch(macSource, /\*dsh\*" web/);
});

test('Windows startup rebuilds and validates the locked latest source before launch', async () => {
	const source = await readFile(join(repositoryRoot, 'restart-dsh-web.ps1'), 'utf8');
	const installSource = await readFile(join(repositoryRoot, 'dev', 'install-dsh-source.ps1'), 'utf8');
	const verifySource = await readFile(join(repositoryRoot, 'dev', 'verify-dsh-source.ps1'), 'utf8');
	assert.match(source, /upstream\.lock\.json/);
	assert.match(source, /rev-parse 'HEAD\^\{tree\}'/);
	assert.match(source, /pnpm.*install.*--frozen-lockfile/);
	assert.match(source, /pnpm.*run.*clean[\s\S]*pnpm.*run.*build/);
	assert.match(source, /同步锁定依赖并干净构建本仓库插件/);
	assert.match(source, /Invoke-Native \$corepack\.Source @\('pnpm', 'install', '--frozen-lockfile'\) \$RepoRoot/);
	assert.match(source, /Invoke-Native \$corepack\.Source @\('pnpm', 'run', 'clean'\) \$RepoRoot[\s\S]*Invoke-Native \$corepack\.Source @\('pnpm', 'run', 'build'\) \$RepoRoot/);
	assert.match(source, /localPluginArtifacts[\s\S]*Get-FileHash/);
	assert.match(source, /shadow-billing Host 产物未包含 alpha1 unknown 修复链路/);
	assert.match(source, /shadow-billing Client 产物必须只把 Billing 注册到扩展区/);
	assert.match(source, /extension\\\.manager\\\.section[\s\S]*conversation\\\.session\\\.header\\\.utilities\|conversation\\\.view\|sb-badge/);
	assert.match(source, /shadow-billing Client 产物未包含 DSH-032 定稿仪表盘或当前价目/);
	assert.match(source, /billing-dashboard[\s\S]*Token 用量[\s\S]*bl-chartTooltip[\s\S]*data-billing-bar[\s\S]*¥1\\\.50[\s\S]*¥4\\\.50/);
	assert.match(source, /api\/shadow-billing\/status[\s\S]*repaired/);
	assert.match(installSource, /pnpm.*install.*--frozen-lockfile[\s\S]*pnpm.*run.*clean[\s\S]*pnpm.*run.*build/);
	assert.match(source, /packages\\api\\gateway\\lib\\index\.js/);
	assert.match(source, /packages\\api\\session-controller\\lib\\index\.js/);
	assert.match(source, /packages\\attachment\\attachment-local\\lib\\index\.js/);
	assert.doesNotMatch(source, /packages\\host\\apiproxy/);
	assert.match(source, /imageInputBridge/);
	assert.match(source, /readImageRequest/);
	assert.match(source, /imageHostPath/);
	assert.match(source, /ui-chat\\lib\\client\.js[\s\S]*tool-activity[\s\S]*activityStartTime/);
	assert.match(source, /ui-chat 构建产物未包含思考读秒与流式时序投影/);
	assert.match(source, /data-reasoning-activity[\s\S]*reasoningTimings/);
	assert.match(source, /ui-tool\\lib\\client\.js[\s\S]*activityStartedTime[\s\S]*node\\\.data\\\.startedTime/);
	assert.match(source, /ui-tool 构建产物未把工具耗时恢复为标题\/摘要后的内联布局/);
	assert.match(source, /callHead[\s\S]*column-gap:8px[\s\S]*justify-content:flex-start[\s\S]*data-has-tool-timer/);
	assert.match(source, /--no-open/);
	assert.match(source, /FileShare\]::ReadWrite/);
	assert.match(source, /Protect-StartupLog/);
	assert.match(source, /token=.*redacted/);
	assert.match(source, /function Write-BrowserHandoff[\s\S]*GetTempPath[\s\S]*FileMode\]::CreateNew/);
	assert.match(source, /Write-BrowserHandoff \$BrowserHandoffFile \$launchUri[\s\S]*Protect-StartupLog/);
	assert.match(source, /anonymousStatus.*401/);
	assert.match(source, /ResponseHeadersRead/);
	assert.match(source, /认证 HTTP 200/);
	assert.match(source, /Get-WebBootEvidence[\s\S]*__DSH_BOOT__[\s\S]*client boot graph entries 为空/);
	assert.match(source, /Assert-WebBootBatches[\s\S]*client boot batch[\s\S]*HTTP/);
	assert.match(source, /clientModulesPreloaded[\s\S]*ClientModulesPreloaded/);
	assert.match(source, /runtimeErrors[\s\S]*Stop-Process[\s\S]*本地运行门禁失败/);
	assert.match(source, /anonymousHttpStatus[\s\S]*authenticatedHttpStatus[\s\S]*clientBootEntryCount[\s\S]*clientBootBatchCount[\s\S]*clientBootBatchHttp200Count[\s\S]*clientModulesPreloaded[\s\S]*skillManagerApiVersion[\s\S]*pluginManagerApiVersion[\s\S]*shadowBillingRepairCount/);
	assert.match(verifySource, /Get-HttpStatus[\s\S]*AnonymousStatus.*401/);
	assert.match(verifySource, /\[string\]\$BuildDirectory/);
	assert.match(verifySource, /RuntimeCandidate[\s\S]*SourceLeaf-runtime/);
	assert.match(verifySource, /RuntimeMetadata\.buildDirectory[\s\S]*\$BuildDirectory/);
	assert.match(verifySource, /authenticatedHttpStatus.*200/);
	assert.match(verifySource, /clientBootEntryCount.*gt 0/);
	assert.match(verifySource, /clientBootBatchHttp200Count.*clientBootBatchCount/);
	assert.match(verifySource, /clientModulesPreloaded.*true/);
	assert.match(verifySource, /skillManagerApiVersion.*6/);
	assert.match(verifySource, /pluginManagerApiVersion.*1/);
	assert.doesNotMatch(verifySource, /Invoke-WebRequest/);
	assert.match(source, /vision-bridge.*disabled: false/);
	assert.match(source, /Qwen3\.8-Flash-Next-FP8/);
	assert.match(source, /image-context-guard/);
	assert.match(source, /buildMetadata/);
});

test('junction setup rejects unsafe names and restore paths outside the runtime plugin directory', async (t) => {
	const powershell = await powershellExecutable();
	if (powershell === null) return t.skip('PowerShell is unavailable');
	const root = await mkdtemp(join(tmpdir(), 'dsh-junction-regression-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const repo = join(root, 'repo');
	const runtime = join(root, 'runtime');
	const outside = join(root, 'outside', 'safe.bak-20260824010101');
	await mkdir(join(repo, 'plugins', 'safe'), { recursive: true });
	await writeFile(join(repo, 'plugins', 'safe', 'package.json'), '{}\n', 'utf8');
	await mkdir(runtime, { recursive: true });
	await mkdir(outside, { recursive: true });
	const script = join(repositoryRoot, 'dev', 'setup-plugin-junction.ps1');

	await assert.rejects(
		execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-File', script, '-PluginName', '../unsafe', '-RepoRoot', repo, '-DshPluginsDir', runtime, '-DryRun']),
		/安全目录名|single safe directory/i,
	);
	await assert.rejects(
		execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-File', script, '-PluginName', 'safe', '-RepoRoot', repo, '-DshPluginsDir', runtime, '-Restore', outside]),
		/直接子目录|direct child/i,
	);
	const result = await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-File', script, '-PluginName', 'safe', '-RepoRoot', repo, '-DshPluginsDir', runtime, '-DryRun']);
	assert.match(result.stdout, /DryRun/);

	await mkdir(join(runtime, 'safe'), { recursive: true });
	await writeFile(join(runtime, 'safe', 'package.json'), '{}\n', 'utf8');
	await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-File', script, '-PluginName', 'safe', '-RepoRoot', repo, '-DshPluginsDir', runtime]);
	assert.equal(await readFile(join(runtime, 'safe', 'package.json'), 'utf8'), '{}\n');
	const backupName = (await readdir(runtime)).find((name) => /^safe\.bak-[0-9]{14}$/.test(name));
	assert.ok(backupName);
	await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-File', script, '-PluginName', 'safe', '-RepoRoot', repo, '-DshPluginsDir', runtime, '-Restore', join(runtime, backupName)]);
	assert.equal(await readFile(join(runtime, 'safe', 'package.json'), 'utf8'), '{}\n');
});

test('shell operations scripts parse and model staging compares content, not only size', async (t) => {
	const bash = await nativeBashExecutable();
	if (bash === null) return t.skip('native bash is unavailable');
	for (const relativePath of ['restart-dsh-web.command', 'dev/qwen36-vision-ram/stage-model.sh']) {
		await execFileAsync(bash, ['-n', join(repositoryRoot, relativePath)]);
	}
	const stageSource = await readFile(join(repositoryRoot, 'dev', 'qwen36-vision-ram', 'stage-model.sh'), 'utf8');
	assert.equal((stageSource.match(/cmp -s --/g) || []).length, 2);
});

test('Skill toggle force parameter uses a type check rather than comparing a value to a type name', async () => {
	const source = await readFile(join(repositoryRoot, 'plugins', 'skill-manager', 'src', 'client.ts'), 'utf8');
	assert.match(source, /typeof force === 'boolean' \? force : row\.enabled !== true/);
});
