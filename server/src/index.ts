import "dotenv/config";
import { randomUUID } from "node:crypto";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";

import {
  createPublicSupabaseClient,
  createUserSupabaseClient,
} from "./lib/supabase.js";

import { requireAuth } from "./middleware/auth.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.disable("x-powered-by");
app.use(helmet());

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174", "http://10.28.168.131:5173", "http://10.28.168.131:5174"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "apikey",
    "x-learnova-session",
  ],
}));

app.use(express.json({ limit: "1mb" }));

function readText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

async function activateSession(
  accessToken: string,
  deviceLabel: string,
) {
  const sessionId = randomUUID();
  const client = createUserSupabaseClient(accessToken);

  const { data, error } = await (client as any).rpc(
    "start_user_session",
    {
      p_session_id: sessionId,
      p_device_label: deviceLabel || "Unknown device",
    },
  );

  if (error) {
    throw new Error("SESSION_CREATION_FAILED");
  }

  return { sessionId, sessionInfo: data };
}

function sendLoginResponse(
  res: Response,
  session: any,
  user: any,
  sessionInfo: any,
) {
  res.status(200).json({
    success: true,
    message: "Login successful.",
    user: {
      id: user.id,
      email: user.email,
    },
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      token_type: session.token_type,
      session_id: sessionInfo.sessionId,
    },
    security: sessionInfo.sessionInfo,
  });
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Learnova API is running.",
    service: "Learnova Backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/supabase-health", async (_req: Request, res: Response) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    res.status(500).json({
      success: false,
      message: "Supabase configuration is missing.",
    });
    return;
  }

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    });

    res.status(response.ok ? 200 : 502).json({
      success: response.ok,
      message: response.ok
        ? "Learnova is connected to Supabase Auth."
        : "Supabase Auth returned an error.",
      status: response.status,
    });
  } catch {
    res.status(502).json({
      success: false,
      message: "Could not reach Supabase.",
    });
  }
});

// REGISTER: Supabase sends a confirmation email.
app.post("/api/auth/register", async (req: Request, res: Response) => {
  const email = readText(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === "string"
    ? req.body.password
    : "";
  const displayName = readText(req.body?.displayName, 100);
  const phoneNumber = readText(req.body?.phoneNumber, 20);
  const verificationChannel = readText(req.body?.verificationChannel, 10);
  const redirectTo = readText(req.body?.redirectTo, 300);
  const deviceLabel = readText(req.body?.deviceLabel, 100);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({
      success: false,
      message: "Enter a valid email address.",
    });
    return;
  }

  if (password.length < 8 || password.length > 128) {
    res.status(400).json({
      success: false,
      message: "Password must contain between 8 and 128 characters.",
    });
    return;
  }

  if (!displayName) {
    res.status(400).json({
      success: false,
      message: "Your display name is required.",
    });
    return;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    res.status(400).json({
      success: false,
      message: "Enter a valid international phone number, including country code.",
    });
    return;
  }

  if (!["email", "sms"].includes(verificationChannel)) {
    res.status(400).json({
      success: false,
      message: "Choose email or SMS verification.",
    });
    return;
  }

  if (verificationChannel === "sms") {
    res.status(503).json({
      success: false,
      code: "SMS_PROVIDER_NOT_CONFIGURED",
      message: "SMS verification is not configured yet. Choose email verification for now.",
    });
    return;
  }

  const allowedRedirects = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://10.28.168.131:5173",
    "http://10.28.168.131:5174",
  ];

  if (!allowedRedirects.includes(redirectTo)) {
    res.status(400).json({
      success: false,
      message: "Invalid verification redirect address.",
    });
    return;
  }

  try {
    const client = createPublicSupabaseClient();

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          display_name: displayName,
          phone_number: phoneNumber,
          verification_channel: verificationChannel,
        },
      },
    });

    if (error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    if (!data.user) {
      res.status(400).json({
        success: false,
        message: "Account registration could not be completed.",
      });
      return;
    }

    // If email confirmation is enabled, the user must verify first.
    if (!data.session) {
      res.status(201).json({
        success: true,
        requiresEmailConfirmation: true,
        message: "Account created. Enter the six-digit verification code sent to your email.",
      });
      return;
    }

    // If email confirmation is disabled, create the Learnova session.
    const sessionInfo = await activateSession(
      data.session.access_token,
      deviceLabel,
    );

    res.status(201).json({
      success: true,
      requiresEmailConfirmation: false,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
        session_id: sessionInfo.sessionId,
      },
      security: sessionInfo.sessionInfo,
    });
  } catch {
    res.status(503).json({
      success: false,
      message: "Registration could not be completed. Please try again.",
    });
  }
});

