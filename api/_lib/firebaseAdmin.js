// Initializes the Firebase Admin SDK once per serverless container.
// Reads the service account JSON and database URL from Vercel Environment
// Variables — never from client code. See README.md for how to create these.
const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT env var is missing or is not valid JSON.');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  return admin;
}

module.exports = { getAdmin };
