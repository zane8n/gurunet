import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppData } from "@/lib/domain";

const dataDir = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDir, "gurunet.json");

const emptyData: AppData = {
  users: [],
  sessions: [],
  challenges: [],
  submissions: [],
  grades: [],
  ledgerEvents: [],
  redemptions: [],
  notebookEntries: [],
  disciplineRecords: [],
  friendships: [],
  marketplaceChallenges: [],
  challengeEnrollments: [],
};

let writeQueue = Promise.resolve();

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

export async function readData(): Promise<AppData> {
  try {
    const raw = await readFile(dataFile, "utf8");
    return { ...emptyData, ...JSON.parse(raw) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    await mkdir(dataDir, { recursive: true });
    await writeFile(dataFile, JSON.stringify(emptyData, null, 2));
    return structuredClone(emptyData);
  }
}

export async function writeData(data: AppData) {
  await mkdir(dataDir, { recursive: true });
  writeQueue = writeQueue.then(() =>
    writeFile(dataFile, JSON.stringify(data, null, 2)),
  );
  await writeQueue;
}

export async function updateData<T>(mutator: (data: AppData) => T | Promise<T>) {
  const data = await readData();
  const result = await mutator(data);
  await writeData(data);
  return result;
}
