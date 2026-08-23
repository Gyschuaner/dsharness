import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const tracked = execFileSync('git', ['ls-files'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).split(/\r?\n/u).filter(Boolean)

const allowedGenerated = /^plugins\/[^/]+\/lib\/[^/]+\.js$/u
const handwrittenJavaScript = tracked.filter(path => path.endsWith('.js') && !allowedGenerated.test(path))
if (handwrittenJavaScript.length > 0) {
  throw new Error(`hand-written JavaScript remains:\n${handwrittenJavaScript.join('\n')}`)
}

const missingOutputs: string[] = []
const pluginsRoot = join(repositoryRoot, 'plugins')
for (const plugin of readdirSync(pluginsRoot, { withFileTypes: true })) {
  if (!plugin.isDirectory()) continue
  const sourceRoot = join(pluginsRoot, plugin.name, 'src')
  if (!existsSync(sourceRoot)) continue
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
    const output = join(pluginsRoot, plugin.name, 'lib', entry.name.replace(/\.ts$/u, '.js'))
    if (!existsSync(output)) missingOutputs.push(relative(repositoryRoot, output).split(sep).join('/'))
  }
}

if (missingOutputs.length > 0) {
  throw new Error(`TypeScript build outputs are missing:\n${missingOutputs.join('\n')}`)
}

process.stdout.write('TypeScript inventory verified: no hand-written .js files and all source outputs exist.\n')
