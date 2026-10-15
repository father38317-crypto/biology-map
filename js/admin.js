// 교사 관리자 페이지 로직

let currentUser = null;
let allRows = [];
let myGrade = null; // '1' / '2' / '3' / 'ALL' / null(미등록)

async function initAdmin() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("backupBtn").addEventListener("click", () => runBackup());
  document.getElementById("statusFilter").addEventListener("change", renderList);
  document.getElementById("classFilter").addEventListener("change", renderList);
  document.getElementById("gradeFilter").addEventListener("change", renderList);
  document.getElementById("changePwBtn").addEventListener("click", () => {
    document.getElementById("changePwSection").hidden = false;
  });
  document.getElementById("cancelChangePwBtn").addEventListener("click", () => {
    document.getElementById("changePwSection").hidden = true;
    document.getElementById("changePwForm").reset();
    document.getElementById("changePwStatus").textContent = "";
  });
  document.getElementById("changePwForm").addEventListener("submit", handleChangePassword);
  document.getElementById("closeEditBtn").addEventListener("click", closeEditModal);
  document.getElementById("cancelEditBtn").addEventListener("click", closeEditModal);
  document.getElementById("editForm").addEventListener("submit", handleEditSubmit);
  buildClassFilterOptions();
  buildGradeFilterOptions();

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

async function handleChangePassword(e) {
  e.preventDefault();
  const newPassword = document.getElementById("newPassword").value;
  const confirm = document.getElementById("newPasswordConfirm").value;
  const statusEl = document.getElementById("changePwStatus");

  if (newPassword !== confirm) {
    statusEl.textContent = "두 비밀번호가 서로 다릅니다.";
    statusEl.classList.add("error");
    return;
  }

  statusEl.textContent = "변경 중...";
  statusEl.classList.remove("error");

  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) {
    statusEl.textContent = "변경 실패: " + error.message;
    statusEl.classList.add("error");
    return;
  }

  statusEl.textContent = "비밀번호가 변경되었습니다.";
  document.getElementById("changePwForm").reset();
  setTimeout(() => {
    document.getElementById("changePwSection").hidden = true;
    statusEl.textContent = "";
  }, 1500);
}

function showLogin() {
  document.getElementById("loginSection").hidden = false;
  document.getElementById("adminSection").hidden = true;
}

