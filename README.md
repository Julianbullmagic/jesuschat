## Deploy to Render

### Prereqs
- Node.js 18+ locally (Render runs Node 18+)
- OpenAI API key
- Supabase project with table `Jesus(id, created_at, shortsummaries text, longsummaries text)`

### Local setup
1. Copy `.env.example` to `.env` and fill values.
2. Install deps and run:
   - `npm install`
   - `npm start`

### Render (Blueprint)
1. Push this repo to GitHub.
2. In Render, New + → Blueprint → connect the repo.
3. Render will read `render.yaml` and create a Web Service.
4. Set environment variables in the Render dashboard:
   - `OPENAIKEY`
   - `SUPABASEURL`
   - `SUPABASEKEY` (prefer service_role key; keep private)
   - `CORS_ORIGIN` (your frontend/site origin or `*` for testing)
5. Deploy. Health check: `GET /healthz` should return `ok`.

### Notes
- The server listens on `process.env.PORT` (set by Render).
- CORS origin is configurable via `CORS_ORIGIN` and applied to both Express and Socket.IO.

