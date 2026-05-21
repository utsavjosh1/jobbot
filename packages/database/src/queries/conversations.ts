import { eq, asc, and, desc, ilike } from "drizzle-orm";
import { db } from "../index.js";
import { conversations, messages } from "../schema.js";
import type { Conversation, Message } from "@postly/shared-types";

export const conversationQueries = {
  /**
   * Create a new conversation
   */
  async create(
    userId: string,
    resumeId?: string,
    model?: string,
  ): Promise<Conversation> {
    const [result] = await db
      .insert(conversations)
      .values({ user_id: userId, resume_id: resumeId, model })
      .returning();

    return result as unknown as Conversation;
  },

  /**
   * Get all conversations for a user
   */
  async findByUser(
    userId: string,
    limit = 50,
    includeArchived = false,
  ): Promise<Conversation[]> {
    const result = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.user_id, userId),
          includeArchived ? undefined : eq(conversations.is_archived, false),
        ),
      )
      .orderBy(desc(conversations.updated_at))
      .limit(limit);

    return result as unknown as Conversation[];
  },

  /**
   * Get a single conversation by ID
   */
  async findById(id: string, userId: string): Promise<Conversation | null> {
    const [result] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.user_id, userId)));

    return (result as unknown as Conversation) || null;
  },

  /**
   * Update conversation title
   */
  async updateTitle(id: string, title: string): Promise<void> {
    await db
      .update(conversations)
      .set({ title, updated_at: new Date() })
      .where(eq(conversations.id, id));
  },

  /**
   * Update the resume associated with a conversation
   */
  async updateResumeId(id: string, resumeId: string): Promise<void> {
    await db
      .update(conversations)
      .set({ resume_id: resumeId, updated_at: new Date() })
      .where(eq(conversations.id, id));
  },

  /**
   * Delete a conversation
   */
  async delete(id: string, userId: string): Promise<boolean> {
    const [result] = await db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.user_id, userId)))
      .returning();

    return !!result;
  },

  async getActiveThread(conversationId: string, limit = 100) {
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.conversation_id, conversationId))
      .orderBy(asc(messages.created_at))
      .limit(limit);

    return result as unknown as Message[];
  },

  async setArchived(id: string, isArchived: boolean) {
    await db
      .update(conversations)
      .set({ is_archived: isArchived, updated_at: new Date() })
      .where(eq(conversations.id, id));
  },

  async editMessage(
    messageId: string,
    content: string,
    conversationId: string,
  ) {
    const [result] = await db
      .insert(messages)
      .values({
        conversation_id: conversationId,
        role: "user",
        content,
        metadata: { edited_from: messageId },
      })
      .returning();

    return result as unknown as Message;
  },

  async cancelMessage(messageId: string) {
    await db
      .update(messages)
      .set({
        metadata: { cancelled: true },
      })
      .where(eq(messages.id, messageId));
  },

  async getMessageVersions(parentMessageId: string, role: string) {
    const result = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.role, role),
          // This is a simplified versioning logic
          ilike(messages.content, `%${parentMessageId}%`),
        ),
      );

    return result as unknown as Message[];
  },

  // ─── Message Operations ──────────────────────────────────────────────────

  /**
   * Create a new message in a conversation
   */
  async createMessage(
    conversationId: string,
    role: string,
    content: string,
    tokensUsed?: number,
    metadata?: unknown,
  ): Promise<Message> {
    const [result] = await db
      .insert(messages)
      .values({
        conversation_id: conversationId,
        role,
        content,
        tokens_used: tokensUsed,
        metadata,
      })
      .returning();

    // Touch conversation timestamp
    await db
      .update(conversations)
      .set({ updated_at: new Date() })
      .where(eq(conversations.id, conversationId));

    return result as unknown as Message;
  },

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, limit = 100): Promise<Message[]> {
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.conversation_id, conversationId))
      .orderBy(asc(messages.created_at))
      .limit(limit);

    return result as unknown as Message[];
  },
};
