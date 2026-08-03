"use server";

import { db } from "@/db";
import { debates, debateArguments, participants, suggestions } from "@/db/schema";
import { desc, eq, sql, and } from "drizzle-orm";

export async function ping() {
  return "pong";
}

export async function saveDebate(topic: string, language: string, userId: string, userName: string) {
  try {
    // Let database handle the ID generation (UUID)
    const result = await db.insert(debates).values({
      topic: topic,
      language: language,
      side: 'FOR',
      status: 'waiting',
      waitingStartedAt: sql`now()`,
      likes: 0,
      dislikes: 0,
      forVotes: 0,
      againstVotes: 0,
      drawVotes: 0,
      rematchVotes: 0,
    }).returning({ insertedId: debates.id });

    if (!result || result.length === 0) {
      return { success: false, error: "Database failed to return ID" };
    }

    return { 
      success: true, 
      id: String(result[0].insertedId) 
    };
  } catch (error: any) {
    console.error("SERVER_ACTION_ERROR:", error);
    return { 
      success: false, 
      error: String(error.message || "Database Insertion Failed") 
    };
  }
}

export async function joinDebate(debateId: string, userId: string, userName: string, side: string) {
  try {
    const debate = await db.query.debates.findFirst({
      where: eq(debates.id, debateId),
      with: { participants: true }
    });

    if (!debate) return { success: false, error: 'Debate not found' };
    if (debate.status !== 'waiting') return { success: false, error: 'Battle already started' };

    const isAlreadyIn = debate.participants.some(p => p.userId === userId);
    if (isAlreadyIn) return { success: false, error: 'Already joined' };

    await db.insert(participants).values({
      debateId,
      userId,
      userName,
      side,
      reputation: 0,
    });

    const hasFor = debate.participants.some(p => p.side === 'FOR') || side === 'FOR';
    const hasAgainst = debate.participants.some(p => p.side === 'AGAINST') || side === 'AGAINST';

    if (hasFor && hasAgainst && !debate.waitingStartedAt) {
      await db.update(debates)
        .set({ waitingStartedAt: sql`now()` })
        .where(eq(debates.id, debateId));
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: String(error.message) };
  }
}

export async function updateDebateStatus(debateId: string, status: 'active' | 'finished') {
  try {
    await db.update(debates).set({ status }).where(eq(debates.id, debateId));
    return { success: true };
  } catch (error: any) {
    return { success: false, error: String(error.message) };
  }
}

export async function submitNuclearStrike(debateId: string, userId: string, argumentId: string) {
  try {
    await db.update(debateArguments)
      .set({ isNuclear: 1 })
      .where(and(eq(debateArguments.debateId, debateId), eq(debateArguments.authorId, userId), eq(debateArguments.id, argumentId)));
    return { success: true };
  } catch (error: any) {
    return { success: false, error: String(error.message) };
  }
}

export async function voteForSide(debateId: string, side: 'FOR' | 'AGAINST' | 'DRAW') {
  try {
    if (side === 'FOR') {
      await db.update(debates).set({ forVotes: sql`${debates.forVotes} + 1` }).where(eq(debates.id, debateId));
    } else if (side === 'AGAINST') {
      await db.update(debates).set({ againstVotes: sql`${debates.againstVotes} + 1` }).where(eq(debates.id, debateId));
    } else {
      await db.update(debates).set({ drawVotes: sql`${debates.drawVotes} + 1` }).where(eq(debates.id, debateId));
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: String(error.message) };
  }
}

export async function finalizeDebate(debateId: string) {
  try {
    const debate = await db.query.debates.findFirst({
      where: eq(debates.id, debateId),
    });
    if (!debate) return { success: false, error: "Debate not found" };

    let winnerSide: 'FOR' | 'AGAINST' | 'DRAW' = 'DRAW';
    if (debate.forVotes > debate.againstVotes) winnerSide = 'FOR';
    else if (debate.againstVotes > debate.forVotes) winnerSide = 'AGAINST';

    const debateParticipants = await db.query.participants.findMany({
      where: eq(participants.debateId, debateId),
    });

    for (const p of debateParticipants) {
      let rep = 5;
      if (winnerSide === 'DRAW') rep = 5;
      else if (p.side === winnerSide) rep = 10;
      else rep = 3;

      await db.update(participants).set({ reputation: rep }).where(eq(participants.id, p.id));
    }

    await db.update(debates).set({ status: 'finished' }).where(eq(debates.id, debateId));
    return { success: true };
  } catch (error: any) {
    return { success: false, error: String(error.message) };
  }
}

export async function voteRematch(debateId: string) {
  try {
    await db.update(debates).set({ rematchVotes: sql`${debates.rematchVotes} + 1` }).where(eq(debates.id, debateId));
    return { success: true };
  } catch (error: any) {
    return { success: false, error: String(error.message) };
  }
}

export async function getTopDebates() {
  try {
    const res = await db.query.debates.findMany({
      orderBy: [desc(debates.createdAt)],
      limit: 20,
      with: { arguments: true, participants: true }
    });
    return JSON.parse(JSON.stringify(res));
  } catch (error) {
    return [];
  }
}

export async function voteDebate(id: string, type: 'like' | 'dislike') {
  try {
    if (type === 'like') {
      await db.update(debates).set({ likes: sql`${debates.likes} + 1` }).where(eq(debates.id, id));
    } else {
      await db.update(debates).set({ dislikes: sql`${debates.dislikes} + 1` }).where(eq(debates.id, id));
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: String(error.message) };
  }
}

export async function addSuggestion(topic: string, language: string) {
  try {
    await db.insert(suggestions).values({ topic, language });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: String(error.message) };
  }
}

export async function getSuggestions() {
  try {
    const res = await db.query.suggestions.findMany({
      orderBy: [desc(suggestions.createdAt)],
      limit: 10,
    });
    return JSON.parse(JSON.stringify(res));
  } catch (error) {
    return [];
  }
}

export async function getDebateWithArguments(id: string) {
  try {
    const debate = await db.query.debates.findFirst({
      where: eq(debates.id, id),
      with: { arguments: true, participants: true }
    });
    return debate ? JSON.parse(JSON.stringify(debate)) : null;
  } catch (error) {
    return null;
  }
}

export async function addArgumentToDebate(debateId: string, content: string, side: string, userId: string, userName: string) {
  try {
    await db.insert(debateArguments).values({
      debateId,
      content,
      side,
      authorId: userId,
      authorName: userName,
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: String(error.message) };
  }
}
