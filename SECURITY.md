# Security Policy

Please report a vulnerability through a private GitHub security advisory when available. Do not attach private chats, media, session data, cookies, or account credentials.

The extension intentionally:

- runs only on Telegram Web;
- accepts download requests only from Telegram Web content scripts;
- allows only HTTP(S), page-local blob/data URLs, and rendered canvases;
- uses no remote code or third-party dependencies; and
- does not request access to browser history, tabs globally, cookies, or the Telegram API.
