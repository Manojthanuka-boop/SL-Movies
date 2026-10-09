(() => {
const page=document.body.dataset.page;
const state={};
const toast=(msg,error=false)=>{let t=document.querySelector(".toast");if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t)}t.textContent=msg;t.classList.toggle("error",error);t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500)};
const escapeHtml=(v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const qs=new URLSearchParams(location.search);

document.querySelector(".menu-toggle")?.addEventListener("click",()=>document.querySelector(".nav")?.classList.toggle("open"));
document.querySelectorAll("[data-nav]").forEach(a=>{if(a.dataset.nav===page)a.classList.add("active")});

async function api(url,opts={}){const r=await fetch(url,{credentials:"same-origin",...opts});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Request failed");return d}
function movieCard(m){const poster=m.poster_url?`<img src="${escapeHtml(m.poster_url)}" alt="${escapeHtml(m.title)} poster" loading="lazy">`:`<div class="poster-art"><small>${escapeHtml(m.genre)}</small>${escapeHtml(m.title)}</div>`;
 return `<article class="movie-card"><a href="/movie.html?id=${m.id}"><div class="poster">${poster}<span class="rating">★ ${Number(m.rating).toFixed(1)}</span></div><div class="movie-info"><h3>${escapeHtml(m.title)}</h3><div class="movie-meta"><span>${m.year}</span><span>•</span><span class="movie-tag">${escapeHtml(m.genre)}</span><span>•</span><span>${escapeHtml(m.duration||"—")}</span></div></div></a></article>`}
async function loadHome(){
 try{
  const [featured,stats]=await Promise.all([api("/api/movies?sort=featured"), fetch("/api/admin/stats",{credentials:"same-origin"}).then(r=>r.ok?r.json():null)]);
  const movies=featured.movies||[];
  const grid=document.getElementById("featuredGrid");if(grid)grid.innerHTML=(movies.filter(x=>x.featured).length?movies.filter(x=>x.featured):movies.sort((a,b)=>b.rating-a.rating)).slice(0,4).map(movieCard).join("")||`<div class="empty">No movies yet. Visit the admin area to add your first title.</div>`;
  if(stats){document.getElementById("homeTotal").textContent=stats.total;document.getElementById("homeFeatured").textContent=stats.featured;document.getElementById("homeRating").textContent=stats.average}
 }catch(e){console.error(e)}
}
async function loadMovies(){
 const grid=document.getElementById("movieGrid"),loading=document.getElementById("loading");if(!grid)return;
 async function draw(){loading.style.display="block";grid.innerHTML="";
   try{const p=new URLSearchParams();if(document.getElementById("search").value.trim())p.set("search",document.getElementById("search").value.trim());if(document.getElementById("genre").value)p.set("genre",document.getElementById("genre").value);p.set("sort",document.getElementById("sort").value);
    const d=await api("/api/movies?"+p);loading.style.display="none";grid.innerHTML=d.movies.length?d.movies.map(movieCard).join(""):`<div class="empty">No movies found.</div>`;
   }catch(e){loading.textContent=e.message}
 }
 const g=qs.get("genre");if(g&&document.getElementById("genre"))document.getElementById("genre").value=g;
 ["search","genre","sort"].forEach(id=>document.getElementById(id)?.addEventListener("input",draw));draw();
}
async function loadMovie(){
 const root=document.getElementById("movieDetail");if(!root)return;
 try{const d=await api("/api/movies/"+encodeURIComponent(qs.get("id")||""));const m=d.movie;document.title=`SL Movies — ${m.title}`;
  const poster=m.poster_url?`<img src="${escapeHtml(m.poster_url)}" alt="${escapeHtml(m.title)} poster">`:`<div class="poster-art"><small>${escapeHtml(m.genre)}</small>${escapeHtml(m.title)}</div>`;
  let watch="";
  if(m.video_url)watch=`<div class="watch-box"><video controls playsinline preload="metadata" src="${escapeHtml(m.video_url)}"></video></div><div class="video-note">Server-hosted movie file. Playback depends on browser-supported video format.</div>`;
  else if(m.external_url)watch=`<div class="watch-actions"><a class="btn btn-primary" href="${escapeHtml(m.external_url)}" target="_blank" rel="noopener">Open movie link ↗</a></div>`;
  else watch=`<div class="video-note">No video source has been added yet.</div>`;
  root.innerHTML=`<section class="detail"><div class="detail-hero"><div class="detail-poster">${poster}</div><div class="detail-content"><span class="eyebrow">${escapeHtml(m.genre).toUpperCase()} • SL MOVIES</span><h1>${escapeHtml(m.title)}</h1><div class="pills"><span class="pill">📅 ${m.year}</span><span class="pill">⏱ ${escapeHtml(m.duration||"—")}</span><span class="pill rating">★ ${Number(m.rating).toFixed(1)}/10</span>${m.featured?'<span class="pill">FEATURED</span>':''}</div><p>${escapeHtml(m.description)}</p>${watch}<div class="watch-actions"><a class="btn btn-ghost" href="/movies.html">← Back to movies</a>${m.video_url?`<a class="btn btn-ghost" href="${escapeHtml(m.video_url)}" download>Download file ↓</a>`:""}</div></div></div></section>`;
 }catch(e){root.innerHTML=`<div class="page-shell"><div class="empty">${escapeHtml(e.message)}<br><br><a class="text-link" href="/movies.html">Back to movies →</a></div></div>`}
}
if(page==="home")loadHome();if(page==="movies")loadMovies();if(page==="movie")loadMovie();
})();