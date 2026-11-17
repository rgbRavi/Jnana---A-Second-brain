// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { addFavourite, getFavouriteNoteIds, removeFavourite } from "../core/notes"
import { eventBus } from "../lib/eventBus"

/** Favourite reads/writes. Every successful write emits `favourite:changed
 *  {id, on}` here — the one place all callers route through — so the gallery,
 *  peek, editor panes and workspaces stay in sync without each caller emitting. */
export function useFavourites() {
    async function fetchFavourites(): Promise<string[]> {
        return await getFavouriteNoteIds()
    }

    async function addToFavourites(noteId: string): Promise<void> {
        await addFavourite(noteId)
        eventBus.emit('favourite:changed', { id: noteId, on: true })
    }

    async function removeFromFavourites(noteId: string): Promise<void> {
        await removeFavourite(noteId)
        eventBus.emit('favourite:changed', { id: noteId, on: false })
    }
    return { fetchFavourites, addToFavourites, removeFromFavourites };
}
