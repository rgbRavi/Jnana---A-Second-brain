// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import {addFavourite, getFavouriteNoteIds, removeFavourite } from "../core/notes"


export function useFavourites() {
    async function fetchFavourites(): Promise<string[]> {
        return await getFavouriteNoteIds()
    }

    async function addToFavourites(noteId: string): Promise<void> {
        await addFavourite(noteId)
    }

    async function removeFromFavourites(noteId: string): Promise<void> {
        await removeFavourite(noteId)
    }
    return { fetchFavourites, addToFavourites, removeFromFavourites };
}
