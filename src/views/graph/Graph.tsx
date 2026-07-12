// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useMemo } from "react"
import { GraphView } from "../../ui/graph/GraphView"
import { useNotesContext } from "../../context/NotesContext"
import { useActiveVaultId } from "../../hooks/useVaults"
import { DEFAULT_VAULT_ID } from "../../types"

function Graph(){

    // Use the single app-wide notes instance from AppLayout, not a fresh one.
    const { create, update, remove, notes } = useNotesContext()
    // Scope the main graph to the active vault (Obsidian-style) — switching vaults
    // swaps which nodes/edges appear, via GraphView's existing scopeIds path.
    const activeVaultId = useActiveVaultId()
    const scopeIds = useMemo(
        () => new Set(notes.filter((n) => (n.vaultId ?? DEFAULT_VAULT_ID) === activeVaultId).map((n) => n.id)),
        [notes, activeVaultId],
    )
    return(
        <div className="graph-view">
            <GraphView onCreate={create} onUpdate={update} onRemove={remove} scopeIds={scopeIds} scopeNoun="vault" />
        </div>
    )
}


export default Graph