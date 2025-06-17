import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import bcrypt from "bcrypt";
import { Strategy as LocalStrategy } from "passport-local";
import passport from "passport";

passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { email },
          include: { group: true },
        });

        if (!user) {
          return done(null, false, { message: "User not found" });
        }

        if (user.status === "suspended") {
          return done(null, false, { message: "Account is suspended. Contact support." });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
          const updatedAttempts = (user.loginAttempts ?? 0) + 1;
          const newStatus = updatedAttempts >= 5 ? "suspended" : user.status;

          await prisma.user.update({
            where: { email },
            data: {
              loginAttempts: updatedAttempts,
              status: newStatus,
            },
          });

          console.log(` ❌ Wrong password for ${email}. Attempts: ${updatedAttempts}/5`);

          return done(null, false, {
            message:
              newStatus === "suspended"
                ? "Your account has been suspended due to multiple failed login attempts"
                : "Invalid credentials",
          });
        }

        // ✅ Correct password: reset attempts
        if (user.loginAttempts > 0) {
          await prisma.user.update({
            where: { email },
            data: { loginAttempts: 0 },
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Serialize user to store in session
passport.serializeUser((user, done) => {
    done(null, user.id); // Serialize user ID
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.user.findUnique({ where: { id } });
        done(null, user); // Attach user object to req.user
    } catch (error) {
        done(error);
    }
});


// Export default passport configuration
export default passport;