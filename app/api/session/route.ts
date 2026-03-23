import { NextResponse } from "next/server";
import { readSessionDb } from "@/lib/session-db";

export async function GET() {
  const db = await readSessionDb();
  return NextResponse.json(db);
}