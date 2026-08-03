import { db } from "@/db";
import { debates, debateArguments, participants } from "@/db/schema";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      // Get single debate details
      const debate = await db.query.debates.findFirst({
        where: eq(debates.id, id),
        with: { arguments: true, participants: true }
      });
      if (!debate) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(JSON.parse(JSON.stringify(debate)));
    }

    // Get top debates
    const res = await db.query.debates.findMany({
      orderBy: [desc(debates.createdAt)],
      limit: 20,
      with: { arguments: true, participants: true }
    });
    return NextResponse.json(JSON.parse(JSON.stringify(res)));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topic, language } = body;

    const [newDebate] = await db.insert(debates).values({
      topic,
      language,
      side: 'FOR',
      status: 'waiting',
      waitingStartedAt: new Date(),
      likes: 0,
      dislikes: 0,
      forVotes: 0,
      againstVotes: 0,
      drawVotes: 0,
      rematchVotes: 0,
    }).returning({ id: debates.id });

    return NextResponse.json({ success: true, id: newDebate.id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
