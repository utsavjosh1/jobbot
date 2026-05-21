import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ChatService } from "../services/chat.service.js";
import { conversationQueries } from "@postly/database";
import type { JwtPayload } from "../middleware/auth.js";

// ─── Validation ──────────────────────────────────────────────────────────────

const createConversationSchema = z.object({
  resume_id: z.string().uuid().nullable().optional(),
  model: z.string().nullable().optional(),
  initial_message: z.string().optional(),
});

const streamSchema = z.object({
  message: z.string().min(1, "Message is required"),
  conversation_id: z.string().uuid("Invalid conversation ID"),
  resume_id: z.string().uuid().nullable().optional(),
});

const editMessageSchema = z.object({
  content: z.string().min(1, "Content is required"),
  conversation_id: z.string().uuid("Invalid conversation ID"),
});

// ─── Typed Request Params ────────────────────────────────────────────────────

type IdParams = { id: string };

// ─── Controller ──────────────────────────────────────────────────────────────

export class ChatController {
  private chatService: ChatService;

  constructor() {
    this.chatService = new ChatService();
  }

  // GET /conversations
  getConversations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: userId } = req.user as JwtPayload;
      const includeArchived = req.query.include_archived === "true";
      const limit = parseInt((req.query.limit as string) || "50", 10);

      const conversations = await conversationQueries.findByUser(
        userId,
        limit,
        includeArchived,
      );

      res.json({ success: true, data: conversations });
    } catch (error) {
      next(error);
    }
  };

  // POST /conversations
  createConversation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = createConversationSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }

      const { id: userId } = req.user as JwtPayload;
      const { resume_id, model, initial_message } = validation.data;

      const conversation = await conversationQueries.create(
        userId,
        resume_id ?? undefined,
        model ?? undefined,
      );

      if (initial_message) {
        await conversationQueries.createMessage(
          conversation.id,
          "user",
          initial_message,
        );
      }

      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  };

  // GET /conversations/:id
  getConversationById = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: userId } = req.user as JwtPayload;
      const { id } = req.params;

      const conversation = await conversationQueries.findById(id, userId);
      if (!conversation) {
        res.status(404).json({
          success: false,
          error: { message: "Conversation not found" },
        });
        return;
      }

      const messages = await conversationQueries.getMessages(id);

      res.json({ success: true, data: { conversation, messages } });
    } catch (error) {
      next(error);
    }
  };

  // GET /conversations/:id/thread — active branch only
  getActiveThread = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: userId } = req.user as JwtPayload;
      const { id } = req.params;

      const conversation = await conversationQueries.findById(id, userId);
      if (!conversation) {
        res.status(404).json({
          success: false,
          error: { message: "Conversation not found" },
        });
        return;
      }

      const limit = parseInt((req.query.limit as string) || "100", 10);
      const messages = await conversationQueries.getActiveThread(id, limit);

      res.json({ success: true, data: { conversation, messages } });
    } catch (error) {
      next(error);
    }
  };

  // PATCH /conversations/:id/archive
  archiveConversation = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: userId } = req.user as JwtPayload;
      const { id } = req.params;
      const isArchived = req.body.is_archived !== false; // default true

      // Verify ownership
      const conversation = await conversationQueries.findById(id, userId);
      if (!conversation) {
        res.status(404).json({
          success: false,
          error: { message: "Conversation not found" },
        });
        return;
      }

      await conversationQueries.setArchived(id, isArchived);

      res.json({
        success: true,
        data: { id, is_archived: isArchived },
      });
    } catch (error) {
      next(error);
    }
  };

  // DELETE /conversations/:id
  deleteConversation = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: userId } = req.user as JwtPayload;
      const { id } = req.params;

      const deleted = await conversationQueries.delete(id, userId);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { message: "Conversation not found" },
        });
        return;
      }

      res.json({ success: true, data: { id } });
    } catch (error) {
      next(error);
    }
  };

  // ─── Message Operations ────────────────────────────────────────────────

  // POST /messages/:id/edit
  editMessage = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = editMessageSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }

      const { id: messageId } = req.params;
      const { content, conversation_id } = validation.data;

      const newMessage = await conversationQueries.editMessage(
        messageId,
        content,
        conversation_id,
      );

      res.json({ success: true, data: newMessage });
    } catch (error) {
      next(error);
    }
  };

  // POST /messages/:id/cancel
  cancelMessage = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: messageId } = req.params;

      await conversationQueries.cancelMessage(messageId);

      res.json({
        success: true,
        data: { id: messageId, status: "cancelled" },
      });
    } catch (error) {
      next(error);
    }
  };

  // GET /messages/:id/versions
  getMessageVersions = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: parentMessageId } = req.params;
      const role = (req.query.role as string) || "user";

      const versions = await conversationQueries.getMessageVersions(
        parentMessageId,
        role,
      );

      res.json({ success: true, data: versions });
    } catch (error) {
      next(error);
    }
  };

  // ─── Streaming ─────────────────────────────────────────────────────────

  // POST /stream
  streamResponse = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = streamSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }

      const { id: userId } = req.user as JwtPayload;
      const { message, conversation_id, resume_id } = validation.data;

      const conversation = await conversationQueries.findById(
        conversation_id,
        userId,
      );
      if (!conversation) {
        res.status(404).json({
          success: false,
          error: { message: "Conversation not found" },
        });
        return;
      }

      // SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const stream = this.chatService.streamChatResponse(
        conversation_id,
        userId,
        message,
        resume_id ?? undefined,
      );

      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      next(error);
    }
  };
}
