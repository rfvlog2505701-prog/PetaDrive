// These Firebase values are CLIENT identifiers, not secrets — Firebase's own docs say
// they are safe to ship in browser code. Real secrets (DropLink key, reCAPTCHA secret,
// Firebase Admin credentials) live only in Vercel Environment Variables and are used
// inside /api/*.js, never sent to the browser. See README.md.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';

export const firebaseConfig = {
  apiKey: "AIzaSyDSuiUb5FfhO8db9ISWJeQi3JK6F3_mxTg",
  authDomain: "petadrive-97ae1.firebaseapp.com",
  databaseURL: "https://petadrive-97ae1-default-rtdb.firebaseio.com",
  projectId: "petadrive-97ae1",
  storageBucket: "petadrive-97ae1.firebasestorage.app",
  messagingSenderId: "288333125133",
  appId: "1:288333125133:web:5a087448149006fcc4e744",
  measurementId: "G-CRG0VYZLJW"
};

export const ADMIN_EMAILS = ['rfvlog2505701@gmail.com']; // UI gating only — real authority is in database.rules.json
export const RECAPTCHA_SITE_KEY = '6LeXnBYuAAAAABpvhd0g9DP066zpKdoRKURIw_Ay'; // public key, safe to ship
export const FREE_QUOTA = 10 * 1024 ** 3;
// There is no fixed per-file size cap any more — large files are split into
// chunks on the client and uploaded one chunk at a time (see files.js), so the
// only real ceiling is the user's remaining storage quota. CHUNK_SIZE must stay
// safely under Vercel's ~4.5MB serverless request-body limit (api/upload.js
// enforces the server-side half of this at MAX_FILE = 4MB).
export const CHUNK_SIZE = 3.5 * 1024 ** 2;
export const GB = 1024 ** 3;
export const APP_LOGO_URL = '/assets/logo.jpg';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
