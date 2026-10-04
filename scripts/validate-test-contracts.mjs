import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()
const testFileConfig = JSON.parse(await readFile(path.join(root, 'test-files.json'), 'utf8'))
const canonicalWrapper = path.join(root, 'src/test/contractTest.ts')
const excludedDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules'])
const contractMarkerPattern = /<!--\s*test-contract:\s*([A-Z][A-Z0-9-]+)\s*-->/g
const contractSources = [
  { file: 'docs/spec.md', prefix: 'SPEC-' },
  { file: 'docs/architecture.md', prefix: 'ARCH-' },
]
const errors = []
const referencedContracts = new Set()

const lineOf = (sourceFile, node) =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1

const collectTypeScriptFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) return []
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectTypeScriptFiles(target)
    return /\.(?:ts|tsx|mts|cts)$/.test(entry.name) ? [target] : []
  }))
  return nestedFiles.flat()
}

const readSourceFile = async (file) => ts.createSourceFile(
  file,
  await readFile(file, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
)

const propertyName = (property) => {
  if (!property.name) return undefined
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text
  }
  return undefined
}

const propertiesNamed = (object, name) =>
  object.properties.filter((property) => propertyName(property) === name)

const collectContracts = async () => {
  const contracts = new Map()
  for (const { file, prefix } of contractSources) {
    const content = await readFile(path.join(root, file), 'utf8')
    for (const match of content.matchAll(contractMarkerPattern)) {
      const id = match[1]
      if (!id.startsWith(prefix)) {
        errors.push(`${file}: Test Contract ID ${id} は ${prefix} で始める必要があります`)
      }
      if (contracts.has(id)) {
        errors.push(`${file}: Test Contract ID ${id} が重複しています`)
      } else {
        contracts.set(id, file)
      }
    }
  }
  return contracts
}

const validateRawVitestApi = (file, sourceFile) => {
  if (file === canonicalWrapper) return

  const visit = (node) => {
    if (ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text === 'vitest') {
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) {
        errors.push(`${path.relative(root, file)}:${lineOf(sourceFile, bindings)}: Vitestのnamespace importは使用できません`)
      }
      if (bindings && ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) {
          const importedName = specifier.propertyName?.text ?? specifier.name.text
          if (importedName === 'test' || importedName === 'it') {
            errors.push(`${path.relative(root, file)}:${lineOf(sourceFile, specifier)}: Vitestのtest/itをimportせず正規のcontractTestを使用してください`)
          }
        }
      }
    }

    if (ts.isExportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text === 'vitest') {
      const clause = node.exportClause
      if (!clause || ts.isNamespaceExport(clause)) {
        errors.push(`${path.relative(root, file)}:${lineOf(sourceFile, node)}: Vitestのnamespace re-exportは使用できません`)
      } else {
        for (const specifier of clause.elements) {
          const exportedSourceName = specifier.propertyName?.text ?? specifier.name.text
          if (exportedSourceName === 'test' || exportedSourceName === 'it') {
            errors.push(`${path.relative(root, file)}:${lineOf(sourceFile, specifier)}: Vitestのtest/itをre-exportせず正規のcontractTestを使用してください`)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

const validateMetadata = (file, sourceFile, call, contracts) => {
  const relativeFile = path.relative(root, file)
  const line = lineOf(sourceFile, call)
  const metadata = call.arguments[0]
  if (!metadata || !ts.isObjectLiteralExpression(metadata)) {
    errors.push(`${relativeFile}:${line}: contractTestの第1引数はobject literalで指定してください`)
    return
  }

  const contractProperties = propertiesNamed(metadata, 'contract')
  const contract = contractProperties[0]
  if (contractProperties.length !== 1
    || !contract
    || !ts.isPropertyAssignment(contract)
    || !ts.isStringLiteral(contract.initializer)) {
    errors.push(`${relativeFile}:${line}: contractは文字列リテラルを直接指定してください`)
  } else {
    const contractId = contract.initializer.text
    if (!contracts.has(contractId)) {
      errors.push(`${relativeFile}:${line}: Test Contract ID ${contractId} は正本に存在しません`)
    } else {
      referencedContracts.add(contractId)
    }
  }

  const regressionProperties = propertiesNamed(metadata, 'regression')
  if (regressionProperties.length > 1) {
    errors.push(`${relativeFile}:${line}: regressionは1つだけ指定してください`)
    return
  }
  const regression = regressionProperties[0]
  if (regression && (!ts.isPropertyAssignment(regression)
    || !ts.isNumericLiteral(regression.initializer)
    || !Number.isInteger(Number(regression.initializer.text))
    || Number(regression.initializer.text) <= 0)) {
    errors.push(`${relativeFile}:${line}: regressionは正のIssue番号を数値リテラルで指定してください`)
  }
}

const validateTestFile = (file, sourceFile, contracts) => {
  const relativeFile = path.relative(root, file)
  let importsCanonicalWrapper = false
  let testCount = 0

  const visit = (node) => {
    if (ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.importClause?.namedBindings
      && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const specifier of node.importClause.namedBindings.elements) {
        const importedName = specifier.propertyName?.text ?? specifier.name.text
        if (importedName !== 'contractTest') continue
        const importedPath = path.resolve(path.dirname(file), node.moduleSpecifier.text)
          .replace(/\.ts$/, '')
        if (specifier.name.text === 'contractTest'
          && importedPath === canonicalWrapper.replace(/\.ts$/, '')) {
          importsCanonicalWrapper = true
        } else {
          errors.push(`${relativeFile}:${lineOf(sourceFile, specifier)}: contractTestはsrc/test/contractTest.tsから名前を変えずに直接importしてください`)
        }
      }
    }

    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'contractTest') {
      testCount += 1
      validateMetadata(file, sourceFile, node, contracts)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  if (!importsCanonicalWrapper) {
    errors.push(`${relativeFile}: contractTestをsrc/test/contractTest.tsから名前を変えずに直接importしてください`)
  }
  if (testCount === 0) {
    errors.push(`${relativeFile}: contractTestで宣言されたtest caseがありません`)
  }
}

const contracts = await collectContracts()
const repositorySources = await collectTypeScriptFiles(root)
const configuredTestFiles = (await Promise.all(
  testFileConfig.roots.map((directory) => collectTypeScriptFiles(path.join(root, directory))),
)).flat().filter((file) =>
  testFileConfig.suffixes.some((suffix) => file.endsWith(`.${suffix}`)),
)
const configuredTestFileSet = new Set(configuredTestFiles)

for (const file of repositorySources) {
  const sourceFile = await readSourceFile(file)
  validateRawVitestApi(file, sourceFile)
  if (configuredTestFileSet.has(file)) {
    validateTestFile(file, sourceFile, contracts)
  }
}

for (const [id, file] of contracts) {
  if (!referencedContracts.has(id)) {
    errors.push(`${file}: Test Contract ID ${id} はtest caseから参照されていません`)
  }
}

if (errors.length > 0) {
  console.error(['Test Contract validationに失敗しました:', ...errors.map((error) => `- ${error}`)].join('\n'))
  process.exitCode = 1
} else {
  console.log(`${contracts.size}件のTest Contractの相互参照と、すべてのtest caseの参照先を確認しました。`)
}
