import { test, type TestFunction } from 'vitest'

interface ContractTestMetadata {
  contract: `SPEC-${string}` | `ARCH-${string}`
  regression?: number
}

/** テストと正本上の契約を結び付けるためだけの薄いVitest wrapper。 */
export const contractTest = (
  metadata: ContractTestMetadata,
  name: string,
  handler: TestFunction,
) => {
  void metadata
  return test(name, handler)
}
