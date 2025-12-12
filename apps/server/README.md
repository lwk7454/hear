# Hear Server

The backend service for the Hear platform, handling API requests, data ingestion, and orchestration.

## Setup

1.  **Dependencies**:
    ```bash
    pnpm install
    ```
2.  **Database**:
    Ensure Postgres is running and schema is pushed:
    ```bash
    cd ../../packages/db
    pnpm prisma db push
    ```
3.  **Environment**:
    Copy `.env.example` to `.env` and fill in:
    *   `DATABASE_URL`
    *   `OPENAI_API_KEY` (for Brain/LLM)
    *   `YOUTUBE_CLIENT_ID` / `SECRET` (for OAuth)
    *   `CORS_ORIGINS` (Optional, comma-separated list of allowed origins. Defaults to localhost for dev).

## YouTube Ingestion & Cookies

To bypass YouTube's "Sign in to confirm you're not a bot" errors, the server uses a "Service Account" cookie file for downloads.

### 1. Generating the Cookie File
1.  Install a browser extension like **"Get cookies.txt LOCALLY"** (Chrome/Firefox).
2.  Log in to YouTube (a Premium account is recommended for higher rate limits).
3.  Open the extension and export cookies to a file.
4.  Rename it to `cookies.txt`.

### 2. Deploying
*   **Local**: Place `cookies.txt` in the `apps/server/` root.
*   **Production**: 
    1.  Upload the file to your server (securely).
    2.  Set the environment variable:
        ```bash
        YOUTUBE_COOKIES_PATH=/path/to/your/secure/cookies.txt
        ```

### 3. Operational Limits
*   **Expiry**: Cookies typically last **6-12 months**. You only need to update this file if:
    *   You change the password of the account.
    *   You explicitly log out all sessions.
    *   YouTube significantly changes their auth mechanism (rare).
*   **Rate Limits**: A single cookie file + IP can typically handle **200-500 downloads per day** safely.
    *   *Tip*: Using a YouTube Premium account reduces the chance of flagging.
*   **Scaling**: If you need thousands of daily downloads, you will need to implement IP Rotation (Proxies) in the `yt-dlp` configuration.
