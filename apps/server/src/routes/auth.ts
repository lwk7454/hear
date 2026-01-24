
import { FastifyInstance } from 'fastify';
import { google } from 'googleapis';
import { env } from '../env.js';
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

function getSafeRedirectUri(requestedUri?: string): string {
    const allowed = env.ALLOWED_FRONTEND_DOMAINS.split(',').map(d => d.trim()).filter(Boolean);
    const defaultUri = allowed[0]; // First one is default

    if (!defaultUri) throw new Error("ALLOWED_FRONTEND_DOMAINS is empty");

    if (!requestedUri) return defaultUri;

    const allowedList = [
        ...allowed
    ].filter(Boolean);

    try {
        // Normalize by checking origin
        const requestedUrl = new URL(requestedUri);
        const isAllowed = allowedList.some(allowedUri => {
            try {
                return new URL(allowedUri).origin === requestedUrl.origin;
            } catch { return false; }
        });

        if (isAllowed) return requestedUri;
    } catch (e) {
        // Invalid URL
    }
    return defaultUri;
}

// Helper for Google Login
// Validated by env.ts
// if (!process.env.FRONTEND_URL) throw new Error("Missing FRONTEND_URL");
// if (!process.env.GOOGLE_LOGIN_REDIRECT_URI) throw new Error("Missing GOOGLE_LOGIN_REDIRECT_URI");
// if (!process.env.YOUTUBE_CLIENT_ID) throw new Error("Missing YOUTUBE_CLIENT_ID (used for Google Login)");
// if (!process.env.YOUTUBE_CLIENT_SECRET) throw new Error("Missing YOUTUBE_CLIENT_SECRET (used for Google Login)");

const googleLoginClient = new google.auth.OAuth2(
    env.YOUTUBE_CLIENT_ID,
    env.YOUTUBE_CLIENT_SECRET,
    env.GOOGLE_LOGIN_REDIRECT_URI
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
        const { redirectUri } = OAuthUrlSchema.parse(request.query);
        const safeRedirectUri = getSafeRedirectUri(redirectUri);

        const state = JSON.stringify({ redirectUri: safeRedirectUri });

        const url = googleLoginClient.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
            redirect_uri: env.GOOGLE_LOGIN_REDIRECT_URI!,
            state // Pass state with redirectUri
        });
        console.log('Generated Login URL:', url); // Debug
        return { url };
    });

    fastify.get('/auth/login/google/callback', async (request, reply) => {
        const { code, state } = OAuthCallbackSchema.parse(request.query);
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

            // Handle State for Redirect
            let finalRedirect = `${getSafeRedirectUri()}/creator`;
            if (state) {
                try {
                    const parsedState = JSON.parse(state);
                    if (parsedState.redirectUri) {
                        const safeUri = getSafeRedirectUri(parsedState.redirectUri);
                        finalRedirect = `${safeUri}/creator`;
                    }
                } catch (e) {
                    console.error("Failed to parse state", e);
                }
            }

            return reply.redirect(finalRedirect);
        } catch (e) {
            console.error(e);
            return reply.code(500).send({ error: 'Login failed' });
        }
    });

    // --- YouTube / Google OAuth (SCAN Scope) ---

    if (!env.YOUTUBE_REDIRECT_URI) throw new Error("Missing YOUTUBE_REDIRECT_URI");

    const scanClient = new google.auth.OAuth2(
        env.YOUTUBE_CLIENT_ID,
        env.YOUTUBE_CLIENT_SECRET,
        env.YOUTUBE_REDIRECT_URI
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

        const { redirectUri } = OAuthUrlSchema.parse(request.query);
        const safeRedirectUri = getSafeRedirectUri(redirectUri);

        const statePayload = JSON.stringify({ userId: user.id, redirectUri: safeRedirectUri });

        const url = scanClient.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            state: statePayload
        });

        return { url };
    });

    fastify.get('/auth/youtube/callback', async (request, reply) => {
        const { code, state } = OAuthCallbackSchema.parse(request.query);

        let userId = state;
        let redirectUri = `${getSafeRedirectUri()}/creator?connected=youtube`;

        if (state) {
            try {
                const parsed = JSON.parse(state);
                if (parsed.userId) userId = parsed.userId;
                if (parsed.redirectUri) {
                    const safeUri = getSafeRedirectUri(parsed.redirectUri);
                    redirectUri = `${safeUri}/creator?connected=youtube`;
                }
            } catch (e) {
                // Legacy: state is just userId
            }
        }
        
        // Validation
        if (!userId) return reply.code(400).send({ error: "Missing state/userId" });

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

            return reply.redirect(redirectUri);

        } catch (e) {
            console.error(e);
            return reply.code(500).send({ error: 'OAuth failed' });
        }
    });

    // --- Instagram OAuth (SCAN Scope) ---

    const IG_CLIENT_ID = env.IG_CLIENT_ID;
    const IG_CLIENT_SECRET = env.IG_CLIENT_SECRET;
    if (!env.IG_REDIRECT_URI) throw new Error("Missing IG_REDIRECT_URI");

    const IG_REDIRECT_URI = env.IG_REDIRECT_URI;

    fastify.get('/auth/instagram/url', async (request, reply) => {
        let user;
        try {
            user = await (request as any).jwtVerify() as { id: string };
        } catch (e) {
            return reply.code(401).send({ error: "Unauthorized" });
        }

        const { redirectUri } = OAuthUrlSchema.parse(request.query);
        const safeRedirectUri = getSafeRedirectUri(redirectUri);
        const statePayload = JSON.stringify({ userId: user.id, redirectUri: safeRedirectUri });
        
        // Encode state for URL
        const encodedState = encodeURIComponent(statePayload);

        const url = `https://api.instagram.com/oauth/authorize?client_id=${IG_CLIENT_ID}&redirect_uri=${IG_REDIRECT_URI}&scope=user_profile,user_media&response_type=code&state=${encodedState}`;

        return { url };
    });

    fastify.get('/auth/instagram/callback', async (request, reply) => {
        const { code, state } = OAuthCallbackSchema.parse(request.query);

        let userId = state;
        let redirectUri = `${getSafeRedirectUri()}/creator?connected=instagram`;

        if (state) {
            try {
                const parsed = JSON.parse(state);
                if (parsed.userId) userId = parsed.userId;
                if (parsed.redirectUri) {
                    const safeUri = getSafeRedirectUri(parsed.redirectUri);
                    redirectUri = `${safeUri}/creator?connected=instagram`;
                }
            } catch (e) {
                // Legacy
            }
        }

        if (!userId) return reply.code(400).send({ error: "Missing state/userId" });

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

            return reply.redirect(redirectUri);

        } catch (e) {
            console.error(e);
            return reply.code(500).send({ error: 'IG OAuth failed' });
        }
    });

}
