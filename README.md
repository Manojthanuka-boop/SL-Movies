# SL Movies — Next Level Full-Stack Edition

A deployment-ready starter for a real movie library:

- Premium black + blue responsive UI
- Public movie search, genre filter and sorting
- Dynamic movie detail pages
- Server-hosted poster images
- Server-hosted movie video files
- Browser-native video player
- Download link for uploaded movie files
- Secure admin sessions stored in SQLite
- CSRF protection for admin mutations
- Password hashing with bcrypt
- Login attempt throttling
- SQLite-backed session store (survives Node process restarts)
- Admin password change from the dashboard
- SQLite database
- Admin dashboard with stats
- Add / edit / delete movies
- Feature / unfeature movies
- Dockerfile + Docker Compose
- Your supplied SL Movies logo is included

## 1. Local setup

Requirements: Node.js 20+

```bash
cp .env.example .env
npm install
npm start
```

Open:

http://localhost:3000

Before going public, change these values in `.env`:
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

Important: the first startup creates the admin from those environment variables. If an admin already exists in the database, changing the env password does not overwrite it.

## 2. Admin

Open:

http://localhost:3000/admin-login.html

After login, the Admin Dashboard lets you upload:
- Poster
- Movie video
- Title
- Year
- Rating
- Genre
- Duration
- Description
- Optional external URL
- Featured flag

Uploaded files are stored under `uploads/` and metadata is stored in SQLite under `data/`.

## 3. Hosting

This app needs **Node.js hosting**, not a static-only host, because the website uses an Express backend, sessions, SQLite and file uploads.

Typical deployment flow:
1. Upload/push this project to your Git repository.
2. Create a Node service on your host.
3. Install dependencies with `npm install`.
4. Start with `npm start`.
5. Set the environment variables from `.env.example`.
6. Give the app persistent storage for `data/` and `uploads/`.

Without persistent storage, a redeploy/restart can remove SQLite data or uploaded movie files.

For a larger production site, use:
- PostgreSQL for the database
- S3 / Cloudflare R2 / another object store for movie files
- CDN for video delivery
- Separate secret management
- HTTPS
- Upload scanning/transcoding and size limits
- Proper monitoring and backups

## 4. Docker

```bash
cp .env.example .env
# edit .env
docker compose up -d --build
```

The compose file mounts:
- `./data` → SQLite database
- `./uploads` → uploaded poster/movie files

## Legal/content reminder

Only upload movies, posters, subtitles or other media that you own or have permission to distribute. This software does not provide or source copyrighted movies.

## Project structure

```
server.js
package.json
.env.example
Dockerfile
docker-compose.yml
data/
uploads/
public/
  index.html
  movies.html
  categories.html
  movie.html
  about.html
  admin-login.html
  admin.html
  css/style.css
  js/site.js
  js/admin.js
  assets/sl-movies-logo.png
```
