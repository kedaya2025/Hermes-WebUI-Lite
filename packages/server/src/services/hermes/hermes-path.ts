/**
 * Hermes 路径检测工具 - 跨平台兼容
 *
 * Hermes 数据目录在不同平台上的位置：
 * - Windows 原生安装: %LOCALAPPDATA%\hermes
 * - Linux/macOS/WSL2: ~/.hermes
 * - 用户自定义: HERMES_HOME 环境变量
 */

import { basename, dirname, isAbsolute, relative, resolve, join } from 'path'
import { homedir } from 'os'
import { existsSync, readFileSync } from 'fs'
import { execFileSync } from 'child_process'

/**
 * 智能检测 Hermes 数据目录
 *
 * 检测优先级：
 * 1. HERMES_HOME 环境变量（用户自定义）
 * 2. Windows: %LOCALAPPDATA%\hermes（原生安装）
 * 3. 默认: ~/.hermes（Linux/macOS/WSL2）
 *
 * @returns Hermes 数据目录的绝对路径
 */
export function detectHermesHome(): string {
  // 1. 用户自定义的环境变量（最高优先级）
  if (process.env.HERMES_HOME) {
    return resolve(process.env.HERMES_HOME)
  }

  // 2. Windows：直接使用 %LOCALAPPDATA%\hermes
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || process.env.APPDATA
    if (localAppData) {
      return join(localAppData, 'hermes')
    }
  }

  // 3. Linux/macOS：~/.hermes
  return resolve(homedir(), '.hermes')
}

/**
 * Detect the Hermes root data directory.
 *
 * `HERMES_HOME` may intentionally point at a profile directory when launching a
 * specific gateway (`<root>/profiles/<name>`). Web UI profile management needs
 * the root directory so it can read `active_profile` and enumerate profiles.
 */
export function detectHermesRootHome(): string {
  const home = detectHermesHome()
  const parent = dirname(home)
  if (basename(parent) === 'profiles') return dirname(parent)
  return home
}

/**
 * 获取 Hermes CLI 二进制文件路径
 * @param customBin 自定义的 hermes 二进制路径
 * @returns hermes 命令名称或路径
 */
export function getHermesBin(customBin?: string): string {
  const preferred = customBin?.trim() || process.env.HERMES_BIN?.trim() || 'hermes'

  if (preferred && preferred !== 'hermes' && existsSync(preferred)) {
    try {
      const firstLine = readFileSync(preferred, 'utf-8').split(/\r?\n/, 1)[0]
      const match = firstLine.match(/^#!\s*(\S+)/)
      const shebang = match?.[1]
      if (shebang && !existsSync(shebang)) {
        const fallbackPython = preferred.replace(/[^/\\]+$/, 'python')
        if (existsSync(fallbackPython)) {
          return fallbackPython
        }
      }
    } catch {
      // Keep preferred path when probe fails; execFile will surface the real error.
    }
    return preferred
  }

  return preferred
}

export function buildHermesExec(customBin?: string, args: string[] = []): { command: string; args: string[] } {
  const preferred = customBin?.trim() || process.env.HERMES_BIN?.trim() || 'hermes'

  if (preferred && preferred !== 'hermes' && existsSync(preferred)) {
    try {
      const firstLine = readFileSync(preferred, 'utf-8').split(/\r?\n/, 1)[0]
      const match = firstLine.match(/^#!\s*(\S+)/)
      const shebang = match?.[1]
      if (shebang && !existsSync(shebang)) {
        const fallbackPython = preferred.replace(/[^/\\]+$/, 'python')
        if (existsSync(fallbackPython)) {
          return { command: fallbackPython, args: [preferred, ...args] }
        }
      }
    } catch {
      // Fall through to direct exec.
    }
    return { command: preferred, args }
  }

  if (preferred === 'hermes') {
    try {
      const resolved = process.platform === 'win32'
        ? execFileSync('where.exe', ['hermes'], { encoding: 'utf-8', windowsHide: true }).split(/\r?\n/).map(line => line.trim()).find(Boolean)
        : execFileSync('which', ['hermes'], { encoding: 'utf-8' }).split(/\r?\n/).map(line => line.trim()).find(Boolean)
      if (resolved && existsSync(resolved)) {
        return buildHermesExec(resolved, args)
      }
    } catch {
      // Keep bare hermes fallback.
    }
  }

  return { command: preferred, args }
}

function comparablePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

export function isPathWithin(targetPath: string, basePath: string): boolean {
  const base = resolve(basePath)
  const target = resolve(targetPath)
  const rel = relative(comparablePath(base), comparablePath(target))
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel))
}

export function relativePathFromBase(targetPath: string, basePath: string): string | null {
  if (!isPathWithin(targetPath, basePath)) return null
  const rel = relative(resolve(basePath), resolve(targetPath))
  return rel.replace(/\\/g, '/')
}
