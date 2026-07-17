# CREO

CREO landing page and a small NAVER BAND OAuth bridge for the Crewart survey.

## Render

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`
- Public URL: `https://creok.onrender.com`

Copy the variables from `.env.example` into Render's Environment page. Keep the
client secret and session secret only in Render; never commit them to Git.

The registered BAND redirect URI is:

`https://creok.onrender.com/api/band-oauth/callback`
