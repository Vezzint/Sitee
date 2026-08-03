import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const debates = pgTable("debates", {
  id: uuid("id").primaryKey().defaultRandom(),
  topic: text("topic").notNull(),
  language: text("language").notNull(),
  side: text("side").notNull(), // 'FOR' or 'AGAINST' (initial side)
  status: text("status").default("waiting").notNull(), // 'waiting', 'active', 'finished'
  waitingStartedAt: timestamp("waiting_started_at", { withTimezone: true, mode: "date" }),
  likes: integer("likes").default(0).notNull(),
  dislikes: integer("dislikes").default(0).notNull(),
  forVotes: integer("for_votes").default(0).notNull(),
  againstVotes: integer("against_votes").default(0).notNull(),
  drawVotes: integer("draw_votes").default(0).notNull(),
  rematchVotes: integer("rematch_votes").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const debateArguments = pgTable("debate_arguments", {
  id: uuid("id").primaryKey().defaultRandom(),
  debateId: uuid("debate_id").references(() => debates.id).notNull(),
  content: text("content").notNull(),
  side: text("side").notNull(), // 'FOR' or 'AGAINST'
  authorId: text("author_id"),
  authorName: text("author_name"),
  isNuclear: integer("is_nuclear").default(0).notNull(), // 0 or 1
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  debateId: uuid("debate_id").references(() => debates.id).notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  side: text("side").notNull(),
  reputation: integer("reputation").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const suggestions = pgTable("suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  topic: text("topic").notNull(),
  language: text("language").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const debatesRelations = relations(debates, ({ many }) => ({
  arguments: many(debateArguments),
  participants: many(participants),
}));

export const debateArgumentsRelations = relations(debateArguments, ({ one }) => ({
  debate: one(debates, {
    fields: [debateArguments.debateId],
    references: [debates.id],
  }),
}));

export const participantsRelations = relations(participants, ({ one }) => ({
  debate: one(debates, {
    fields: [participants.debateId],
    references: [debates.id],
  }),
}));
