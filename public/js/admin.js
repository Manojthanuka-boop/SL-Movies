(() => {
const escapeHtml=(v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const qs=(s,r=document)=>r.querySelector(s);let csrf="";let editingId=null;
async function api(url,opts={}){
 const headers=new Headers(opts.headers||{});
 if(csrf)headers.set("X-CSRF-Token",csrf);
 const r=await fetch(url,{...opts,headers,credentials:"same-origin"});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Request failed");return d;
}
const toast=(msg,error=false)=>{let t=qs(".toast");if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t)}t.textContent=msg;t.classList.toggle("error",error);t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500)};
async function session(){
 try{const d=await fetch("/api/auth/me",{credentials:"same-origin"}).then(r=>r.json());if(document.body.dataset.page==="login"){if(d.authenticated)location.href="/admin.html";return d}
 if(!d.authenticated){location.href="/admin-login.html";return null}csrf=d.csrf;return d}catch(e){if(document.body.dataset.page!=="login")location.href="/admin-login.html"}
}
async function login(){
 const form=qs("#loginForm");if(!form)return;form.addEventListener("submit",async e=>{e.preventDefault();const msg=qs("#loginMsg");
 try{const fd=new FormData(form);const d=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:fd.get("username"),password:fd.get("password")}),credentials:"same-origin"}).then(async r=>{const x=await r.json();if(!r.ok)throw new Error(x.error);return x});
 csrf=d.csrf;msg.textContent="Signed in. Opening dashboard…";msg.className="form-message success";setTimeout(()=>location.href="/admin.html",300)}catch(err){msg.textContent=err.message;msg.className="form-message error"}});
}
async function dashboard(){
 const root=qs("#adminApp");if(!root)return;const me=await session();if(!me)return;
 root.innerHTML=`<section class="admin-top"><div><span class="eyebrow">PRIVATE CONTROL ROOM</span><h1>Admin Dashboard</h1><p>Welcome, ${escapeHtml(me.username)}. Manage your movie library.</p></div><div class="admin-actions"><a class="btn btn-ghost" href="/" target="_blank">View site ↗</a><button id="logout" class="btn btn-danger">Log out</button></div></section>
 <section class="admin-stat-grid"><div class="stat-card"><small>Total movies</small><strong id="sTotal">—</strong></div><div class="stat-card"><small>Featured</small><strong id="sFeatured">—</strong></div><div class="stat-card"><small>Average rating</small><strong id="sAverage">—</strong></div></section>
 <section class="admin-layout"><article class="panel"><h2 id="formTitle">Add new movie</h2><p class="panel-sub">Upload your poster and movie file. For best browser playback, MP4 (H.264/AAC) is recommended.</p>
 <form id="movieForm" enctype="multipart/form-data"><div class="form-grid">
 <label class="field">Title<input name="title" required placeholder="Movie title"></label><label class="field">Year<input name="year" required type="number" min="1900" max="2100"></label>
 <label class="field">Rating<input name="rating" required type="number" min="0" max="10" step="0.1" value="8.0"></label>
 <label class="field">Genre<select name="genre"><option>Action</option><option>Drama</option><option>Comedy</option><option>Thriller</option><option>Sci-Fi</option><option>Romance</option><option>Animation</option><option>Adventure</option><option>Horror</option><option>Documentary</option><option>Family</option><option>Crime</option></select></label>
 <label class="field">Duration<input name="duration" placeholder="2h 10m"></label><label class="field">External URL<input name="external_url" placeholder="Optional https://..."></label>
 <label class="field field-full">Poster<input name="poster" type="file" accept="image/*"><small class="file-help">JPG / PNG / WEBP / AVIF</small></label>
 <label class="field field-full">Movie file<input name="movie" type="file" accept="video/*"><small class="file-help">MP4 / WebM / OGG / MOV / MKV • max 3 GB</small></label>
 <label class="field field-full">Description<textarea name="description" rows="6" required placeholder="Movie description"></textarea></label>
 </div><label class="field-checkbox"><input type="checkbox" name="featured" value="1"> Mark as featured</label>
 <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" type="submit" id="submitBtn">Save movie →</button><button class="btn btn-ghost" type="button" id="cancelEdit" hidden>Cancel edit</button></div>
 <div id="formMsg" class="form-message"></div></form></article>
 <aside class="panel"><h2>Your catalog</h2><p class="panel-sub">Edit, feature or delete uploaded movies.</p><div id="adminList" class="admin-list"></div></aside></section>`;
 qs("#passwordForm").onsubmit=async(e)=>{e.preventDefault();const form=e.currentTarget,msg=qs("#passwordMsg");const fd=new FormData(form);
   try{await api("/api/admin/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({current_password:fd.get("current_password"),new_password:fd.get("new_password")})});msg.textContent="Password updated.";msg.className="form-message success";form.reset()}
   catch(err){msg.textContent=err.message;msg.className="form-message error"}
 };
 qs("#logout").onclick=async()=>{try{await api("/api/auth/logout",{method:"POST"});location.href="/"}catch(e){toast(e.message,true)}};
 qs("#cancelEdit").onclick=()=>resetForm();
 qs("#movieForm").onsubmit=saveMovie;
 await refresh();
}
async function refresh(){
 try{const d=await api("/api/admin/stats");qs("#sTotal").textContent=d.total;qs("#sFeatured").textContent=d.featured;qs("#sAverage").textContent=d.average;renderList(d.latest);loadAllAdminMovies()}catch(e){toast(e.message,true)}
}
async function loadAllAdminMovies(){try{const d=await api("/api/movies?sort=oldest");renderList(d.movies)}catch(e){}}
function renderList(items){
 const box=qs("#adminList");if(!box)return;if(!items.length){box.innerHTML='<div class="empty">No movies added yet.</div>';return}
 box.innerHTML=items.map(m=>`<div class="admin-item"><div class="admin-thumb">${m.poster_url?`<img src="${escapeHtml(m.poster_url)}" alt="">`:"🎬"}</div><div><h3>${escapeHtml(m.title)}</h3><small>${m.year} • ${escapeHtml(m.genre)} • ★ ${Number(m.rating).toFixed(1)}${m.featured?" • FEATURED":""}</small></div><div class="admin-buttons"><button class="mini-btn blue" data-edit="${m.id}">Edit</button><button class="mini-btn" data-feature="${m.id}">${m.featured?"Unfeature":"Feature"}</button><button class="mini-btn red" data-delete="${m.id}">Delete</button></div></div>`).join("");
 box.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editMovie(b.dataset.edit));
 box.querySelectorAll("[data-feature]").forEach(b=>b.onclick=()=>toggleFeatured(b.dataset.feature));
 box.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteMovie(b.dataset.delete));
}
async function allMovie(id){return (await api("/api/movies/"+id)).movie}
async function editMovie(id){
 try{const m=await allMovie(id);editingId=m.id;const f=qs("#movieForm");f.title.value=m.title;f.year.value=m.year;f.rating.value=m.rating;f.genre.value=m.genre;f.duration.value=m.duration||"";f.external_url.value=m.external_url||"";f.description.value=m.description;f.featured.checked=!!m.featured;
 qs("#formTitle").textContent="Edit movie";qs("#submitBtn").textContent="Update movie →";qs("#cancelEdit").hidden=false;window.scrollTo({top:0,behavior:"smooth"})
 }catch(e){toast(e.message,true)}
}
function resetForm(){editingId=null;qs("#movieForm").reset();qs("#formTitle").textContent="Add new movie";qs("#submitBtn").textContent="Save movie →";qs("#cancelEdit").hidden=true}
async function saveMovie(e){
 e.preventDefault();const f=qs("#movieForm"),msg=qs("#formMsg");const data=new FormData(f);
 try{msg.textContent=editingId?"Updating…":"Uploading…";
  const opts={method:editingId?"PUT":"POST",body:data,credentials:"same-origin"};
  if(csrf){const headers=new Headers();headers.set("X-CSRF-Token",csrf);opts.headers=headers;}
  const r=await fetch(editingId?`/api/admin/movies/${editingId}`:"/api/admin/movies",opts);
  let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Request failed");
  toast(editingId?"Movie updated.":"Movie uploaded.");resetForm();await refresh()}catch(err){msg.textContent=err.message;msg.className="form-message error";toast(err.message,true)}
}
async function toggleFeatured(id){try{const m=await allMovie(id);await api(`/api/admin/movies/${id}/featured`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({featured:!m.featured})});toast(m.featured?"Removed from featured.":"Added to featured.");await refresh()}catch(e){toast(e.message,true)}}
async function deleteMovie(id){if(!confirm("Delete this movie and its uploaded files?"))return;try{await api(`/api/admin/movies/${id}`,{method:"DELETE"});toast("Movie deleted.");await refresh()}catch(e){toast(e.message,true)}}
login();dashboard();
})();
