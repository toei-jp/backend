"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * セッションミドルウェア
 */
const connectRedis = require("connect-redis");
const session = require("express-session");
const redis = require("redis");
const redisStore = connectRedis(session);
const COOKIE_MAX_AGE = 3600000; // 60 * 60 * 1000(session active 1 hour)
exports.default = session({
    secret: 'chevre-backend-secret',
    resave: false,
    // Force a session identifier cookie to be set on every response.
    // The expiration is reset to the original maxAge, resetting the expiration countdown.
    rolling: true,
    saveUninitialized: false,
    store: new redisStore({
        client: redis.createClient(Number(process.env.REDIS_PORT), process.env.REDIS_HOST, {
            password: process.env.REDIS_KEY,
            tls: { servername: process.env.REDIS_HOST },
            return_buffers: true
        })
    }),
    cookie: {
        maxAge: COOKIE_MAX_AGE
    }
});
