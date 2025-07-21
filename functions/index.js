// functions/index.js

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");

initializeApp();
const db = getFirestore();

exports.onReviewCreated = onDocumentCreated("pins/{pinId}/reviews/{reviewId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.log("No data associated with the event");
    return;
  }
  const reviewData = snapshot.data();
  const pinId = event.params.pinId;
  const pinRef = db.doc(`pins/${pinId}`);

  logger.log(`Processing new review ${event.params.reviewId} for pin ${pinId}`);

  try {
    await db.runTransaction(async (transaction) => {
      const pinDoc = await transaction.get(pinRef);
      if (!pinDoc.exists) {
        throw new Error("Pin document does not exist!");
      }
      const pinData = pinDoc.data();
      const reviewerId = reviewData.userId;
      const creatorId = pinData.createdBy;

      const reviewerDoc = await transaction.get(db.doc(`users/${reviewerId}`));
      if (!reviewerDoc.exists) {
        throw new Error(`Reviewer user document ${reviewerId} not found!`);
      }
      const reviewerData = reviewerDoc.data();
      
      // --- 1. Calculate Review Weight ---
      const resortRep = reviewerData.resortReputation?.[pinData.resort] || 0;
      const globalCred = reviewerData.credibilityScore || 0;
      const reviewWeight = 1 + (resortRep / 1500) + (globalCred / 5000);
      logger.log(`Reviewer Weight for ${reviewerId} is ${reviewWeight}`);

      // --- 2. Update Pin's Weighted Averages ---
      const newWeightedTechSum = (pinData.weightedTechSum || 0) + (reviewData.rating_technicality * reviewWeight);
      const newTotalTechWeight = (pinData.totalTechWeight || 0) + reviewWeight;
      const newWeightedExpoSum = (pinData.weightedExpoSum || 0) + (reviewData.rating_exposure * reviewWeight);
      const newTotalExpoWeight = (pinData.totalExpoWeight || 0) + reviewWeight;
      const newWeightedEntrySum = (pinData.weightedEntrySum || 0) + (reviewData.rating_entry * reviewWeight);
      const newTotalEntryWeight = (pinData.totalEntryWeight || 0) + reviewWeight;

      const newAvgTech = newWeightedTechSum / newTotalTechWeight;
      const newAvgExpo = newWeightedExpoSum / newTotalExpoWeight;
      const newAvgEntry = newWeightedEntrySum / newTotalEntryWeight;

      // --- 3. Update Reviewer's Reputation ---
      const reviewerUpdateRef = db.doc(`users/${reviewerId}`);
      transaction.update(reviewerUpdateRef, {
        "credibilityScore": FieldValue.increment(2),
        "pinsReviewedCount": FieldValue.increment(1)
      });
      
      const pinUpdateData = {
          weightedTechSum: newWeightedTechSum,
          totalTechWeight: newTotalTechWeight,
          avg_technicality: newAvgTech,
          weightedExpoSum: newWeightedExpoSum,
          totalExpoWeight: newTotalExpoWeight,
          avg_exposure: newAvgExpo,
          weightedEntrySum: newWeightedEntrySum,
          totalEntryWeight: newTotalEntryWeight,
          avg_entry: newAvgEntry,
          difficulty: (newAvgTech + newAvgExpo + newAvgEntry) / 3,
          ratingCount: FieldValue.increment(1)
      };

      // --- 4. Handle Vouching Logic ---
      if (reviewData.isVouching) {
        logger.log(`Review is also a vouch. Processing vouch for creator ${creatorId}.`);
        const creatorUpdateRef = db.doc(`users/${creatorId}`);
        // This is a simplified rep gain. You can expand this with your full formula.
        const reputationGain = 10 * reviewWeight; 
        
        transaction.update(creatorUpdateRef, {
            [`resortReputation.${pinData.resort}`]: FieldValue.increment(reputationGain)
        });
        
        pinUpdateData.vouchCount = FieldValue.increment(1);
      }
      
      transaction.update(pinRef, pinUpdateData);
    });

    logger.log("Transaction successfully committed!");

  } catch (error) {
    logger.error(`Error in onReviewCreated for pin ${pinId}:`, error);
  }
});