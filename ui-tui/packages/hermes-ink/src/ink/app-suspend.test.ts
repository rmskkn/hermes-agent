import { EventEmitter } from 'events'

import { describe, expect, it } from 'vitest'

import { suspendOnCtrlZ } from './components/App.js'
import Ink from './ink.js'
import { EXIT_ALT_SCREEN } from './termio/dec.js'

describe('suspendOnCtrlZ', () => {
  it('is off unless HERMES_TUI_CTRL_Z_SUSPEND opts in', () => {
    expect(suspendOnCtrlZ({}, 'linux')).toBe(false)
    expect(suspendOnCtrlZ({ HERMES_TUI_CTRL_Z_SUSPEND: '0' }, 'linux')).toBe(false)
    expect(suspendOnCtrlZ({ HERMES_TUI_CTRL_Z_SUSPEND: '1' }, 'linux')).toBe(true)
    expect(suspendOnCtrlZ({ HERMES_TUI_CTRL_Z_SUSPEND: 'true' }, 'darwin')).toBe(true)
  })

  it('never suspends on Windows', () => {
    expect(suspendOnCtrlZ({ HERMES_TUI_CTRL_Z_SUSPEND: '1' }, 'win32')).toBe(false)
  })

  it('never suspends under the dashboard PTY, which has no shell to resume it', () => {
    expect(suspendOnCtrlZ({ HERMES_TUI_CTRL_Z_SUSPEND: '1', HERMES_PTY_HOST: 'dashboard' }, 'linux')).toBe(false)
  })
})

class FakeTty extends EventEmitter {
  chunks: string[] = []
  columns = 20
  rows = 5
  isTTY = true

  write(chunk: string | Uint8Array, cb?: (err?: Error | null) => void): boolean {
    this.chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
    cb?.()

    return true
  }
}

describe('Ink#exitAltScreenForSuspend', () => {
  // #151431 follow-up: alt-screen has no scrollback, so a Ctrl+Z suspend that
  // leaves it active freezes the pane with nothing to scroll (tmux included —
  // the limitation is terminal-level, not tmux-specific) until SIGCONT.
  it('exits alt-screen when active, leaving altScreenActive set for the SIGCONT resume path', () => {
    const stdout = new FakeTty()
    const stdin = new FakeTty()
    const stderr = new FakeTty()

    const ink = new Ink({
      exitOnCtrlC: false,
      patchConsole: false,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream
    })

    ink.setAltScreenActive(true)
    stdout.chunks = []

    ink.exitAltScreenForSuspend()

    expect(stdout.chunks.join('')).toContain(EXIT_ALT_SCREEN)

    ink.unmount()
  })

  it('is a no-op when alt-screen was never entered', () => {
    const stdout = new FakeTty()
    const stdin = new FakeTty()
    const stderr = new FakeTty()

    const ink = new Ink({
      exitOnCtrlC: false,
      patchConsole: false,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream
    })

    stdout.chunks = []

    ink.exitAltScreenForSuspend()

    expect(stdout.chunks.join('')).toBe('')

    ink.unmount()
  })
})
