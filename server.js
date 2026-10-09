require("dotenv").config();

const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOADS_DIR = path.join(ROOT, "uploads");
const POSTERS_DIR = path.join(UPLOADS_DIR, "posters");
const MOVIES_DIR = path.join(UPLOADS_DIR, "movies");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "sl-movies.db");

for (const dir of [DATA_DIR, UPLOADS_DIR, POSTERS_DIR, MOVIES_DIR]) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expire INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  year INTEGER NOT NULL,
  rating REAL NOT NULL DEFAULT 0,
  genre TEXT NOT NULL,
  duration TEXT DEFAULT '',
  description TEXT NOT NULL,
  poster_path TEXT DEFAULT '',
  video_path TEXT DEFAULT '',
  external_url TEXT DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "SLMovies@2026";
if (!db.prepare("SELECT id FROM admins LIMIT 1").get()) {
  const hash = bcrypt.hashSync(adminPassword, 12);
  db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(adminUsername, hash);
}

const seedMovies = [
  ["The Last Orbit","2026",9.1,"Sci-Fi","2h 14m","A brilliant pilot races beyond the edge of known space to bring a lost crew home before a cosmic storm closes the route forever.",1],
  ["Neon City","2025",8.7,"Thriller","1h 58m","In a rain-soaked future metropolis, a detective follows a trail of coded memories through the city's hidden night economy.",1],
  ["Midnight Run","2025",8.4,"Action","2h 03m","One night, one impossible delivery and a city full of people who want the package before sunrise.",1],
  ["Ocean Between Us","2024",8.2,"Drama","2h 08m","Two old friends meet again after a decade apart and discover that some stories were never really finished.",0],
  ["Weekend Chaos","2024",7.9,"Comedy","1h 46m","A perfectly planned weekend turns into a hilarious chain of accidents, secrets and unexpected friendships.",0],
  ["Red Horizon","2023",8.6,"Adventure","2h 21m","A young explorer follows a forgotten map into a spectacular landscape no modern satellite has ever recorded.",0],
  ["Parallel Hearts","2023",8.1,"Romance","1h 52m","Two strangers keep meeting in different versions of the same city and wonder if fate is trying to tell them something.",0],
  ["Pixel Planet","2022",8.8,"Animation","1h 39m","A tiny digital hero leaves the screen to save a world whose colorful code is slowly disappearing.",0]
];
if (db.prepare("SELECT COUNT(*) c FROM movies").get().c === 0) {
  const seed = db.prepare(`INSERT INTO movies (title,slug,year,rating,genre,duration,description,featured) VALUES (?,?,?,?,?,?,?,?)`);
  const tx = db.transaction(() => { for (const m of seedMovies) seed.run(m[0], uniqueSlug(m[0]), Number(m[1]), m[2], m[3], m[4], m[5], m[6]); });
  tx();
}

const genres = ["Action","Drama","Comedy","Thriller","Sci-Fi","Romance","Animation","Adventure","Horror","Documentary","Family","Crime"];

function slugify(value) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `movie-${Date.now()}`;
}
function uniqueSlug(title, ignoreId = null) {
  let base = slugify(title), slug = base, i = 2;
  while (true) {
    const row = ignoreId
      ? db.prepare("SELECT id FROM movies WHERE slug = ? AND id != ?").get(slug, ignoreId)
      : db.prepare("SELECT id FROM movies WHERE slug = ?").get(slug);
    if (!row) return slug;
    slug = `${base}-${i++}`;
  }
}
function cleanText(value, max=5000) {
  return String(value || "").trim().slice(0,max);
}
function safeFileName(original, prefix) {
  const ext = path.extname(original || "").toLowerCase();
  return `${prefix}-${crypto.randomBytes(12).toString("hex")}${ext}`;
}

const imageTypes = new Set(["image/jpeg","image/png","image/webp","image/avif"]);
const videoTypes = new Set(["video/mp4","video/webm","video/ogg","video/quicktime","video/x-matroska"]);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, file.fieldname === "poster" ? POSTERS_DIR : MOVIES_DIR),
  filename: (req, file, cb) => cb(null, safeFileName(file.originalname, file.fieldname))
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "poster" && !imageTypes.has(file.mimetype)) return cb(new Error("Poster must be JPG, PNG, WEBP or AVIF."));
    if (file.fieldname === "movie" && !videoTypes.has(file.mimetype)) return cb(new Error("Movie must be MP4, WebM, OGG, MOV or MKV."));
    cb(null, true);
  }
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));


class SQLiteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.db = database;
    this.getStmt = database.prepare("SELECT sess, expire FROM sessions WHERE sid = ?");
    this.setStmt = database.prepare("INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire");
    this.destroyStmt = database.prepare("DELETE FROM sessions WHERE sid = ?");
    this.touchStmt = database.prepare("UPDATE sessions SET expire = ? WHERE sid = ?");
    this.cleanupStmt = database.prepare("DELETE FROM sessions WHERE expire <= ?");
    this.cleanup = () => this.cleanupStmt.run(Date.now());
    setInterval(this.cleanup, 10 * 60 * 1000).unref();
  }
  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid);
      if (!row || row.expire <= Date.now()) {
        if (row) this.destroyStmt.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.sess));
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const expire = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 8*60*60*1000;
      this.setStmt.run(sid, JSON.stringify(sess), expire);
      cb?.(null);
    } catch (e) { cb?.(e); }
  }
  destroy(sid, cb) {
    try { this.destroyStmt.run(sid); cb?.(null); } catch (e) { cb?.(e); }
  }
  touch(sid, sess, cb) {
    try {
      const expire = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 8*60*60*1000;
      this.touchStmt.run(expire, sid);
      cb?.(null);
    } catch (e) { cb?.(e); }
  }
}
const sessionStore = new SQLiteSessionStore(db);

app.use(session({
  store: sessionStore,
  name: "sl_movies_sid",
  secret: process.env.SESSION_SECRET || "development-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

function newCsrfToken() { return crypto.randomBytes(24).toString("hex"); }
function ensureSessionToken(req) {
  if (!req.session.csrf) req.session.csrf = newCsrfToken();
  return req.session.csrf;
}
function requireAuth(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: "Authentication required." });
  next();
}
function requireCsrf(req, res, next) {
  const token = req.get("x-csrf-token");
  if (!req.session.csrf || token !== req.session.csrf) return res.status(403).json({ error: "Invalid security token." });
  next();
}

// Lightweight login rate limit: protects against casual brute force attempts.
const attempts = new Map();
function loginLimiter(req, res, next) {
  const key = `${req.ip}:${String(req.body.username || "").toLowerCase()}`;
  const now = Date.now();
  const old = attempts.get(key);
  if (old && now < old.blockedUntil) return res.status(429).json({ error: "Too many login attempts. Try again later." });
  if (old && now > old.resetAt) attempts.delete(key);
  next();
}

function mapMovie(row) {
  if (!row) return null;
  return {
    ...row,
    featured: Boolean(row.featured),
    poster_url: row.poster_path ? `/uploads/posters/${encodeURIComponent(path.basename(row.poster_path))}` : "",
    video_url: row.video_path ? `/uploads/movies/${encodeURIComponent(path.basename(row.video_path))}` : ""
  };
}

app.get("/api/auth/me", (req,res) => {
  if (!req.session.adminId) return res.json({ authenticated:false });
  const admin = db.prepare("SELECT id, username FROM admins WHERE id = ?").get(req.session.adminId);
  res.json({ authenticated: Boolean(admin), username: admin?.username || "", csrf: ensureSessionToken(req) });
});

app.post("/api/auth/login", loginLimiter, (req,res) => {
  const username = cleanText(req.body.username, 100);
  const password = String(req.body.password || "");
  const key = `${req.ip}:${username.toLowerCase()}`;
  const user = db.prepare("SELECT * FROM admins WHERE username = ?").get(username);
  const ok = user && bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    const entry = attempts.get(key) || {count:0, resetAt:Date.now()+15*60*1000, blockedUntil:0};
    entry.count += 1;
    if (entry.count >= 8) entry.blockedUntil = Date.now()+10*60*1000;
    attempts.set(key, entry);
    return res.status(401).json({ error:"Wrong username or password." });
  }
  attempts.delete(key);
  req.session.adminId = user.id;
  req.session.csrf = newCsrfToken();
  res.json({ ok:true, username:user.username, csrf:req.session.csrf });
});

