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
  return json(
    {
      error: error instanceof Error ? error.message : "Unexpected server error",
    },
    { status: 500 },
  );
}
