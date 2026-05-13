# Dwellera

Dwellera is an FSBO real estate marketplace with map search, realtime chat, natural-language property search, seller verification, Matterport walkthrough embeds, and a buyer-side negotiation agent.

## Features

- Interactive map marketplace with Leaflet markers, heatmap, address fly-to, and lasso area search.
- Natural-language search for requests like `pool in Willow Glen under 2M` or `3 bed houses in San Jose`.
- Gemini Live AI page that can call marketplace search tools and show matching properties.
- Realtime buyer/seller messaging with Supabase broadcast channels.
- Negotiation Agent workflow tree with property branches, chat preview, offer stages, approval controls, and agent settings.
- Seller ID verification flow with camera capture, pending review, approval/rejection, and listing lockout until verified.
- Matterport 3D walkthrough embeds inside the property details modal.

## Tech Stack

### Frontend

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- React Leaflet
- Supabase JS

### Backend

- FastAPI
- SQLAlchemy
- Supabase Postgres
- Supabase Auth
- Cloudinary image upload

## Local Setup

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Required `backend/.env` values:

```txt
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_KEY=...
```

For creating or updating Supabase Auth users through the admin API, `SUPABASE_KEY` should be a service-role key. If it is only an anon key, the demo seed script falls back to public signup.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Required `frontend/.env.local` values:

```txt
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=...
NEXT_PUBLIC_GEMINI_API_KEY=...
```

Open:

```txt
http://localhost:3000
```

## Demo Data

Seed or refresh showcase data:

```bash
python backend/seed_demo_data.py
```

The script is idempotent. It does not truncate or delete existing data. It creates demo auth users, mirrors them to the app `users` table, and inserts demo listings only when missing.

Demo accounts all use:

```txt
password
```

| Email | Role | Use |
|---|---|---|
| `ava.buyer@dwellera.demo` | buyer | Buyer search, chat, negotiation agent |
| `marcus.buyer@dwellera.demo` | buyer | Alternate buyer |
| `willow.seller@dwellera.demo` | seller | San Jose seller dashboard |
| `sf.seller@dwellera.demo` | seller | San Francisco seller dashboard |
| `bay.seller@dwellera.demo` | seller | Townhouse/view listing seller |

Demo sellers are pre-verified by the seed script so they can create listings immediately.

## Showcase Script

### 1. Seller Flow

Log in as:

```txt
willow.seller@dwellera.demo
password
```

Show:

- Seller dashboard
- Existing listings
- Messages
- Listing status toggle
- Create listing button

### 2. Buyer Search

Log in as:

```txt
ava.buyer@dwellera.demo
password
```

Go to `Map` and try Natural Search:

```txt
pool in Willow Glen under 2M
```

Expected:

- `Willow Glen Family Pool Home`

Try:

```txt
3 bed houses in San Jose under 2M
```

Expected:

- Multiple San Jose house results.

### 3. AI / NLP Search

Go to `AI` and use the typed search:

```txt
Find modern condos in SOMA under 1.5 million
```

Expected:

- `Modern SOMA Loft`

### 4. Negotiation Agent

Go to `Negotiation` as `ava.buyer@dwellera.demo`.

Use:

```txt
Enabled: checked
Agent can finalize: unchecked
Max price: 2000000
Target offer: 1750000
Max offer: 1900000
Min beds: 3
Min baths: 2
Property type: House
Areas: San Jose, Willow Glen
Must haves: pool
Max active workflows: 8
```

Click `Save Settings`, then `Sync Now`.

Expected:

- A workflow branch for `Willow Glen Family Pool Home`.
- Chat preview shows the agent outreach.
- Seller can reply from Messages.
- Buyer can approve when the offer reaches review.

## Seller Verification

Seller signup requires a camera ID capture.

Flow:

1. User selects `Sell Properties`.
2. User captures ID using camera.
3. Account is created with `verification_status = pending`.
4. Seller can log in but cannot create listings.
5. A reviewer opens:

```txt
http://localhost:3000/verification-agent
```

6. Reviewer approves or rejects the seller.
7. Only `verified` sellers can publish listings.

Pending verifications expire after 48 hours and listing access remains blocked.

For production, ID images should be stored in private encrypted storage with strict retention and access rules. The current implementation stores the capture as a data URL for demo simplicity.

## Matterport 3D Walkthrough

Listings can store:

```txt
matterport_url
```

The create-listing form has an optional `Matterport Walkthrough URL` field.

Where the button appears:

- Open a property card.
- In the property details modal, look at the large image area.
- If that listing has a `matterport_url`, a white `3D` button appears in the top-right corner of the image area, just left of the close button.
- Clicking `3D` opens the Matterport viewer embedded inside the app. It does not open a new tab or redirect.

Demo listings with the dummy Matterport URL:

- `Willow Glen Family Pool Home`
- Demo-created `Modern SOMA Loft`

If the button does not appear, restart the FastAPI backend so `/api/listings` returns the new `matterport_url` field:

```bash
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## Useful Commands

```bash
# Frontend type check
cd frontend
npx tsc --noEmit

# Frontend production build
npm run build

# Backend syntax check
cd ..
python -m py_compile backend/main.py backend/models.py backend/schemas.py

# Additive verification and Matterport migration
python backend/migrate_verification.py
```
