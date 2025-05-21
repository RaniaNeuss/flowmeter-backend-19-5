/**
 *  Module to manage the users in a database
 *  Table: 'users' 
 */

'use strict';
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(); // Initialize Prisma client
const fs = require('fs');
const path = require('path');
var sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
var settings        // Application settings
var logger;         // Application logger

/**
 * Init and bind the database resource
 * @param {*} _settings 
 * @param {*} _log 
 */
function init(_settings, _log) {
    settings = _settings;
    logger = _log;

    
}


async function init() {
    try {
        console.log('Prisma client initialized for User management.');
        await prisma.$connect();
    } catch (err) {
        console.error('Error initializing Prisma client:', err);
        throw new Error('Failed to initialize Prisma client');
    }
}
/**
 * Set default users value in database (administrator)
 */
export async function setDefault() {
    try {
        const defaultPassword = bcrypt.hashSync('123456', 10);
        await prisma.user.upsert({
            where: { username: 'admin' },
            update: {},
            create: {
                id: generateUUID(),
                username: 'admin',
                password: defaultPassword,
                groups: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
        console.log('Default administrator account created or already exists.');
    } catch (err) {
        console.error('Error creating default user:', err);
        throw new Error('Failed to create default user');
    }
}

/**
 * Return the Users list
 */
export async function getUsers(filter) {
    try {
        if (filter && filter.username) {
            const user = await prisma.user.findUnique({
                where: { username: filter.username },
                select: {
                    id: true,
                    username: true,
                    groups: true,
                    info: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            return user ? [user] : [];
        } else {
            const users = await prisma.user.findMany({
                select: {
                    id: true,
                    username: true,
                    groups: true,
                    info: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            return users;
        }
    } catch (err) {
        console.error('Error fetching users:', err);
        throw new Error('Failed to fetch users');
    }
}

/**
 * Set user value in database
 */
export async function setUser({ id, username, password, groups, info }) {
    try {
        const hashedPassword = password ? bcrypt.hashSync(password, 10) : undefined;
        const updatedUser = await prisma.user.upsert({
            where: { username },
            update: {
                password: hashedPassword || undefined,
                groups: groups || undefined,
                info: info || undefined,
                updatedAt: new Date(),
            },
            create: {
                id: id || generateUUID(),
                username,
                password: hashedPassword,
                groups,
                info,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
        console.log('User added or updated:', updatedUser.username);
        return updatedUser;
    } catch (err) {
        console.error('Error setting user:', err);
        throw new Error('Failed to set user');
    }
}
/**
 * Remove user from database
 */
export async function removeUser(username) {
    try {
        await prisma.user.delete({
            where: { username },
        });
        console.log(`User ${username} removed successfully.`);
    } catch (err) {
        console.error('Error removing user:', err);
        throw new Error('Failed to remove user');
    }
}

/**
 * Close the database
 */
async function close() {
    try {
        await prisma.$disconnect();
        console.log('Prisma client disconnected.');
    } catch (err) {
        console.error('Error disconnecting Prisma client:', err);
    }
}

export default  {
    init: init,
    close: close,
    setDefault: setDefault,
    getUsers: getUsers,
    setUser: setUser,
    removeUser: removeUser
};