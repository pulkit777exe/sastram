import { put, del } from "@vercel/blob";

export interface UploadOptions {
  maxSizeBytes?: number;
  allowedTypes?: string[];
}

const DEFAULT_MAX_SIZE = 4.5 * 1024 * 1024; // 4.5MB
const DEFAULT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/webm",
];

export async function uploadFile(
  file: File,
  options: UploadOptions = {}
): Promise<{ url: string; error?: string }> {
  const maxSize = options.maxSizeBytes || DEFAULT_MAX_SIZE;
  const allowedTypes = options.allowedTypes || DEFAULT_ALLOWED_TYPES;

  // Validate file size
  if (file.size > maxSize) {
    return {
      url: "",
      error: `File size exceeds ${maxSize / 1024 / 1024}MB limit`,
    };
  }

  // Validate file type
  if (!allowedTypes.includes(file.type)) {
    return {
      url: "",
      error: `File type ${file.type} is not allowed`,
    };
  }

  try {
    const blob = await put(file.name, file, {
      access: "public",
    });

    return { url: blob.url };
  } catch (error) {
    console.error("Error uploading file:", error);
    return {
      url: "",
      error: "Failed to upload file",
    };
  }
}

export async function deleteFile(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    await del(url);
    return { success: true };
  } catch (error) {
    console.error("Error deleting file:", error);
    return {
      success: false,
      error: "Failed to delete file",
    };
  }
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const maxSize = 5 * 1024 * 1024; // 5MB for images

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: "Only JPEG, PNG, GIF, and WebP images are allowed",
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: "Image size must be less than 4.5MB",
    };
  }

  return { valid: true };
}

