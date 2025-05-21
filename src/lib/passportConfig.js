import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import bcrypt from "bcrypt";
import { Strategy as LocalStrategy } from "passport-local";
import passport from "passport";

// passport.use(
//     new LocalStrategy(async (email, password, done) => {
//         try {
//             // Find user by email
//             const user = await prisma.user.findUnique({
//                 where: { email },
//                 include: { groups: true }, // Include related groups
//             });

//             // Check if user exists
//             if (!user) {
//                 return done(null, false, { message: "User not found" });
//             }

//             // Compare the provided password with the hashed password
//             const isMatch = await bcrypt.compare(password, user.password);
//             if (!isMatch) {
//                 return done(null, false, { message: "Incorrect password" });
//             }

//             // If everything is okay, return the user
//             return done(null, user);
//         } catch (error) {
//             // Handle errors
//             return done(error);
//         }
//     })
// );

passport.use(
    new LocalStrategy(
      {  usernameField: "email", passwordField: "password" }, // Specify the field names
      async (email, password, done) => {
        try {
          // Find user by email
          const user = await prisma.user.findUnique({
            where: { email }, // Query using email
            include: { groups: true }, // Include related groups
          });
  
          // Check if user exists
          if (!user) {
            return done(null, false, { message: "User not found" });
          }
  
          // Compare the provided password with the hashed password
          const isMatch = await bcrypt.compare(password, user.password);
          if (!isMatch) {
            return done(null, false, { message: "Incorrect password" });
          }
  
          // If everything is okay, return the user
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