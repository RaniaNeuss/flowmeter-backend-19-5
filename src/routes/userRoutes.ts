import { Router } from 'express';
import { getUsers,refreshtoken,createGroupWithPermissions,sendOtpToUser,downloadAttachment,getAllPermissions, upsertTablePermission, upsertFieldPermission, getUserPreferences,  saveUserPreferences,verifyOtp,editUser,forgotPassword, resetPassword ,getMyProfile, Register,createUser, deleteUser, getGroups, createGroup, deleteGroup, getUser, login , authStatus ,logout,editProfile } from '../controllers/userController';
import passport from "passport";
import jwt from "jsonwebtoken";
import { JWT_SECRET, REFRESH_SECRET } from "../lib/config";
import { authorizeRoles } from '../lib/authorizeRoles';
import { UserStatus } from "@prisma/client"; // 👈 import the enum
import { authenticateUser } from "../lib/authMiddleware";
import { Request, Response, NextFunction } from "express";

declare module "express-session" {
    interface SessionData {
        userId: string; // Add userId as a string
      
        viewId: string;
    }
}

interface User {
    id: string;
    username: string;
    password: string;
    name: string | null;
    email: string;
    otpCode:string | null;
    otpExpiry :Date | null;
    info: string | null;
    createdAt: Date;
    loginAttempts: number;
    updatedAt: Date; 
    status: UserStatus;
    resetToken : string| null;  // <-- Add this
  resetTokenExpiry: Date | null; // <-- Add this
  }
const router = Router();

/** ===========================
 *        GROUP ROUTES
 * =========================== */
router.get('/groups', authenticateUser, authorizeRoles('SuperAdmin'), getGroups);
router.post('/groups', authenticateUser, authorizeRoles('SuperAdmin'), createGroup);
router.delete('/groups/:id', authenticateUser, authorizeRoles('SuperAdmin'), deleteGroup);

/** ===========================
 *        USER ROUTES
 * =========================== */
router.get('/me', authenticateUser, getMyProfile); // Specific route before dynamic route
router.put('/me', authenticateUser, editProfile);   // Update own profile

router.get('/', authenticateUser, authorizeRoles('SuperAdmin'), getUsers); // Admin only
router.post('/', authenticateUser, authorizeRoles('SuperAdmin'), createUser); // Admin only
router.get('/:id', authenticateUser, getUser); // Dynamic route
router.put('/:id', authenticateUser, authorizeRoles('SuperAdmin'), editUser); // Admin only
router.delete('/:id', authenticateUser, authorizeRoles('SuperAdmin'),  deleteUser);
router.post(
  '/preferences',authenticateUser,saveUserPreferences
);

router.get('/get/preferences/:tableName',authenticateUser,getUserPreferences
);
router.post("/register", Register);
/** ===========================
 *       permission ROUTES
 * =========================== */

router.get('/permissions/table', getAllPermissions);

router.post('/permissions/table', authenticateUser, authorizeRoles('SuperAdmin'), upsertTablePermission);
router.post('/permissions/field', authenticateUser, authorizeRoles('SuperAdmin'), upsertFieldPermission);
router.post("/with-permissions", createGroupWithPermissions);

/** ===========================
 *        AUTH ROUTES
 * =========================== */

router.post("/refreshtoken", async (req: Request, res: Response): Promise<void> => {
  // If no session, try Bearer token authentication (for Mobile) or cookies
    let refreshToken = req.cookies.refreshToken || req.headers['authorization']?.split(' ')[1];

     if (!refreshToken) {
        console.error("Refresh token not provided");
        res.status(401).json({ message: "Refresh token not provided" });
        return;
    }
    try {
        // Verify the refresh token
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET as string) as { id: string };

        // Generate a new access token
        const newtoken = jwt.sign(
            { id: decoded.id },
            process.env.JWT_SECRET as string,
            { expiresIn: "120m" } // 15 minutes
        );

        res.status(200).json({ token: newtoken });
    } catch (err) {
        res.status(403).json({ message: "Invalid refresh token" });
    }
});
router.post("/login",login);
router.post("/logout", (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ message: "Logout error" });

        req.session.destroy((destroyErr) => {
            if (destroyErr) return res.status(500).json({ message: "Error logging out" });
            res.clearCookie("connect.sid"); // Clear the session cookie
            res.clearCookie("refreshToken");
            res.clearCookie("user")
            res.clearCookie("token");
            res.json({ message: "Logged out successfully" });
        });
    });
});
router.get('/auth/status', authStatus);


/** ===========================
 *     OTP VERIFICATION ROUTES
 * =========================== */
router.post('/auth/send-otp', sendOtpToUser);
router.post('/auth/verify-otp', verifyOtp);

/** ===========================
 *     PASSWORD RESET ROUTES
 * =========================== */
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);



router.get('/files/:id', downloadAttachment);








export default router;








// router.post("/login", (req: Request, res: Response, next: NextFunction) => {
//     passport.authenticate(
//       "local",
//       (err: Error | null, user: User | false, info: { message: string }) => {
//         if (err) {
//           return res.status(500).json({ message: "Internal error" });
//         }
  
//         if (!user) {
//           return res.status(401).json({ message: info?.message || "Invalid credentials" });
//         }
  
//         req.logIn(user, (loginErr) => {
//           if (loginErr) {
//             return res.status(500).json({ message: "Login error" });
//           }
  
//           // **Session for Web Clients**
//           req.session.userId = user.id; // Store userId in the session
  
//           // Generate JWT Token for Mobile Clients
//           const token = jwt.sign(
//             { id: user.id, email: user.email, },
//             JWT_SECRET,
//             { expiresIn: "120m" }
//           );
  
//           const refreshToken = jwt.sign(
//             { id: user.id },
//             REFRESH_SECRET,
//             { expiresIn: "7d" }
//           );
  
//           // **Set access Token in HTTP-Only Cookie (Web Only)**
//           res.cookie("token", token, {
//             httpOnly: true,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: "strict",
//             maxAge:  2* 60 * 60 * 1000, 
//           });

//           res.cookie("refreshToken", refreshToken, {
//             httpOnly: true,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: "strict",
//             maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
//           });
  
//           // **Response for Mobile**
//           res.status(200).json({
//             message: "Logged in successfully",
//             user,
//             token,
//             refreshToken,
//             expiresIn:  2* 60 * 60 * 1000,
//           });
//         });
//       }
//     )(req, res, next);
//   });

