import { put } from "@vercel/blob";

const MAX_FILE_SIZES = {
  IMAGE: 4.5 * 1024 * 1024,
  GIF: 4.5 * 1024 * 1024,
  VIDEO: 4.5 * 1024 * 1024,
  PDF: 4.5 * 1024 * 1024,
  FILE: 4.5 * 1024 * 1024,
};

const ALLOWED_MIME_TYPES = {
  IMAGE: ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"],
  GIF: ["image/gif"],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime"],
  PDF: ["application/pdf"],
};

export type FileCategory = "IMAGE" | "GIF" | "VIDEO" | "PDF" | "FILE";

export function getFileCategory(mimeType: string): FileCategory {
  if (ALLOWED_MIME_TYPES.IMAGE.includes(mimeType)) {
    return mimeType === "image/gif" ? "GIF" : "IMAGE";
  }
  if (ALLOWED_MIME_TYPES.VIDEO.includes(mimeType)) {
    return "VIDEO";
  }
  if (ALLOWED_MIME_TYPES.PDF.includes(mimeType)) {
    return "PDF";
  }
  return "FILE";
}

export function validateFileUpload(file: File): {
  valid: boolean;
  error?: string;
} {
  const category = getFileCategory(file.type);
  const maxSize = MAX_FILE_SIZES[category];

  const allAllowedTypes = [
    ...ALLOWED_MIME_TYPES.IMAGE,
    ...ALLOWED_MIME_TYPES.VIDEO,
    ...ALLOWED_MIME_TYPES.PDF,
  ];

  if (!allAllowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not supported. Allowed: images, GIFs, videos (MP4/WebM), and PDFs.`,
    };
  }

  if (file.size > maxSize) {
    const maxSizeMB = Math.floor(maxSize / (1024 * 1024));
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit for ${category} files.`,
    };
  }

  return { valid: true };
}

export async function uploadFile(
  file: File
): Promise<{ url: string; pathname: string }> {
  const validation = validateFileUpload(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const blob = await put(file.name, file, {
    access: "public",
    addRandomSuffix: true,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}

export function getFileIcon(mimeType: string): string {
  const category = getFileCategory(mimeType);

  switch (category) {
    case "IMAGE":
      return "🖼️";
    case "GIF":
      return "🎞️";
    case "VIDEO":
      return "🎥";
    case "PDF":
      return "📄";
    default:
      return "📎";
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
