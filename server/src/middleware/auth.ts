import type { RequestHandler } from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createUserSupabaseClient } from "../lib/supabase.js";

declare global {
  namespace Express {
    interface Locals {
      user: User;
      supabase: SupabaseClient;
      sessionId: string;
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const authorization = req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1];
  const sessionId = req.header("x-learnova-session");

  if (!accessToken || !sessionId) {
    res.status(401).json({
      success: false,
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication and an active Learnova session are required.",
    });
    return;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    res.status(401).json({
      success: false,
      code: "INVALID_SESSION",
      message: "Invalid Learnova session.",
    });
    return;
  }

  try {
    const client = createUserSupabaseClient(accessToken);

    const { data: authData, error: authError } =
      await client.auth.getUser(accessToken);

    if (authError || !authData.user) {
      res.status(401).json({
        success: false,
        code: "INVALID_TOKEN",
        message: "Your login has expired. Please sign in again.",
      });
      return;
    }

    const { data: active, error: sessionError } =
      await (client as any).rpc("is_current_user_session", {
        p_session_id: sessionId,
      });

    if (sessionError) {
      res.status(503).json({
        success: false,
        code: "SESSION_CHECK_UNAVAILABLE",
        message: "Session verification is temporarily unavailable.",
      });
      return;
    }

    if (active !== true) {
      res.status(401).json({
        success: false,
        code: "SESSION_REPLACED",
        message: "Your account was signed in on another device. Please sign in again.",
      });
      return;
    }

    res.locals.user = authData.user;
    res.locals.supabase = client;
    res.locals.sessionId = sessionId;

    next();
  } catch {
    res.status(503).json({
      success: false,
      code: "AUTHENTICATION_UNAVAILABLE",
      message: "Authentication verification is temporarily unavailable.",
    });
  }
};
