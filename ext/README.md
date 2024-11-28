# Picture Resizer Pro\

## How to get Google OAuth ID

1. Go to Google Cloud Console (<https://console.cloud.google.com/>)
2. Select your Firebase project
3. Go to APIs & Services > Credentials
4. Click "Create Credentials" > "OAuth client ID"
5. Choose "Chrome Extension" as application type
6. Enter your extension ID (find it in chrome://extensions/)
7. The extension ID looks like: "abcdefghijklmnopqrstuvwxyzabcdef"
8. Click Create and copy the client ID

## Firebase Setup

Add the Google Cloud Project ID in the 'safelist client IDs' list in the google sign-in methods in firebase console.