// "내 기록": 이 기기에서 등록한 글의 승인 상태와 수정 여부 확인
// 글을 올릴 때 만든 무작위 ID를 이 기기에만 저장해 두고, 그 ID로만 서버(get_my_observations)에 상태를 물어본다.

const MY_RECORDS_KEY = "bioMapMyRecords";
const MY_RECORDS_MAX = 50;

function loadMyRecords() {
  try {
    return JSON.parse(localStorage.getItem(MY_RECORDS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveMyRecords(list) {
  try {
    localStorage.setItem(MY_RECORDS_KEY, JSON.stringify(list.slice(0, MY_RECORDS_MAX)));
  } catch {
    // 사생활 보호 모드 등으로 저장이 막힌 경우: 기록 확인만 못 할 뿐 등록에는 영향 없음
  }
}

function rememberMyRecord(record) {
  saveMyRecords([record, ...loadMyRecords().filter((r) => r.id !== record.id)]);
}

// state: "loading"(확인 중) | "found"(서버 정보 있음) | "missing"(서버에 없음)
function renderMyRecord(local, server, state) {
  const info = server || local;
  let statusHtml;
  let noteHtml = "";

  if (state === "loading") {
    statusHtml = '<span class="my-badge">확인 중...</span>';
  } else if (state === "unknown") {
    statusHtml = '<span class="my-badge">확인 불가</span>';
  } else if (state === "missing") {
    statusHtml = '<span class="my-badge gone">확인할 수 없음</span>';
    noteHtml = '<div class="my-line">선생님이 삭제했거나 서버에서 찾을 수 없는 글이에요.</div>';
  } else if (server.status === "approved") {
    statusHtml = `<span class="my-badge ok">✅ 승인됨</span>`;
    noteHtml = server.reviewed_at ? `<div class="my-line">승인 시각 ${escapeHtml(formatDateTime(server.reviewed_at))}</div>` : "";
  } else {
    statusHtml = '<span class="my-badge wait">⏳ 승인 대기중</span>';
    noteHtml = '<div class="my-line">선생님이 확인하면 모두에게 지도에 표시돼요.</div>';
  }

  let editedHtml = "";
  if (state === "found") {
    editedHtml = server.edited_at
      ? `<div class="my-line edited">✏️ 선생님이 내용을 수정했어요 · ${escapeHtml(formatDateTime(server.edited_at))}</div>`
      : '<div class="my-line">수정 없음</div>';
  }

  const canLocate = state !== "missing" && info.lat != null && info.lng != null;
  return `
    <div class="my-record">
      <div class="my-record-top">
        <strong>${escapeHtml(info.plant_name)}</strong>
        ${statusHtml}
      </div>
      <div class="my-line">${escapeHtml(gradeLabel(info.grade))} ${escapeHtml(classLabel(info.class_name))} · ${escapeHtml(info.student_name)} · 등록 ${escapeHtml(formatDateTime(local.created_at))}</div>
      ${noteHtml}
      ${editedHtml}
      ${canLocate ? `<button type="button" class="btn btn-secondary my-locate" data-locate data-lat="${info.lat}" data-lng="${info.lng}" data-grade="${escapeHtml(info.grade)}">지도에서 보기</button>` : ""}
    </div>`;
}

async function openMyRecords() {
  document.getElementById("myModal").hidden = false;
  const listEl = document.getElementById("myRecordsList");
  const statusEl = document.getElementById("myRecordsStatus");
  const local = loadMyRecords();

  prefillSearchFields(local[0]);

  if (local.length === 0) {
    listEl.innerHTML = '<p class="my-empty">이 기기에서 등록한 기록이 아직 없어요.<br />위에서 이름으로 찾아보거나, 기록을 올린 뒤 다시 열어보세요.</p>';
    statusEl.textContent = "";
    return;
  }

  listEl.innerHTML = local.map((r) => renderMyRecord(r, null, "loading")).join("");
  statusEl.textContent = "상태를 확인하는 중...";

  const { data, error } = await supabasePublic.rpc("get_my_observations", { p_ids: local.map((r) => r.id) });
  if (error) {
    statusEl.textContent = rpcErrorMessage(error);
    listEl.innerHTML = local.map((r) => renderMyRecord(r, null, "unknown")).join("");
    return;
  }

  const byId = new Map(data.map((row) => [row.id, row]));
  listEl.innerHTML = local
    .map((r) => {
      const server = byId.get(r.id);
      return renderMyRecord(r, server || null, server ? "found" : "missing");
    })
    .join("");
  statusEl.textContent = "";
}

function closeMyRecords() {
  document.getElementById("myModal").hidden = true;
}

function rpcErrorMessage(error) {
  if (/could not find the function|schema cache/i.test(error.message || "")) {
    return "아직 관리자 설정(데이터베이스 업데이트)이 끝나지 않았어요. 선생님께 알려주세요.";
  }
  return "불러오지 못했어요. 잠시 후 다시 시도해 주세요. (" + error.message + ")";
}

// 검색칸이 비어 있으면 가장 최근에 이 기기에서 올린 글의 이름/학년/반으로 미리 채워준다
// 반은 잘못 골라 올린 경우도 찾을 수 있도록 기본을 "전체 반"으로 둔다
function prefillSearchFields(latest) {
  const nameInput = document.getElementById("searchName");
  if (nameInput.value) return;
  if (latest) {
    nameInput.value = latest.student_name;
    document.getElementById("searchGrade").value = latest.grade;
  } else {
    document.getElementById("searchGrade").value = activeViewGrade;
  }
}

async function handleNameSearch(e) {
  e.preventDefault();
  const name = document.getElementById("searchName").value.trim();
  const grade = document.getElementById("searchGrade").value;
  const cls = document.getElementById("searchClass").value;
  const statusEl = document.getElementById("searchStatus");
  const resultsEl = document.getElementById("searchResults");

  if (name.replace(/\s/g, "").length < 2) {
    statusEl.textContent = "이름을 두 글자 이상 입력해 주세요.";
    resultsEl.innerHTML = "";
    return;
  }

  statusEl.textContent = "찾는 중...";
  resultsEl.innerHTML = "";
  const { data, error } = await supabasePublic.rpc("find_observations_by_name", {
    p_name: name,
    p_grade: grade,
    p_class: cls,
  });
  if (error) {
    statusEl.textContent = rpcErrorMessage(error);
    return;
  }
  if (data.length === 0) {
    statusEl.textContent =
      "찾는 글이 없어요. 이름(띄어쓰기는 상관없어요)과 학년을 다시 확인해 보세요. 반을 잘못 골라 올렸을 수 있으니 '전체 반'으로도 찾아보세요. 선생님이 삭제한 글은 보이지 않아요.";
    return;
  }
  const where = cls ? `${gradeLabel(grade)} ${classLabel(cls)}` : `${gradeLabel(grade)} 전체 반`;
  statusEl.textContent = `${where} ${name} 학생의 글 ${data.length}건을 찾았어요. 반이 다르게 올라가 있으면 선생님께 알려주세요.`;
  resultsEl.innerHTML = data.map((r) => renderMyRecord(r, r, "found")).join("");
}

function fillSelect(selectEl, items) {
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.label;
    selectEl.appendChild(opt);
  });
}

function initMyRecords() {
  fillSelect(document.getElementById("searchGrade"), CONFIG.GRADES);
  document.getElementById("searchClass").appendChild(new Option("전체 반", ""));
  fillSelect(document.getElementById("searchClass"), CONFIG.CLASSES);
  document.getElementById("nameSearchForm").addEventListener("submit", handleNameSearch);
  document.getElementById("searchResults").addEventListener("click", handleLocateClickInList);
  document.getElementById("myRecordsBtn").addEventListener("click", openMyRecords);
  document.getElementById("closeMyBtn").addEventListener("click", closeMyRecords);
  document.getElementById("clearMyBtn").addEventListener("click", () => {
    if (!confirm("이 기기에 저장된 '내 기록' 목록을 지울까요?\n(지도에 올라간 글은 지워지지 않아요.)")) return;
    saveMyRecords([]);
    openMyRecords();
  });
  document.getElementById("myRecordsList").addEventListener("click", handleLocateClickInList);
}

function handleLocateClickInList(e) {
  const btn = e.target.closest("[data-locate]");
  if (!btn) return;
  closeMyRecords();
  switchGrade(btn.dataset.grade);
  map.setView([Number(btn.dataset.lat), Number(btn.dataset.lng)], CONFIG.DEFAULT_ZOOM);
}

document.addEventListener("DOMContentLoaded", initMyRecords);
