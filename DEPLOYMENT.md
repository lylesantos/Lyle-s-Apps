# 📱 VibePlayer Deployment & Distribution Guide (Android APK & PWA Web)

VibePlayer is built as a hybrid cross-platform application. It can be run and shipped in two native, production-grade modes:
1. **Andriod Native App (Capacitor APK)**: Build a fully functional, offline-first Android `.apk` ready for distribution on GitHub Releases, app sharing portals, or direct sideload install.
2. **Progressive Web App (PWA Hosting)**: Deploy onto any shared hosting, FTP, cPanel, or cloud platform (Netlify, Vercel, GitHub Pages).

---

## 🤖 Part 1: How to Build & Generate Android Native APK

VibePlayer has native Capacitor integration fully configured in this repository. 

To compile the Android Native APK on your local developer machine:

### 📋 Prerequisites
Ensure you have the following installed on your machine:
- **Node.js** (v18+)
- **Android Studio** (with the Android SDK installed)
- **Java Development Kit (JDK)** version 17 or higher (essential for Gradle compilation)

### 🚀 Step-by-Step Native Compilation

1. **Clone/Download the Repository**
   Download the project folder as a ZIP from the AI Studio settings menu, or sync it via the GitHub export button. Open your terminal in the workspace root directory.

2. **Install Local Node Packages**
   ```bash
   npm install
   ```

3. **Compile the React Production Build**
   Create the highly optimized web assembly output folder `/dist`:
   ```bash
   npm run build
   ```

4. **Sync Web Assets to the Android Native Container**
   Copy the updated web player assets (HTML, icons, compiled JS/CSS, manifest, sw) directly into the Android package:
   ```bash
   npx cap sync
   ```

5. **Compile the APK directly using Gradle**
   To build the production-ready debug APK containing lossless on-device playback capability, execute:
   - **On Windows**:
     ```cmd
     cd android
     gradlew assembleDebug
     ```
   - **On macOS / Linux**:
     ```bash
     cd android
     ./gradlew assembleDebug
     ```

6. **Locating your Compiled APK**
   Once Gradle reports `BUILD SUCCESSFUL`, your installable APK is located at:
   ```filepath
   android/app/build/outputs/apk/debug/app-debug.apk
   ```
   *Rename this to `vibeplayer.apk` and upload it directly as an asset in your GitHub Release!*

7. **Sign for Google Play Store (Release Build)**
   To create a production-signed bundle for Google Play:
   ```bash
   npx cap open android
   ```
   This will open Android Studio. Go to **Build** > **Generate Signed Bundle / APK...**, select your keystore file, and configure your release build.

---

## 🌐 Part 2: How to Deploy as a Web-Hosting PWA Installer

You can also host VibePlayer on any standard domain. Since all playback, database persistence (IndexedDB), and metadata writing is done 100% on the client's web browser, you do not need custom server servers (you can host it for free!).

To compile the standalone static files, run:
```bash
npm install
npm run build
```

Upload the complete contents inside the generated **`/dist`** folder directly to your hosting account:

### 1️⃣ cPanel or Hostinger (FTP/Shared Hosting)
1. Compress everything inside `/dist` into a `vibeplayer.zip` file.
2. Go to your web host's **File Manager** and enter the target web folder (usually `public_html`).
3. Upload `vibeplayer.zip` and extract it at that level.
4. Your PWA is live!

### 2️⃣ Netlify (Drag-and-Drop)
1. Log in to [Netlify](https://www.netlify.com/).
2. Navigate to the **Sites** tab.
3. Drag the compiled **`/dist`** folder directly into the Netlify Drop box.

### 3️⃣ GitHub Pages (Automation Option)
1. Add `"homepage": "https://<your-username>.github.io/<your-repo-name>"` to your `package.json`.
2. Install the deployment helper:
   ```bash
   npm install --save-dev gh-pages
   ```
3. Add the script `deploy: "gh-pages -d dist"` into your package scripts and run:
   ```bash
   npm run deploy
   ```

---

## 📂 Download & Project Export Guide

When you are ready to compile the APK or deploy to hosting:
1. **Download source bundle**: Open the settings dropdown at the top of AI Studio and click **Export as ZIP** or **Export to GitHub**.
2. **Extract & Run**: Extract the download locally, run `npm install`, and choose your build target from the guides above!