async function showAdmin() {
  document.getElementById("loginSection").hidden = true;
  document.getElementById("adminSection").hidden = false;

  const { data, error } = await supabaseClient
    .from("teachers")
    .select("grade")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  myGrade = error ? null : data?.grade ?? null;

  const gradeInfoEl = document.getElementById("myGradeInfo");
  if (!myGrade) {
    gradeInfoEl.textContent = "⚠ 담당 학년이 등록되지 않았습니다. 관리자에게 문의하세요 (schema.sql 4번 참고).";
  } else {
    gradeInfoEl.textContent = myGrade === "ALL" ? "담당: 전체 학년" : `담당: ${gradeLabel(myGrade)}`;
  }

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

function buildGradeFilterOptions() {
  const sel = document.getElementById("gradeFilter");
  CONFIG.GRADES.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.label;
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
  const gradeFilter = document.getElementById("gradeFilter").value;

  let rows = allRows;
  if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
  if (classFilter !== "all") rows = rows.filter((r) => r.class_name === classFilter);
  if (gradeFilter !== "all") rows = rows.filter((r) => r.grade === gradeFilter);

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
    document.getElementById(`edit-${r.id}`).addEventListener("click", () => openEditModal(r.id));
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
        <div class="card-title">${escapeHtml(r.plant_name)} <span class="badge">${statusLabel(r.status)}</span>${r.author_type === "teacher" ? ' <span class="teacher-badge">교사</span>' : ""}</div>
        <div class="card-meta">${escapeHtml(gradeLabel(r.grade))} ${escapeHtml(classLabel(r.class_name))} · ${escapeHtml(r.student_name)} · ${new Date(r.created_at).toLocaleString("ko-KR")}</div>
        <div class="card-taxon">종/속/과/목/강/문/계: ${taxonRow}</div>
        <div class="card-field"><b>위치</b> <a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" rel="noopener">${formatLatLng(r.lat, r.lng)}</a></div>
        <div class="card-field"><b>서식지</b> ${escapeHtml(r.habitat || "-")}</div>
        <div class="card-field"><b>형태</b> ${escapeHtml(r.morphology || "-")}</div>
        <div class="card-field"><b>특징</b> ${escapeHtml(r.characteristics || "-")}</div>
        <div class="card-field"><b>습성</b> ${escapeHtml(r.behavior || "-")}</div>
        <div class="card-actions">
          ${r.status !== "approved" ? `<button id="approve-${r.id}" class="btn btn-approve">승인</button>` : ""}
          <button id="edit-${r.id}" class="btn btn-secondary">수정</button>
          <button id="delete-${r.id}" class="btn btn-delete">삭제</button>
        </div>
      </div>
    </div>`;
}

let editingId = null;

function openEditModal(id) {
  const r = allRows.find((row) => row.id === id);
  if (!r) return;
  editingId = id;
  const form = document.getElementById("editForm");

  const gradeSel = document.getElementById("editGrade");
  gradeSel.innerHTML = "";
  CONFIG.GRADES.filter((g) => myGrade === "ALL" || g.id === myGrade).forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.label;
    gradeSel.appendChild(opt);
  });

  const classSel = document.getElementById("editClass");
  if (!classSel.options.length) {
    CONFIG.CLASSES.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.label;
      classSel.appendChild(opt);
    });
  }

  [
    "student_name", "plant_name", "habitat", "morphology", "characteristics", "behavior",
    "taxon_species", "taxon_genus", "taxon_family", "taxon_order", "taxon_class", "taxon_phylum", "taxon_kingdom",
    "lat", "lng", "grade", "class_name",
  ].forEach((name) => {
    form.elements[name].value = r[name] ?? "";
  });

  document.getElementById("editStatus").textContent = "";
  document.getElementById("editModal").hidden = false;
}

function closeEditModal() {
  document.getElementById("editModal").hidden = true;
  editingId = null;
}

async function handleEditSubmit(e) {
  e.preventDefault();
  if (!editingId) return;

  const fd = new FormData(e.target);
  const text = (key) => String(fd.get(key) ?? "").trim();
  const optional = (key) => text(key) || null;
  const statusEl = document.getElementById("editStatus");
  const saveBtn = document.getElementById("saveEditBtn");

  const lat = parseFloat(fd.get("lat"));
  const lng = parseFloat(fd.get("lng"));
  if (!text("student_name") || !text("plant_name")) {
    statusEl.textContent = "이름과 생물 이름은 비워둘 수 없습니다.";
    statusEl.classList.add("error");
    return;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    statusEl.textContent = "위도(-90~90)와 경도(-180~180)를 올바르게 입력해주세요.";
    statusEl.classList.add("error");
    return;
  }

  const updates = {
    student_name: text("student_name"),
    grade: text("grade"),
    class_name: text("class_name"),
    plant_name: text("plant_name"),
    lat,
    lng,
    taxon_species: optional("taxon_species"),
    taxon_genus: optional("taxon_genus"),
    taxon_family: optional("taxon_family"),
    taxon_order: optional("taxon_order"),
    taxon_class: optional("taxon_class"),
    taxon_phylum: optional("taxon_phylum"),
    taxon_kingdom: optional("taxon_kingdom"),
    habitat: optional("habitat"),
    morphology: optional("morphology"),
    characteristics: optional("characteristics"),
    behavior: optional("behavior"),
  };

  saveBtn.disabled = true;
  statusEl.textContent = "저장 중...";
  statusEl.classList.remove("error");

  const { data, error } = await supabaseClient
    .from("observations")
    .update(updates)
    .eq("id", editingId)
    .select("id");

  saveBtn.disabled = false;
  if (error) {
    statusEl.textContent = "저장 실패: " + error.message;
    statusEl.classList.add("error");
    return;
  }
  if (!data || data.length === 0) {
    statusEl.textContent = "저장되지 않았습니다. 수정 권한이 없거나 이미 삭제된 게시물입니다.";
    statusEl.classList.add("error");
    return;
  }

  closeEditModal();
  renderList();
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
