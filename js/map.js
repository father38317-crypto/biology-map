// 학생용 지도 페이지 로직

let map;
let tempMarker = null;
let pendingClickLatLng = null;
const classLayers = {}; // classId -> L.layerGroup
const activeClassIds = new Set(CONFIG.CLASSES.map((c) => c.id));
let activeViewGrade = CONFIG.GRADES[0].id;
let userPickedGrade = false; // 학년 탭을 직접 눌렀는지 (눌렀을 때만 등록창의 학년을 그 탭으로 미리 채움)
let lastChoice = null; // 이 화면에서 방금 글을 올릴 때 고른 { grade, class_name } (이름은 다른 학생이 이어서 쓸 수 있어 저장하지 않음)
let isTeacher = false;
let teacherGrade = null; // '1' / '2' / '3' / 'ALL'
let teacherUserId = null;
let accuracyCircle = null;
let pendingLocationInfo = null; // { source: "click" | "gps", accuracy?: number }

function makeDivIcon(color, opts = {}) {
  const dashedClass = opts.dashed ? " dashed-marker" : "";
  const teacherClass = opts.teacher ? " teacher-pin" : "";
  return L.divIcon({
    className: "",
    html: `<span class="pin${dashedClass}${teacherClass}" style="background:${color}"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

function makeClusterIcon(cluster, color) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 32 : count < 50 ? 38 : 44;
  return L.divIcon({
    className: "",
    html: `<div class="cluster-pin" style="background:${color};width:${size}px;height:${size}px;line-height:${size}px;">${count}</div>`,
    iconSize: [size, size],
  });
}

function initMap() {
  map = L.map("map").setView([CONFIG.SCHOOL_LAT, CONFIG.SCHOOL_LNG], CONFIG.DEFAULT_ZOOM);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    className: "pastel-tiles",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  L.marker([CONFIG.SCHOOL_LAT, CONFIG.SCHOOL_LNG], {
    icon: L.divIcon({
      className: "",
      html: '<span class="school-pin">🏫</span>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    }),
    interactive: false,
  }).addTo(map);

  CONFIG.CLASSES.forEach((c) => {
    classLayers[c.id] = L.markerClusterGroup({
      maxClusterRadius: 45,
      iconCreateFunction: (cluster) => makeClusterIcon(cluster, c.color),
    }).addTo(map);
  });

  populateClassSelect();
  populateGradeSelect();
  buildGradeTabs();
  buildFilterBar();
  loadApprovedObservations();
  detectTeacher();
  supabaseClient.auth.onAuthStateChange(() => detectTeacher());

  map.on("click", onMapClick);

  document.getElementById("entryForm").addEventListener("submit", handleSubmit);
  document.getElementById("cancelBtn").addEventListener("click", closeEntryModal);
  document.getElementById("closeModalBtn").addEventListener("click", closeEntryModal);
  document.getElementById("photoInput").addEventListener("change", handlePhotoPreview);
  document.getElementById("locateBtn").addEventListener("click", handleLocateClick);
  document.getElementById("teacherLogoutBtn").addEventListener("click", () => supabaseClient.auth.signOut());
}

// 교사 계정으로 로그인된 브라우저인지 확인 (teachers 테이블에 본인 행이 있으면 교사)
async function detectTeacher() {
  let grade = null;
  let userId = null;
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session) {
    const { data } = await supabaseClient
      .from("teachers")
      .select("grade")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (data) {
      grade = data.grade;
      userId = session.user.id;
    }
  }
  isTeacher = !!grade;
  teacherGrade = grade;
  teacherUserId = userId;
  document.getElementById("teacherStatus").hidden = !isTeacher;
}

// 학년/반은 기본값 없이 직접 고르게 한다 (기본 선택을 그대로 두고 올려서 엉뚱한 반으로 저장되는 것을 막기 위함)
function populateClassSelect() {
  const sel = document.getElementById("classSelect");
  sel.appendChild(new Option("반 선택", ""));
  CONFIG.CLASSES.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    sel.appendChild(opt);
  });
}

function populateGradeSelect() {
  const sel = document.getElementById("gradeSelect");
  sel.appendChild(new Option("학년 선택", ""));
  CONFIG.GRADES.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.label;
    sel.appendChild(opt);
  });
}

function buildGradeTabs() {
  const bar = document.getElementById("gradeTabs");
  bar.innerHTML = "";
  CONFIG.GRADES.forEach((g) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "grade-tab" + (g.id === activeViewGrade ? " active" : "");
    tab.textContent = g.label;
    tab.addEventListener("click", () => {
      userPickedGrade = true;
      switchGrade(g.id);
    });
    bar.appendChild(tab);
  });
}

function switchGrade(gradeId) {
  if (gradeId === activeViewGrade) return;
  activeViewGrade = gradeId;
  document.querySelectorAll(".grade-tab").forEach((tab, i) => {
    tab.classList.toggle("active", CONFIG.GRADES[i].id === gradeId);
  });
  Object.values(classLayers).forEach((layer) => layer.clearLayers());
  loadApprovedObservations();
}

function buildFilterBar() {
  const bar = document.getElementById("filterBar");
  bar.innerHTML = "";

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "filter-chip all";
  allChip.textContent = "전체 보기";
  allChip.addEventListener("click", () => {
    const anyHidden = activeClassIds.size < CONFIG.CLASSES.length;
    CONFIG.CLASSES.forEach((c) => setClassVisible(c.id, anyHidden));
    document.querySelectorAll(".filter-chip input[type=checkbox]").forEach((cb) => {
      cb.checked = anyHidden;
    });
  });
  bar.appendChild(allChip);

  CONFIG.CLASSES.forEach((c) => {
    const label = document.createElement("label");
    label.className = "filter-chip";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", () => setClassVisible(c.id, checkbox.checked));
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = c.color;
    label.appendChild(checkbox);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(c.label));
    bar.appendChild(label);
  });
}

function setClassVisible(classId, visible) {
  const layer = classLayers[classId];
  if (!layer) return;
  if (visible) {
    activeClassIds.add(classId);
    if (!map.hasLayer(layer)) layer.addTo(map);
  } else {
    activeClassIds.delete(classId);
    if (map.hasLayer(layer)) map.removeLayer(layer);
  }
}

// 교사가 로그인된 브라우저에서도 학생들과 똑같이 승인된 전체 기록이 보이도록 로그인 세션이 없는 클라이언트로 조회한다
async function loadApprovedObservations() {
  const grade = activeViewGrade;
  const { data, error } = await fetchAllPages(() =>
    supabasePublic
      .from("observations")
      .select("*", { count: "exact" })
      .eq("status", "approved")
      .eq("grade", grade)
      .order("created_at", { ascending: false })
      .order("id")
  );
  if (grade !== activeViewGrade) return; // 불러오는 사이 다른 학년 탭으로 바뀌었으면 결과를 버린다

  if (error) {
    console.error("관찰 기록 로딩 실패:", error);
    return;
  }
  data.forEach(addObservationMarker);
}

function addObservationMarker(obs) {
  const color = classColor(obs.class_name);
  const marker = L.marker([obs.lat, obs.lng], {
    icon: makeDivIcon(color, { teacher: obs.author_type === "teacher" }),
  });
  marker.bindPopup(renderPopupHtml(obs), { maxWidth: 260 });
  const layer = classLayers[obs.class_name];
  (layer || map).addLayer(marker);
  return marker;
}

// 핀이 가까운 핀들과 묶여 있지 않고 화면에 보일 때만 팝업을 연다 (묶인 경우는 숫자 뱃지로 보인다)
function showMarkerPopup(layer, marker) {
  const visible = layer && layer.getVisibleParent ? layer.getVisibleParent(marker) : marker;
  if (visible === marker) marker.openPopup();
}

function renderPopupHtml(obs, opts = {}) {
  const photoUrl = photoPublicUrl(obs.photo_path);
  const taxonParts = [
    ["종", obs.taxon_species],
    ["속", obs.taxon_genus],
    ["과", obs.taxon_family],
    ["목", obs.taxon_order],
    ["강", obs.taxon_class],
    ["문", obs.taxon_phylum],
    ["계", obs.taxon_kingdom],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${escapeHtml(v)}`)
    .join(" · ");

  return `
    <div class="popup-card">
      ${opts.pending ? '<span class="pending-badge">승인 대기중</span>' : ""}
      ${photoUrl ? `<img src="${photoUrl}" alt="사진">` : ""}
      <h3>${escapeHtml(obs.plant_name)}</h3>
      <div class="meta">${escapeHtml(classLabel(obs.class_name))} · ${escapeHtml(obs.student_name)}${obs.author_type === "teacher" ? ' <span class="teacher-badge">교사</span>' : ""}</div>
      ${taxonParts ? `<div class="row"><b>분류</b> ${taxonParts}</div>` : ""}
      ${obs.habitat ? `<div class="row"><b>서식지</b> ${escapeHtml(obs.habitat)}</div>` : ""}
      ${obs.morphology ? `<div class="row"><b>형태</b> ${escapeHtml(obs.morphology)}</div>` : ""}
      ${obs.characteristics ? `<div class="row"><b>특징</b> ${escapeHtml(obs.characteristics)}</div>` : ""}
      ${obs.behavior ? `<div class="row"><b>습성</b> ${escapeHtml(obs.behavior)}</div>` : ""}
      <div class="row"><b>위치</b> ${formatLatLng(obs.lat, obs.lng)}</div>
    </div>`;
}

function onMapClick(e) {
  placeTempMarkerAndOpenModal(e.latlng, { source: "click" });
}

function clearTempLocationLayers() {
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
  if (accuracyCircle) {
    map.removeLayer(accuracyCircle);
    accuracyCircle = null;
  }
}

function placeTempMarkerAndOpenModal(latlng, info) {
  clearTempLocationLayers();
  pendingClickLatLng = latlng;
  pendingLocationInfo = info;
  tempMarker = L.marker(latlng, { icon: makeDivIcon("#555555", { dashed: true }) }).addTo(map);
  if (info.source === "gps" && info.accuracy) {
    accuracyCircle = L.circle(latlng, {
      radius: info.accuracy,
      color: "#388e3c",
      weight: 1,
      fillColor: "#388e3c",
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(map);
  }
  openEntryModal();
}

// 위치를 몇 초간 계속 측정해서 가장 정확한 값을 사용한다.
// (한 번만 읽으면 휴대폰이 처음 알려주는 대략적인 위치(Wi-Fi/기지국 기반, 수십~수백 m 오차)가 그대로 쓰인다)
function handleLocateClick() {
  if (!navigator.geolocation) {
    alert("이 브라우저에서는 위치 확인 기능(GPS)을 사용할 수 없습니다. 지도를 직접 클릭해서 기록해주세요.");
    return;
  }

  const btn = document.getElementById("locateBtn");
  const idleText = "📍 내 위치로 기록";
  btn.disabled = true;
  btn.textContent = "위치 측정 중...";

  let best = null;
  let lastError = null;
  let finished = false;
  let watchId = null;
  let timer = null;

  const finish = () => {
    if (finished) return;
    finished = true;
    navigator.geolocation.clearWatch(watchId);
    clearTimeout(timer);
    btn.disabled = false;
    btn.textContent = idleText;

    if (!best) {
      const messages = {
        1: "위치 권한이 거부되었습니다. 브라우저(또는 휴대폰) 설정에서 이 사이트의 위치 접근을 허용해주세요.",
        2: "현재 위치를 확인할 수 없습니다. 휴대폰의 위치(GPS) 설정을 켜고, 하늘이 트인 곳에서 다시 시도해주세요.",
        3: "위치 확인 시간이 초과되었습니다. 하늘이 트인 곳에서 다시 시도해주세요.",
      };
      alert(messages[lastError && lastError.code] || messages[3]);
      return;
    }

    const latlng = L.latLng(best.coords.latitude, best.coords.longitude);
    map.setView(latlng, Math.max(map.getZoom(), CONFIG.DEFAULT_ZOOM));
    placeTempMarkerAndOpenModal(latlng, { source: "gps", accuracy: best.coords.accuracy });
  };

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
      btn.textContent = `위치 측정 중... ±${Math.round(best.coords.accuracy)}m`;
      if (best.coords.accuracy <= CONFIG.GPS_TARGET_ACCURACY_M) finish();
    },
    (error) => {
      lastError = error;
      if (error.code === 1) finish();
    },
    { enableHighAccuracy: true, timeout: CONFIG.GPS_MAX_WAIT_MS, maximumAge: 0 }
  );
  timer = setTimeout(finish, CONFIG.GPS_MAX_WAIT_MS);
}

function renderLocationInfo() {
  const el = document.getElementById("locationInfo");
  const info = pendingLocationInfo;
  el.classList.remove("warn");
  if (!info || !pendingClickLatLng) {
    el.textContent = "";
    return;
  }
  const coords = formatLatLng(pendingClickLatLng.lat, pendingClickLatLng.lng);
  if (info.source === "gps") {
    const acc = Math.round(info.accuracy);
    el.textContent = `📍 내 위치 (정확도 ±${acc}m) · ${coords}`;
    if (acc > CONFIG.GPS_WARN_ACCURACY_M) {
      el.classList.add("warn");
      el.textContent += ` — 정확도가 낮습니다. 취소 후 하늘이 트인 곳에서 다시 측정하거나, 지도를 눌러 위치를 직접 지정하세요.`;
    }
  } else {
    el.textContent = `🗺 지도에서 선택한 위치 · ${coords}`;
  }
}

function openEntryModal() {
  document.getElementById("gradeSelect").value = lastChoice ? lastChoice.grade : userPickedGrade ? activeViewGrade : "";
  document.getElementById("classSelect").value = lastChoice ? lastChoice.class_name : "";
  document.getElementById("teacherPostRow").hidden = !isTeacher;
  renderLocationInfo();
  document.getElementById("entryModal").hidden = false;
}

function closeEntryModal() {
  document.getElementById("entryModal").hidden = true;
  document.getElementById("entryForm").reset();
  document.getElementById("photoPreview").hidden = true;
  setFormStatus("");
  clearTempLocationLayers();
  pendingClickLatLng = null;
  pendingLocationInfo = null;
}

function handlePhotoPreview() {
  const file = document.getElementById("photoInput").files[0];
  const preview = document.getElementById("photoPreview");
  if (!file) {
    preview.hidden = true;
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
}

function setFormStatus(message, isError = false) {
  const el = document.getElementById("formStatus");
  el.textContent = message;
  el.classList.toggle("error", isError);
}

async function handleSubmit(e) {
  e.preventDefault();
  if (!pendingClickLatLng) return;

  const form = e.target;
  const fd = new FormData(form);
  const studentName = (fd.get("student_name") || "").trim();
  const grade = fd.get("grade");
  const className = fd.get("class_name");
  const plantName = (fd.get("plant_name") || "").trim();

  if (!studentName || !grade || !className || !plantName) {
    setFormStatus("이름, 학년, 반, 생물 이름은 꼭 입력(선택)해야 해요.", true);
    return;
  }

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;

  try {
    let photoPath = null;
    const file = document.getElementById("photoInput").files[0];
    if (file) {
      setFormStatus("사진 압축 중...");
      const compressedBlob = await compressImage(file);
      const filename = `${className}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

      setFormStatus("사진 업로드 중...");
      const { error: uploadError } = await supabaseClient.storage
        .from(CONFIG.PHOTO_BUCKET)
        .upload(filename, compressedBlob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      photoPath = filename;
    }

    setFormStatus("저장 중...");
    const row = {
      id: generateUuid(),
      student_name: studentName,
      grade: grade,
      class_name: className,
      lat: pendingClickLatLng.lat,
      lng: pendingClickLatLng.lng,
      plant_name: plantName,
      taxon_species: fd.get("taxon_species") || null,
      taxon_genus: fd.get("taxon_genus") || null,
      taxon_family: fd.get("taxon_family") || null,
      taxon_order: fd.get("taxon_order") || null,
      taxon_class: fd.get("taxon_class") || null,
      taxon_phylum: fd.get("taxon_phylum") || null,
      taxon_kingdom: fd.get("taxon_kingdom") || null,
      habitat: fd.get("habitat") || null,
      morphology: fd.get("morphology") || null,
      characteristics: fd.get("characteristics") || null,
      behavior: fd.get("behavior") || null,
      photo_path: photoPath,
      status: "pending",
    };
    if (isTeacher && document.getElementById("postAsTeacher").checked) {
      row.author_type = "teacher";
      // 본인 담당 학년(또는 전체 학년 담당)의 교사 자료는 바로 승인. 서버 규칙(RLS)도 같은 조건으로 검사한다.
      if (teacherGrade === "ALL" || teacherGrade === grade) {
        row.status = "approved";
        row.reviewed_at = new Date().toISOString();
        row.reviewed_by = teacherUserId;
      }
    }

    const { error: insertError } = await supabaseClient.from("observations").insert(row);
    if (insertError) throw insertError;

    lastChoice = { grade: row.grade, class_name: row.class_name };
    rememberMyRecord({
      id: row.id,
      student_name: row.student_name,
      plant_name: row.plant_name,
      grade: row.grade,
      class_name: row.class_name,
      lat: row.lat,
      lng: row.lng,
      created_at: new Date().toISOString(),
    });

    // 저장은 이미 끝났으므로, 아래 화면 갱신에서 문제가 생겨도 "오류"로 보이지 않게 한다 (재제출로 인한 중복 등록 방지)
    try {
      if (row.status === "approved") {
        addApprovedLocalMarker(row);
      } else {
        addLocalPendingMarker(row);
      }
    } catch (uiError) {
      console.warn("등록 후 지도 갱신 중 오류:", uiError);
    }
    closeEntryModal();
    alert(
      row.status === "approved"
        ? "등록 완료! 교사 자료는 자동 승인되어 바로 지도에 표시됩니다."
        : "제출 완료! 선생님이 승인하면 모두에게 지도에 표시됩니다.\n위쪽 '내 기록'에서 승인 여부와 수정 여부를 확인할 수 있어요."
    );
  } catch (err) {
    console.error(err);
    setFormStatus("오류가 발생했습니다: " + (err.message || err), true);
  } finally {
    submitBtn.disabled = false;
  }
}

// 승인 전이라도 방금 등록한 학생 본인 화면에는 바로 보여준다 (다른 사람에게는 보이지 않음)
function addLocalPendingMarker(row) {
  if (row.grade !== activeViewGrade) {
    switchGrade(row.grade);
  }
  const marker = L.marker([row.lat, row.lng], {
    icon: makeDivIcon(classColor(row.class_name), { dashed: true, teacher: row.author_type === "teacher" }),
  });
  marker.bindPopup(renderPopupHtml(row, { pending: true }), { maxWidth: 260 });
  const layer = classLayers[row.class_name];
  (layer || map).addLayer(marker);
  showMarkerPopup(layer, marker);
}

// 교사 자료처럼 등록과 동시에 승인된 글: 같은 학년을 보고 있으면 바로 핀을 추가하고,
// 다른 학년 탭으로 전환하는 경우에는 전환 시 서버에서 다시 불러오는 목록에 이미 포함된다
function addApprovedLocalMarker(row) {
  if (row.grade !== activeViewGrade) {
    switchGrade(row.grade);
    return;
  }
  const marker = addObservationMarker(row);
  showMarkerPopup(classLayers[row.class_name], marker);
}

document.addEventListener("DOMContentLoaded", initMap);
