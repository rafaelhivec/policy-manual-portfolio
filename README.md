# Evergreen Mobility Personnel Policy (Prototype)

This is a **no-build** static site designed to be deployed on **Cloudflare Pages (free)** from a **GitHub repo**.

It includes:
- Evergreen Mobility-style header/footer + layout
- A document-first policy viewer with a **separate-scroll** Table of Contents
- An **Ask AI** panel that answers questions *from the policy text only*
- A **5 questions/day** limit (enforced via Cloudflare KV)

---

## Step-by-step (no coding)

### 1) Create the GitHub repo
1. Go to GitHub → New repository
2. Name it something like: `policy-prototype`
3. Upload **all files** in this zip (keep folders as-is)

### 2) Deploy with Cloudflare Pages
1. Cloudflare Dashboard → **Workers & Pages**
2. **Create application** → **Pages** → **Import an existing Git repository**
3. Choose your repo → **Begin setup**
4. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `/` (root)

Deploy.

### 3) Turn on the AI model (Workers AI binding)
1. Cloudflare → your Pages project → **Settings** → **Functions** → **Bindings**
2. Add binding:
   - Type: **Workers AI**
   - Variable name: `AI`

### 4) Enforce 5 questions/day (KV binding)
1. Cloudflare Dashboard → **Workers & Pages** → **KV**
2. Create a namespace (example: `policy_limits`)
3. Pages project → **Settings** → **Functions** → **Bindings**
4. Add binding:
   - Type: **KV Namespace**
   - Variable name: `LIMITS`
   - Select your KV namespace

### 5) Optional: Gate the AI feature (recommended)
This prevents random visitors from using your AI feature. (The policy viewer remains public.)

1. Pages project → **Settings** → **Environment variables**
2. Add:
   - `PROTOTYPE_KEY` = `something-you-can-type`

On the website (right sidebar), type the same key once.

---

## Files
- `policy.json` = what the page renders
- `chunks.json` = what the AI uses for “document-first” answers
- `functions/api/ask.js` = server-side AI + rate limit
