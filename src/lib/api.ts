import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof ZodError) {
    const fields = error.issues
      .map((issue) => issue.path.join(".") || "input")
      .filter(Boolean);
    return json(
      {
        error: fields.length
          ? `Please check: ${Array.from(new Set(fields)).join(", ")}.`
          : "Please check the submitted form.",
        issues: error.issues,
      },
      { status: 400 },
    );
  }
  if (isMissingDatabaseTableError(error)) {
    return json(
      {
        error:
          "Database migration required. One or more required tables are missing in the connected database. Run `pnpm prisma:deploy` against the same DATABASE_URL used by the app, then refresh.",
      },
      { status: 503 },
    );
  }
  return json(
    {
      error: error instanceof Error ? error.message : "Unexpected server error",
    },
    { status: 500 },
  );
}

function isMissingDatabaseTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("does not exist in the current database") ||
    (message.includes("The table") && message.includes("does not exist")) ||
    message.includes("P2021")
  );
}
