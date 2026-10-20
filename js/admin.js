// 교사 관리자 페이지 로직

let currentUser = null;
let allRows = [];
let myGrade = null; // '1' / '2' / '3' / 'ALL' / null(미등록)

async function initAdmin() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("backupBtn").addEventListener("click", () => runBackup());
  ["statusFilter", "classFilter", "gradeFilter"].forEach((id) =>
    document.getElementById(id).addEventListener("change", onFilterChange)
  );
  document.getElementById("searchInput").addEventListener("input", onFilterChange);
  document.getElementById("reloadBtn").addEventListener("click", reloadList);
  document.getElementById("list").addEventListener("click", handleListClick);
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
      const sameUser = currentUser && currentUser.id === session.user.id;
      currentUser = session.user;
      if (!sameUser) showAdmin(); // 같은 계정의 토큰 갱신/탭 복귀 때는 목록을 다시 불러오지 않는다
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

  reloadList();
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

const PAGE_SIZE = 60; // 한 번에 화면에 그리는 카드 수 (글이 수천 건이어도 휴대폰에서 느려지지 않게)
let visibleCount = PAGE_SIZE;

// 서버에서 내가 볼 수 있는 전체 글을 가져온다 (1000건씩 나눠서 끝까지)
async function reloadList() {
  document.getElementById("list").innerHTML = "<p>불러오는 중...</p>";
  const { data, error } = await fetchAllPages(() =>
    supabaseClient
      .from("observations")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id")
  );
  if (error) {
    console.error(error);
    alert("데이터를 불러오지 못했습니다: " + error.message);
    allRows = [];
  } else {
    allRows = data;
  }
  renderList();
}

function onFilterChange() {
  visibleCount = PAGE_SIZE;
  renderList();
}

// 이름/띄어쓰기/대소문자 차이를 무시하고 비교하기 위한 정리
function normalizeForSearch(text) {
  return String(text ?? "").normalize("NFC").toLowerCase().replace(/[\s 　​﻿]+/g, "");
}

// 이미 불러온 목록을 필터·검색 조건에 맞게 화면에 다시 그린다 (서버 재조회 없음)
function renderList() {
  const listEl = document.getElementById("list");
  const statusFilter = document.getElementById("statusFilter").value;
  const classFilter = document.getElementById("classFilter").value;
  const gradeFilter = document.getElementById("gradeFilter").value;
  const keyword = normalizeForSearch(document.getElementById("searchInput").value);

  let rows = allRows;
  if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
  if (classFilter !== "all") rows = rows.filter((r) => r.class_name === classFilter);
  if (gradeFilter !== "all") rows = rows.filter((r) => r.grade === gradeFilter);
  if (keyword) {
    rows = rows.filter(
      (r) => normalizeForSearch(r.student_name).includes(keyword) || normalizeForSearch(r.plant_name).includes(keyword)
    );
  }

  const pendingCount = allRows.filter((r) => r.status === "pending").length;
  document.getElementById("countInfo").textContent =
    `전체 ${allRows.length}건 · 대기 ${pendingCount}건 · 조건에 맞는 글 ${rows.length}건`;

  if (rows.length === 0) {
    listEl.innerHTML = "<p>게시물이 없습니다.</p>";
    return;
  }

  const shown = rows.slice(0, visibleCount);
  listEl.innerHTML =
    shown.map(renderCard).join("") +
    (rows.length > shown.length
      ? `<div class="more-wrap"><button type="button" class="btn btn-secondary" data-action="more">더 보기 (${shown.length}/${rows.length})</button></div>`
      : "");
}

function handleListClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  switch (btn.dataset.action) {
    case "approve":
      approveRow(id);
      break;
    case "edit":
      openEditModal(id);
      break;
    case "delete":
      deleteRow(id, allRows.find((r) => r.id === id)?.photo_path);
      break;
    case "more":
      visibleCount += PAGE_SIZE;
      renderList();
      break;
  }
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
        ${r.edited_at ? `<div class="card-field"><b>수정됨</b> ${escapeHtml(formatDateTime(r.edited_at))}</div>` : ""}
        <div class="card-taxon">종/속/과/목/강/문/계: ${taxonRow}</div>
        <div class="card-field"><b>위치</b> <a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" rel="noopener">${formatLatLng(r.lat, r.lng)}</a></div>
        <div class="card-field"><b>서식지</b> ${escapeHtml(r.habitat || "-")}</div>
        <div class="card-field"><b>형태</b> ${escapeHtml(r.morphology || "-")}</div>
        <div class="card-field"><b>특징</b> ${escapeHtml(r.characteristics || "-")}</div>
        <div class="card-field"><b>습성</b> ${escapeHtml(r.behavior || "-")}</div>
        <div class="card-actions">
          ${r.status !== "approved" ? `<button type="button" data-action="approve" data-id="${r.id}" class="btn btn-approve">승인</button>` : ""}
          <button type="button" data-action="edit" data-id="${r.id}" class="btn btn-secondary">수정</button>
          <button type="button" data-action="delete" data-id="${r.id}" class="btn btn-delete">삭제</button>
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
  reloadList();
}

async function approveRow(id) {
  const { data, error } = await supabaseClient
    .from("observations")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUser?.id,
    })
    .eq("id", id)
    .select("id");
  if (error || !data || data.length === 0) {
    alert("승인 실패: " + (error ? error.message : "승인 권한이 없거나 이미 삭제된 글입니다."));
    return;
  }
  reloadList();
}

async function deleteRow(id, photoPath) {
  if (!confirm("정말 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
  // 글을 먼저 지우고, 지워진 것이 확인되면 사진을 지운다 (글 삭제가 실패했는데 사진만 사라지는 일을 막기 위해)
  const { data, error } = await supabaseClient.from("observations").delete().eq("id", id).select("id");
  if (error || !data || data.length === 0) {
    alert("삭제 실패: " + (error ? error.message : "삭제 권한이 없거나 이미 삭제된 글입니다."));
    return;
  }
  if (photoPath) {
    await supabaseClient.storage.from(CONFIG.PHOTO_BUCKET).remove([photoPath]);
  }
  reloadList();
}

document.addEventListener("DOMContentLoaded", initAdmin);
