export interface ParsedArgs {
  positionals: string[]
  flags: Record<string, string | true>
}

/**
 * `--key value`, `--key=value`, `--flag`, `-h`; a lone `--` ends flag parsing.
 * Names in `booleans` never take a value, so `genoffice --json info a.docx` keeps
 * `info` as the command. Throws on empty flag names (`--=x`); short-flag
 * tokens like `-h` never count as a `--key` value, so `--out -h` leaves
 * `-h` for help handling instead of swallowing it. (Bare `-` still counts:
 * it means stdin.)
 */
export function parseArgs(
  argv: readonly string[],
  booleans: ReadonlySet<string> = new Set(),
): ParsedArgs {
  const positionals: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (arg === '-h') {
      flags.help = true
      continue
    }
    if (!arg.startsWith('--') || arg.length === 2) {
      positionals.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    if (eq !== -1) {
      const name = arg.slice(2, eq)
      if (!name) throw new Error(`invalid flag "${arg}": flag names must not be empty`)
      flags[name] = arg.slice(eq + 1)
      continue
    }
    const key = arg.slice(2)
    if (!key) throw new Error(`invalid flag "${arg}": flag names must not be empty`)
    const next = argv[i + 1]
    const nextIsFlag = next !== undefined && (next.startsWith('--') || /^-[a-zA-Z?]/.test(next))
    if (!booleans.has(key) && next !== undefined && !nextIsFlag) {
      flags[key] = next
      i++
    } else {
      flags[key] = true
    }
  }
  return { positionals, flags }
}

export function flagString(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[name]
  return typeof v === 'string' ? v : undefined
}

export function flagBool(args: ParsedArgs, name: string): boolean {
  return args.flags[name] !== undefined
}
