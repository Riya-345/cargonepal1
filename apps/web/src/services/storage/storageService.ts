// ============================================================
// CargoNepal — Storage service (spec §15, §28)
// ============================================================
// Uploads to private buckets under `<bucket>/<userId>/...` and reads
// back via short-lived signed URLs. Validates type + size client-side
// before upload; the bucket policies enforce the same server-side.
// ============================================================

import { supabase } from "@/services/supabaseClient";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_MB } from "@/core/constants";

export type Bucket = "proof-of-delivery" | "rider-documents" | "parcel-images" | "avatars";

export interface UploadResult {
  path: string;
  error?: string;
}

export async function uploadFile(bucket: Bucket, userId: string, file: File, sub = ""): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type) && bucket !== "rider-documents") {
    return { path: "", error: `Unsupported file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}` };
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return { path: "", error: `File too large. Max ${MAX_UPLOAD_MB} MB.` };
  }
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${userId}/${sub ? sub + "/" : ""}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { path: "", error: error.message };
  return { path };
}

/** Compress an image client-side before upload (spec §56). */
export async function compressImage(file: File, maxDim = 1280, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" });
}

/** Get a signed URL for a private object. */
export async function getSignedUrl(bucket: Bucket, path: string, expiresSec = 300): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresSec);
  if (error) return null;
  return data.signedUrl;
}

/** Public URL (avatars, marketing). */
export function getPublicUrl(bucket: Bucket, path: string): string | null {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
