# 🌐 VibePlayer Web Hosting & Standalone PWA Deployment Guide

VibePlayer is a modern, responsive, installable **Progressive Web App (PWA)** built using React 19, TypeScript, and Tailwind CSS. It is natively optimized to run **fully standalone client-side (SPA) inside any browser or as an installed mobile application**.

You can compile it and upload it directly into any web hosting service (such as **cPanel, Hostinger, GoDaddy, Netlify, Vercel, GitHub Pages, Firebase Hosting, or Amazon S3**).

---

## ⚡ Quick Start: Standard Client-Side Build

To compile VibePlayer into static web files that you can upload to your hosting account, run the following command in your terminal on your local computer:

```bash
npm install
npm run build
```

This compiles your entire React application and outputs the optimized production-ready files inside the `/dist` directory.

---

## 📂 Understanding the Built Files (`/dist` Folder)

After building, the contents of the `/dist` folder will look like this:

- **`index.html`**: The entry point of your standalone application.
- **`manifest.json`**: The PWA web manifest file that enables standard browser installation ("Add to Home Screen").
- **`sw.js`**: The offline Service Worker which manages state-of-the-art offline asset caching, allowing the app to reboot instantly even on an airplane.
- **`vibeplayer_app_icon.jpg`**: High-contrast icon used for launcher homescreens and icons.
- **`assets/`**: Contains the compiled chunked JavaScript modules and combined Tailwind CSS files.

---

## 🚀 How to Upload to Your Hosting Account

Select your preferred hosting method below:

### 1️⃣ cPanel or Hostinger (Standard Shared Hosting)
1. In your local workspace, open the `/dist` folder.
2. Select all files and folders inside `/dist` and compress them into a **`.zip`** archive (e.g., `vibeplayer.zip`).
3. Log in to your hosting account panel and locate the **File Manager**.
4. Navigate to your website's root directory (usually `public_html`).
5. Upload the `vibeplayer.zip` file directly to `public_html`.
6. Extract the zip file's contents so that `index.html`, `manifest.json`, and the `/assets` folder reside directly inside your target domain folder.
7. Open your custom domain in your browser!

### 2️⃣ Netlify (Instant Drag-and-Drop)
1. Go to [Netlify](https://www.netlify.com/) and sign in.
2. Navigate to the **Sites** tab.
3. Drag the compiled **`/dist`** folder from your computer and drop it into the **Netlify Drop** upload zone on the web page.
4. Your PWA is live instantly with an SSL certificate!

### 3️⃣ GitHub Pages
1. Install the GitHub Pages deployment helper locally:
   ```bash
   npm install --save-dev gh-pages
   ```
2. Open your `package.json` file and add a `"homepage"` pointing to your repository:
   ```json
   "homepage": "https://username.github.io/vibeplayer"
   ```
3. Add the deployment script helpers to the `"scripts"` object in `package.json`:
   ```json
   "predeploy": "npm run build",
   "deploy": "gh-pages -d dist"
   ```
4. Deploy with a single command:
   ```bash
   npm run deploy
   ```

---

## 📱 Mobile Installation & Offline Optimization
VibePlayer is pre-linked with a modern Web Manifest and mobile-capable meta tags inside `index.html`. 

- **Google Chrome on Android**: Simply navigate to your uploaded URL. A browser banner will say *"Add VibePlayer to Home Screen"*. Alternatively, click the **⋮ Menu** (Three Dots) on the top right, then select **Install App** or **Add to Home Screen**.
- **Safari on iOS**: Open your URL inside Safari, tap the **Share** button, and tap **"Add to Home Screen"**.
- VibePlayer will launch in a standalone immersive orientation with zero ugly browser address bars.

---

## 🗄️ Offline Persistence Tech Details
All imported MP3, M4A, FLAC, and WAV audio assets, along with metadata, lyrics, and playlists created by the user, are saved on-device inside **IndexedDB (browser local database sandbox)**. 
- Standalone client-side play does **not** rely on our Node.js server.
- The web app will never download audio tracks twice: they are stored persistently inside the sandbox and play instantly!
