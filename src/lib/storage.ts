import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";
import { fromDbAttachment } from "@/lib/db-mappers";
import type { User } from "@/lib/domain";

const uploadRoot =
  process.env.GURUNET_UPLOAD_DIR ||
  (process.env.VERCEL ? path.join("/tmp", "gurunet-uploads") : path.join(".data", "uploads"));
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
  const useBlob = Boolean(process.env.VERCEL || process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
  if (!useBlob) await mkdir(path.join(uploadRoot, user.id), { recursive: true });

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
    const pathname = `response-evidence/${user.id}/${id}${extension}`;
    let storagePath: string;
    if (useBlob) {
      const blob = await put(pathname, file, {
        access: "private",
        addRandomSuffix: false,
        contentType: type,
      });
      storagePath = `blob:${blob.pathname}`;
    } else {
      const localPath = path.join(user.id, `${id}${extension}`);
      const absolutePath = path.join(uploadRoot, localPath);
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(absolutePath, bytes);
      storagePath = `local:${localPath}`;
    }

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

export async function clearUploadStorage() {
  const blobPaths = await prisma.submissionAttachment.findMany({
    where: { storagePath: { startsWith: "blob:" } },
    select: { storagePath: true },
  });
  if (blobPaths.length) {
    await del(blobPaths.map(({ storagePath }) => storagePath.slice(5)));
  }
  await rm(uploadRoot, { recursive: true, force: true });
  return { uploadRoot };
}

export async function clearUserUploadStorage(userId: string) {
  const blobPaths = await prisma.submissionAttachment.findMany({
    where: { userId, storagePath: { startsWith: "blob:" } },
    select: { storagePath: true },
  });
  if (blobPaths.length) {
    await del(blobPaths.map(({ storagePath }) => storagePath.slice(5)));
  }
  await rm(path.join(uploadRoot, userId), { recursive: true, force: true });
  return { uploadRoot, userId };
}

export async function readStoredUpload(storagePath: string) {
  if (storagePath.startsWith("blob:")) {
    const result = await get(storagePath.slice(5), { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return { stream: result.stream, contentType: result.blob.contentType };
  }
  const { readFile } = await import("node:fs/promises");
  const localPath = storagePath.startsWith("local:") ? storagePath.slice(6) : storagePath;
  const bytes = await readFile(path.join(uploadRoot, localPath)).catch(() => null);
  return bytes ? { stream: bytes, contentType: "application/octet-stream" } : null;
}

export async function deleteStoredUpload(storagePath: string) {
  if (storagePath.startsWith("blob:")) {
    await del(storagePath.slice(5));
    return;
  }
  const localPath = storagePath.startsWith("local:") ? storagePath.slice(6) : storagePath;
  await rm(path.join(uploadRoot, localPath), { force: true });
}

function safeExtension(name: string) {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext.length <= 12 ? ext : "";
}
