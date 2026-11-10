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

## বড় ফাইল এখন কীভাবে কাজ করে (চাঙ্কড আপলোড)
Vercel-এর Node.js Serverless Function-এ ইনকামিং রিকোয়েস্ট বডি সর্বোচ্চ ~4.5MB রাখতে দেয় — এটা Vercel-এর নিজস্ব প্ল্যাটফর্ম লিমিট, কোনো কোড দিয়ে এটা বাড়ানো যায় না। তাই সরাসরি "200MB ইউজ করো" সেট করা সম্ভব না — তার বদলে এখন ব্রাউজার (`public/assets/js/files.js`) নিজেই প্রতিটা ফাইলকে ছোট ছোট **chunk**-এ (ডিফল্ট ৩.৫MB, `CHUNK_SIZE` — `firebase-config.js`-এ) ভেঙে একটার পর একটা `/api/upload`-এ পাঠায়, প্রতি chunk-এর জন্য আলাদা এক-বারের token নিয়ে। প্রতিটা chunk-এর যে provider URL পাওয়া যায় সেগুলো ক্রমানুসারে `parts` অ্যারে হিসেবে ফাইলের রেকর্ডে (`userFiles/{uid}/{fileId}/parts`) সেভ হয়।

ফলে **কোনো fixed ফাইল-সাইজ লিমিট নেই** — যত বড় ফাইলই হোক, শুধু chunk ধরে ধরে আপলোড হতে থাকবে (ব্যবহারকারীর স্টোরেজ কোটাই এখন একমাত্র আসল সীমা)। ডাউনলোডের সময় নতুন `GET /f/:id` এন্ডপয়েন্ট (`api/f.js`) সবগুলো `parts`-কে ক্রমানুসারে fetch করে একটানা একটাই স্ট্রিম হিসেবে ব্যবহারকারীর কাছে পাঠায় — অর্থাৎ ৩০০MB-র একটা ভিডিও যতগুলো chunk-এই আপলোড হোক না কেন, ডাউনলোড/প্রিভিউ-এর সময় সেটা একটাই মার্জড ফাইল হিসেবে দেখা যায়। পুরো ব্যাপারটার বিস্তারিত API.md-তে লেখা আছে।

সীমাবদ্ধতা যা এখনও আছে: খুব বড় ফাইলে অনেকগুলো chunk মানে অনেকগুলো আলাদা request (প্রতিটায় reCAPTCHA + token + upload) — তাই একটা ৫০০MB ফাইল আপলোড হতে কয়েক মিনিট লাগতে পারে এবং storage provider-এর daily limit-এ পড়ে যাওয়ার সম্ভাবনা থাকে। আর `/f/:id` এখনো HTTP Range request সাপোর্ট করে না, তাই বড় ভিডিওতে সিক/স্ক্রাব করাটা মসৃণ নাও হতে পারে — ভবিষ্যতে দরকার হলে এটা যোগ করা যায়।

## দুটো পাবলিক লিংক: Download page vs Direct link
`/api/publish` এখন একই id দিয়ে দুই ধরনের পাবলিক লিংক বোঝায়:
- **Download page link** — `/d/<id>` — আগের মতোই, প্রিভিউ + Download বাটনসহ একটা PetaDrive পেজ।
- **Direct link** — `/f/<id>` — raw ফাইল বাইট সরাসরি স্ট্রিম করে (নতুন `api/f.js` দিয়ে)। এটা `<img>`/`<video>` এম্বেড বা hotlink করার জন্য।

দুটো লিংকের **কোনোটাই** storage provider-এর (DropLink) আসল URL কখনো প্রকাশ করে না — `api/f.js` সার্ভার-সাইডে provider থেকে fetch করে, তারপর সেই bytes ব্যবহারকারীর কাছে pipe করে দেয়; browser-এর network tab-এও provider-এর ডোমেইন দেখা যায় না, শুধু আপনার নিজের ডোমেইন দেখা যাবে।

