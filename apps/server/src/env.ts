import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Core
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('8000').transform(Number),
  ENVIRONMENT: z.enum(['dev', 'prod', 'staging']).optional().default('dev'),
  
  // Auth
  JWT_SECRET: z.string().default('supersecret123'),
  COOKIE_SECRET: z.string().default('another-secret-123'),
  DB_PASSWORD: z.string().min(1),
  ADMIN_EMAILS: z.string().optional(),
  ALLOW_TEST_AUTH: z.enum(['true', 'false']).optional(),
  
  // URLs
  ALLOWED_FRONTEND_DOMAINS: z.string().min(1), // Comma-separated list of allowed origins. The first one is default.
  CORS_ORIGINS: z.string().optional(),
  
  // Services
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  LLM_MODEL: z.string().default('gpt-4o'),
  VISION_MODEL: z.string().default('z-ai/glm-4.6v'),
  
  SUPABASE_URL: z.url().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  
  HIGGS_API_URL: z.url().default('http://localhost:8002'),
  HIGGS_TIMEOUT: z.string().default('60000').transform(Number),

  CLEANSER_WORKER_URL: z.url().default('http://127.0.0.1:8001'),
  
  GLM_WORKER_HOST: z.string().default('localhost'),
  
  PERPLEXITY_MODEL: z.string().default('sonar'),
  
  // OAuth / Socials
  GOOGLE_LOGIN_REDIRECT_URI: z.url(),
  
  YOUTUBE_CLIENT_ID: z.string().min(1),
  YOUTUBE_CLIENT_SECRET: z.string().min(1),
  YOUTUBE_REDIRECT_URI: z.url().min(1),
  YOUTUBE_COOKIES_FROM_BROWSER: z.string().optional(),
  YOUTUBE_COOKIES_PATH: z.string().optional(),
  
  IG_CLIENT_ID: z.string().optional(),
  IG_CLIENT_SECRET: z.string().optional(),
  IG_REDIRECT_URI: z.string().optional(),
});

export const env = envSchema.parse(process.env);
