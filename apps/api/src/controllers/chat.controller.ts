import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ChatService } from "../services/chat.service.js";
import { conversationQueries } from "@postly/database";
import type { JwtPayload } from "../middleware/auth.js";

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

type IdParams = { id: string };

function sendValidationError(res: Response, error: z.ZodError) {
  res
    .status(400)
    .json({ success: false, error: { message: error.issues[0].message } });
}

function userFromRequest(req: Request): string {
  return (req.user as JwtPayload).id;
}

function notFound(res: Response, message = "Not found") {
  res.status(404).json({ success: false, error: { message } });
}

export class ChatController {
  private chatService = new ChatService();

  getConversations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = userFromRequest(req);
      const conversations = await conversationQueries.findByUser(
        userId,
        parseInt((req.query.limit as string) || "50", 10),
        req.query.include_archived === "true",
      );
      res.json({ success: true, data: conversations });
    } catch (error) {
      next(error);
    }
  };

  createConversation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = createConversationSchema.safeParse(req.body);
      if (!validation.success) {
        sendValidationError(res, validation.error);
        return;
      }

      const userId = userFromRequest(req);
      const { resume_id, model, initial_message } = validation.data;
      const conversation = await conversationQueries.create(
        userId,
        resume_id ?? undefined,
        model ?? undefined,
      );

      if (initial_message)
        await conversationQueries.createMessage(
          conversation.id,
          "user",
          initial_message,
        );
      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  };

  getConversationById = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = userFromRequest(req);
      const conversation = await conversationQueries.findById(
        req.params.id as string,
        userId,
      );
      if (!conversation) {
        notFound(res, "Conversation not found");
        return;
      }
      res.json({
        success: true,
        data: {
          conversation,
          messages: await conversationQueries.getMessages(
            req.params.id as string,
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getActiveThread = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = userFromRequest(req);
      const conversation = await conversationQueries.findById(
        req.params.id as string,
        userId,
      );
      if (!conversation) {
        notFound(res, "Conversation not found");
        return;
      }
      const messages = await conversationQueries.getActiveThread(
        req.params.id as string,
        parseInt((req.query.limit as string) || "100", 10),
      );
      res.json({ success: true, data: { conversation, messages } });
    } catch (error) {
      next(error);
    }
  };

  archiveConversation = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = userFromRequest(req);
      const conversation = await conversationQueries.findById(
        req.params.id as string,
        userId,
      );
      if (!conversation) {
        notFound(res, "Conversation not found");
        return;
      }
      const isArchived = req.body.is_archived !== false;
      await conversationQueries.setArchived(
        req.params.id as string,
        isArchived,
      );
      res.json({
        success: true,
        data: { id: req.params.id as string, is_archived: isArchived },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteConversation = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = userFromRequest(req);
      const deleted = await conversationQueries.delete(
        req.params.id as string,
        userId,
      );
      if (!deleted) {
        notFound(res, "Conversation not found");
        return;
      }
      res.json({ success: true, data: { id: req.params.id as string } });
    } catch (error) {
      next(error);
    }
  };

  editMessage = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = editMessageSchema.safeParse(req.body);
      if (!validation.success) {
        sendValidationError(res, validation.error);
        return;
      }
      const newMessage = await conversationQueries.editMessage(
        req.params.id as string,
        validation.data.content,
        validation.data.conversation_id,
      );
      res.json({ success: true, data: newMessage });
    } catch (error) {
      next(error);
    }
  };

  cancelMessage = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await conversationQueries.cancelMessage(req.params.id as string);
      res.json({
        success: true,
        data: { id: req.params.id as string, status: "cancelled" },
      });
    } catch (error) {
      next(error);
    }
  };

  getMessageVersions = async (
    req: Request<IdParams>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const versions = await conversationQueries.getMessageVersions(
        req.params.id as string,
        (req.query.role as "user" | "assistant" | "system") || "user",
      );
      res.json({ success: true, data: versions });
    } catch (error) {
      next(error);
    }
  };

  streamResponse = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = streamSchema.safeParse(req.body);
      if (!validation.success) {
        sendValidationError(res, validation.error);
        return;
      }

      const userId = userFromRequest(req);
      const { message, conversation_id, resume_id } = validation.data;

      const conversation = await conversationQueries.findById(
        conversation_id,
        userId,
      );
      if (!conversation) {
        notFound(res, "Conversation not found");
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      for await (const event of this.chatService.streamChatResponse(
        conversation_id,
        userId,
        message,
        resume_id ?? undefined,
      )) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      next(error);
    }
  };
}
