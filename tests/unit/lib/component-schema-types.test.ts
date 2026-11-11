import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const FIXTURE = path.join(ROOT, 'tests/fixtures/component-schema/type-errors.ts')
const DIRECTIVE_RE = /^\s*\/\/ @ts-expect-error (.+)$/

interface Finding {
  line: number
  message: string
}

/** Type-check `source` as the fixture file with the project's compiler options. */
function check(source: string): Finding[] {
  const { config } = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), ts.sys.readFile)
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, ROOT)
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile
  host.getSourceFile = (fileName, languageVersion, ...rest) => path.resolve(fileName) === FIXTURE
    ? ts.createSourceFile(fileName, source, languageVersion)
    : getSourceFile(fileName, languageVersion, ...rest)

  const program = ts.createProgram([FIXTURE], options, host)
  return ts.getPreEmitDiagnostics(program).map(diagnostic => ({
    line: diagnostic.file && diagnostic.start !== undefined ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line : -1,
    message: `${diagnostic.file?.fileName ?? ''}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
  }))
}

describe('the types of examples, withFake and kss-modern/fixtures', { timeout: 60_000 }, () => {
  const source = fs.readFileSync(FIXTURE, 'utf-8')
  const lines = source.split('\n')
  const directives = lines.flatMap((line, index) => {
    const match = DIRECTIVE_RE.exec(line)
    return match ? [{ line: index + 1, expected: match[1] }] : []
  })

  it('compiles with every expected error in place', () => {
    expect(directives.length).toBeGreaterThanOrEqual(17)
    expect(check(source)).toEqual([])
  })

  it('fails each marked line for the named reason and nothing else', () => {
    const findings = check(lines.map(line => DIRECTIVE_RE.test(line) ? '' : line).join('\n'))

    for (const { line, expected } of directives) {
      const messages = findings.filter(finding => finding.line === line).map(finding => finding.message)
      expect(messages, `line ${line + 1}`).toContainEqual(expect.stringContaining(expected))
    }
    const marked = new Set(directives.map(directive => directive.line))
    expect(findings.filter(finding => !marked.has(finding.line))).toEqual([])
  })
})
