# Argus: Visual AI Browser Activity Agent

Argus is a Chrome extension that periodically captures a screenshot of your active tab, sends it to a Python backend powered by Gemini 3.1 Flash-Lite, and categorizes your activity for personal insight.

## Backend Setup

1. **Install Python dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Configure Environment variables:**
   - In the `backend` directory, edit the `.env` file and add your `GOOGLE_API_KEY`.
   - By default, it will use SQLite for local testing. You can optionally add a `DATABASE_URL` for PostgreSQL.

3. **Run the backend server:**
   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```
   The API will be available at `http://localhost:8000`.

## Chrome Extension Setup

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top right corner.
3. Click the **Load unpacked** button.
4. Select the `extension` folder inside this project directory.
5. Pin the Argus extension to your  toolbar.
6. Click the extension icon and go to **Settings** to grant consent before monitoring can begin!

## Architecture Note

This project uses Manifest V3. Background tasks run using `chrome.alarms` to avoid the service worker from sleeping during idle times. For Chrome, it uses `chrome.offscreen` to compress canvas data without requiring the user to have a popup open. For Firefox, the fallback seamlessly uses a direct canvas element inside the Event Page background script.
