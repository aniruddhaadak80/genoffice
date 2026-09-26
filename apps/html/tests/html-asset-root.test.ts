import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isInDocDir, resolveSafeRelativeImagePath } from '../src/main/asset-lifecycle'

const tempDirectories: string[] = []

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function servesFromDocumentDir(documentPath: string, target: string): Promise<boolean> {
  const dir = resolve(dirname(documentPath))
  if (!isInDocDir(resolve(target), dir)) return false
  return (await resolveSafeRelativeImagePath(documentPath, relative(dir, resolve(target)))) !== null
}

describe('isInDocDir for the html-asset document directory', () => {
  it('admits siblings of filesystem-root documents', () => {
    expect(isInDocDir('/a.png', '/', '/')).toBe(true)
    expect(isInDocDir('/assets/a.png', '/', '/')).toBe(true)
    expect(isInDocDir('C:\\a.png', 'C:\\', '\\')).toBe(true)
    expect(isInDocDir('C:\\assets\\a.png', 'C:\\', '\\')).toBe(true)
  })

  it('admits siblings of nested documents', () => {
    expect(isInDocDir('/docs/a.png', '/docs', '/')).toBe(true)
    expect(isInDocDir('C:\\docs\\a.png', 'C:\\docs', '\\')).toBe(true)
  })

  it('rejects another directory and a name-prefix sibling', () => {
    expect(isInDocDir('/other/a.png', '/docs', '/')).toBe(false)
    expect(isInDocDir('/docs-evil/a.png', '/docs', '/')).toBe(false)
    expect(isInDocDir('C:\\docs-evil\\a.png', 'C:\\docs', '\\')).toBe(false)
  })

  it('never reports the document directory itself as inside', () => {
    expect(isInDocDir('/', '/', '/')).toBe(false)
    expect(isInDocDir('/docs', '/docs', '/')).toBe(false)
    expect(isInDocDir('C:\\', 'C:\\', '\\')).toBe(false)
  })

  it('does not append a second separator to a root directory', () => {
    const root = resolve(sep)
    expect(root.endsWith(sep)).toBe(true)
    expect(isInDocDir(join(root, 'a.png'), root)).toBe(true)
    expect(join(root, 'a.png').startsWith(root + sep)).toBe(false)
  })
})

describe('html-asset document directory gate', () => {
  it('serves a real sibling image of the open document', async () => {
    const directory = await temporaryDirectory('html-asset-root-')
    const documentPath = join(directory, 'page.html')
    const imagePath = join(directory, 'sibling.png')
    await writeFile(imagePath, 'not-really-a-png-but-a-real-file')
    expect(await servesFromDocumentDir(documentPath, imagePath)).toBe(true)
  })

  it('serves a real nested sibling image', async () => {
    const directory = await temporaryDirectory('html-asset-nested-')
    const sub = join(directory, 'assets')
    const documentPath = join(directory, 'page.html')
    await mkdir(sub, { recursive: true })
    const imagePath = join(sub, 'sibling.png')
    await writeFile(imagePath, 'bytes')
    expect(await servesFromDocumentDir(documentPath, imagePath)).toBe(true)
  })

  it('does not serve an image from another directory', async () => {
    const directory = await temporaryDirectory('html-asset-other-')
    const other = await temporaryDirectory('html-asset-elsewhere-')
    const documentPath = join(directory, 'page.html')
    const imagePath = join(other, 'sibling.png')
    await writeFile(imagePath, 'bytes')
    expect(await servesFromDocumentDir(documentPath, imagePath)).toBe(false)
  })

  it('refuses a missing sibling', async () => {
    const directory = await temporaryDirectory('html-asset-missing-')
    expect(
      await servesFromDocumentDir(join(directory, 'page.html'), join(directory, 'absent.png')),
    ).toBe(false)
  })
})
