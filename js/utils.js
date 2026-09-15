// 공통 유틸리티 함수

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function classLabel(classId) {
  const c = CONFIG.CLASSES.find((c) => c.id === String(classId));
  return c ? c.label : classId;
}

function classColor(classId) {
  const c = CONFIG.CLASSES.find((c) => c.id === String(classId));
  return c ? c.color : "#777777";
}

function formatLatLng(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return "-";
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
}

function statusLabel(status) {
  return { pending: "승인 대기중", approved: "승인됨" }[status] || status;
}

function photoPublicUrl(path) {
  if (!path) return null;
  return supabaseClient.storage.from(CONFIG.PHOTO_BUCKET).getPublicUrl(path)
    .data.publicUrl;
}

// 사진을 캔버스로 리사이즈 + 압축해서 JPEG Blob으로 반환
function compressImage(
  file,
  maxWidth = CONFIG.PHOTO_MAX_WIDTH,
  quality = CONFIG.PHOTO_QUALITY
) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지를 열 수 없습니다."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("이미지 압축에 실패했습니다."));
          },
          "image/jpeg",
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
