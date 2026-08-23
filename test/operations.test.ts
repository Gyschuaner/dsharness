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
	for (const relativePath of ['restart-dsh-web.ps1', 'dev/setup-plugin-junction.ps1']) {
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
