// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_REMEMBERED,
  addNeverAsk,
  clearAskedQuestions,
  excludedQuestions,
  getAskedQuestions,
  getNeverAsk,
  normalizeQuestion,
  openBucket,
  rememberQuestions,
  removeNeverAsk,
} from './quizMemory'

describe('normalizeQuestion', () => {
  it('ignores case, punctuation and spacing differences', () => {
    expect(normalizeQuestion('  What IS back-propagation? ')).toBe(
      normalizeQuestion('what is back propagation'),
    )
  })

  it('keeps genuinely different questions distinct', () => {
    expect(normalizeQuestion('What is a tensor?')).not.toBe(normalizeQuestion('What is a vector?'))
  })
})

describe('quiz memory', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty and remembers what was asked', () => {
    expect(getAskedQuestions('vault-default')).toEqual([])
    rememberQuestions('vault-default', ['What is a tensor?', 'Define entropy.'])
    expect(getAskedQuestions('vault-default')).toEqual(['What is a tensor?', 'Define entropy.'])
  })

  it('keeps vaults separate', () => {
    rememberQuestions('vault-a', ['A?'])
    rememberQuestions('vault-b', ['B?'])
    expect(getAskedQuestions('vault-a')).toEqual(['A?'])
    expect(getAskedQuestions('vault-b')).toEqual(['B?'])
  })

  it('does not store a question twice, even reworded in case/punctuation', () => {
    rememberQuestions('v', ['What is a tensor?'])
    rememberQuestions('v', ['what is a TENSOR'])
    expect(getAskedQuestions('v')).toEqual(['What is a tensor?'])
  })

  it('drops the oldest entries past the cap', () => {
    const many = Array.from({ length: MAX_REMEMBERED + 5 }, (_, i) => `Question ${i}?`)
    rememberQuestions('v', many)
    const kept = getAskedQuestions('v')
    expect(kept).toHaveLength(MAX_REMEMBERED)
    expect(kept[0]).toBe('Question 5?')
    expect(kept[kept.length - 1]).toBe(`Question ${MAX_REMEMBERED + 4}?`)
  })

  it('clears one vault only', () => {
    rememberQuestions('v', ['A?'])
    rememberQuestions('w', ['B?'])
    clearAskedQuestions('v')
    expect(getAskedQuestions('v')).toEqual([])
    expect(getAskedQuestions('w')).toEqual(['B?'])
  })

  it('treats corrupt storage as empty instead of throwing', () => {
    localStorage.setItem('jnana.quiz.asked.v1', 'not json')
    expect(getAskedQuestions('v')).toEqual([])
    expect(() => rememberQuestions('v', ['A?'])).not.toThrow()
  })
})

describe('never-ask list', () => {
  beforeEach(() => localStorage.clear())

  it('never-ask survives the MAX_REMEMBERED cap', () => {
    addNeverAsk('v', 'Bad question?')
    rememberQuestions('v', Array.from({ length: 250 }, (_, i) => `Q ${i}?`))
    expect(excludedQuestions('v')).toContain('Bad question?')
    expect(getNeverAsk('v')).toEqual(['Bad question?'])
  })

  it('dedupes and removeNeverAsk matches ignoring case/punctuation', () => {
    addNeverAsk('v', 'What is X?')
    addNeverAsk('v', 'what is x')
    expect(getNeverAsk('v')).toHaveLength(1)
    removeNeverAsk('v', 'WHAT IS X!!')
    expect(getNeverAsk('v')).toEqual([])
  })

  it('excludedQuestions dedupes asked + never-ask', () => {
    rememberQuestions('v', ['A?'])
    addNeverAsk('v', 'a')
    expect(excludedQuestions('v')).toEqual(['A?'])
  })

  it('clearAskedQuestions clears the never-ask list too', () => {
    addNeverAsk('v', 'A?')
    clearAskedQuestions('v')
    expect(getNeverAsk('v')).toEqual([])
  })

  it('openBucket keeps open questions out of the vault bucket', () => {
    rememberQuestions(openBucket('v'), ['Open?'])
    expect(openBucket('v')).toBe('v:open')
    expect(getAskedQuestions('v')).toEqual([])
    expect(getAskedQuestions('v:open')).toEqual(['Open?'])
  })
})
