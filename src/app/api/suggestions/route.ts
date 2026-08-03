import { db } from "@/db";
import { suggestions } from "@/db/schema";
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const res = await db.query.suggestions.findMany({
      orderBy: [desc(suggestions.createdAt)],
      limit: 10,
    });
    return NextResponse.json(JSON.parse(JSON.stringify(res)));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { topic, language } = await req.json();
    await db.insert(suggestions).values({ topic, language });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
