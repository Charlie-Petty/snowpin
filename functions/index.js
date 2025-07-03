// functions/index.js

const functions = require("firebase-functions"); // v1 SDK for your existing function
const admin = require("firebase-admin");
const {
  beforeDocumentCreate,
  beforeDocumentUpdate,
} = require("firebase-functions/v2/firestore"); // v2 SDK for new functions
const { HttpsError } = require("firebase-functions/v2/https");
const { containsProfanity } = require("./profanity");

admin.initializeApp();

// Helper function for profanity checks
const validateDocument = (data) => {
  if (!data) return; // Exit if there's no data

  const fieldsToCheck = [
    // Pin fields
    data.featureName,
    data.description,
    data.directions,
    // User profile fields
    data.username,
    data.name,
    data.bio,
    // Review fields
    data.comment,
    // Name Suggestion fields
    data.suggestedName,
  ];

  for (const field of fieldsToCheck) {
    if (containsProfanity(field)) {
      // If profanity is found, throw an error to block the write.
      throw new HttpsError(
        "invalid-argument",
        "Your submission contains inappropriate language and has been blocked.",
      );
    }
  }
};


// --- V2 PROFANITY CHECKING FUNCTIONS ---

// Function to check NEW pins and NEW user profiles
exports.checkNewDocuments = beforeDocumentCreate(
  "/{collection}/{docId}",
  (event) => {
    const { collection } = event.params;
    if (collection !== "pins" && collection !== "users") {
      return;
    }
    const data = event.data.data();
    validateDocument(data);
  },
);

// Function to check UPDATED pins and UPDATED user profiles
exports.checkUpdatedDocuments = beforeDocumentUpdate(
  "/{collection}/{docId}",
  (event) => {
    const { collection } = event.params;
    if (collection !== "pins" && collection !== "users") {
      return;
    }
    const data = event.data.after.data();
    validateDocument(data);
  },
);

// Function to check NEW subcollection documents (reviews, suggestions, etc.)
exports.checkNewSubcollectionDocs = beforeDocumentCreate(
  "/pins/{pinId}/{subcollection}/{docId}",
  (event) => {
    const data = event.data.data();
    validateDocument(data);
  },
);


// --- V1 ADMIN PROCESSING FUNCTION (Your Existing Code) ---

/**
 * Triggered when a user document is written to. If the `makeAdmin` field
 * is set to true, it grants the user admin privileges via custom claims
 * and then removes the field.
 */
exports.processAdminRequest = functions.firestore
  .document("users/{userId}")
  .onWrite(async (change, context) => {
    const afterData = change.after.data();
    const shouldMakeAdmin = change.after.exists && afterData.makeAdmin === true;

    if (!shouldMakeAdmin) {
      console.log("No admin request found. Exiting function.");
      return null;
    }

    const { userId } = context.params;

    try {
      await admin.auth().setCustomUserClaims(userId, { admin: true });
      console.log(`Successfully set admin claim for user: ${userId}`);

      await change.after.ref.update({
        makeAdmin: admin.firestore.FieldValue.delete(),
      });

      console.log(`Cleaned up 'makeAdmin' field for user: ${userId}`);
      return { result: `Admin claim set for ${userId}` };
    } catch (error) {
      console.error("Error setting custom claim:", error);
      return { error: "Failed to set custom claim." };
    }
  });