app.post("/api/auth/logout", requireAuth, requireCsrf, (req,res) => {
  req.session.destroy(()=>res.json({ok:true}));
});

app.post("/api/admin/password", requireAuth, requireCsrf, (req,res) => {
  const current = String(req.body.current_password || "");
  const next = String(req.body.new_password || "");
  const admin = db.prepare("SELECT * FROM admins WHERE id=?").get(req.session.adminId);
  if (!admin || !bcrypt.compareSync(current, admin.password_hash)) return res.status(400).json({error:"Current password is incorrect."});
  if (next.length < 10) return res.status(400).json({error:"New password must be at least 10 characters."});
  const hash = bcrypt.hashSync(next, 12);
  db.prepare("UPDATE admins SET password_hash=? WHERE id=?").run(hash, admin.id);
  res.json({ok:true});
});

// Public API
app.get("/api/movies", (req,res) => {
  const search = cleanText(req.query.search, 100).toLowerCase();
  const genre = cleanText(req.query.genre, 40);
  const sort = cleanText(req.query.sort, 20);

  let sql = "SELECT * FROM movies WHERE 1=1";
  const params = {};
  if (search) { sql += " AND (LOWER(title) LIKE @search OR LOWER(description) LIKE @search OR LOWER(genre) LIKE @search)"; params.search=`%${search}%`; }
  if (genre && genres.includes(genre)) { sql += " AND genre = @genre"; params.genre=genre; }
  if (sort === "rating") sql += " ORDER BY rating DESC, created_at DESC";
  else if (sort === "year") sql += " ORDER BY year DESC, created_at DESC";
  else if (sort === "title") sql += " ORDER BY title COLLATE NOCASE ASC";
  else if (sort === "oldest") sql += " ORDER BY created_at ASC";
  else sql += " ORDER BY featured DESC, created_at DESC";
  sql += " LIMIT 300";
  const rows = db.prepare(sql).all(params).map(mapMovie);
  res.json({ movies:rows, total:rows.length });
});

app.get("/api/movies/:id", (req,res) => {
  const row = db.prepare("SELECT * FROM movies WHERE id = ? OR slug = ?").get(req.params.id, req.params.id);
  if (!row) return res.status(404).json({error:"Movie not found."});
  res.json({movie:mapMovie(row)});
});

// Admin API
app.get("/api/admin/stats", requireAuth, (req,res)=>{
  const total = db.prepare("SELECT COUNT(*) c FROM movies").get().c;
  const featured = db.prepare("SELECT COUNT(*) c FROM movies WHERE featured=1").get().c;
  const avg = db.prepare("SELECT COALESCE(AVG(rating),0) avg FROM movies").get().avg;
  const latest = db.prepare("SELECT * FROM movies ORDER BY created_at DESC LIMIT 5").all().map(mapMovie);
  res.json({total, featured, average:Number(avg).toFixed(1), latest});
});

const movieUpload = upload.fields([{name:"poster",maxCount:1},{name:"movie",maxCount:1}]);

function handleUpload(req,res,next) { movieUpload(req,res,(err)=>{ if(err) return res.status(400).json({error:err.message}); next(); }); }

