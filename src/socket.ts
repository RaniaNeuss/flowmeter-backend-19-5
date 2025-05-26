import { Server } from 'socket.io';
import { createServer } from 'http';
import { Application } from 'express';
import EventEmitter from 'events';
import prisma from './prismaClient';
const initializeSocket = (app: Application) => {
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*', // Replace with your frontend URL or restrict to specific domains
      methods: ['GET', 'POST'],
    },
  });

  const events = new EventEmitter(); // Shared event emitter

  io.on('connection', (socket) => {
    console.log('New Socket.IO connection established.');






    // Handle client disconnect
    socket.on('disconnect', () => {
      console.log('Socket.IO connection closed.');
    });

    // Handle socket errors
    socket.on('error', (err) => {
      console.error('Socket.IO error:', err);
    });
  });
  



  // Broadcast function for external modules to emit custom events
  const broadcast = (event: string, data: any) => {
    io.emit(event, data);
    console.log(`Broadcasting event "${event}" with data:`, data);
  };


  
  return { io, server, broadcast, events };
};



export default initializeSocket;