## "Link not found" সমস্যা হলে যা চেক করবেন
এই রিপোতে দুটো ফিক্স দেওয়া আছে যেগুলো বেশিরভাগ ক্ষেত্রে এই সমস্যা সমাধান করবে:
1. শেয়ার লিংক তৈরির সময় এখন সবসময় সার্ভারকে (`/api/publish`) জিজ্ঞেস করা হয়, local cache-এ থাকা পুরোনো `publishedUrl` সরাসরি বিশ্বাস করা হয় না — তাই publishedFiles রেকর্ড অন্য কোনোভাবে মুছে গেলেও (যেমন অন্য ডিভাইস থেকে revoke) এটা নিজে থেকেই নতুন কার্যকর লিংক বানিয়ে দেবে, পুরোনো ভাঙা লিংক দেখাবে না।
2. `/d/<id>` ও `/f/<id>` দুটোই এখন id-টা trim/decode করে নেয়, যেন লিংকের শেষে বাড়তি স্পেস বা encoding-এর কারণে মিসম্যাচ না হয়।

তবুও যদি **প্রতিবারই** "Link not found" দেখায়, সবচেয়ে সম্ভাব্য কারণ কোডে না, বরং deployment কনফিগে:
- Vercel-এ `FIREBASE_DATABASE_URL` env var আর `public/assets/js/firebase-config.js`-এর `databaseURL` একই Firebase project/database-কে point করছে কিনা মিলিয়ে দেখুন — আলাদা হলে Admin SDK এক জায়গায় লিখবে, browser আরেক জায়গায় পড়বে, ফলে সবসময়ই "not found" আসবে।
- Firebase Console → Realtime Database → Rules-এ এই রিপোর হালনাগাদ `database.rules.json` আসলেই Publish করা হয়েছে কিনা (পুরোনো rules-এ `publishedFiles.".read"` হয়তো `true` না-ও থাকতে পারে)।
- `/d/<id>` বা `/f/<id>` লিংকের id অংশে কোনো বাড়তি ক্যারেক্টার (যেমন মেসেঞ্জার/ফেসবুকের লিংক-ট্র্যাকিং প্যারামিটার) জুড়ে গেছে কিনা।

## আর্কিটেকচার সংক্ষেপে
```
ব্রাউজার → /api/token (প্রতি chunk-এর জন্য, Firebase ID token + reCAPTCHA যাচাই) → একবার-ব্যবহারযোগ্য token
ব্রাউজার → /api/upload (প্রতি chunk আলাদা কল, token যাচাই, token একবারই claim হয়) → DropLink (secret key শুধু এখানে) → chunk-এর directUrl ফেরত
ব্রাউজার → সবগুলো chunk-এর URL জোড়া লাগিয়ে নিজেই Firebase-এ userFiles/{uid}/{fileId} লিখে রাখে (parts অ্যারেসহ মেটাডেটা)
ব্রাউজার → /api/publish (owner-check) → publishedFiles/{id} তৈরি (parts-সহ) → /d/{id} ও /f/{id} — দুটো লিংকই ফেরত
যে কেউ → /d/{id} খুললে Firebase থেকে পাবলিক-রিড publishedFiles/{id} পড়ে প্রিভিউ+ডাউনলোড পেজ দেখায় (preview/download উভয়ই /f/{id} ব্যবহার করে)
যে কেউ → /f/{id} খুললে api/f.js সবগুলো part সার্ভার-সাইডে fetch করে একটানা স্ট্রিম হিসেবে পাঠায় — provider-এর URL কখনো প্রকাশ পায় না
```

এন্ডপয়েন্ট-বাই-এন্ডপয়েন্ট পুরো বিস্তারিত রেফারেন্স (request/response শেপসহ) **API.md**-তে আছে।

## UI
`public/assets/css/base.css` এখন Firebase Console-এর ধাঁচে — dark রঙের বাম সাইডবার, Roboto/Google Sans ফন্ট, নীল (#039be5) অ্যাকসেন্ট, flat card/button স্টাইল। বাম নেভিগেশনে আগের "My Files" এখন **"Storage"** নামে আছে (Firebase-এর নিজের Storage প্রোডাক্টের নামের সাথে মিলিয়ে)।

## ডিজাইন নিয়ে একটা স্বচ্ছতা
মূল থিম, রঙ, ফন্ট এবং লোগো অবিকৃত রাখা হয়েছে, কিন্তু মাল্টি-পেজ স্ট্রাকচারে সাজানোর সময় আগের SPA-র প্রতিটা মাইক্রো-অ্যানিমেশন হুবহু কপি করা হয়নি — ফোকাস ছিল সিকিউরিটি আর আর্কিটেকচারে। পরে চাইলে এনিমেশন/ডিজাইন পালিশ আলাদাভাবে যোগ করা যাবে।
