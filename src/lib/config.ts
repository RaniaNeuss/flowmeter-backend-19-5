import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file

// Export the secrets as constants
export const JWT_SECRET = process.env.JWT_SECRET as string;
export const REFRESH_SECRET = process.env.REFRESH_SECRET as string;
export const SESSION_SECRET=process.env.SESSION_SECRET as string;


export const PORT = process.env.PORT as string;



export const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m" ;
export const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d";

export const COOKIE_ACCESS_TOKEN_MAX_AGE = parseInt(process.env.COOKIE_ACCESS_TOKEN_MAX_AGE || "5400000");
export const COOKIE_REFRESH_TOKEN_MAX_AGE = parseInt(process.env.COOKIE_REFRESH_TOKEN_MAX_AGE || "604800000");



// Optional: Add validation to ensure the variables exist
if (!JWT_SECRET || !REFRESH_SECRET ||!SESSION_SECRET ) {
  throw new Error("Missing required environment variables: JWT_SECRET or REFRESH_SECRET");
}