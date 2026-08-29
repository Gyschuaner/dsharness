import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
const staleOutputs: string[] = []
const pluginProjects: string[] = []
const pluginsRoot = join(repositoryRoot, 'plugins')
for (const plugin of readdirSync(pluginsRoot, { withFileTypes: true })) {
  if (!plugin.isDirectory()) continue
  const pluginRoot = join(pluginsRoot, plugin.name)
  if (existsSync(join(pluginRoot, 'tsconfig.json'))) pluginProjects.push(`plugins/${plugin.name}`)
  const sourceRoot = join(pluginsRoot, plugin.name, 'src')
  if (!existsSync(sourceRoot)) continue
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
    const output = join(pluginsRoot, plugin.name, 'lib', entry.name.replace(/\.ts$/u, '.js'))
    const displayOutput = relative(repositoryRoot, output).split(sep).join('/')
    if (!existsSync(output)) {
      missingOutputs.push(displayOutput)
      continue
    }
    const source = join(sourceRoot, entry.name)
    if (statSync(source).mtimeMs > statSync(output).mtimeMs) staleOutputs.push(displayOutput)
  }
}

if (missingOutputs.length > 0) {
  throw new Error(`TypeScript build outputs are missing:\n${missingOutputs.join('\n')}`)
}

const rootConfig = JSON.parse(readFileSync(join(repositoryRoot, 'tsconfig.json'), 'utf8')) as {
  references?: Array<{ path?: string }>
}
const rootReferences = new Set((rootConfig.references ?? []).flatMap((entry) => {
  if (typeof entry.path !== 'string') return []
  return [entry.path.replace(/^\.\//u, '').replaceAll('\\', '/')]
}))
const missingProjectReferences = pluginProjects.filter(project => !rootReferences.has(project))
if (missingProjectReferences.length > 0) {
  throw new Error(`plugin TypeScript projects are missing from root references:\n${missingProjectReferences.join('\n')}`)
}

if (staleOutputs.length > 0) {
  throw new Error(`TypeScript build outputs are older than their sources:\n${staleOutputs.join('\n')}`)
}

process.stdout.write('TypeScript inventory verified: every plugin is in the root build graph and all source outputs are fresh.\n')
