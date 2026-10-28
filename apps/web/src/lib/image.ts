/**
 * 사진 파일을 긴 변 maxSize(px) 이하의 JPEG로 줄인다.
 * canvas로 다시 그리기 때문에 촬영 위치(GPS) 등 EXIF 정보가 제거된다.
 * 업로드할 때는 원본이 아니라 이 결과물을 올린다. (docs/SECURITY.md)
 */
export async function fileToResizedBlob(
  file: File,
  maxSize = 1024,
  quality = 0.8,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("canvas is not supported");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("image encode failed"))),
      "image/jpeg",
      quality,
    );
  });
}
