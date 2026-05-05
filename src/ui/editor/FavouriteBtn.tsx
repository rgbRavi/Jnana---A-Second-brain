import { useFavourites } from "../../hooks/useFavourites"
import { useState, useEffect } from "react"
import Styles from "./FavouriteBtn.module.css"

type FavouriteBtnProps = {
    noteId: string
}

export function FavouriteBtn({ noteId }: FavouriteBtnProps) {
    const { addToFavourites, removeFromFavourites, fetchFavourites } = useFavourites()
    const [isFavourite, setIsFavourite] = useState(false)

    useEffect(() => {
        fetchFavourites().then(ids => setIsFavourite(ids.includes(noteId)))
    }, [noteId])

    const handleClick = async () => {
        if (isFavourite) {
            await removeFromFavourites(noteId)
            setIsFavourite(false)
        } else {
            await addToFavourites(noteId)
            setIsFavourite(true)
        }
    }

    return (
        <button onClick={handleClick} title={isFavourite ? "Remove from favourites" : "Add to favourites"} className={Styles.favouriteBtn}>
            {isFavourite ? "★" : "☆"}
        </button>
    )
}