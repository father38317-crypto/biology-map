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

  if (local.length === 0) {
    listEl.innerHTML = '<p class="my-empty">이 기기에서 등록한 기록이 아직 없어요.<br />기록을 올리면 여기에서 승인 상태와 수정 여부를 볼 수 있어요.</p>';
    statusEl.textContent = "";
    return;
  }

  listEl.innerHTML = local.map((r) => renderMyRecord(r, null, "loading")).join("");
  statusEl.textContent = "상태를 확인하는 중...";

  const { data, error } = await supabasePublic.rpc("get_my_observations", { p_ids: local.map((r) => r.id) });
  if (error) {
    statusEl.textContent = "상태를 확인하지 못했어요. 잠시 후 다시 열어보세요. (" + error.message + ")";
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

function initMyRecords() {
  document.getElementById("myRecordsBtn").addEventListener("click", openMyRecords);
  document.getElementById("closeMyBtn").addEventListener("click", closeMyRecords);
  document.getElementById("clearMyBtn").addEventListener("click", () => {
    if (!confirm("이 기기에 저장된 '내 기록' 목록을 지울까요?\n(지도에 올라간 글은 지워지지 않아요.)")) return;
    saveMyRecords([]);
    openMyRecords();
  });
  document.getElementById("myRecordsList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-locate]");
    if (!btn) return;
    closeMyRecords();
    switchGrade(btn.dataset.grade);
    map.setView([Number(btn.dataset.lat), Number(btn.dataset.lng)], CONFIG.DEFAULT_ZOOM);
  });
}

document.addEventListener("DOMContentLoaded", initMyRecords);
