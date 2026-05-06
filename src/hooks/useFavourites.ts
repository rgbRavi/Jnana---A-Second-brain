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
