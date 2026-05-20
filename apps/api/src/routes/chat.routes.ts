import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { ChatController } from "../controllers/chat.controller.js";

const router = Router();
const chatController = new ChatController();

router.use(authenticateToken);

router.get("/conversations", chatController.getConversations);
router.post("/conversations", chatController.createConversation);
router.get("/conversations/:id", chatController.getConversationById);
router.get("/conversations/:id/thread", chatController.getActiveThread);
router.patch("/conversations/:id/archive", chatController.archiveConversation);
router.delete("/conversations/:id", chatController.deleteConversation);
router.post("/messages/:id/edit", chatController.editMessage);
router.post("/messages/:id/cancel", chatController.cancelMessage);
router.get("/messages/:id/versions", chatController.getMessageVersions);
router.post("/stream", chatController.streamResponse);

export default router;
