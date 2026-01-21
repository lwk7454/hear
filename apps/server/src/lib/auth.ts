
import { env } from '../env.js';
export function isAdminUser(user: { email: string | null }): boolean {
    if (!user.email) return false;
    if (env.ENVIRONMENT === 'dev') return true;
    const adminEmails = (env.ADMIN_EMAILS || "").split(",").map(e => e.trim());
    return user.email.endsWith("@demo.com") || adminEmails.includes(user.email);
}

export async function verifyUser(request: any): Promise<{ id: string, email: string }> {
    // 1. Try real JWT
    try {
        const decoded = await request.jwtVerify();
        return decoded;
    } catch (e) {
        // 2. Try Test Bypass if enabled
        if (env.ALLOW_TEST_AUTH === 'true' && request.headers['x-test-user-email']) {
            return {
                id: (request.headers['x-test-user-id'] as string) || 'test-admin-id',
                email: request.headers['x-test-user-email'] as string
            };
        }
        throw e;
    }
}
