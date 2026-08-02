# API Setup

## Google (Gmail + Drive)
1. Create a Google Cloud OAuth desktop client.
2. Enable Gmail API and Drive API.
3. Scopes: `gmail.readonly` and `drive.file` only.
4. Put client id/secret names in `.env` (values via OS secret store in-app).

## Clio Manage
1. Create a Clio private application.
2. Configure redirect URI for loopback.
3. Set region/base URL.
4. Grant permissions for matters/contacts read and communications/documents create.
