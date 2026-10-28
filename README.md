<<<<<<< HEAD
<<<<<<< HEAD
# StudyVerse: Scroll Keepers (full-stack)

Your original game, now with accounts, a login page, a Node.js backend and a SQLite database.
Progress (XP, badges, loaded notes, mastered words, streaks) is saved per user on the server.

## Run it
Requires **Node.js 22.13 or newer** (check with `node -v`). There is nothing to `npm install`.

    npm start
    # open http://localhost:3000

## Troubleshooting (Windows)
- **The Sage is asleep / no "Summarize with AI" button**: the server did not find your key. When you start `node server.js` it prints `AI: ON ...` or `AI: OFF ...`. If it says OFF, make sure the file is named exactly `.env` (not `.env.txt`), sits in the same folder as `server.js`, then stop (Ctrl+C) and start the server again.
- `npm : ... running scripts is disabled`: use `npm.cmd start`, or run `node server.js` directly.
- `No built-in SQLite` / `node:sqlite` errors: your Node is too old. Install Node 22.13+ LTS from nodejs.org.
- `port 3000 is already in use`: close the other server, or run `$env:PORT=3001; node server.js`.
- Database errors inside a OneDrive folder: move the project to something like `C:\projects\studyverse`.
- Page opens but login fails: make sure you opened http://localhost:3000 from the running server, not the HTML file directly.

## Turn on the AI (summarizer, quiz and chatbot)
Copy `.env.example` to `.env` and choose ONE provider, then restart the server:
- **Anthropic Claude** (default): set `ANTHROPIC_API_KEY` (key from https://console.anthropic.com).
- **OpenAI or compatible** (Groq, OpenRouter, Together...): set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_BASE_URL` if not OpenAI itself.
- **Free local model (Ollama)**: install Ollama, run `ollama pull llama3.1`, then set `AI_PROVIDER=openai`, `OPENAI_BASE_URL=http://localhost:11434/v1`, `OPENAI_MODEL=llama3.1`. No key needed. Small local models write weaker quizzes, so if the AI boss fails the game falls back to classic questions.

- **Qwen / reasoning models**: see the Qwen section in `.env.example`. The server removes `<think>` reasoning from answers automatically.

Without any AI setup the AI buttons stay hidden and everything else works.

AI features:
- **Summarize with AI** (Library): a written summary, saved with the document.
- **AI boss battles** (Arena): multiple-choice questions with explanations (a "Classic questions" button keeps the original mode).
- **The Sage** (chat tutor): answers using the document you have open. The conversation is saved per document.

Keys stay on the server and are never sent to the browser. Each user is limited to 40 AI requests per hour,
long documents are handled in parts: the summary reads the whole document (in sections, then merges them), the chat looks up the most relevant pages for each question, and the quiz samples questions from across the whole document.

## Document history
Every PDF or set of notes you load is saved to your account (identical text is stored once, so re-loading it does not add a copy or give XP again).
The **History** page lists them with date, size, and whether they have an AI summary or chat. You can **Open** one to continue where you left off
(its summary and chat come back), **Rename** it, or **Delete** it. Up to 50 documents of 400,000 characters each. Only the PDF's extracted text is stored, not the PDF file itself.

## Accounts, leaderboard and profile
- **Leaderboard** page: top 20 heroes by total XP, with your own rank. XP is reported by the player's browser, so it is a friendly board, not tamper-proof.
- **Profile** page: your stats, a switch to hide yourself from the leaderboard, change password, and delete account.
- Changing your password logs out your other devices. Deleting your account permanently removes your user, saved progress and sessions.
- Databases from the previous version are upgraded automatically on first start (existing XP is carried onto the leaderboard).

## Other settings
Optional environment variables: `PORT` (default 3000), `DATA_DIR` (where the database lives),
`NODE_ENV=production` (marks the session cookie Secure; use behind HTTPS).

## Structure
    server.js            HTTP server, API routes, sessions, static files
    db.js                SQLite schema (users, sessions, progress)
    ai.js                AI providers (Anthropic / OpenAI-compatible / Ollama): summary, quiz, chat
    public/login.html    Login / sign-up page
    public/app.html      The game (only served to logged-in users)
    public/css/style.css All styling (your original CSS + login styles)
    public/js/app.js     Game logic (now saves to the server)
    public/js/login.js   Login page logic
    data/studyverse.db   Created on first run

## API
    POST /api/register   {username, password}   create account + log in
    POST /api/login      {username, password}
    POST /api/logout
    GET  /api/me
    GET  /api/state      load saved progress
    PUT  /api/state      save progress
    GET  /api/leaderboard top 20 + your rank
    GET  /api/profile    your profile and stats
    PUT  /api/profile    {show_on_board: true|false}
    POST /api/password   {current, next}
    DELETE /api/account  {password}
    GET  /api/docs       list saved documents (history)
    POST /api/docs       {name, text} save a document
    GET  /api/docs/:id   open one (text, summary, chat)
    PUT  /api/docs/:id   {name} rename, or {clearChat:true}
    DELETE /api/docs/:id
    GET  /api/ai/status  {enabled, provider, model}
    POST /api/ai/summary {docId} or {text}   (saved on the document)
    POST /api/ai/quiz    {docId|text, count}
    POST /api/ai/chat    {docId, message}    (history kept server-side)

## Security notes
Passwords are hashed with scrypt and a per-user salt. Sessions are random 256-bit tokens in
HttpOnly, SameSite=Lax cookies, and only a hash of the token is stored. Auth attempts are
rate-limited per IP, request bodies are capped at 2 MB, and cross-origin writes are rejected.
For a public deployment, serve it over HTTPS and set NODE_ENV=production.
=======
# StudyVerse1
>>>>>>> 6c9421ba5b39290e7c18a7b8684aba2055524334
=======

>>>>>>> 3c509c257c2a5fe6c9a340ed1eddf18f1849d59d
