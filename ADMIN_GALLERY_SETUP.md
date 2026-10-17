# Admin gallery upload setup

The site is deployed on Vercel. Gallery image files are stored in Vercel Blob, and their public URLs and metadata are stored in the existing MongoDB service configured by `MONGODB_URI`. The browser never receives storage or database credentials.

## Configure deployment

1. Install the project dependencies with `npm install` and deploy the project to Vercel.
2. Create a public Vercel Blob store connected to this Vercel project. Connected stores use Vercel OIDC automatically with the current Blob SDK; if the store is using a static token instead, configure `BLOB_READ_WRITE_TOKEN` as a server-only environment variable.
3. Set `MONGODB_URI` to the existing MongoDB connection string and, if needed, set `MONGODB_DB` (defaults to `sewielders`). Allow the Vercel deployment to connect to the database.
4. Set `ADMIN_EMAIL` to the administrator's login email.
5. Generate the password hash by running `npm run admin:password-hash`, then add the printed `ADMIN_PASSWORD_HASH` to Vercel. The password itself is not stored in the app.
6. Set `SESSION_SECRET` to a unique random value of at least 32 characters. Keep all secrets server-side and redeploy after changing environment variables.

For local development, copy `.env.example` to `.env.local`, fill in the same variables, and use `vercel dev` so the serverless API routes and static site run together. Never commit `.env.local` or real credentials.

## Upload limits

Uploads accept JPEG, PNG, and WebP. Each image is limited to 3 MB and each request to 4 MB total (to stay within Vercel's function request limit); up to 10 files may be selected subject to the request-size limit. `GALLERY_MAX_IMAGES`, `GALLERY_MAX_FILE_BYTES`, and `GALLERY_MAX_REQUEST_BYTES` configure the limits. Files are checked against their binary image signatures before storage. The public gallery keeps its existing cards and layout and appends saved images from `/api/gallery`.

## Deployment verification

The workspace does not contain MongoDB or Blob credentials, so the real hosted upload, database persistence, and public image delivery require the deployment configuration above. Once configured, verify sign-in, invalid/oversized-file rejection, successful upload, dashboard reload, and the public `/gallery` page against that deployment.
