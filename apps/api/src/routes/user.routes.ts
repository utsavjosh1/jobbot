import { Router } from "express";
import multer from "multer";
import path from "path";
import { UserController } from "../controllers/user.controller.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();
const userController = new UserController();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "uploads/avatars"),
  filename: (_req, file, cb) =>
    cb(
      null,
      `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`,
    ),
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Only JPEG, PNG, and WebP are allowed."),
      );
    }
  },
});

router.use(authenticateToken);

router.get("/profile", userController.getProfile);
router.patch("/profile", userController.updateProfile);
router.get("/seeker-profile", userController.getSeekerProfile);
router.patch("/seeker-profile", userController.updateSeekerProfile);
router.get("/employer-profile", userController.getEmployerProfile);
router.patch("/employer-profile", userController.updateEmployerProfile);
router.get("/subscription", userController.getSubscription);
router.post("/change-password", userController.changePassword);
router.post(
  "/upload-avatar",
  upload.single("avatar"),
  userController.uploadAvatar,
);

export default router;
