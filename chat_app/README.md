# Circle — group chat with push notifications

Sign up, sign in, a live group chat with text + photo sharing, and push
notifications when the app isn't open.

## Setup

### 1. Supabase
1. Create a project at supabase.com
2. Go to SQL Editor → New query → paste in `supabase/schema.sql` → Run
3. Go to Project Settings → API → copy your **Project URL** and **anon public key**
4. Paste those into `public/supabase-config.js`
5. Go to Authentication → Providers → make sure Email is enabled
6. Go to Authentication → Settings and **turn off "Confirm email"** —
   this is required, not optional, since the app signs people up with
   a made-up address (e.g. `alex@users.circle-app.local`) and there's
   no real inbox to confirm. Leaving this on is also what causes a
   "email rate limit exceeded" error during testing.

**Note on login:** people only ever type a username and password — no
email address anywhere in the UI. Behind the scenes the app turns the
username into a fake address just so Supabase's auth system (which
expects an email-shaped string) accepts it — same approach as your
notes website's login.

**Note on password rules:** the app enforces the same rules as your
notes site (username 5–10 characters; password 8–20 characters with
uppercase, lowercase, a number, and a special character) in the
browser before submitting. Supabase also has its own minimum password
length setting (default is 6) under Authentication → Settings — bump
that to 8 there too, so the rule is enforced on the server side as
well, not just in the browser.

### 2. Run it locally
You can open `public/index.html` directly, or serve it locally, to test
before deploying:
```
npx serve public
```

### 3. Deploy to Cloudflare
1. Push this folder to a GitHub repo
2. Install Wrangler: `npm install -g wrangler`
3. Run `wrangler login`, then from this folder: `wrangler deploy`
4. For auto-deploy on every GitHub push, connect the repo in the
   Cloudflare dashboard under Workers & Pages → your project → Settings → Builds

## What's working
- Sign up / sign in with just a username and password (Supabase Auth)
- Everyone lands in one shared group chat
- Messages send and appear live for everyone (Supabase Realtime)
- Attach and send a photo (up to 8MB) via the paperclip button
- Push notifications on new messages (see setup below)

## What's next
- Further UI polish (typing indicator, read receipts, etc.)

## Setting up push notifications

Push is built in now. Two things to configure — both done in dashboards,
no CLI required.

### A. Add secrets in the Cloudflare dashboard
Go to your Worker in the Cloudflare dashboard → **Settings → Variables and
Secrets** → add these (mark them as **Secret**, not plain text):

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | `BBRZwlWQ4I0lqTwM4ZnmuXLg8B8V76XqnOVA9_pQE4jwI77OhACA6hKVXN8sj-mmfWpLmmdrbHaZM1hMDJssyqk` |
| `VAPID_PRIVATE_KEY` | `ooSKHKTXgCeiyXxeJsDUapyB-0T3avUSwmS2S5AUulM` |
| `VAPID_SUBJECT` | `mailto:you@example.com` (any contact email, push services just want *something* here) |
| `SUPABASE_URL` | same value as in `supabase-config.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** key (different from the anon key — keep this one secret, never put it in client code) |
| `NOTIFY_SECRET` | `60a211456ad03314c74195dfda7a21f124525fbe39c3e8ac` (or make up your own random string) |

The `VAPID_PUBLIC_KEY` above is already in `supabase-config.js` too, so
push works out of the box — but since it's a matched pair, if you ever
regenerate the keys, both places need updating together.

### B. Create the Supabase webhook
This is what tells your Worker "a new message just arrived, go notify people."

1. In Supabase, go to **Database → Webhooks → Create a new webhook**
2. Table: `messages`, Events: `Insert` only
3. Type: **HTTP Request**, Method: `POST`
4. URL: `https://YOUR-WORKER-URL.workers.dev/api/notify`
5. Add an HTTP header: `x-notify-secret` → same value you used for `NOTIFY_SECRET` above
6. Save

That's it — from now on, every new message triggers a push to everyone
else's devices (except the sender's), and taps on the notification open
the app.

### Notes
- Browsers ask permission the first time someone signs in — they'll see
  the normal "Circle wants to send notifications" prompt
- iPhone/iPad users need to **add the app to their home screen first**
  (Safari share button → Add to Home Screen) — Apple only allows push
  for installed PWAs, not regular Safari tabs
- Dead/expired subscriptions are automatically cleaned up when a push fails
