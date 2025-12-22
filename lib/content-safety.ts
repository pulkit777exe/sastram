const BAD_WORDS = ["spam", "scam", "malware", "virus", "phishing"]; // i dont know if this is right or not

export function containsBadLanguage(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return BAD_WORDS.some((word) => lowerContent.includes(word));
}

export function filterBadLanguage(content: string): string {
  let filteredContent = content;
  BAD_WORDS.forEach((word) => {
    const regex = new RegExp(word, "gi");
    filteredContent = filteredContent.replace(regex, "*".repeat(word.length));
  });
  return filteredContent;
}

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateFile(file: File): FileValidationResult {
  const MAX_SIZE = 4.5 * 1024 * 1024;  // vercel blob limit
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "application/pdf"];

  if (file.size > MAX_SIZE) {
    return { isValid: false, error: "File size exceeds 5MB limit." };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { isValid: false, error: "Invalid file type. Only Images and PDFs are allowed." };
  }

  if (file.name.toLowerCase().includes("virus")) {
    return { isValid: false, error: "Malware detected." };
  }

  return { isValid: true };
}
