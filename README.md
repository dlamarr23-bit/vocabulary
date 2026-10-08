# Vocabulary kit: flashcards and live class games

This kit is a complete vocabulary website you run yourself, for free, on GitHub and Cloudflare.

- **Flashcards page.** Your own library of sets, sorted into folders you make. Students open it with
  no account and no sign in.
- **Every set has four ways to study:** Flashcards (flip, hint, read aloud, star, sort into Know and
  Still learning), Learn (rounds of multiple choice, then typed answers), Test (you pick the number
  and kind of questions) and Match (a timed matching game).
- **Making sets.** You type cards, or paste a whole list at once (Quizlet's export works). You can
  add pictures (upload, paste, drop, a web link, free picture search, animated GIFs) and have
  definitions suggested. With one optional setting, an AI draws a picture for a card. You can make
  folders and drag them around, change icons and colors, and download a set as Word or PDF.
- **Three live class games, played on students' own devices with a join code or QR code:**
  - **Vocab Live:** a team race like Quizlet Live, with optional power-ups and a time limit.
  - **Blast:** shoot the asteroid with the right word.
  - **Multiplayer Match.**

  All three have a podium at the end, optional music on your screen only (students' devices stay
  silent), and a **Demo mode** with 40 pretend students so you can try everything alone.
- **Nickname check.** If students type their own names, rude names are refused by word lists and,
  as a second check, by Cloudflare's free AI.
- **Class Pass and a class leaderboard.** Students sign in with their school Google account (Class
  Pass) when they play in class or study at home. Wins in team and solo games, top 3 finishes,
  correct answers, practice sessions, perfect tests and the fastest Match times go on a leaderboard,
  shown as "First L.". It filters by class period (or all periods together), this school year or
  all time, and topic. Signing in is never required to study or play.

The kit starts empty: no sets, no folders. Everything you make is saved on your Cloudflare account,
not in these files, so you never need to touch code to add or change sets.

**Cost:** nothing. Everything here fits in the free plans of GitHub and Cloudflare. You do not need a
credit card or an API key.

**Time:** about 30 minutes, once.

---

## Before you start

You need:

1. A free **GitHub** account (github.com).
2. A free **Cloudflare** account (dash.cloudflare.com).
3. This kit, unzipped into a folder on your computer.
4. A **teacher password** you make up. Anyone with it can edit your sets, so do not share it with
   students.

Cloudflare moves its buttons around now and then. If a button below is not exactly where this says,
look for the words in **bold**. The left-hand menu has **Workers & Pages** and **Storage &
Databases** in it.

---

## Step 1. Put the kit on GitHub

1. On github.com, click **+** at the top right, then **New repository**.
2. Name it, for example `vocabulary`. **Private** is fine. Do not tick "Add a README". Click
   **Create repository**.
3. On the new, empty repository page, click **uploading an existing file**.
4. Open the unzipped kit folder on your computer and drag **everything inside it** onto the page.
   Drag the contents, not the folder itself, so that `README.md`, `site` and `game-server` sit at
   the top of the repository.
   - The kit has a hidden folder, `.github`. It runs the monthly nickname filter update and a check
     on every change. To see it before dragging: on a Mac press **Command + Shift + .** in Finder; on
     Windows, in File Explorer choose **View**, then **Show**, then **Hidden items**. The site works
     without it, but include it if you can.
5. Wait for the upload to finish (the music makes it about 50 MB), then click **Commit changes**.

## Step 2. Make the website (Cloudflare Pages)

1. In Cloudflare, open **Workers & Pages**, then **Create**, then the **Pages** tab, then **Import an
   existing Git repository** (or **Connect to Git**).
2. Connect your GitHub account when asked, and allow access to the repository from Step 1.
3. Pick the repository and click **Begin setup**.
4. Fill in:
   - **Project name:** anything, for example `my-vocabulary`. This becomes your address,
     `my-vocabulary.pages.dev`.
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** `node site/build.mjs`
   - **Build output directory:** `site/public`
5. Click **Save and Deploy**. After a minute, the site is live at `https://<project name>.pages.dev`.

The Flashcards page works now, but you cannot save sets or host games yet. Steps 3 to 5 switch those
on.

## Step 3. Switch on saving, and set your password

**Make the storage:**

1. Open **Storage & Databases**, then **KV** (Workers KV), then **Create** (Create instance).
2. Name it `vocabulary-sets` and create it.

**Connect it to the site:**

3. Open **Workers & Pages**, click your Pages project, then **Settings**, then **Bindings**, then
   **Add**, then **KV namespace**.
4. **Variable name:** `FLASHCARDS` (exactly like that, in capitals). **KV namespace:**
   `vocabulary-sets`. Save.

**Set the teacher password:**

5. Still in the project's **Settings**, open **Variables and Secrets**, then **Add**.
6. **Type:** Secret. **Variable name:** `EDIT_PASSWORD`. **Value:** your teacher password. Save.

**Redeploy** (settings only take effect on a new deployment):

7. Open the project's **Deployments** tab, click the **⋯** beside the newest one, then **Retry
   deployment**. Wait for it to finish.

**Check it:** open `https://<your site>/api/session`. You should see `"cloud":true`. Then open
`https://<your site>/flashcards/`, click **Teacher sign in** at the bottom, and enter your password.

## Step 4. Make the game server (a Cloudflare Worker)

The games run on a small second program, the game server. It lives in the `game-server` folder of
the same repository.

1. Open **Workers & Pages**, then **Create**, then the **Workers** tab, then **Import a repository**
   (or **Connect to Git**).
2. Pick the same repository.
3. Fill in:
   - **Project name:** `vocab-live`. It must match the `name` line in `game-server/wrangler.toml`. If
     you want another name, change that line on GitHub first.
   - Open **Advanced settings** (or **Build settings**) and set **Path** or **Root directory** to
     `game-server`.
   - **Build command:** leave empty.
   - **Deploy command:** `npx wrangler deploy`
4. Click **Deploy** and wait for it to finish. It has no web page of its own; that is normal.

Nothing else is needed for the AI nickname check: the game server asks for Cloudflare's AI itself
(the `[ai]` lines in `game-server/wrangler.toml`).

From now on, both the site and the game server update themselves whenever the repository changes.

## Step 5. Connect the game server to the site

1. Open **Workers & Pages**, click your **Pages** project (the website, not `vocab-live`), then
   **Settings**, then **Bindings**, then **Add**, then **Durable Object** (Durable Object
   namespace).
2. **Variable name:** `LIVE`. For the namespace, pick **`LiveGame`** from the **`vocab-live`**
   Worker. Save.
3. **Redeploy** the site, as in Step 3, item 7.

**Check it:** `https://<your site>/api/session` now shows `"live":true`. Open
`https://<your site>/live/`, tick **Demo mode**, and click **Create game**. Pretend students join
within a few seconds.

## Step 6 (optional). Let the AI draw pictures for cards

This adds a **Draw it** button to the card editor.

1. Your Pages project, **Settings**, **Bindings**, **Add**, **Workers AI**. **Variable name:** `AI`.
   Save.
2. Redeploy the site. `/api/session` then shows `"draw":true`.

**About the free AI allowance:**

- Cloudflare gives each account 10,000 "neurons" of AI use a day, free. It resets daily, and you are
  never charged on the free plan; the AI simply stops until the next day.
- One drawn picture uses about 1,400, so about 7 pictures a day.
- The nickname check uses the same allowance but only a few neurons per name. If drawing uses up the
  day's allowance, nicknames are checked by the word lists alone until the next day.

## Step 7 (optional). Better picture search with Pixabay

**Find pictures** in the editor always searches Wikipedia, Wikimedia Commons and Openverse. To add
Pixabay's free photos and illustrations as well:

1. Make a free account at pixabay.com.
2. Open https://pixabay.com/api/docs/ and copy your key (shown next to `key` under Parameters).
3. In your Pages project, open **Settings**, then **Variables and Secrets**, then **Add**. Choose
   **Secret**, name it `PIXABAY_KEY`, and paste the key as the value.
4. Redeploy the site.

---

## Step 8 (optional). Class Pass sign-in and the class leaderboard

Class Pass uses the same Google sign-in as the physical science site's Class Pass. Google only sends
a sign-in back to addresses it has been told about, so add this site's address once:

1. Open console.cloud.google.com, signed in with your school account, and pick the project
   **Video Check sign-in** (the one Class Pass uses).
2. Open **APIs & Services**, then **Credentials**, and click the OAuth client Class Pass uses (its ID
   starts with `3149691222-`).
3. Under **Authorized JavaScript origins**, click **Add URI** and type `https://<your site>`.
4. Under **Authorized redirect URIs**, click **Add URI** and type `https://<your site>/signin/`
   (with the slash at the end). Click **Save**. It can take a few minutes to start working.
5. Open `https://<your site>/leaderboard/`, click **Teacher sign in** at the bottom, then open
   **Class roster** and paste your class list. One student per line with their school email, first
   name, last name and period, in any order (a Self-Check sheet's Roster tab, Period, Name, Email,
   pastes straight in). Click **Save roster**. Only students on the roster can sign in.

Nothing else needs setting up: the game server keeps the roster and results (it updates itself
from GitHub, step 4).

**How it counts**

- Live games count when **you host them signed in with the teacher password**, and never in Demo
  mode. A game hosted by a student, or at home, does not count. On the host screen, students signed
  in with Class Pass show a ✓.
- A **win** is first place with at least one right answer, in a game with two or more teams (or
  players). Vocab Live and Blast with teams are **team wins**; Multiplayer Match and solo Vocab Live
  are **solo wins**. **Top 3 finishes** never count last place.
- **Practice** counts when a signed-in student finishes Match, a test, or every term in Learn. Each
  set counts once per mode per day, so repeating the same thing all evening does not climb the
  board. A **perfect test** needs 10 or more questions (or the whole set).
- **Fastest times** show when one set is picked under Topic. Multiplayer Match is ranked by time per
  pair, so 4 and 8 pair games compare fairly.
- **This school year** starts August 1.
- Only you see emails. Students see "First L." (more of the last name when two would match), and
  they see the leaderboard only while signed in.
- In the roster table you can **Remove** a student (results are kept in case you add them back) or
  **Clear results** for one student.

**If a student can't sign in**

- "is not on the class list": add their email to the roster (check they picked their school account).
- "Access blocked" from Google: the same district setting as the physical science site's Class Pass;
  if Class Pass works there, it works here once steps 3 and 4 are done.
- "Your browser blocked the sign-in window": the sign-in opens in a small window of its own. Allow
  pop-ups for the site.
- `PASS_CLIENT_ID` (a variable on the Pages project) replaces the built-in Class Pass client ID, if
  Google ever deletes it.

## Using it

### Making sets (you)

1. Open `https://<your site>/flashcards/` and click **Teacher sign in** at the bottom.
2. **+ Add Set**, give it a name, and it opens ready to type. Type a term and its definition; new
   cards come from **Add card +**.
3. **Import cards** pastes a whole list. Use one card per line, with a tab, comma or dash between the
   term and its definition. From Quizlet, use **Export**, then **Copy text**.
4. On any card you can add a picture: drop, paste or choose a file, paste a web link, use **Find
   pictures** (free pictures), **Google Images**, or **Draw it** if you did Step 6.
5. Everything saves by itself about a second after you stop typing. Students see changes the next
   time they open the page.
6. Back on the Flashcards page: **+ New folder**, drag cards onto folders, and use each card's ⋯
   menu to rename, move, delete, change its icon or change a folder's color.

Students never see the teacher tools. A set with no cards stays hidden from them.

### Studying (students)

Give students the address `https://<your site>/flashcards/`. They open a set and pick Flashcards,
Learn, Test or Match. Their stars and progress stay in their own browser. Nothing about a student is
sent anywhere.

### Hosting a game (you, or anyone)

1. Open `https://<your site>/live/`, or **Host a game** in the top bar or on a set.
2. Pick a game (Vocab Live, Blast or Match), a set, and the options. **Demo mode** fills the game
   with 40 pretend students, for practice.
3. Click **Create game** and put the screen on the projector. Students go to
   `https://<your site>/join/` and type the code, scan the QR code, or use **Copy join link** or
   **Post to Google Classroom**.
4. Start the game when everyone is in. From the **Players** button you can rename or remove a
   student.

**Names:** in setup you choose between random fun names ("Speedy Otter") and names students type.
Typed names are checked for rude words. Games delete themselves 5 minutes after nothing happens,
and 3 hours after they start at the latest. Nothing is kept afterwards.

---

## Changing the site's name

The site is called "Vocabulary" until you change it:

1. On GitHub, open `site/content/site.mjs` and click the pencil (Edit).
2. Change `title` and `brandLine` (and the tagline if you like). Keep the quote marks.
3. **Commit changes.** Cloudflare rebuilds the site in about a minute.

## If something is not working

Open `https://<your site>/api/session`. It shows what the site can see:

| Says | Meaning | Fix |
| --- | --- | --- |
| `"storage":false` | The KV storage is not connected. | Step 3, items 3 and 4, then redeploy. |
| `"password":false` | No teacher password. | Step 3, items 5 and 6, then redeploy. |
| `"live":false` | The game server is not connected. | Steps 4 and 5, then redeploy. |
| `"draw":false` | Draw it is off. That is fine. | Step 6 if you want it. |
| `"pass":false` | Class Pass and the leaderboard need the game server. | Steps 4 and 5, then redeploy. |

**Other problems:**

- **"Saving to the site is not switched on yet."** Same as `storage` or `password` above.
- **The game server's build fails with a name error.** The Worker's project name and the `name`
  line in `game-server/wrangler.toml` must match exactly.
- **Forgot the teacher password.** Set a new value for `EDIT_PASSWORD` (Step 3) and redeploy. This
  signs every device out.
- **A setting changed but nothing happened.** Redeploy the site. Settings only take effect on a new
  deployment.

## Free plan limits

Even a busy class is far inside the free plans.

| Service | Free limit |
| --- | --- |
| Cloudflare Pages (the site) | Unlimited visits. |
| Workers KV (your saved sets) | 1,000 saves and 100,000 reads a day. |
| Durable Objects (the games and leaderboard) | A class of 30 uses a tiny share of the daily free use. |
| Workers AI (nickname check, Draw it) | 10,000 neurons a day, as in Step 6. |

## What is in this kit

| Path | What it is |
| --- | --- |
| `site/` | The website. `build.mjs` makes the pages in `site/public/`; `content/site.mjs` holds the name and top bar. |
| `site/server/worker.js` | The site's server: saving sets and pictures, teacher sign in, picture search, Draw it, and passing game connections to the game server. The build copies it to `site/public/_worker.js`. |
| `site/public/assets/` | The page scripts, styles, font, music and QR code maker. |
| `game-server/` | The live game server (one Cloudflare Durable Object per game), the nickname check (`src/names.js`) and the class leaderboard (`src/board.js`). |
| `.github/workflows/` | **Check:** runs the build and the nickname test on every change. **Update the nickname filter:** once a month, installs the newest rude-word list if it still passes the test. |
| `MUSIC-CREDITS.md` | Where the songs, font and QR code maker come from. |

**Trying it on your own computer (optional, for the technically minded):** with Node.js installed,
open two terminals at the repository's top folder and run:

```
cd game-server && npm install && npx wrangler dev --port 8790
npx wrangler pages dev site/public --kv FLASHCARDS --binding EDIT_PASSWORD=test --do LIVE=LiveGame@vocab-live
```

The game server's AI nickname check talks to Cloudflare even on your computer. If wrangler asks you
to log in, run `npx wrangler login`, or delete the `[ai]` lines from `game-server/wrangler.toml` while
testing (and put them back before you push).
