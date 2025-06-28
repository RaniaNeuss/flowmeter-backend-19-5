import { Request, Response,NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
import jwt, { SignOptions } from 'jsonwebtoken';

import {   JWT_SECRET,
  REFRESH_SECRET,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  COOKIE_ACCESS_TOKEN_MAX_AGE,
  COOKIE_REFRESH_TOKEN_MAX_AGE } from "../lib/config";
import { User as PrismaUser } from "@prisma/client";
import { sendResetOtpEmail } from "../lib/sendemail";
import { sendOtpEmail } from "../lib/sendotp"; // Make sure to create this helper
import passport from "passport";
declare global {
    namespace Express {
        interface User extends PrismaUser {}
    }
}




/** ===========================
 *        ADMIN
 * =========================== */

// Controller: Create User
export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, group,  username } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "validation_error", message: "Email and password are required" });
      return;
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      res.status(409).json({ error: "conflict_error", message: `Email "${email}" is already taken` });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let assignedGroup = await prisma.group.findUnique({ where: { name: group || "User" } });
    if (!assignedGroup) {
      assignedGroup = await prisma.group.create({ data: { name: group || "User" } });
    }

    const newUser = await prisma.user.create({
      data: {
        email,
          username,
        password: hashedPassword,
        groupId: assignedGroup.id
      }
    });

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: newUser.id,
        email: newUser.email,
        group: assignedGroup.name
      }
    });
  } catch (err: any) {
    console.error("Failed to create user:", err.message);
    res.status(500).json({ error: "unexpected_error", message: err.message });
  }
};
export const editUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminUserId = req.userId;
    const { id } = req.params;
    const { email, name, info, username, password, group, status } = req.body;

    if (!id) {
      res.status(400).json({ error: "validation_error", message: "User ID is required." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: "not_found", message: `User with ID ${id} not found.` });
      return;
    }

    const isAdmin = await prisma.user.findFirst({ where: { id: adminUserId, groupId: 1 } });
    if (!isAdmin && adminUserId !== id) {
      res.status(403).json({ error: "forbidden", message: "You do not have permission to edit this user." });
      return;
    }

    const updateData: any = {
      email: email || undefined,
      name: name || undefined,
      info: info || undefined,
      username: username || undefined,
      updatedAt: new Date()
    };

    // Hash password if provided
    if (password) {
      if (password.length < 6) {
        res.status(400).json({ error: "validation_error", message: "Password must be at least 6 characters long" });
        return;
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Handle status update + loginAttempts reset if status is reactivated
    if (status) {
      updateData.status = status;
      if (status === "active" && user.status === "suspended") {
        updateData.loginAttempts = 0;
      }
    }

    // Group update
    if (group) {
      const existingGroup = await prisma.group.findUnique({ where: { name: group } });
      if (!existingGroup) {
        res.status(404).json({ error: "not_found", message: `Group "${group}" does not exist.` });
        return;
      }
      updateData.groupId = existingGroup.id;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      message: "User updated successfully.",
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        name: updatedUser.name,
        status: updatedUser.status,
        loginAttempts: updatedUser.loginAttempts,
        groupId: updatedUser.groupId,
        updatedAt: updatedUser.updatedAt,
      },
    });

  } catch (err: any) {
    console.error(`Failed to edit user with ID ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: "unexpected_error", message: "An error occurred while updating the user." });
  }
};
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        info: true,
        status: true,
        loginAttempts: true,
        createdAt: true,
        updatedAt: true,
       tablePermissions: {
  select: {
    tableName: true,
    canRead: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true
  }
}
,
        group: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    console.info("Fetched all users successfully");
    res.status(200).json(users);
  } catch (err: any) {
    console.error("API get users error:", err.message);
    res.status(500).json({ error: "Failed to fetch users", details: err.message });
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
      // 1) Debug: Log session details (optional)
      console.log("Session Data:", req.session);
  
      // 2) Confirm that the current user is logged in
      const loggedInUserId = req.userId;
      console.log("loggedInUserId:", loggedInUserId);
      if (!loggedInUserId) {
        res
          .status(401)
          .json({ error: "unauthorized", message: "User is not logged in" });
        return;
      }
  
      // 3) Extract the target user ID from URL params (e.g. DELETE /users/:id)
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ error: "validation_error", message: "No user ID provided in params" });
        return;
      }
  
      // 4) Check if the user we want to delete actually exists
      const existingUser = await prisma.user.findUnique({ where: { id } });
      if (!existingUser) {
        console.warn(`User with ID ${id} not found`);
        res.status(404).json({ error: "not_found", message: "User not found" });
        return;
      }
  
      // 5) Optionally, check if the logged-in user has permission to delete
      //    For example, only a SuperAdmin or deleting themselves
      //    (Uncomment / adapt if you want some permission logic:)
      // const isAdmin = await prisma.user.findFirst({
      //   where: { id: loggedInUserId, groups: { some: { name: "SuperAdmin" } } },
      // });
      // if (!isAdmin && loggedInUserId !== id) {
      //   return res
      //     .status(403)
      //     .json({ error: "forbidden", message: "No permission to delete this user" });
      // }
  
      // 6) Delete the user by ID
      await prisma.user.delete({ where: { id } });
      console.info(`User deleted successfully: ${id}`);
  
      // 7) Return status 204 (No Content)
      res.status(204).end();
    } catch (err: any) {
      console.error("Error deleting user:", err.message);
      // If you have a custom handleError:
      // handleError(res, err, "api delete user");
      // else just do:
      res.status(500).json({ error: "unexpected_error", message: err.message });
    }
  };

export const getGroups = async (req: Request, res: Response): Promise<void> => {
    try {
          

     
       // Retrieve userId from session
        const userId = req.userId;       console.log('userId:', userId);
         const groups = await prisma.group.findMany();
         console.info("Fetched all groups successfully");
        res.status(200).json(groups);
    } catch (err: any) {
        console.error("api get groups: " + err.message);
        handleError(res, err, "api get groups");
    }
};

// Controller: Create Group
export const createGroup = async (req: Request, res: Response): Promise<void> => {
    try {
          


       // Retrieve userId from session
        const userId = req.userId;       console.log('userId:', userId);

        const { name } = req.body;

        // Check if the group already exists
        const existingGroup = await prisma.group.findUnique({ where: { name } });
        if (existingGroup) {
            console.warn(`Group creation failed: group "${name}" already exists`);
            res.status(409).json({ error: "conflict_error", message: `Group "${name}" already exists` });
            return;
        }

        const newGroup = await prisma.group.create({
            data: { name },
        });

        console.info(`Group created successfully: ${newGroup.name}`);
        res.status(201).json(newGroup);
    } catch (err: any) {
        console.error("api post groups: " + err.message);
        handleError(res, err, "api post groups");
    }
};

// Controller: Delete Group by ID
export const deleteGroup = async (req: Request, res: Response): Promise<void> => {
    try {

       // Retrieve userId from session
        const userId = req.userId;       console.log('userId:', userId);

        await prisma.group.delete({ where: { id: Number(userId) } });
        console.info(`Group deleted successfully: ${userId}`);
        res.status(204).end();
    } catch (err: any) {
        console.error("api delete groups: " + err.message);
        handleError(res, err, "api delete groups");
    }
};
export const upsertTablePermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, groupId, tableName, canRead, canCreate, canUpdate, canDelete } = req.body;

    if (!tableName || (!userId && !groupId)) {
      res.status(400).json({ error: 'validation_error', message: 'tableName and either userId or groupId are required' });
      return;
    }

    const where = userId
      ? { userId_tableName: { userId, tableName } }
      : { groupId_tableName: { groupId, tableName } };

    const data = {
      tableName,
      canRead: !!canRead,
      canCreate: !!canCreate,
      canUpdate: !!canUpdate,
      canDelete: !!canDelete,
      userId: userId || undefined,
      groupId: groupId || undefined,
    };

    const permission = await prisma.tablePermission.upsert({
      where,
      update: data,
      create: data,
    });

    res.status(200).json({ message: 'Table permission saved', permission });
  } catch (error: any) {
    console.error('Error upserting table permission:', error);
    res.status(500).json({ error: 'unexpected_error', message: error.message });
  }
};

// ✅ Create or Update Field Permission
export const upsertFieldPermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, groupId, tableName, fieldName, canRead, canUpdate } = req.body;

    if (!tableName || !fieldName || (!userId && !groupId)) {
      res.status(400).json({ error: 'validation_error', message: 'tableName, fieldName and either userId or groupId are required' });
      return;
    }

    const where = userId
      ? { userId_tableName_fieldName: { userId, tableName, fieldName } }
      : { groupId_tableName_fieldName: { groupId, tableName, fieldName } };

    const data = {
      tableName,
      fieldName,
      canRead: !!canRead,
      canUpdate: !!canUpdate,
      userId: userId || undefined,
      groupId: groupId || undefined,
    };

    const permission = await prisma.fieldPermission.upsert({
      where,
      update: data,
      create: data,
    });

    res.status(200).json({ message: 'Field permission saved', permission });
  } catch (error: any) {
    console.error('Error upserting field permission:', error);
    res.status(500).json({ error: 'unexpected_error', message: error.message });
  }
};

// GET /api/permissions
export const getAllPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const tablePermissions = await prisma.tablePermission.findMany({
      include: {
        user: {
          select: { id: true, username: true, email: true },
        },
        group: {
          select: { id: true, name: true },
        },
      },
    });

    const fieldPermissions = await prisma.fieldPermission.findMany({
      include: {
        user: {
          select: { id: true, username: true, email: true },
        },
        group: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(200).json({
      message: "Permissions fetched successfully",
      tablePermissions,
      fieldPermissions,
    });
  } catch (error: any) {
    console.error("❌ getAllPermissions error:", error.message);
    res.status(500).json({ error: "Failed to retrieve permissions", details: error.message });
  }
};


// DELETE /api/permissions/table/:id
export const deleteTablePermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.tablePermission.delete({
      where: { id: Number(id) },
    });

    res.status(200).json({ message: "Table permission deleted successfully" });
  } catch (error: any) {
    console.error("❌ deleteTablePermission error:", error.message);
    res.status(500).json({ error: "Failed to delete table permission", details: error.message });
  }
};




/** ===========================
 *        USER
 * =========================== */
// Controller: Sign in User

export const login = (req: Request, res: Response, next: NextFunction): void => {
  passport.authenticate("local", async (err: any, user: any, info: any) => {
    if (err) return res.status(500).json({ message: "Internal server error" });
    if (!user) return res.status(401).json({ message: info?.message || "Invalid email or password" });

    req.logIn(user, (loginErr) => {
      if (loginErr) return res.status(500).json({ message: "Login failed" });

      req.session.userId = user.id;

      const token = jwt.sign(
        { id: user.id, email: user.email, group: user.group.name },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES_IN } as SignOptions
      );

      const refreshToken = jwt.sign(
        { id: user.id },
        REFRESH_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES_IN } as SignOptions
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: COOKIE_ACCESS_TOKEN_MAX_AGE,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: COOKIE_REFRESH_TOKEN_MAX_AGE,
      });

      console.log("Refresh Token Set:", refreshToken);

     res.status(200).json({
  message: "User logged in successfully",
  user: {
    id: user.id,
    email: user.email,
    group: {
      name: user.group.name
    }
  },
  // token,
  // refreshToken,
});

    });
  })(req, res, next);
};
export const Register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, email, password } = req.body;
  
      // 1. Validation
      if (!username || typeof username !== "string") {
        res.status(400).json({ error: "validation_error", message: "Valid username is required" });
        return;
      }
  
      if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: "validation_error", message: "Valid email is required" });
        return;
      }
  
      if (!password || typeof password !== "string" || password.length < 6) {
        res.status(400).json({ error: "validation_error", message: "Password must be at least 6 characters long" });
        return;
      }
  
      // 2. Uniqueness check
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        res.status(409).json({ error: "conflict_error", message: `email "${email}" is already taken` });
        return;
      }
  
      const existingUser = await prisma.user.findFirst({ where: { username } });
      if (existingUser) {
        res.status(409).json({ error: "conflict_error", message: `username "${username}" is already taken` });
        return;
      }
  
      // 3. Generate hashed password
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // 4. Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
      const otpExpiry = new Date(Date.now() + 1000 * 60 * 10); // 10 mins
  
      // 5. Create user with pending status
      // Find the group to connect
      const existingGroup = await prisma.group.findFirst();
      if (!existingGroup) {
        res.status(400).json({ error: "validation_error", message: "No group found to assign to user" });
        return;
      }
      const newUser = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          status: "pending",
          otpCode: otp,
          otpExpiry,
          group: {
            connect: { id: existingGroup.id }
          }
        },
      });
  
      // 6. Send OTP via email
      await sendOtpEmail(email, otp);
  
      console.info(`User registered with pending status: ${newUser.email}`);
      res.status(201).json({
        message: "User registered successfully. Please verify your email using the OTP sent.",
        userId: newUser.id,
      });
    } catch (err: any) {
      console.error(`Failed to register user: ${err.message}`);
      handleError(res, err, "api register user");
    }
  };

  export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, otp } = req.body;
  
      if (!email || !otp) {
        res.status(400).json({ message: "Email and OTP are required" });
        return;
      }
  
      const user = await prisma.user.findUnique({ where: { email } });
  
      if (!user || user.otpCode !== otp || !user.otpExpiry || new Date() > user.otpExpiry) {
        res.status(400).json({ message: "Invalid or expired OTP" });
        return;
      }
  
      await prisma.user.update({
        where: { email },
        data: {
          status: "active",
          otpCode: null,
          otpExpiry: null,
        },
      });
  
      res.status(200).json({ message: "Account activated successfully." });
    } catch (err: any) {
      console.error("verifyOtp error:", err.message);
      res.status(500).json({ error: "unexpected_error", message: err.message });
    }
  };
  
export const sendOtpToUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;
  
      if (!email) {
        res.status(400).json({ message: "Email is required" });
        return;
      }
  
      const user = await prisma.user.findUnique({ where: { email } });
  
      if (!user) {
        res.status(404).json({ message: "User not found with this email." });
        return;
      }
  
      // Generate new OTP and expiry
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date(Date.now() + 1000 * 60 * 10); // 10 mins
  
      // Update user with new OTP
      await prisma.user.update({
        where: { email },
        data: {
          otpCode: otp,
          otpExpiry,
        },
      });
  
      await sendOtpEmail(email, otp);
  
      res.status(200).json({ message: "OTP sent to your email successfully." });
    } catch (err: any) {
      console.error("sendOtpToUser error:", err.message);
      res.status(500).json({ error: "unexpected_error", message: err.message });
    }
  };


export const refreshtoken = async (req: Request, res: Response): Promise<void> => {
    
    // If no session, try Bearer token authentication (for Mobile) or cookies
    let refreshToken = req.cookies.refreshToken || req.headers['authorization']?.split(' ')[1];

    if (!refreshToken) {
        console.error("Refresh token not provided");
        res.status(401).json({ message: "Refresh token not provided" });
        return;
    }

    try {
        // Verify the refresh token
        const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as { id: string };
        console.log("Token successfully verified for user ID:", decoded.id);

        // Generate a new access token
         const newAccessToken = jwt.sign(
      { id: decoded.id },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN } as SignOptions
    );      

        res.status(200).json({
            token: newAccessToken,
            expiresIn: ACCESS_TOKEN_EXPIRES_IN  , 
        });
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            console.error("Refresh token expired:", err.message);
            res.status(401).json({ message: "Refresh token expired. Please log in again." });
        } else {
            console.error("Failed to refresh access token:", (err as Error).message);
            res.status(403).json({ message: "Invalid refresh token" });
        }
    }
};


export const authStatus = async (req: Request, res: Response): Promise<void> => {
    console.log("User in session:", req.user);
    if (req.isAuthenticated()) {
        res.status(200).json({
            message: "User logged in successfully",
            email: (req.user as any).email, // Use 'as any' or type your 'req.user' properly
        });
    } else {
        res.status(401).json({ message: "Unauthorized user" });
    }
};


export const logout = (req: Request, res: Response): void => {
    req.logout((err) => {
        if (err) {
            res.status(500).json({ message: "Failed to log out" });
            return;
        }

        // Destroy the session
        req.session.destroy(() => {
            // Clear the refresh token cookie
            res.clearCookie("token");
            res.clearCookie("refreshToken");
             res.clearCookie("connect.sid");
            res.status(200).json({ message: "User logged out successfully" });
        });
    });
};

// Controller: Get User by ID
export const getUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.id;

    if (!userId) {
      res.status(400).json({ error: 'validation_error', message: 'User ID is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        info: true,
        status: true,
        loginAttempts: true,
        createdAt: true,
        updatedAt: true,
        groupId: true,
        group: {
          select: { name: true }
        },
        tablePermissions: {
          select: {
            tableName: true,
            canRead: true,
            canCreate: true,
            canUpdate: true,
            canDelete: true
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (err: any) {
    console.error("❌ Error in getUser:", err.message);
    res.status(500).json({ error: "unexpected_error", message: err.message });
  }
};

// Controller: Get My Profile
export const getMyProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.userId;

        if (!userId) {
            res.status(401).json({ message: "User is not logged in" });
            return;
        }

        // Fetch user details excluding password
        const user = await prisma.user.findUnique({
            where: { id: String(userId) },
            select: {
                id: true,
                username: true,
                name: true,
                email: true,
                info: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                group: {
                    select: {
                        name: true,
                    },
                },
                 tablePermissions: {
          select: {
            tableName: true,
            canRead: true,
            canCreate: true,
            canUpdate: true,
            canDelete: true
          }
        }
            },
        });

        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        // Format the response to align with the login response
        res.status(200).json({
            message: "Profile retrieved successfully",
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                info: user.info,
                status: user.status,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                tablePermissions: user.tablePermissions || [], // Ensure tablePermissions is always an array
                group: user.group ? user.group.name : null, // Handle case where group might be null
            },
        });

    } catch (err: any) {
        console.error("Error in getMyProfile:", err.message);
        res.status(500).json({ error: "unexpected_error", message: "An error occurred while retrieving the profile" });
    }
};

export const editProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { email, name, info, password } = req.body;

    if (!userId) {
      res.status(401).json({ error: "unauthorized", message: "User not logged in" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "not_found", message: `User with ID ${userId} not found.` });
      return;
    }

    const updateData: any = {};

    if (email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: "validation_error", message: "Valid email is required" });
        return;
      }
      updateData.email = email;
    }

    if (name !== undefined) updateData.name = name;
    if (info !== undefined) updateData.info = info;

    if (password !== undefined) {
      if (password.length < 6) {
        res.status(400).json({ error: "validation_error", message: "Password must be at least 6 characters" });
        return;
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { ...updateData, updatedAt: new Date() }
    });

    res.status(200).json({
      message: "Profile updated successfully.",
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        name: updatedUser.name,
        info: updatedUser.info,
        status: updatedUser.status
      }
    });
  } catch (err: any) {
    console.error("Failed to edit profile:", err.message);
    res.status(500).json({ error: "unexpected_error", message: err.message });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ message: "Email is required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiry = new Date(Date.now() + 1000 * 60 * 10); // 10 mins

    await prisma.user.update({
      where: { email },
      data: {
        otpCode: otp,
        otpExpiry: expiry,
      },
    });

    await sendResetOtpEmail(email, otp);

    res.json({ message: "OTP sent to your email to reset password." });
  } catch (err: any) {
    console.error("forgotPassword error:", err.message);
    res.status(500).json({ error: "unexpected_error", message: err.message });
  }
};


export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      res.status(400).json({ message: "Email, OTP, and new password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (
      !user ||
      user.otpCode !== otp ||
      !user.otpExpiry ||
      new Date() > user.otpExpiry
    ) {
      res.status(400).json({ message: "Invalid or expired OTP" });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        otpCode: null,
        otpExpiry: null,
      },
    });

    res.json({ message: "Password has been reset successfully." });
  } catch (err: any) {
    console.error("resetPassword error:", err.message);
    res.status(500).json({ error: "unexpected_error", message: err.message });
  }
};

export const saveUserPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ error: "unauthorized", message: "User is not logged in" });
      return;
    }

    const { tableName, preferences } = req.body;

    if (!tableName || typeof preferences !== "object") {
      res.status(400).json({
        error: "validation_error",
        message: "tableName and preferences (as JSON object) are required",
      });
      return;
    }

    const updated = await prisma.userPreference.upsert({
      where: {
        userId_tableName: { userId: userId, tableName }, // assumes composite unique
      },
      update: {
        preferences: JSON.stringify(preferences),
        updatedAt: new Date(),
      },
      create: {
        userId,
        tableName,
        preferences: JSON.stringify(preferences),
      },
    });

    res.status(200).json({
      message: "Preferences saved successfully",
      preference: updated,
    });
  } catch (err: any) {
    console.error("saveUserPreferences error:", err.message);
    res.status(500).json({ error: "unexpected_error", message: err.message });
  }
};

export const getUserPreferences = async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;

  if (!userId) {
    res.status(401).json({ error: "unauthorized", message: "User is not logged in" });
    return;
  }

  const { tableName } = req.params;

  if (!tableName) {
    res.status(400).json({ error: "Table name is required" });
    return;
  }

  try {
    const preferences = await prisma.userPreference.findUnique({
      where: {
        userId_tableName: {
          userId,
          tableName,
        },
      },
    });

    
    res.status(200).json({
      message: "Preferences retrieved successfully",
      preferences: preferences ? JSON.parse(preferences.preferences) : null,
    });
  } catch (error: any) {
    console.error("❌ getUserPreferences error:", error);
    res.status(500).json({
      error: "Unexpected server error",
      message: error.message ?? "Unknown error",
    });
  }
};

function handleError(res: Response, err: any, context: string): void {
    if (err && err.code) {
        res.status(400).json({ error: err.code, message: err.message });
        console.error(`${context}: ${err.message}`);
    } else {
        res.status(400).json({ error: "unexpected_error", message: err });
        console.error(`${context}: ${err}`);
    }
}