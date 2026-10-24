// The extraction function keeps its own copy of the test codes (it runs on Deno,
// outside the app build). This test fails if the two lists drift apart.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { LAB_TESTS } from '../src/domain/labs/catalog'

it('extract-document lists exactly the app catalog codes', () => {
  const source = readFileSync(resolve(__dirname, '../../supabase/functions/extract-document/index.ts'), 'utf8')
  const block = source.slice(source.indexOf('const CATALOG:'), source.indexOf('const CATALOG_CODES'))
  const codes = [...block.matchAll(/\['([a-z0-9_]+)',/g)].map((m) => m[1])
  expect(codes).toEqual(LAB_TESTS.map((t) => t.code))
})
