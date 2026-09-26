import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()
const testFiles = JSON.parse(await readFile(path.join(root, 'test-files.json'), 'utf8'))
const contractPattern = /<!-- test-contract: ((?:SPEC|ARCH)-[A-Z0-9-]+) -->/g
const sources = [
  { file: 'docs/spec.md', prefix: 'SPEC-' },
  { file: 'docs/architecture.md', prefix: 'ARCH-' },
]

const contracts = new Map()
const errors = []

for (const source of sources) {
  const content = await readFile(path.join(root, source.file), 'utf8')
  for (const match of content.matchAll(contractPattern)) {
    const id = match[1]
    if (!id.startsWith(source.prefix)) {
      errors.push(`${source.file}: ${id} は ${source.prefix} で始める必要があります`)
    }
    if (contracts.has(id)) {
      errors.push(`${source.file}: Test Contract ID ${id} が重複しています`)
    } else {
      contracts.set(id, source.file)
    }
  }
}

const collectTestFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectTestFiles(target)
    return testFiles.suffixes.some((suffix) => entry.name.endsWith(`.${suffix}`)) ? [target] : []
  }))
  return files.flat()
}

const property = (object, name) => object.properties.find((item) =>
  ts.isPropertyAssignment(item)
  && ((ts.isIdentifier(item.name) && item.name.text === name)
    || (ts.isStringLiteral(item.name) && item.name.text === name)),
)

const files = (await Promise.all(
  testFiles.roots.map((directory) => collectTestFiles(path.join(root, directory))),
)).flat()

for (const file of files) {
  const relativeFile = path.relative(root, file)
  const source = ts.createSourceFile(
    file,
    await readFile(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  let testCount = 0

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text === 'vitest' && node.importClause?.namedBindings) {
      const bindings = node.importClause.namedBindings
      if (ts.isNamespaceImport(bindings)) {
        errors.push(`${relativeFile}:${source.getLineAndCharacterOfPosition(bindings.getStart()).line + 1}: Vitestのnamespace importは生のtest/itを迂回できるため使用できません`)
      } else {
        for (const item of bindings.elements) {
          if (['test', 'it'].includes(item.propertyName?.text ?? item.name.text)) {
            errors.push(`${relativeFile}:${source.getLineAndCharacterOfPosition(item.getStart()).line + 1}: Vitestのtest/itを直接importせずcontractTestを使用してください`)
          }
        }
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
      if (name === 'test' || name === 'it') {
        errors.push(`${relativeFile}:${line}: ${name}()を直接使用せずcontractTest()を使用してください`)
      }
      if (name === 'contractTest') {
        testCount += 1
        const metadata = node.arguments[0]
        if (!metadata || !ts.isObjectLiteralExpression(metadata)) {
          errors.push(`${relativeFile}:${line}: contractTestのmetadataはobject literalで指定してください`)
        } else {
          const contract = property(metadata, 'contract')
          if (!contract || !ts.isStringLiteral(contract.initializer)) {
            errors.push(`${relativeFile}:${line}: contractは文字列リテラルで指定してください`)
          } else if (!contracts.has(contract.initializer.text)) {
            errors.push(`${relativeFile}:${line}: Test Contract ID ${contract.initializer.text} は正本に存在しません`)
          }
          const regression = property(metadata, 'regression')
          if (regression && (!ts.isNumericLiteral(regression.initializer)
            || !Number.isInteger(Number(regression.initializer.text))
            || Number(regression.initializer.text) <= 0)) {
            errors.push(`${relativeFile}:${line}: regressionは正のIssue番号で指定してください`)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (testCount === 0) errors.push(`${relativeFile}: contractTestで宣言されたtest caseがありません`)
}

if (errors.length > 0) {
  console.error(['Test Contract validationに失敗しました:', ...errors.map((error) => `- ${error}`)].join('\n'))
  process.exitCode = 1
} else {
  console.log(`${contracts.size}件のTest Contractと、すべてのtest caseの参照を確認しました。`)
}
