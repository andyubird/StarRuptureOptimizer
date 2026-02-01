# How to Deploy StarRupture Optimizer

Since this is a static React application (Vite), you can deploy it for free on several platforms. Here are the best options:

## Option 1: Vercel (Recommended)
Vercel is the easiest way to deploy Vite apps.

1.  **Push your code to GitHub**.
    *   Create a repository on GitHub.
    *   Push your local code to it.
2.  **Sign up for Vercel** (vercel.com) using your GitHub account.
3.  Click **"Add New Project"** and select your `StarRuptureOptimizer` repository.
4.  Vercel will detect it's a Vite app.
    *   **Build Command**: `npm run build`
    *   **Output Directory**: `dist`
5.  Click **Deploy**.
    *   *Done!* You'll get a URL like `star-rupture-optimizer.vercel.app`.

## Option 2: Netlify
Similar to Vercel, extremely reliable.

1.  **Push code to GitHub**.
2.  **Sign up for Netlify** (netlify.com).
3.  Click **"Add new site"** -> **"Import from existing project"**.
4.  Connect GitHub and choose your repo.
5.  **Build Settings**:
    *   **Build command**: `npm run build`
    *   **Publish directory**: `dist`
6.  Click **Deploy**.

## Option 3: GitHub Pages
If you want to host it directly on your repo.

1.  Open `vite.config.ts` and set the base path:
    ```ts
    export default defineConfig({
      base: '/your-repo-name/', // REPLACE THIS with your repo name
      plugins: [react()],
    })
    ```
2.  Install `gh-pages`:
    ```bash
    npm install gh-pages --save-dev
    ```
3.  Add a script to `package.json`:
    ```json
    "deploy": "gh-pages -d dist"
    ```
4.  Run `npm run build` then `npm run deploy`.

---
**Recommendation**: Go with **Vercel** or **Netlify**. They require zero configuration changes and just work out of the box.
