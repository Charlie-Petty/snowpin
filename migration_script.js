// migration_script.js (ES Module Version)
import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// This line tells the script to look for your key file in the same directory.
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateData() {
  console.log('Starting data migration...');

  // 1. Migrate Users Collection
  const usersRef = db.collection('users');
  const usersSnapshot = await usersRef.get();
  const userBatch = db.batch();

  usersSnapshot.forEach(doc => {
    const userData = doc.data();
    const updateData = {};
    if (userData.credibilityScore === undefined) {
      updateData.credibilityScore = 0;
    }
    if (userData.resortReputation === undefined) {
      updateData.resortReputation = {};
    }
    if (Object.keys(updateData).length > 0) {
      userBatch.update(doc.ref, updateData);
    }
  });
  await userBatch.commit();
  console.log(`Migrated ${usersSnapshot.size} user documents.`);

  // 2. Migrate Pins Collection
  const pinsRef = db.collection('pins');
  const pinsSnapshot = await pinsRef.get();
  const pinBatch = db.batch();

  pinsSnapshot.forEach(doc => {
    const pinData = doc.data();
    const updateData = {};
    if (pinData.vouchCount === undefined) updateData.vouchCount = 0;
    if (pinData.avg_technicality === undefined) updateData.avg_technicality = pinData.difficulty || 0;
    if (pinData.avg_exposure === undefined) updateData.avg_exposure = pinData.difficulty || 0;
    if (pinData.avg_entry === undefined) updateData.avg_entry = pinData.difficulty || 0;
    if (pinData.weightedTechSum === undefined) updateData.weightedTechSum = 0;
    if (pinData.totalTechWeight === undefined) updateData.totalTechWeight = 0;
    if (pinData.weightedExposureSum === undefined) updateData.weightedExposureSum = 0;
    if (pinData.totalExposureWeight === undefined) updateData.totalExposureWeight = 0;
    if (pinData.weightedEntrySum === undefined) updateData.weightedEntrySum = 0;
    if (pinData.totalEntryWeight === undefined) updateData.totalEntryWeight = 0;

    if (Object.keys(updateData).length > 0) {
      pinBatch.update(doc.ref, updateData);
    }
  });
  await pinBatch.commit();
  console.log(`Migrated ${pinsSnapshot.size} pin documents.`);

  console.log('Data migration complete!');
}

migrateData().catch(console.error);