import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";
import { fromDbAttachment } from "@/lib/db-mappers";
import type { User } from "@/lib/domain";

const uploadRoot =
  process.env.GURUNET_UPLOAD_DIR ||
  path.join(".data", "uploads");
const maxFileSize = 2.5 * 1024 * 1024;
const maxBatchSize = 8 * 1024 * 1024;

const allowedTypes = [
  "image/",
  "text/",
  "application/json",
  "application/octet-stream",
  "application/vnd.tcpdump.pcap",
];

export async function saveUploadFiles(user: User, files: File[]) {
  if (files.length === 0) throw new Response("No files uploaded", { status: 400 });
  if (files.length > 8) throw new Response("Upload at most 8 files", { status: 400 });

  const totalSize = files.reduce((total, file) => total + file.size, 0);
  if (totalSize > maxBatchSize) {
    throw new Response("Total upload size must stay under 8 MB", { status: 400 });
  }

  const saved = [];
  await mkdir(path.join(uploadRoot, user.id), { recursive: true });

  for (const file of files) {
    if (file.size > maxFileSize) {
      throw new Response(`${file.name} is larger than 2.5 MB`, { status: 400 });
    }
    const type = file.type || "application/octet-stream";
    if (!allowedTypes.some((allowed) => type.startsWith(allowed) || type === allowed)) {
      throw new Response(`${file.name} has an unsupported file type`, { status: 400 });
    }

    const id = createId("att");
    const extension = safeExtension(file.name);
    const storagePath = path.join(user.id, `${id}${extension}`);
    const absolutePath = path.join(uploadRoot, storagePath);
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, bytes);

    const attachment = await prisma.submissionAttachment.create({
      data: {
        id,
        userId: user.id,
        filename: file.name || "upload",
        mimeType: type,
        byteSize: file.size,
        storagePath,
        kind: type.startsWith("image/") ? "image" : "file",
      },
    });
    saved.push(fromDbAttachment(attachment));
  }

  return saved;
}

function safeExtension(name: string) {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext.length <= 12 ? ext : "";
}
