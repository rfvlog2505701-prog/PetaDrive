# PetaDrive — GitHub + Vercel ডেপ্লয়মেন্ট গাইড

## এই প্রজেক্টে কী বদলেছে
- পুরনো সিঙ্গেল-ফাইল `index.html`-এ DropLink আর Webora-র secret API key দুটো ব্রাউজারের কোডেই খোলা ছিল — যে কেউ view-source করে key দুটো বের করে নিজে থেকে আপলোড/পাবলিশ করতে পারত। এখন দুটো key-ই **সার্ভার সাইডে** (Vercel Environment Variable) থাকে, ব্রাউজার কোনোদিন এগুলো দেখে না।
- আপলোড এখন **one-time token** দিয়ে সুরক্ষিত: আগে `/api/token`-এ গিয়ে একটা টোকেন নিতে হয়, তারপর সেই টোকেন দিয়ে `/api/upload`-এ ফাইল পাঠাতে হয়। একটা টোকেন একবারের বেশি ব্যবহার করা যায় না (Firebase transaction দিয়ে atomically চেক হয়), আর টোকেন নেওয়ার আগে reCAPTCHA v3 পাস করতে হয় — তাই স্ক্রিপ্ট দিয়ে সরাসরি token/upload API হিট করা যাবে না।
- Webora বাদ দিয়ে শেয়ার/ডাউনলোড পেজ এখন **নিজের ডোমেইনেই** তৈরি হয় — `/d/<id>` লিংকে ওপেন হলে ইমেজ/ভিডিও/অডিও সরাসরি প্রিভিউ হয়, টেক্সট-জাতীয় ফাইল (`.txt .md .json .js .css .html .py .csv` ইত্যাদি) ভিউ করা যায়, আর Download বাটনে ক্লিক করলে সরাসরি ফাইল ডাউনলোড হয়।
- প্রতিটা অ্যাক্টিভিটি আলাদা HTML পেজ/ফোল্ডারে: `public/auth/` (login, register), `public/app/` (dashboard, files, share, settings), প্রতিটার নিজস্ব JS `public/assets/js/`-এ।
- লোগো favicon হিসেবে বসানো আছে (`public/assets/logo.jpg`), সব পেজের `<head>`-এ `<link rel="icon">` আছে।

## ফোল্ডার স্ট্রাকচার
```
public/                 ← স্ট্যাটিক ফ্রন্টএন্ড (Vercel এটাই সার্ভ করে)
  index.html             রুট — লগইন থাকলে dashboard, না থাকলে login-এ পাঠায়
  auth/login.html        লগইন + resend verification + forgot password
  auth/register.html     রেজিস্ট্রেশন
  app/dashboard.html     হোম — স্টোরেজ ব্যবহার, সাম্প্রতিক ফাইল
  app/files.html         মূল ফাইল ম্যানেজার — আপলোড, ফোল্ডার, প্রিভিউ, শেয়ার লিংক
  app/share.html         সব শেয়ার লিংকের তালিকা — কপি/ওপেন/রিভোক
  app/settings.html      প্রোফাইল, থিম, পাসওয়ার্ড, অ্যাডমিন প্যানেল
  d.html                 পাবলিক ডাউনলোড/শেয়ার পেজ (কারো লগইন লাগে না)
  assets/css/            শেয়ার্ড CSS
  assets/js/             শেয়ার্ড JS (firebase-config, ui, shell, auth, files, ...)
  assets/logo.jpg        আপনার দেওয়া লোগো (favicon + brand mark হিসেবে ব্যবহৃত)
api/                     সার্ভারলেস ফাংশন (Vercel নিজে থেকেই এগুলো /api/... হিসেবে চালায়)
  token.js               one-time upload token ইস্যু করে
  upload.js               token যাচাই করে DropLink-এ আপলোড করে (secret key শুধু এখানে)
  publish.js              শেয়ার/ডাউনলোড পেজ তৈরি করে (/d/<id>)
  unpublish.js            শেয়ার লিংক revoke করে
  _lib/                   ভেতরের হেলপার (Firebase Admin init, token/recaptcha verify)
database.rules.json      Firebase Realtime Database rules (নিচে দেখুন)
vercel.json              /d/:id রুট ও ফাংশন কনফিগ
package.json             api/ ফোল্ডারের জন্য npm ডিপেন্ডেন্সি (busboy, firebase-admin)
.env.example             কোন কোন env var লাগবে তার তালিকা (শুধু রেফারেন্স, ভ্যালু নাই)
```

