// 교사 관리자 페이지 로직

let currentUser = null;
let allRows = [];

async function initAdmin() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("backupBtn").addEventListener("click", () => runBackup());
  document.getElementById("statusFilter").addEventListener("change", renderList);
  document.getElementById("classFilter").addEventListener("change", renderList);
  buildClassFilterOptions();

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    showAdmin();
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) {
      currentUser = session.user;
      showAdmin();
    } else {
      currentUser = null;
      showLogin();
    }
  });
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) errEl.textContent = "로그인 실패: " + error.message;
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
}

function showLogin() {
  document.getElementById("loginSection").hidden = false;
  document.getElementById("adminSection").hidden = true;
}

function showAdmin() {
  document.getElementById("loginSection").hidden = true;
  document.getElementById("adminSection").hidden = false;
  renderList();
}

function buildClassFilterOptions() {
  const sel = document.getElementById("classFilter");
  CONFIG.CLASSES.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    sel.appendChild(opt);
  });
}

async function fetchAll() {
  const { data, error } = await supabaseClient
    .from("observations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    alert("데이터를 불러오지 못했습니다: " + error.message);
    return [];
  }
  return data;
}

async function renderList() {
  const listEl = document.getElementById("list");
  listEl.innerHTML = "<p>불러오는 중...</p>";
  allRows = await fetchAll();

  const statusFilter = document.getElementById("statusFilter").value;
  const classFilter = document.getElementById("classFilter").value;

  let rows = allRows;
  if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
  if (classFilter !== "all") rows = rows.filter((r) => r.class_name === classFilter);

  const pendingCount = allRows.filter((r) => r.status === "pending").length;
  document.getElementById("countInfo").textContent =
    `전체 ${allRows.length}건 · 대기 ${pendingCount}건 · 표시 중 ${rows.length}건`;

  if (rows.length === 0) {
    listEl.innerHTML = "<p>게시물이 없습니다.</p>";
    return;
  }

  listEl.innerHTML = rows.map(renderCard).join("");

  rows.forEach((r) => {
    const approveBtn = document.getElementById(`approve-${r.id}`);
    if (approveBtn) approveBtn.addEventListener("click", () => approveRow(r.id));
    document.getElementById(`delete-${r.id}`).addEventListener("click", () => deleteRow(r.id, r.photo_path));
  });
}

function renderCard(r) {
  const url = photoPublicUrl(r.photo_path);
  const taxonRow = [
    r.taxon_species,
    r.taxon_genus,
    r.taxon_family,
    r.taxon_order,
    r.taxon_class,
    r.taxon_phylum,
    r.taxon_kingdom,
  ]
    .map((v) => escapeHtml(v || "-"))
    .join(" / ");

  return `
    <div class="card status-${r.status}">
      ${url ? `<img class="thumb" src="${url}" alt="사진" loading="lazy">` : '<div class="thumb thumb-empty">사진 없음</div>'}
      <div class="card-body">
        <div class="card-title">${escapeHtml(r.plant_name)} <span class="badge">${statusLabel(r.status)}</span></div>
        <div class="card-meta">${escapeHtml(classLabel(r.class_name))} · ${escapeHtml(r.student_name)} · ${new Date(r.created_at).toLocaleString("ko-KR")}</div>
        <div class="card-taxon">종/속/과/목/강/문/계: ${taxonRow}</div>
        <div class="card-field"><b>위치</b> <a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" rel="noopener">${formatLatLng(r.lat, r.lng)}</a></div>
        <div class="card-field"><b>서식지</b> ${escapeHtml(r.habitat || "-")}</div>
        <div class="card-field"><b>형태</b> ${escapeHtml(r.morphology || "-")}</div>
        <div class="card-field"><b>특징</b> ${escapeHtml(r.characteristics || "-")}</div>
        <div class="card-field"><b>습성</b> ${escapeHtml(r.behavior || "-")}</div>
        <div class="card-actions">
          ${r.status !== "approved" ? `<button id="approve-${r.id}" class="btn btn-approve">승인</button>` : ""}
          <button id="delete-${r.id}" class="btn btn-delete">삭제</button>
        </div>
      </div>
    </div>`;
}

async function approveRow(id) {
  const { error } = await supabaseClient
    .from("observations")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUser?.id,
    })
    .eq("id", id);
  if (error) {
    alert("승인 실패: " + error.message);
    return;
  }
  renderList();
}

async function deleteRow(id, photoPath) {
  if (!confirm("정말 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
  if (photoPath) {
    await supabaseClient.storage.from(CONFIG.PHOTO_BUCKET).remove([photoPath]);
  }
  const { error } = await supabaseClient.from("observations").delete().eq("id", id);
  if (error) {
    alert("삭제 실패: " + error.message);
    return;
  }
  renderList();
}

document.addEventListener("DOMContentLoaded", initAdmin);
