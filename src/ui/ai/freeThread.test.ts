// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { settleVersions, showVersion, versionsToKeep, type FreeMessage } from './freeThread'

const reply = (content: string, extra: Partial<FreeMessage> = {}): FreeMessage => ({ role: 'assistant', content, ...extra })

/** Retry `m`: the pending placeholder that replaces it, finished with `answer`. */
const retry = (m: FreeMessage, answer: string) =>
  settleVersions({ ...reply(answer), versions: versionsToKeep(m) })

describe('reply versions', () => {
  it('keeps the first answer when a retry adds a second, showing the new one', () => {
    const second = retry(reply('first'), 'second')
    expect(second.content).toBe('second')
    expect(second.versionIndex).toBe(1)
    expect(second.versions?.map((v) => v.content)).toEqual(['first', 'second'])
  })

  it('accumulates across retries', () => {
    const third = retry(retry(reply('a'), 'b'), 'c')
    expect(third.versions?.map((v) => v.content)).toEqual(['a', 'b', 'c'])
    expect(third.versionIndex).toBe(2)
  })

  it('restores the previous answer when the retry produced nothing', () => {
    const failed = retry(retry(reply('a'), 'b'), '')
    expect(failed.content).toBe('b')
    expect(failed.pending).toBe(false)
    expect(failed.versions?.map((v) => v.content)).toEqual(['a', 'b'])
    expect(failed.versionIndex).toBe(1)
  })

  it('switches versions without losing state made on the shown one', () => {
    const two = retry(reply('a'), 'b')
    const edited = { ...two, appliedIds: ['p1'] } // e.g. a proposal applied on version 2
    const back = showVersion(edited, 0)
    expect(back.content).toBe('a')
    expect(back.appliedIds).toBeUndefined()
    const forward = showVersion(back, 1)
    expect(forward.content).toBe('b')
    expect(forward.appliedIds).toEqual(['p1'])
  })

  it('keeps nothing for a reply with no answer, and retrying a shown older version keeps all', () => {
    expect(versionsToKeep(reply(''))).toEqual([])
    expect(versionsToKeep(undefined)).toEqual([])
    const onFirst = showVersion(retry(reply('a'), 'b'), 0)
    expect(retry(onFirst, 'c').versions?.map((v) => v.content)).toEqual(['a', 'b', 'c'])
  })
})
