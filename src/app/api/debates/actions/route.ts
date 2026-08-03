import { db } from "@/db";
import { debates, debateArguments, participants, suggestions } from "@/db/schema";
import { NextResponse } from "next/server";
import { desc, eq, sql, and } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const { action, ...payload } = await req.json();

    if (action === "join") {
      const { debateId, userId, userName, side } = payload;
      const debate = await db.query.debates.findFirst({
        where: eq(debates.id, debateId),
        with: { participants: true }
      });
      if (!debate || debate.status !== 'waiting') return NextResponse.json({ success: false, error: 'Debate not available' });
      if (debate.participants.some(p => p.userId === userId)) return NextResponse.json({ success: false, error: 'Already joined' });

      await db.insert(participants).values({ debateId, userId, userName, side, reputation: 0 });

      const hasFor = debate.participants.some(p => p.side === 'FOR') || side === 'FOR';
      const hasAgainst = debate.participants.some(p => p.side === 'AGAINST') || side === 'AGAINST';

      if (hasFor && hasAgainst && !debate.waitingStartedAt) {
        await db.update(debates).set({ waitingStartedAt: new Date() }).where(eq(debates.id, debateId));
      }
      return NextResponse.json({ success: true });
    }

    if (action === "status") {
      const { debateId, status } = payload;
      await db.update(debates).set({ status }).where(eq(debates.id, debateId));
      return NextResponse.json({ success: true });
    }

    if (action === "nuclear") {
      const { debateId, userId, argumentId } = payload;
      await db.update(debateArguments).set({ isNuclear: 1 }).where(and(eq(debateArguments.debateId, debateId), eq(debateArguments.authorId, userId), eq(debateArguments.id, argumentId)));
      return NextResponse.json({ success: true });
    }

    if (action === "voteSide") {
      const { debateId, side } = payload;
      if (side === 'FOR') await db.update(debates).set({ forVotes: sql`${debates.forVotes} + 1` }).where(eq(debates.id, debateId));
      else if (side === 'AGAINST') await db.update(debates).set({ againstVotes: sql`${debates.againstVotes} + 1` }).where(eq(debates.id, debateId));
      else await db.update(debates).set({ drawVotes: sql`${debates.drawVotes} + 1` }).where(eq(debates.id, debateId));
      return NextResponse.json({ success: true });
    }

    if (action === "finalize") {
      const { debateId } = payload;
      const debate = await db.query.debates.findFirst({ where: eq(debates.id, debateId) });
      if (!debate) return NextResponse.json({ success: false, error: "Debate not found" });

      let winnerSide: 'FOR' | 'AGAINST' | 'DRAW' = 'DRAW';
      if (debate.forVotes > debate.againstVotes) winnerSide = 'FOR';
      else if (debate.againstVotes > debate.forVotes) winnerSide = 'AGAINST';

      const debateParticipants = await db.query.participants.findMany({ where: eq(participants.debateId, debateId) });
      for (const p of debateParticipants) {
        let rep = 5;
        if (winnerSide === 'DRAW') rep = 5;
        else if (p.side === winnerSide) rep = 10;
        else rep = 3;
        await db.update(participants).set({ reputation: rep }).where(eq(participants.id, p.id));
      }
      await db.update(debates).set({ status: 'finished' }).where(eq(debates.id, debateId));
      return NextResponse.json({ success: true });
    }

    if (action === "rematch") {
      const { debateId } = payload;
      await db.update(debates).set({ rematchVotes: sql`${debates.rematchVotes} + 1` }).where(eq(debates.id, debateId));
      return NextResponse.json({ success: true });
    }

    if (action === "argument") {
      const { debateId, content, side, userId, userName } = payload;
      await db.insert(debateArguments).values({ debateId, content, side, authorId: userId, authorName: userName });
      return NextResponse.json({ success: true });
    }

    if (action === "voteLike") {
      const { id, type } = payload;
      if (type === 'like') await db.update(debates).set({ likes: sql`${debates.likes} + 1` }).where(eq(debates.id, id));
      else await db.update(debates).set({ dislikes: sql`${debates.dislikes} + 1` }).where(eq(debates.id, id));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
