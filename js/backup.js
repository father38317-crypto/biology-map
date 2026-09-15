// 학기 말 전체 데이터 백업 (CSV + 사진을 하나의 zip으로)

async function runBackup() {
  const btn = document.getElementById("backupBtn");
  const statusEl = document.getElementById("backupStatus");
  btn.disabled = true;

  try {
    statusEl.textContent = "데이터 불러오는 중...";
    const { data: rows, error } = await supabaseClient
      .from("observations")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const zip = new JSZip();
    const photosFolder = zip.folder("photos");

    const headers = [
      "등록일시", "반", "이름", "생물이름", "위도", "경도",
      "종", "속", "과", "목", "강", "문", "계",
      "서식지", "형태", "특징", "습성", "상태", "사진파일명",
    ];
    const csvRows = [headers];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      let photoFilename = "";

      if (r.photo_path) {
        statusEl.textContent = `사진 내려받는 중... (${i + 1}/${rows.length})`;
        try {
          const { data: blob, error: dlError } = await supabaseClient.storage
            .from(CONFIG.PHOTO_BUCKET)
            .download(r.photo_path);
          if (!dlError && blob) {
            photoFilename = r.photo_path;
            photosFolder.file(photoFilename, blob);
          }
        } catch (e) {
          console.warn("사진 다운로드 실패:", r.photo_path, e);
        }
      }

      csvRows.push([
        new Date(r.created_at).toLocaleString("ko-KR"),
        classLabel(r.class_name),
        r.student_name,
        r.plant_name,
        r.lat,
        r.lng,
        r.taxon_species,
        r.taxon_genus,
        r.taxon_family,
        r.taxon_order,
        r.taxon_class,
        r.taxon_phylum,
        r.taxon_kingdom,
        r.habitat,
        r.morphology,
        r.characteristics,
        r.behavior,
        statusLabel(r.status),
        photoFilename,
      ]);
    }

    // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 추가
    const csvContent = "﻿" + csvRows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
    zip.file("데이터.csv", csvContent);

    statusEl.textContent = "압축 파일 생성 중...";
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(zipBlob, `생물지도_백업_${dateStr}.zip`);
    statusEl.textContent = `완료! 총 ${rows.length}건이 백업되었습니다.`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "백업 실패: " + (err.message || err);
  } finally {
    btn.disabled = false;
  }
}
