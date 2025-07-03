// src/utils/interactions.js
import { doc, getDoc, setDoc, deleteDoc, runTransaction, collection, getDocs, query, where, collectionGroup, increment } from "firebase/firestore";
import { db } from "../firebase";
import toast from "react-hot-toast";

// Fetches the complete interaction state for a user on a specific pin.
export const fetchUserInteractionState = async (pinId, userId) => {
  if (!userId) return { isFavorited: false, userVote: null, isFlagged: false };
  
  const favRef = doc(db, "pins", pinId, "favorites", userId);
  const voteRef = doc(db, "pins", pinId, "votes", userId);
  const flagRef = doc(db, "pins", pinId, "flags", userId);

  try {
    const [favSnap, voteSnap, flagSnap] = await Promise.all([
      getDoc(favRef),
      getDoc(voteRef),
      getDoc(flagRef)
    ]);

    return {
      isFavorited: favSnap.exists(),
      userVote: voteSnap.exists() ? voteSnap.data().vote : null,
      isFlagged: flagSnap.exists(),
    };
  } catch (error) {
    console.error("Error fetching user interaction state:", error);
    toast.error("Could not load your interaction status.");
    return { isFavorited: false, userVote: null, isFlagged: false };
  }
};

export const toggleFavorite = async (pinId, userId) => {
  if (!userId) return toast.error("You must be logged in to favorite.");
  const favRef = doc(db, "pins", pinId, "favorites", userId);
  
  try {
    const docSnap = await getDoc(favRef);
    if (docSnap.exists()) {
      await deleteDoc(favRef);
      toast("Removed from favorites.", { icon: "💔" });
      return false;
    } else {
      // FINAL FIX: Add the userId to the document. This is CRITICAL for the new security rule to work.
      await setDoc(favRef, { createdAt: new Date(), userId: userId });
      toast.success("Added to favorites!");
      return true;
    }
  } catch (error) {
    console.error("Error toggling favorite:", error);
    toast.error("Could not update favorite status.");
    return null;
  }
};

export const handleVote = async (pinId, userId, newVote) => {
    if (!userId) return toast.error("You must be logged in to vote.");
    
    const voteRef = doc(db, "pins", pinId, "votes", userId);
    const pinRef = doc(db, "pins", pinId);

    try {
        await runTransaction(db, async (transaction) => {
            const voteDoc = await transaction.get(voteRef);
            const pinDoc = await transaction.get(pinRef);

            if (!pinDoc.exists()) throw new Error("Pin not found!");

            const oldVote = voteDoc.exists() ? voteDoc.data().vote : null;
            let likeIncrement = 0;
            let dislikeIncrement = 0;

            if (oldVote === newVote) {
                if (newVote === 'like') likeIncrement = -1;
                else dislikeIncrement = -1;
                transaction.delete(voteRef);
            } else {
                if (oldVote === 'like') likeIncrement = -1;
                if (oldVote === 'dislike') dislikeIncrement = -1;
                
                if (newVote === 'like') likeIncrement += 1;
                else dislikeIncrement += 1;
                transaction.set(voteRef, { vote: newVote, userId: userId });
            }
            
            transaction.update(pinRef, {
                likeCount: increment(likeIncrement),
                dislikeCount: increment(dislikeIncrement),
            });
        });

        const voteDoc = await getDoc(voteRef);
        return voteDoc.exists() ? voteDoc.data().vote : null;

    } catch (error) {
        console.error("Vote transaction failed:", error);
        toast.error("Could not process your vote.");
        return null;
    }
};

export const toggleFlag = async (pinId, userId) => {
    if (!userId) return toast.error("You must be logged in to flag content.");
    const flagRef = doc(db, "pins", pinId, "flags", userId);
    const pinRef = doc(db, "pins", pinId);
    
    try {
        await runTransaction(db, async (transaction) => {
            const flagSnap = await transaction.get(flagRef);
            if (flagSnap.exists()) {
                transaction.delete(flagRef);
                transaction.update(pinRef, { flagCount: increment(-1) });
            } else {
                transaction.set(flagRef, { reason: "flagged", createdAt: new Date(), userId: userId });
                transaction.update(pinRef, { flagCount: increment(1) });
            }
        });

        const flagSnap = await getDoc(flagRef);
        if (flagSnap.exists()) {
             toast.success("Pin flagged for review.");
             return true;
        } else {
            toast("Flag removed.", { icon: "✅" });
            return false;
        }
    } catch (error) {
        console.error("Error toggling flag:", error);
        toast.error("Could not update flag status.");
        return null;
    }
};

export const fetchFavoritePinIds = async (userId) => {
    if (!userId) return [];
    try {
        const favoritesQuery = query(collectionGroup(db, 'favorites'), where('userId', '==', userId));
        const snapshot = await getDocs(favoritesQuery);
        return snapshot.docs.map(doc => doc.ref.path.split('/')[1]);
    } catch (error) {
        console.error("Error fetching favorite pin IDs:", error);
        toast.error("Could not load your favorite pins.");
        return [];
    }
};
