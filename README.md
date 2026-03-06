# ☕ Corner Cafe — Shift Scheduler

## How to launch this website (step by step)

---

### STEP 1 — Set up your database (Supabase) — free

1. Go to **https://supabase.com** and click "Start your project"
2. Sign up with Google or email
3. Click **"New project"**
   - Name it: `corner-cafe`
   - Set a database password (save it somewhere safe)
   - Pick the region closest to you
   - Click **"Create new project"** and wait ~2 minutes
4. Once it loads, click **"SQL Editor"** in the left sidebar
5. Click **"New query"**
6. Open the file `supabase-setup.sql` from this folder, copy everything inside it, paste it into the editor, and click **"Run"**
7. You should see "Success. No rows returned" — that means it worked!
8. Now click **"Project Settings"** (gear icon, bottom left) → **"API"**
9. Copy these two values — you'll need them in Step 3:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

---

### STEP 2 — Put your Supabase keys in the project

1. In this folder, find the file called `.env.example`
2. Make a copy of it and rename the copy to `.env.local`
3. Open `.env.local` and replace the placeholder values:

```
REACT_APP_SUPABASE_URL=https://your-actual-project-url.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-actual-anon-key-here
```

Save the file.

---

### STEP 3 — Deploy to Vercel — free (or ~$20/mo for a team plan)

**Option A: Drag and drop (easiest, no GitHub needed)**

1. Go to **https://vercel.com** and sign up (free)
2. From your Vercel dashboard, click **"Add New Project"**
3. Choose **"Import Third-Party Git Repository"** OR look for a drag-and-drop upload option
4. Actually the easiest way: install the Vercel CLI
   - Open Terminal (Mac) or Command Prompt (Windows)
   - Run: `npm install -g vercel`
   - In terminal, navigate to this folder: `cd path/to/corner-cafe`
   - Run: `vercel`
   - Follow the prompts — it will ask you to log in and confirm settings
5. When it asks about environment variables, add:
   - `REACT_APP_SUPABASE_URL` → your Supabase URL
   - `REACT_APP_SUPABASE_ANON_KEY` → your Supabase anon key
6. Vercel will give you a URL like `corner-cafe-abc123.vercel.app` — that's your live site!

**Option B: Via GitHub (slightly more setup, easier to update later)**

1. Create a free GitHub account at **https://github.com**
2. Create a new repository called `corner-cafe`
3. Upload all the files in this folder to that repo
4. Go to **https://vercel.com**, sign up, click "Add New Project"
5. Connect your GitHub account and select the `corner-cafe` repo
6. Under "Environment Variables", add your two Supabase values
7. Click "Deploy" — done!

---

### STEP 4 — Optional: get a custom domain

If you want a URL like `shifts.cornercafe.com` instead of the Vercel one:

1. Buy a domain at **https://namecheap.com** (~$12/year for a .com)
2. In Vercel, go to your project → Settings → Domains
3. Add your domain and follow the DNS instructions Vercel gives you
4. Takes about 10–30 minutes to go live

---

### Updating the site later

If you ever want to make changes (add features, fix something):
- If using GitHub: update the files and push — Vercel auto-deploys
- If using Vercel CLI: make your changes, then run `vercel --prod` in the folder

---

### Costs summary

| Service | Free tier | What you get |
|---|---|---|
| Supabase | Free forever for small projects | Database, up to 500MB |
| Vercel | Free for personal projects | Hosting, custom domain support |
| Domain name | ~$12/year (optional) | e.g. shifts.yourcafe.com |

**For a staff of ~37 people, the free tiers of both will be more than enough.**

---

### Need help?

If you get stuck on any step, screenshot the error and bring it back here!
