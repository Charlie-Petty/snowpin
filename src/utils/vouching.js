import { doc, getDoc, setDoc, deleteDoc, runTransaction, increment } from "firebase/firestore";
import { db } from "../firebase";
import toast from "react-hot-toast";

/**
 * Toggles a "vouch" for a specific pin by a user.
 * A vouch signifies that the user confirms the pin's quality and accuracy.
 * This function handles adding/removing the vouch and updating the total vouch count on the pin.
 * @param {string} pinId - The ID of the pin to vouch for.
 * @param {string} pinCreatorId - The ID of the user who created the pin.
 * @param {string} userId - The ID of the user performing the vouch.
 * @returns {Promise<boolean|null>} - Returns true if now vouched, false if unvouched, null on error.
 */
export const toggleVouch = async (pinId, pinCreatorId, userId) => {
  // Prevent users from vouching for their own pins.
  if (pinCreatorId === userId) {
    toast.error("You can't vouch for your own pin!");
    return null;
  }
  if (!userId) {
    toast.error("You must be logged in to vouch for a pin.");
    return null;
  }

  const vouchRef = doc(db, "pins", pinId, "vouches", userId);
  const pinRef = doc(db, "pins", pinId);

  try {
    const vouchDoc = await getDoc(vouchRef);

    if (vouchDoc.exists()) {
      // The user has already vouched, so we're removing the vouch.
      await runTransaction(db, async (transaction) => {
        transaction.delete(vouchRef);
        transaction.update(pinRef, { vouchCount: increment(-1) });
      });
      toast("Vouch removed.", { icon: "👎" });
      return false;
    } else {
      // The user is adding a new vouch.
      await runTransaction(db, async (transaction) => {
        transaction.set(vouchRef, {
          userId: userId,
          createdAt: new Date(),
        });
        transaction.update(pinRef, { vouchCount: increment(1) });
      });
      toast.success("Vouched! You're confirming this is a quality pin.");
      return true;
    }
  } catch (error) {
    console.error("Error toggling vouch:", error);
    toast.error("Could not update vouch status.");
    return null;
  }
};
