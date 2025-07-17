const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { containsProfanity } = require("./profanity");

admin.initializeApp();
const db = admin.firestore();

// --- HELPER FUNCTION for Profanity ---
const checkAndClean = async (docRef, data) => {
  if (!data) return null;
  const fieldsToCheck = [
    data.featureName, data.description, data.directions,
    data.username, data.name, data.bio,
    data.comment, data.suggestedName,
  ];

  for (const field of fieldsToCheck) {
    if (containsProfanity(field)) {
      console.log(`Profanity found in doc: ${docRef.path}. Deleting.`);
      return docRef.delete();
    }
  }
  return null;
};

// --- V2 CLOUD FUNCTIONS ---

/**
 * Triggered when a new review is created.
 * This is now the main engine for both reviews and vouches.
 */
exports.onReviewCreated = onDocumentCreated("pins/{pinId}/reviews/{reviewId}", async (event) => {
  const { pinId, reviewId } = event.params;
  const reviewData = event.data.data();
  const pinRef = db.collection("pins").doc(pinId);
  const userRef = db.collection("users").doc(reviewData.userId);

  return db.runTransaction(async (transaction) => {
    const pinDoc = await transaction.get(pinRef);
    const userDoc = await transaction.get(userRef);
    if (!pinDoc.exists || !userDoc.exists) {
      console.log("Pin or User document not found.");
      return;
    }

    const pinData = pinDoc.data();
    const userData = userDoc.data();
    const resortPath = `resortReputation.${pinData.resort}`;

    // --- Part 1: Update Pin's Weighted Difficulty Ratings ---
    const resortRep = userData.resortReputation?.[pinData.resort] || 0;
    const globalCred = userData.credibilityScore || 0;
    const reviewWeight = 1 + (resortRep / 1500) + (globalCred / 5000);

    const newWeightedSums = {
      weightedTechSum: (pinData.weightedTechSum || 0) + (reviewData.rating_technicality * reviewWeight),
      weightedExposureSum: (pinData.weightedExposureSum || 0) + (reviewData.rating_exposure * reviewWeight),
      weightedEntrySum: (pinData.weightedEntrySum || 0) + (reviewData.rating_entry * reviewWeight),
    };
    const newTotalWeights = {
      totalTechWeight: (pinData.totalTechWeight || 0) + reviewWeight,
      totalExposureWeight: (pinData.totalExposureWeight || 0) + reviewWeight,
      totalEntryWeight: (pinData.totalEntryWeight || 0) + reviewWeight,
    };
    const newAverages = {
      avg_technicality: newWeightedSums.weightedTechSum / newTotalWeights.totalTechWeight,
      avg_exposure: newWeightedSums.weightedExposureSum / newTotalWeights.totalExposureWeight,
      avg_entry: newWeightedSums.weightedEntrySum / newTotalWeights.totalEntryWeight,
    };
    const overallDifficulty = (newAverages.avg_technicality + newAverages.avg_exposure + newAverages.avg_entry) / 3;

    transaction.update(pinRef, {
      ...newWeightedSums, ...newTotalWeights, ...newAverages,
      difficulty: overallDifficulty,
      ratingCount: admin.firestore.FieldValue.increment(1),
    });

    // --- Part 2: Grant Small Reputation Bonus for the Review ---
    transaction.update(userRef, {
      [resortPath]: admin.firestore.FieldValue.increment(2),
    });

    // --- Part 3: If the review includes a vouch, process it ---
    if (reviewData.isVouching === true) {
      const creatorId = pinData.createdBy;
      if (creatorId === reviewData.userId) return; // Can't vouch for own pin

      const creatorRef = db.collection("users").doc(creatorId);
      const vouchGivenRef = db.collection(`users/${reviewData.userId}/vouchesGiven`).doc(creatorId);
      
      const [creatorDoc, vouchGivenDoc] = await Promise.all([
        transaction.get(creatorRef),
        transaction.get(vouchGivenRef)
      ]);

      if (!creatorDoc.exists) return;

      const vouchCount = vouchGivenDoc.exists ? (vouchGivenDoc.data().count || 0) : 0;
      let baseVouchPoints = 10;
      if (vouchCount === 1) baseVouchPoints = 8;
      else if (vouchCount === 2) baseVouchPoints = 5;
      else if (vouchCount >= 3) baseVouchPoints = 2;

      const voucherRepMultiplier = resortRep >= 1500 ? 2.5 : 1.0;
      const pinDifficulty = pinData.difficulty || 3;
      const difficultyMultiplier = 0.8 + ((pinDifficulty - 1) / 4) * 1.2;
      const reputationGained = baseVouchPoints * voucherRepMultiplier * difficultyMultiplier;

      // Update pin creator's reputation and the vouch-given tracker
      transaction.update(creatorRef, { [resortPath]: admin.firestore.FieldValue.increment(reputationGained) });
      transaction.set(vouchGivenRef, { count: admin.firestore.FieldValue.increment(1) }, { merge: true });
      
      // Also increment the public vouch count on the pin
      transaction.update(pinRef, { vouchCount: admin.firestore.FieldValue.increment(1) });
    }
  });
});


/**
 * Triggered when a user document is written to.
 * Grants admin privileges if 'makeAdmin' is true.
 */
exports.handleAdminRequest = onDocumentWritten("users/{userId}", async (event) => {
  if (!event.data?.after?.exists) return null;
  const afterData = event.data.after.data();
  if (afterData.makeAdmin !== true) return null;

  const { userId } = event.params;
  try {
    await admin.auth().setCustomUserClaims(userId, { admin: true });
    return event.data.after.ref.update({ makeAdmin: admin.firestore.FieldValue.delete() });
  } catch (error) {
    console.error("Error setting custom claim for user:", userId, error);
    return null;
  }
});

/**
 * Checks for profanity in new documents (pins, users, reviews, etc.).
 */
exports.checkAllNewDocuments = onDocumentCreated("{collectionId}/{docId}", (event) => {
  const pathParts = event.data.ref.path.split('/');
  if (pathParts.length === 2 && (pathParts[0] === 'pins' || pathParts[0] === 'users')) {
     return checkAndClean(event.data.ref, event.data.data());
  }
  if (pathParts.length === 4 && pathParts[0] === 'pins') {
     return checkAndClean(event.data.ref, event.data.data());
  }
  return null;
});

/**
 * Checks for profanity in updated documents (pins, users).
 */
exports.checkAllUpdatedDocuments = onDocumentWritten("{collectionId}/{docId}", (event) => {
  if (!event.data?.after?.exists) return null;
  
  const pathParts = event.data.after.ref.path.split('/');
  if (pathParts.length === 2 && (pathParts[0] === 'pins' || pathParts[0] === 'users')) {
    return checkAndClean(event.data.after.ref, event.data.after.data());
  }
  return null;
});