// VERIFY EMAIL: exchange the six-digit code for an authenticated session.
app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
  const email = readText(req.body?.email, 254).toLowerCase();
  const token = readText(req.body?.token, 6);
  const deviceLabel = readText(req.body?.deviceLabel, 100);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({
      success: false,
      message: "Enter a valid email address.",
    });
    return;
  }

  if (!/^\d{6}$/.test(token)) {
    res.status(400).json({
      success: false,
      message: "Enter the six-digit verification code.",
    });
    return;
  }

  try {
    const client = createPublicSupabaseClient();

    const { data, error } = await client.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error || !data.user || !data.session) {
      res.status(400).json({
        success: false,
        code: "INVALID_OR_EXPIRED_CODE",
        message: "The verification code is invalid or expired. Request a new code and try again.",
      });
      return;
    }

    const sessionInfo = await activateSession(
      data.session.access_token,
      deviceLabel,
    );

    sendLoginResponse(res, data.session, data.user, sessionInfo);
  } catch {
    res.status(503).json({
      success: false,
      message: "Email verification could not be completed. Please try again.",
    });
  }
});

// RESEND: request another signup confirmation email.
app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
  const email = readText(req.body?.email, 254).toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({
      success: false,
      message: "Enter a valid email address.",
    });
    return;
  }

  try {
    const client = createPublicSupabaseClient();

    const { error } = await client.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "If the account can be verified, a new code has been sent. Check your inbox.",
    });
  } catch {
    res.status(503).json({
      success: false,
      message: "A new verification code could not be requested. Please try again later.",
    });
  }
});

// LOGIN
app.post("/api/auth/login", async (req: Request, res: Response) => {
  const email = readText(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === "string"
    ? req.body.password
    : "";
  const deviceLabel = readText(req.body?.deviceLabel, 100);

  if (!email || !password) {
    res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
    return;
  }

  try {
    const client = createPublicSupabaseClient();

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      res.status(401).json({
        success: false,
        code: "LOGIN_FAILED",
        message: "Email or password is incorrect, or the email has not been verified.",
      });
      return;
    }

    const sessionInfo = await activateSession(
      data.session.access_token,
      deviceLabel,
    );

    sendLoginResponse(res, data.session, data.user, sessionInfo);
  } catch {
    res.status(503).json({
      success: false,
      message: "Login could not be completed. Please try again.",
    });
  }
});

// LOGOUT
app.post("/api/auth/logout", requireAuth, async (_req, res) => {
  const client = res.locals.supabase;
  const sessionId = res.locals.sessionId;

  const { data, error } = await (client as any).rpc(
    "end_user_session",
    { p_session_id: sessionId },
  );

  if (error || data !== true) {
    res.status(503).json({
      success: false,
      message: "Logout could not be confirmed. Please try again.",
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: "You have been logged out.",
  });
});

// CURRENT USER PROFILE
app.get("/api/auth/me", requireAuth, async (_req, res) => {
  const user = res.locals.user;
  const supabase = res.locals.supabase;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    res.status(500).json({
      success: false,
      message: "Could not retrieve the user profile.",
    });
    return;
  }

  res.status(200).json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
    },
    profile,
  });
});

app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

const errorHandler: ErrorRequestHandler = (
  _error,
  _req,
  res,
  _next,
) => {
  res.status(500).json({
    success: false,
    message: "An internal server error occurred.",
  });
};

app.use(errorHandler);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Learnova API running at http://localhost:${PORT}`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received. Closing Learnova API...`);

  server.close(() => {
    console.log("Learnova API stopped safely.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));





