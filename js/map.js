// 학생용 지도 페이지 로직

let map;
let tempMarker = null;
let pendingClickLatLng = null;
const classLayers = {}; // classId -> L.layerGroup
const activeClassIds = new Set(CONFIG.CLASSES.map((c) => c.id));

function makeDivIcon(color, opts = {}) {
  const dashedClass = opts.dashed ? " dashed-marker" : "";
  return L.divIcon({
    className: "",
    html: `<span class="pin${dashedClass}" style="background:${color}"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

function initMap() {
  map = L.map("map").setView([CONFIG.SCHOOL_LAT, CONFIG.SCHOOL_LNG], CONFIG.DEFAULT_ZOOM);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
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
    classLayers[c.id] = L.layerGroup().addTo(map);
  });

  populateClassSelect();
  buildFilterBar();
  loadApprovedObservations();

  map.on("click", onMapClick);

  document.getElementById("entryForm").addEventListener("submit", handleSubmit);
  document.getElementById("cancelBtn").addEventListener("click", closeEntryModal);
  document.getElementById("closeModalBtn").addEventListener("click", closeEntryModal);
  document.getElementById("photoInput").addEventListener("change", handlePhotoPreview);
  document.getElementById("locateBtn").addEventListener("click", handleLocateClick);
}

function populateClassSelect() {
  const sel = document.getElementById("classSelect");
  CONFIG.CLASSES.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    sel.appendChild(opt);
  });
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

async function loadApprovedObservations() {
  const { data, error } = await supabaseClient
    .from("observations")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("관찰 기록 로딩 실패:", error);
    return;
  }
  data.forEach(addObservationMarker);
}

function addObservationMarker(obs) {
  const color = classColor(obs.class_name);
  const marker = L.marker([obs.lat, obs.lng], { icon: makeDivIcon(color) });
  marker.bindPopup(renderPopupHtml(obs), { maxWidth: 260 });
  const layer = classLayers[obs.class_name];
  (layer || map).addLayer(marker);
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
      <div class="meta">${escapeHtml(classLabel(obs.class_name))} · ${escapeHtml(obs.student_name)}</div>
      ${taxonParts ? `<div class="row"><b>분류</b> ${taxonParts}</div>` : ""}
      ${obs.habitat ? `<div class="row"><b>서식지</b> ${escapeHtml(obs.habitat)}</div>` : ""}
      ${obs.morphology ? `<div class="row"><b>형태</b> ${escapeHtml(obs.morphology)}</div>` : ""}
      ${obs.characteristics ? `<div class="row"><b>특징</b> ${escapeHtml(obs.characteristics)}</div>` : ""}
      ${obs.behavior ? `<div class="row"><b>습성</b> ${escapeHtml(obs.behavior)}</div>` : ""}
      <div class="row"><b>위치</b> ${formatLatLng(obs.lat, obs.lng)}</div>
    </div>`;
}

function onMapClick(e) {
  placeTempMarkerAndOpenModal(e.latlng);
}

function placeTempMarkerAndOpenModal(latlng) {
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
  pendingClickLatLng = latlng;
  tempMarker = L.marker(latlng, { icon: makeDivIcon("#555555", { dashed: true }) }).addTo(map);
  openEntryModal();
}

function handleLocateClick() {
  if (!navigator.geolocation) {
    alert("이 브라우저에서는 위치 확인 기능(GPS)을 사용할 수 없습니다. 지도를 직접 클릭해서 기록해주세요.");
    return;
  }

  const btn = document.getElementById("locateBtn");
  btn.disabled = true;
  btn.textContent = "위치 확인 중...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
      map.setView(latlng, Math.max(map.getZoom(), CONFIG.DEFAULT_ZOOM));
      placeTempMarkerAndOpenModal(latlng);
      btn.disabled = false;
      btn.textContent = "📍 내 위치로 기록";
    },
    (error) => {
      btn.disabled = false;
      btn.textContent = "📍 내 위치로 기록";
      const messages = {
        1: "위치 권한이 거부되었습니다. 브라우저 설정에서 위치 접근을 허용해주세요.",
        2: "현재 위치를 확인할 수 없습니다. GPS/네트워크 연결을 확인해주세요.",
        3: "위치 확인 시간이 초과되었습니다. 다시 시도해주세요.",
      };
      alert(messages[error.code] || "위치를 가져오지 못했습니다. 지도를 직접 클릭해서 기록해주세요.");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function openEntryModal() {
  document.getElementById("entryModal").hidden = false;
}

function closeEntryModal() {
  document.getElementById("entryModal").hidden = true;
  document.getElementById("entryForm").reset();
  document.getElementById("photoPreview").hidden = true;
  setFormStatus("");
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
  pendingClickLatLng = null;
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
  const className = fd.get("class_name");
  const plantName = (fd.get("plant_name") || "").trim();

  if (!studentName || !className || !plantName) {
    setFormStatus("이름, 반, 생물 이름은 필수 입력입니다.", true);
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
      student_name: studentName,
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

    const { error: insertError } = await supabaseClient.from("observations").insert(row);
    if (insertError) throw insertError;

    addLocalPendingMarker(row);
    closeEntryModal();
    alert("제출 완료! 선생님이 승인하면 모두에게 지도에 표시됩니다.");
  } catch (err) {
    console.error(err);
    setFormStatus("오류가 발생했습니다: " + (err.message || err), true);
  } finally {
    submitBtn.disabled = false;
  }
}

// 승인 전이라도 방금 등록한 학생 본인 화면에는 바로 보여준다 (다른 사람에게는 보이지 않음)
function addLocalPendingMarker(row) {
  const marker = L.marker([row.lat, row.lng], {
    icon: makeDivIcon(classColor(row.class_name), { dashed: true }),
  });
  marker.bindPopup(renderPopupHtml(row, { pending: true }), { maxWidth: 260 });
  const layer = classLayers[row.class_name];
  (layer || map).addLayer(marker);
  marker.openPopup();
}

document.addEventListener("DOMContentLoaded", initMap);
