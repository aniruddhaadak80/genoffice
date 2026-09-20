import { readFileSync, statSync } from 'node:fs'
import { flagString, type ParsedArgs } from './args'
import { resolveInput, type PathContext } from './fs'
import { CliError, EXIT } from './result'

/** Max --ops payload: prevents GB file/stdin from OOMing JSON.parse downstream. */
export const MAX_OPS_BYTES = 16 * 1024 * 1024

function throwIfOpsOverBudget(bytes: number, source: string): void {
  if (bytes > MAX_OPS_BYTES) {
    throw new CliError(
      EXIT.file,
      `ops input too large: ${source} is ${bytes} bytes (cap ${MAX_OPS_BYTES}); split into smaller batches`,
      { source, bytes, cap: MAX_OPS_BYTES },
      {
        reason: 'resource_limit',
        suggestion: 'split into smaller --ops batches',
      },
    )
  }
}

/** `--ops <file>` or `--ops -` (stdin); returns the raw text and a label for error messages. */
export function readOpsInput(args: ParsedArgs, ctx: PathContext): { text: string; source: string } {
  const spec = flagString(args, 'ops')
  if (!spec)
    throw new CliError(EXIT.usage, 'missing --ops <file|->', undefined, {
      reason: 'missing_argument',
    })
  if (spec === '-') {
    const text = readFileSync(0, 'utf-8')
    throwIfOpsOverBudget(Buffer.byteLength(text, 'utf-8'), 'stdin')
    return { text, source: 'stdin' }
  }
  const path = resolveInput(spec, ctx)
  const size = statSync(path).size
  throwIfOpsOverBudget(size, path)
  return { text: readFileSync(path, 'utf-8'), source: path }
}