## ধাপ ১ — GitHub-এ আপলোড
এই জিপের সবকিছু ঠিক যেমন আছে তেমনই আপনার GitHub রিপোতে push করুন — কিছু বদলানোর দরকার নেই। ফোল্ডার স্ট্রাকচার যেন অবিকৃত থাকে (`api/`, `public/` ঠিক রুটে থাকা জরুরি, কারণ Vercel এই দুটো ফোল্ডার নিজে থেকেই চেনে)।

## ধাপ ২ — Vercel-এ ইমপোর্ট
Vercel-এ "Add New Project" → আপনার GitHub রিপো সিলেক্ট করুন। Framework Preset "Other" রাখুন (কোনো বিল্ড স্টেপ লাগবে না, `public/` সরাসরি সার্ভ হবে)।

## ধাপ ৩ — Environment Variables (এইটুকুই গুরুত্বপূর্ণ অংশ)
Vercel-এ Project → Settings → Environment Variables-এ গিয়ে নিচের **৪টা সিক্রেট ভ্যালু** যোগ করুন (`.env.example`-এ ফরম্যাট দেখতে পাবেন):

| Variable | কোথা থেকে পাবেন | Secret? |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project settings → Service accounts → "Generate new private key" — পুরো JSON ফাইলটার কনটেন্ট এক লাইনে পেস্ট করুন | ✅ হ্যাঁ, কখনো কোডে দেবেন না |
| `FIREBASE_DATABASE_URL` | `https://petadrive-97ae1-default-rtdb.firebaseio.com` (আপনার আগের কনফিগেই ছিল) | না, কিন্তু env var-এই রাখা ভালো |
| `DROP_API_KEY` | আপনার DropLink অ্যাকাউন্ট থেকে পাওয়া key (আগে যেটা কোডে হার্ডকোড করা ছিল) | ✅ হ্যাঁ |
| `RECAPTCHA_SECRET_KEY` | [google.com/recaptcha/admin](https://www.google.com/recaptcha/admin) থেকে একটা v3 সাইট রেজিস্টার করলে secret key পাবেন | ✅ হ্যাঁ |
| `SITE_URL` (ঐচ্ছিক) | আপনার Vercel ডোমেইন, যেমন `https://petadrive.vercel.app` | না |

**এগুলো কোডে/ব্রাউজারে কখনো যায় না** — শুধু `api/*.js` ফাইলগুলো `process.env.XXX` দিয়ে এগুলো পড়ে, Vercel-এর সার্ভারেই থেকে যায়।

### এগুলো env var না, কোডেই সাধারণভাবে থাকবে (public, সমস্যা নেই)
- Firebase client config (`apiKey`, `authDomain`, ইত্যাদি) — `public/assets/js/firebase-config.js`-এ আগের মতোই আছে। Firebase নিজেই বলে এগুলো সিক্রেট না, ব্রাউজারে থাকা স্বাভাবিক (আসল সুরক্ষা আসে `database.rules.json` থেকে)।
- reCAPTCHA **site key** (secret না, public key) — `public/assets/js/firebase-config.js`-এ `RECAPTCHA_SITE_KEY` আর `public/app/files.html`-এর script ট্যাগে বসান। reCAPTCHA অ্যাডমিন কনসোল থেকে v3 সাইট রেজিস্টার করলে একই সাথে site key আর secret key দুটোই পাবেন — site key দুই জায়গায় বসাতে হবে (উপরে বলা), secret key যাবে env var-এ।

## ধাপ ৪ — Firebase Database Rules পাবলিশ করুন
Firebase Console → Realtime Database → Rules-এ গিয়ে এই রিপোর `database.rules.json`-এর কনটেন্ট পেস্ট করে Publish করুন। এটা ছাড়া নতুন সিকিউরিটি মডেল কাজ করবে না (পুরনো rules থাকলে হয়তো অনেক কিছু খোলা/বন্ধ ভুল থাকবে)।

> অ্যাডমিন ইমেইল rules ফাইলে হার্ডকোড করা আছে (`rfvlog2505701@gmail.com`, আপনার আগের `ADMIN_EMAILS` থেকে নেওয়া)। অ্যাডমিন বদলাতে চাইলে rules ফাইলে সব জায়গায় ইমেইলটা বদলে আবার Publish করুন।

## বড় ফাইল নিয়ে একটা গুরুত্বপূর্ণ সীমাবদ্ধতা
Vercel-এর Node.js Serverless Function-এ ইনকামিং রিকোয়েস্ট বডি সর্বোচ্চ ~4.5MB রাখতে দেয় (এটা Vercel-এর নিজস্ব প্ল্যাটফর্ম লিমিট, কোড দিয়ে বাড়ানো যায় না)। যেহেতু এখন প্রতিটা আপলোড `/api/upload` দিয়ে যায় (DropLink key লুকানোর জন্যই এটা দরকার), তাই `api/upload.js`-এ `MAX_FILE` আপাতত **4MB**-এ সেট করা আছে। আগের মতো ২০০MB ফাইল এই সিকিউর পথ দিয়ে এখনই যাবে না। বড় ফাইল সাপোর্ট দরকার হলে ভবিষ্যতে এই বিকল্পগুলো বিবেচনা করতে পারেন:
- আপলোড প্রক্সিটা Vercel Serverless-এর বদলে একটা ছোট Node/Express সার্ভারে (Render, Fly.io) হোস্ট করা — সেখানে এই বডি-সাইজ লিমিট নেই।
- অথবা Vercel Edge Function-এ স্ট্রিমিং আপলোড হিসেবে রিরাইট করা (জটিল, কারণ Edge রানটাইমে `firebase-admin` সরাসরি চলে না)।

## আর্কিটেকচার সংক্ষেপে
```
ব্রাউজার → /api/token  (Firebase ID token + reCAPTCHA যাচাই) → একবার-ব্যবহারযোগ্য token
ব্রাউজার → /api/upload (token + Firebase ID token যাচাই, token একবারই claim হয়) → DropLink (secret key শুধু এখানে) → directUrl ফেরত
ব্রাউজার → নিজেই Firebase-এ userFiles/{uid}/{fileId} লিখে রাখে (মেটাডেটা)
ব্রাউজার → /api/publish (owner-check) → publishedFiles/{id} তৈরি → /d/{id} লিংক
যে কেউ → /d/{id} খুললে Firebase থেকে পাবলিক-রিড publishedFiles/{id} পড়ে প্রিভিউ+ডাউনলোড দেখায়
```

## ডিজাইন নিয়ে একটা স্বচ্ছতা
মূল থিম, রঙ, ফন্ট এবং লোগো অবিকৃত রাখা হয়েছে, কিন্তু মাল্টি-পেজ স্ট্রাকচারে সাজানোর সময় আগের SPA-র প্রতিটা মাইক্রো-অ্যানিমেশন হুবহু কপি করা হয়নি — ফোকাস ছিল সিকিউরিটি আর আর্কিটেকচারে। পরে চাইলে এনিমেশন/ডিজাইন পালিশ আলাদাভাবে যোগ করা যাবে।
