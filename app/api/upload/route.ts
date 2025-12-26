import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/services/auth";
import { put } from "@vercel/blob";
import { validateFileUpload, getFileCategory } from "@/lib/utils/file-upload";
import { uploadResponseSchema } from "@/lib/schemas/api";
import { logger } from "@/lib/infrastructure/logger";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (files.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 files allowed" },
        { status: 400 }
      );
    }

    for (const file of files) {
      const validation = validateFileUpload(file);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const blob = await put(file.name, file, {
          access: "public",
        });

        const type = getFileCategory(file.type);

        return {
          url: blob.url,
          type,
          name: file.name,
          size: file.size,
        };
      })
    );

    const response = { files: uploadedFiles };
    const validatedResponse = uploadResponseSchema.safeParse(response);

    if (!validatedResponse.success) {
      logger.error("Invalid upload response:", validatedResponse.error.issues);
      return NextResponse.json(
        { error: "Failed to process upload response" },
        { status: 500 }
      );
    }

    return NextResponse.json(validatedResponse.data);
  } catch (error) {
    console.error("Error uploading files:", error);
    return NextResponse.json(
      { error: "Failed to upload files" },
      { status: 500 }
    );
  }
}

//AWS S3 Implementation
/*
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        const key = `uploads/${Date.now()}-${file.name}`;

        await s3Client.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: key,
            Body: buffer,
            ContentType: file.type,
          })
        );

        const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

        let type: "IMAGE" | "GIF" | "FILE" = "FILE";
        if (file.type.startsWith("image/")) {
          type = file.type === "image/gif" ? "GIF" : "IMAGE";
        }

        return { url, type, name: file.name, size: file.size };
      })
    );

    return NextResponse.json({ files: uploadedFiles });
  } catch (error) {
    console.error("Error uploading files:", error);
    return NextResponse.json(
      { error: "Failed to upload files" },
      { status: 500 }
    );
  }
}
*/
