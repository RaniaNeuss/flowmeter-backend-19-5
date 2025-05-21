import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file

// Export the secrets as constants
export const JWT_SECRET = process.env.JWT_SECRET as string;
export const REFRESH_SECRET = process.env.REFRESH_SECRET as string;
export const SESSION_SECRET=process.env.SESSION_SECRET as string;
export const PORT = process.env.PORT as string;

// Optional: Add validation to ensure the variables exist
if (!JWT_SECRET || !REFRESH_SECRET ||!SESSION_SECRET ) {
  throw new Error("Missing required environment variables: JWT_SECRET or REFRESH_SECRET");
}