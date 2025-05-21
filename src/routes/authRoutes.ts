import express from "express";
import { login, refreshtoken, logout } from "../controllers/userController";
import { authenticateUser } from "../lib/authMiddleware";

const router = express.Router();

router.post("/login", login); // Login endpoint
router.post("/refresh-token", refreshtoken); // Refresh token endpoint
router.post("/logout", logout); // Logout endpoint

export default router;
