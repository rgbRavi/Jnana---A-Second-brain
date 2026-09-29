// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The right-rail "Note tools" panel — tags, AI tag/link suggestions, media
// attachments and formatting for the focused Working Notes pane, moved off the
// editor surface to keep it quiet. Reads the pane's context from activeNote.

import { useActiveNote } from '../../lib/activeNote'
import { TagEditor } from '../TagEditor'
import { ComposerSuggestions } from '../ai/ComposerSuggestions'
import { ComposerToolbar } from '../editor/ComposerToolbar'
import { FormatToolbar } from '../editor/FormatToolbar'
import { isAutoTag } from '../../core/tags'
import { Section } from './TableToolPanel'
import styles from './RightRail.module.css'

export function NoteToolsPanel() {
  const active = useActiveNote()
  if (!active) return <div className={styles.empty}>Open a note in Working Notes to use these tools.</div>

  const { note, allNotes, setUserTags, addTag, addLink, typed, editing, editorRef, toolbarProps, uploading } = active

  return (
    <div className={styles.panelBody}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Tags</div>
        <TagEditor tags={note.tags} onChange={setUserTags} />
      </div>

      {!typed && (
        <Section title="Suggest">
          <ComposerSuggestions
            note={note}
            allNotes={allNotes}
            currentTags={note.tags.filter((t) => !isAutoTag(t))}
            onAddTag={addTag}
            onAddLink={addLink}
          />
        </Section>
      )}

      {editing && (
        <>
          <Section title="Insert">
            <ComposerToolbar {...toolbarProps} disabled={uploading} />
          </Section>
          <Section title="Format">
            <FormatToolbar editorRef={editorRef} disabled={uploading} />
          </Section>
        </>
      )}
    </div>
  )
}
