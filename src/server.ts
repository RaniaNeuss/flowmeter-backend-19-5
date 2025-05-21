import express from 'express';
import session from 'express-session';
import passport from './lib/passportConfig';
import cors from 'cors';
import cookieParser from "cookie-parser";
import prisma from './prismaClient'; // Import Prisma Client
import initializeSocket from './socket'; // Import Socket Initialization
import rfpRoutes from './routes/rfpRoutes';
import { PORT } from "./lib/config";
import flowRoute from './routes/flowRoute';
import deviceManager from './runtime/devices/deviceManager';

import userRoutes from './routes/userRoutes';

import deviceRoutes from './routes/deviceRoutes';


const app = express();


// Middlewares
app.use(express.json());
app.use(
  cors({
    origin: 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge:  24* 60 * 60 * 1000, 
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(cookieParser()); // Parse cookies



// Routes
app.use('/api/users', userRoutes);
app.use('/api/rfp', rfpRoutes);

app.use('/api/influx', flowRoute);

app.use('/api/sewage', flowRoute);
app.use('/api/users', userRoutes);


app.use('/api/devices', deviceRoutes);

// Initialize Socket.IO
const { io, events,server } = initializeSocket(app);
// Export the Socket.IO instance for use in other modules
export { io };





const getexistingdevices = async () => {
  try {
    const devices = await prisma.device.findMany({
      where: { enabled: true }, // Fetch enabled devices
      // Include tags for each device
    });

    console.log('Total enabled devices:', devices.length);

    if (devices.length > 0) {
      return devices;
    }
    return [];
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error fetching devices:', error.message);
    } else {
      console.error('Error fetching devices:', error);
    }
    return []; // Return an empty array if an error occurs
  }
};





(async () => {
  try {
    // Run all tasks in parallel
    const [devices] = await Promise.all([
      getexistingdevices(), // Fetch devices concurrently
    ]);

    await Promise.all([
      deviceManager.initializeAndPollDevices(devices), // Initialize and poll devices
    ]);

    console.log("✅ All services started successfully.");
  } catch (error) {
    console.error("❌ Error during server startup:", error);
  }
})();


// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
