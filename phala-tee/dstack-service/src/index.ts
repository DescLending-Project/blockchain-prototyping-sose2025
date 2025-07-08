/**
 * @fileoverview DStack TEE Service API main entry point
 * This file configures the Express server and mounts the API routes.
 * The service provides access to Trusted Execution Environment (TEE) 
 * features through the Phala DStack SDK.
 * 
 * @module dstack-service
 * @requires dotenv
 * @requires express
 * @requires cors
 * @requires ./routes/dstack
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import dstackRouter from './routes/dstack';
import cors from 'cors';

/**
 * Express application instance
 * @constant {express.Application}
 */
const app = express();

/**
 * Server port - uses environment variable PORT if available, otherwise defaults to 8081
 * @constant {number}
 */
const port = process.env.DSTACK_SERVICE_PORT || 8081;

// Configure middleware
app.use(express.json()); // Parse JSON request bodies
app.use(cors())          // Enable CORS for all routes

/**
 * Mount the DStack router at the /dstack path
 * All DStack API endpoints will be available under /dstack/*
 */
app.use('/dstack', dstackRouter);

/**
 * Start the Express server
 * @listens {port}
 */
app.listen(port, () => {
    console.log(`DStack service running on port ${port}`);
});