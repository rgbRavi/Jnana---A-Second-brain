// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { classifyFile, extensionOf, basenameOf } from './classify'

describe('classifyFile', () => {
  it('routes media by extension', () => {
    expect(classifyFile('shot.PNG')).toBe('image')
    expect(classifyFile('clip.mp4')).toBe('video')
    expect(classifyFile('song.flac')).toBe('audio')
  })

  it('embeds a PDF rather than sending it to the document importer', () => {
    // Media wins over DOCUMENT_EXTENSIONS, which also lists pdf — the toolbar's
    // document button embeds a PDF without prompting too.
    expect(classifyFile('paper.pdf')).toBe('pdf')
  })

  it('sends office and spreadsheet files to the document importer', () => {
    expect(classifyFile('notes.docx')).toBe('document')
    expect(classifyFile('budget.xlsx')).toBe('document')
    expect(classifyFile('rows.csv')).toBe('document')
  })

  it('treats .ogg as audio and .ogv as video', () => {
    expect(classifyFile('track.ogg')).toBe('audio')
    expect(classifyFile('movie.ogv')).toBe('video')
  })

  it('returns null for anything it cannot import', () => {
    expect(classifyFile('setup.exe')).toBeNull()
    expect(classifyFile('README')).toBeNull()
    expect(classifyFile('')).toBeNull()
  })

  it('works on full paths, either separator', () => {
    expect(classifyFile('C:\\Users\\me\\a.mp3')).toBe('audio')
    expect(classifyFile('/home/me/a.docx')).toBe('document')
  })
})

describe('extensionOf / basenameOf', () => {
  it('lower-cases the extension and tolerates none', () => {
    expect(extensionOf('A.JPG')).toBe('jpg')
    expect(extensionOf('Makefile')).toBe('')
  })

  it('takes the last path segment for either separator', () => {
    expect(basenameOf('C:\\a\\b\\c.docx')).toBe('c.docx')
    expect(basenameOf('/a/b/c.docx')).toBe('c.docx')
    expect(basenameOf('c.docx')).toBe('c.docx')
  })
})
