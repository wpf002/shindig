"use client";

/** Shrink an image in the browser before upload. Also drops EXIF. */
export async function shrink(file: File, maxEdge = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file; // let the server reject it with a real message
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

export async function toFormData(files: File[], maxEdge?: number): Promise<FormData> {
  const fd = new FormData();
  const blobs = await Promise.all(files.map((f) => shrink(f, maxEdge)));
  blobs.forEach((b, i) => fd.append("images", b, `image-${i}.jpg`));
  return fd;
}