app.post("/api/admin/movies", requireAuth, requireCsrf, handleUpload, (req,res)=>{
  const body=req.body;
  const title=cleanText(body.title,150), description=cleanText(body.description,5000), genre=cleanText(body.genre,40);
  const year=Number(body.year), rating=Number(body.rating || 0);
  if(!title || !description || !Number.isInteger(year) || year<1900 || year>2100 || !genres.includes(genre)) return res.status(400).json({error:"Please complete valid movie details."});
  if(rating<0 || rating>10) return res.status(400).json({error:"Rating must be between 0 and 10."});
  const videoFile=req.files?.movie?.[0], posterFile=req.files?.poster?.[0];
  if(!videoFile && !cleanText(body.external_url,1000)) return res.status(400).json({error:"Upload a movie file or provide an external URL."});
  const slug=uniqueSlug(title);
  const insert=db.prepare(`INSERT INTO movies (title,slug,year,rating,genre,duration,description,poster_path,video_path,external_url,featured,updated_at)
    VALUES (@title,@slug,@year,@rating,@genre,@duration,@description,@poster_path,@video_path,@external_url,@featured,CURRENT_TIMESTAMP)`);
  const info=insert.run({
    title,slug,year,rating,genre,duration:cleanText(body.duration,50),description,
    poster_path:posterFile?posterFile.filename:"", video_path:videoFile?videoFile.filename:"",
    external_url:cleanText(body.external_url,1000), featured:body.featured==="1"?1:0
  });
  res.status(201).json({movie:mapMovie(db.prepare("SELECT * FROM movies WHERE id=?").get(info.lastInsertRowid))});
});

app.put("/api/admin/movies/:id", requireAuth, requireCsrf, handleUpload, (req,res)=>{
  const current=db.prepare("SELECT * FROM movies WHERE id=?").get(req.params.id);
  if(!current) return res.status(404).json({error:"Movie not found."});
  const body=req.body, title=cleanText(body.title,150), description=cleanText(body.description,5000), genre=cleanText(body.genre,40);
  const year=Number(body.year), rating=Number(body.rating||0);
  if(!title || !description || !Number.isInteger(year) || year<1900 || year>2100 || !genres.includes(genre) || rating<0 || rating>10) return res.status(400).json({error:"Please complete valid movie details."});
  const videoFile=req.files?.movie?.[0], posterFile=req.files?.poster?.[0];
  const posterPath=posterFile?posterFile.filename:current.poster_path;
  const videoPath=videoFile?videoFile.filename:current.video_path;
  const externalUrl=cleanText(body.external_url,1000);
  db.prepare(`UPDATE movies SET title=?,slug=?,year=?,rating=?,genre=?,duration=?,description=?,poster_path=?,video_path=?,external_url=?,featured=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(title,uniqueSlug(title,current.id),year,rating,genre,cleanText(body.duration,50),description,posterPath,videoPath,externalUrl,body.featured==="1"?1:0,current.id);
  if(posterFile && current.poster_path) fs.rmSync(path.join(POSTERS_DIR,current.poster_path),{force:true});
  if(videoFile && current.video_path) fs.rmSync(path.join(MOVIES_DIR,current.video_path),{force:true});
  res.json({movie:mapMovie(db.prepare("SELECT * FROM movies WHERE id=?").get(current.id))});
});

app.delete("/api/admin/movies/:id", requireAuth, requireCsrf, (req,res)=>{
  const row=db.prepare("SELECT * FROM movies WHERE id=?").get(req.params.id);
  if(!row)return res.status(404).json({error:"Movie not found."});
  const tx=db.transaction(()=>{
    db.prepare("DELETE FROM movies WHERE id=?").run(row.id);
    if(row.poster_path)fs.rmSync(path.join(POSTERS_DIR,row.poster_path),{force:true});
    if(row.video_path)fs.rmSync(path.join(MOVIES_DIR,row.video_path),{force:true});
  });
  tx();
  res.json({ok:true});
});

app.patch("/api/admin/movies/:id/featured", requireAuth, requireCsrf, (req,res)=>{
  const value=req.body.featured?1:0;
  const info=db.prepare("UPDATE movies SET featured=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(value,req.params.id);
  if(!info.changes)return res.status(404).json({error:"Movie not found."});
  res.json({ok:true});
});

app.use("/uploads", express.static(UPLOADS_DIR, {
  fallthrough:false,
  setHeaders:(res)=>{res.setHeader("Cache-Control","public, max-age=86400");}
}));
app.use(express.static(path.join(ROOT,"public"), {extensions:["html"]}));

app.use((err,req,res,next)=>{
  console.error(err);
  if(err instanceof multer.MulterError) return res.status(400).json({error:err.message});
  res.status(500).json({error:"Server error."});
});

app.get("*", (req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));

app.listen(PORT, ()=>console.log(`SL Movies running on http://localhost:${PORT}`));
