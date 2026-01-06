
import { FastifyInstance } from 'fastify';
import { google } from 'googleapis';
import { prisma } from '../lib/db.js';
import { z } from 'zod';
import { isAdminUser, verifyUser } from '../lib/auth.js';

const OAuthUrlSchema = z.object({
    creatorId: z.string().optional(), // Optional if logged in
    redirectUri: z.string().optional(),
});

const OAuthCallbackSchema = z.object({
    code: z.string(),
    state: z.string().optional(),
});

// Helper for Google Login
if (!process.env.GOOGLE_LOGIN_REDIRECT_URI) throw new Error("Missing GOOGLE_LOGIN_REDIRECT_URI");
if (!process.env.YOUTUBE_CLIENT_ID) throw new Error("Missing YOUTUBE_CLIENT_ID (used for Google Login)");
if (!process.env.YOUTUBE_CLIENT_SECRET) throw new Error("Missing YOUTUBE_CLIENT_SECRET (used for Google Login)");

const googleLoginClient = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.GOOGLE_LOGIN_REDIRECT_URI
);

export async function authRoutes(fastify: FastifyInstance) {

    // --- Session Check ---
    fastify.get('/auth/me', async (request, reply) => {
        try {
            const data = await verifyUser(request);
            const creator = await prisma.creator.findUnique({ where: { id: data.id } });
            if (!creator) throw new Error("Not found");

            return {
                authenticated: true,
                creator,
                isAdmin: isAdminUser(creator)
            };
        } catch (e) {
            return { authenticated: false };
        }
    });
    // --- Logout ---
    fastify.post('/auth/logout', async (request, reply) => {
        reply.clearCookie('token', { path: '/' });
        return { status: 'success' };
    });

    // --- Login: Google ---
    fastify.get('/auth/login/google', async (request, reply) => {
        const url = googleLoginClient.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
            redirect_uri: process.env.GOOGLE_LOGIN_REDIRECT_URI!
        });
        console.log('Generated Login URL:', url); // Debug
        return { url };
    });

    fastify.get('/auth/login/google/callback', async (request, reply) => {
        const { code } = OAuthCallbackSchema.parse(request.query);
        try {
            const { tokens } = await googleLoginClient.getToken(code);
            googleLoginClient.setCredentials(tokens);

            // Get Profile
            const oauth2 = google.oauth2({ version: 'v2', auth: googleLoginClient });
            const userInfo = await oauth2.userinfo.get();

            if (!userInfo.data.email) throw new Error("No email found");

            // Upsert User
            const creator = await prisma.creator.upsert({
                where: { email: userInfo.data.email },
                update: { name: userInfo.data.name ?? null },
                create: {
                    email: userInfo.data.email,
                    name: userInfo.data.name || 'New Creator'
                }
            });

            // Set Session Cookie
            const token = fastify.jwt.sign({ id: creator.id, email: creator.email });
            reply.setCookie('token', token, {
                path: '/',
                httpOnly: true,
                secure: false, // Dev
                sameSite: 'lax'
            });

            return reply.redirect('http://localhost:3000/creator');
        } catch (e) {
            console.error(e);
            return reply.code(500).send({ error: 'Login failed' });
        }
    });

    // --- YouTube / Google OAuth (SCAN Scope) ---

    if (!process.env.YOUTUBE_REDIRECT_URI) throw new Error("Missing YOUTUBE_REDIRECT_URI");

    const scanClient = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        process.env.YOUTUBE_REDIRECT_URI
    );

    fastify.get('/auth/youtube/url', async (request, reply) => {
        // Require session
        let user;
        try {
            user = await (request as any).jwtVerify() as { id: string };
        } catch (e) {
            return reply.code(401).send({ error: "Unauthorized" });
        }

        const scopes = [
            'https://www.googleapis.com/auth/youtube.readonly'
        ];

        const url = scanClient.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            state: user.id // Pass Logged-in User ID
        });

        return { url };
    });

    fastify.get('/auth/youtube/callback', async (request, reply) => {
        const { code, state: userId } = OAuthCallbackSchema.parse(request.query);

        try {
            const { tokens } = await scanClient.getToken(code);
            // We don't set credentials globally on the client instance to avoid race conditions in concurrent reqs
            // Just use tokens to save.

            // Update Connection for existing user
            await (prisma.creator as any).update({
                where: { id: userId as string },
                data: {
                    authConnections: {
                        create: {
                            platform: 'YOUTUBE',
                            accessToken: tokens.access_token!,
                            refreshToken: tokens.refresh_token || undefined,
                            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null
                        }
                    }
                }
            });

            return reply.redirect('http://localhost:3000/creator?connected=youtube');

        } catch (e) {
            console.error(e);
            return reply.code(500).send({ error: 'OAuth failed' });
        }
    });

    // --- Instagram OAuth (SCAN Scope) ---

    const IG_CLIENT_ID = process.env.IG_CLIENT_ID;
    const IG_CLIENT_SECRET = process.env.IG_CLIENT_SECRET;
    if (!process.env.IG_REDIRECT_URI) throw new Error("Missing IG_REDIRECT_URI");

    const IG_REDIRECT_URI = process.env.IG_REDIRECT_URI;

    fastify.get('/auth/instagram/url', async (request, reply) => {
        let user;
        try {
            user = await (request as any).jwtVerify() as { id: string };
        } catch (e) {
            return reply.code(401).send({ error: "Unauthorized" });
        }

        const url = `https://api.instagram.com/oauth/authorize?client_id=${IG_CLIENT_ID}&redirect_uri=${IG_REDIRECT_URI}&scope=user_profile,user_media&response_type=code&state=${user.id}`;

        return { url };
    });

    fastify.get('/auth/instagram/callback', async (request, reply) => {
        const { code, state: userId } = OAuthCallbackSchema.parse(request.query);

        try {
            const formData = new URLSearchParams();
            formData.append('client_id', IG_CLIENT_ID!);
            formData.append('client_secret', IG_CLIENT_SECRET!);
            formData.append('grant_type', 'authorization_code');
            formData.append('redirect_uri', IG_REDIRECT_URI);
            formData.append('code', code);

            const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
                method: 'POST',
                body: formData
            });

            const tokens = await tokenRes.json();

            if (tokens.error_message) throw new Error(tokens.error_message);

            await (prisma.creator as any).update({
                where: { id: userId as string },
                data: {
                    authConnections: {
                        create: {
                            platform: 'INSTAGRAM',
                            accessToken: (tokens as any).access_token,
                        }
                    }
                }
            });

            return reply.redirect('http://localhost:3000/creator?connected=instagram');

        } catch (e) {
            console.error(e);
            return reply.code(500).send({ error: 'IG OAuth failed' });
        }
    });

}
