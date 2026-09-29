// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Renders the declarative blocks a plugin hands back (lib/pluginBlocks.ts) with
// the app's own tokens, so a worker panel or a plugin-rendered fence looks like
// Jnana rather than like whatever the plugin would have drawn. Text goes in as
// text — React escapes it — which is the point of the format.

import type { PluginBlock } from '../../lib/pluginBlocks'
import styles from './PluginBlocks.module.css'

export function PluginBlocks({
  blocks,
  onAction,
}: {
  blocks: PluginBlock[]
  /** Called with a button's `actionId`; omit to render buttons disabled. */
  onAction?: (actionId: string) => void
}) {
  return (
    <div className={styles.blocks}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <h4 key={i} className={styles.heading}>
                {block.text}
              </h4>
            )
          case 'text':
            return (
              <p key={i} className={styles.text}>
                {block.text}
              </p>
            )
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List key={i} className={styles.list}>
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </List>
            )
          }
          case 'table':
            return (
              <div key={i} className={styles.tableWrap}>
                <table className={styles.table}>
                  {block.headers && (
                    <thead>
                      <tr>
                        {block.headers.map((h, j) => (
                          <th key={j}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td key={k}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'button':
            return (
              <button
                key={i}
                type="button"
                className={styles.button}
                disabled={!onAction}
                onClick={() => onAction?.(block.actionId)}
              >
                {block.label}
              </button>
            )
          case 'divider':
            return <hr key={i} className={styles.divider} />
        }
      })}
    </div>
  )
}
