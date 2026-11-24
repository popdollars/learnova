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
  createAdminSupabaseClient,
  createPublicSupabaseClient,
  createUserSupabaseClient,
} from "./lib/supabase.js";

import { requireAuth } from "./middleware/auth.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.disable("x-powered-by");
app.use(helmet());

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://learnova-one-psi.vercel.app",
    "http://10.28.168.131:5173",
    "http://10.28.168.131:5174",
  ],
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

  console.log("[SESSION] Creating session...");

  const { data, error } = await (client as any).rpc(
    "start_user_session",
    {
      p_session_id: sessionId,
      p_device_label: deviceLabel || "Unknown device",
    },
  );

  if (error) {
    console.error("[SESSION] Supabase RPC failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    throw error;
  }

  console.log("[SESSION] Session created successfully.");

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

// REGISTER: create a confirmed account and sign in immediately.
app.post("/api/auth/register", async (req: Request, res: Response) => {
  const email = readText(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === "string"
    ? req.body.password
    : "";

  const displayName = readText(req.body?.displayName, 100);
  const phoneNumber = readText(req.body?.phoneNumber, 20);
  const address = readText(req.body?.address, 250);
  const institution = readText(req.body?.institution, 150);
  const faculty = readText(req.body?.faculty, 150);
  const academicYear = readText(req.body?.academicYear, 50);
  const englishLevel = readText(req.body?.englishLevel, 50);
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
      message: "Your full name is required.",
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

  if (!address || !institution || !faculty || !academicYear || !englishLevel) {
    res.status(400).json({
      success: false,
      message: "Complete all student registration details.",
    });
    return;
  }

  try {
    const admin = createAdminSupabaseClient();

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        phone: phoneNumber,
        user_metadata: {
          display_name: displayName,
          phone_number: phoneNumber,
          address,
          institution,
          faculty,
          academic_year: academicYear,
          english_level: englishLevel,
        },
      });

    if (createError || !created.user) {
      res.status(400).json({
        success: false,
        message: createError?.message || "Account registration could not be completed.",
      });
      return;
    }

    // Sign in immediately. No OTP or confirmation step.
    const client = createPublicSupabaseClient();

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      res.status(503).json({
        success: false,
        message: "Your account was created, but automatic login could not be completed. Please sign in.",
      });
      return;
    }

    // Preserve Learnova's existing device/session security.
    const sessionInfo = await activateSession(
      data.session.access_token,
      deviceLabel,
    );

    res.status(201).json({
      success: true,
      requiresEmailConfirmation: false,
      message: "Account created successfully. Welcome to Learnova.",
      user: {
        id: data.user.id,
        email: data.user.email,
        display_name: displayName,
        phone_number: phoneNumber,
        address,
        institution,
        faculty,
        academic_year: academicYear,
        english_level: englishLevel,
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
  } catch (error) {
    console.error("Registration error:", error);

    res.status(503).json({
      success: false,
      message: "Registration could not be completed. Please try again.",
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
        message: "Email or password is incorrect.",
      });
      return;
    }

    const sessionInfo = await activateSession(
      data.session.access_token,
      deviceLabel,
    );

    sendLoginResponse(res, data.session, data.user, sessionInfo);
  } catch (error) {
    console.error("Login error:", error);

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
      metadata: user.user_metadata,
    },
    profile,
  });
});

// STUDENT DASHBOARD
app.get("/api/student/dashboard", requireAuth, async (_req, res) => {
  const user = res.locals.user;
  const supabase = res.locals.supabase;

  try {
    const { data: enrollments, error: enrollmentError } = await supabase
      .from("enrollments")
      .select("id, course_id, status, enrolled_at")
      .eq("student_id", user.id);

    if (enrollmentError) throw enrollmentError;

    const enrollmentRows = enrollments ?? [];
    const courseIds = [...new Set(
      enrollmentRows.map((row: any) => row.course_id).filter(Boolean)
    )];

    let courses: any[] = [];
    let lessons: any[] = [];
    let progress: any[] = [];

    if (courseIds.length > 0) {
      const [courseResult, lessonResult, progressResult] =
        await Promise.all([
          supabase
            .from("courses")
            .select("id, title, code, description, category, level, status")
            .in("id", courseIds),

          supabase
            .from("lessons")
            .select("id, course_id, title, position")
            .in("course_id", courseIds)
            .order("position", { ascending: true }),

          supabase
            .from("lesson_progress")
            .select("lesson_id, completed_at")
            .eq("student_id", user.id),
        ]);

      if (courseResult.error) throw courseResult.error;
      if (lessonResult.error) throw lessonResult.error;
      if (progressResult.error) throw progressResult.error;

      courses = courseResult.data ?? [];
      lessons = lessonResult.data ?? [];
      progress = progressResult.data ?? [];
    }

    const { data: records, error: recordsError } = await supabase
      .from("academic_records")
      .select("id, course_id, assessment_name, score, max_score, feedback, recorded_at")
      .eq("student_id", user.id)
      .order("recorded_at", { ascending: false });

    if (recordsError) throw recordsError;

    const completedLessonIds = new Set(
      progress.map((item: any) => item.lesson_id)
    );

    const studentCourses = enrollmentRows.map((enrollment: any) => {
      const course = courses.find(
        (item: any) => item.id === enrollment.course_id
      );

      if (!course) return null;

      const courseLessons = lessons.filter(
        (lesson: any) => lesson.course_id === course.id
      );

      const completed = courseLessons.filter(
        (lesson: any) => completedLessonIds.has(lesson.id)
      ).length;

      const total = courseLessons.length;

      return {
        enrollment_id: enrollment.id,
        enrolled_at: enrollment.enrolled_at,
        enrollment_status: enrollment.status,
        id: course.id,
        title: course.title,
        code: course.code,
        description: course.description,
        category: course.category,
        level: course.level,
        total_lessons: total,
        completed_lessons: completed,
        progress_percent: total > 0
          ? Math.round((completed / total) * 100)
          : 0,
      };
    }).filter(Boolean);

    const academicRecords = records ?? [];
    const scoredRecords = academicRecords.filter(
      (record: any) =>
        typeof record.score === "number" &&
        typeof record.max_score === "number" &&
        record.max_score > 0
    );

    const averagePerformance = scoredRecords.length > 0
      ? Math.round(
          scoredRecords.reduce(
            (sum: number, record: any) =>
              sum + (record.score / record.max_score) * 100,
            0
          ) / scoredRecords.length
        )
      : null;

    res.status(200).json({
      success: true,
      student: {
        id: user.id,
        email: user.email,
      },
      summary: {
        enrolled_courses: studentCourses.length,
        completed_lessons: progress.length,
        academic_records: academicRecords.length,
        average_performance: averagePerformance,
      },
      courses: studentCourses,
      academic_records: academicRecords,
    });
  } catch (error) {
    console.error("Student dashboard error:", error);

    res.status(500).json({
      success: false,
      message: "Student dashboard data could not be loaded.",
    });
  }
});

// COURSE DETAILS
app.get("/api/student/courses/:courseId", requireAuth, async (req, res) => {
  try {
    const user = res.locals.user;
    const supabase = res.locals.supabase;
    const courseId = String(req.params.courseId);

    const { data: enrollment, error: enrollmentError } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", courseId)
      .maybeSingle();

    if (enrollmentError) throw enrollmentError;

    if (!enrollment) {
      res.status(404).json({
        success: false,
        message: "Course not found in your enrolments.",
      });
      return;
    }

    const [courseResult, lessonsResult] = await Promise.all([
      supabase.from("courses")
        .select("id, title, code, description, category, level, status")
        .eq("id", courseId)
        .maybeSingle(),

      supabase.from("lessons")
        .select("id, course_id, title, content, position")
        .eq("course_id", courseId)
        .order("position", { ascending: true }),
    ]);

    if (courseResult.error) throw courseResult.error;
    if (lessonsResult.error) throw lessonsResult.error;

    if (!courseResult.data) {
      res.status(404).json({
        success: false,
        message: "Course not found.",
      });
      return;
    }

    const lessons = lessonsResult.data ?? [];
    let progress: { lesson_id: string }[] = [];

    if (lessons.length > 0) {
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("lesson_id")
        .eq("student_id", user.id)
        .in("lesson_id", lessons.map((lesson: any) => lesson.id));

      if (error) throw error;
      progress = data ?? [];
    }

    const completedIds = new Set(
      progress.map(item => item.lesson_id)
    );

    res.json({
      success: true,
      course: courseResult.data,
      lessons: lessons.map((lesson: any) => ({
        ...lesson,
        completed: completedIds.has(lesson.id),
      })),
    });
  } catch (error) {
    console.error("Course details error:", error);

    res.status(500).json({
      success: false,
      message: "Course details could not be loaded.",
    });
  }
});

// LESSON DETAILS
app.get("/api/student/lessons/:lessonId", requireAuth, async (req, res) => {
  try {
    const user = res.locals.user;
    const supabase = res.locals.supabase;
    const lessonId = String(req.params.lessonId);

    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("id, course_id, title, content, position")
      .eq("id", lessonId)
      .maybeSingle();

    if (lessonError) throw lessonError;

    if (!lesson) {
      res.status(404).json({
        success: false,
        message: "Lesson not found.",
      });
      return;
    }

    const { data: enrollment, error: enrollmentError } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", lesson.course_id)
      .maybeSingle();

    if (enrollmentError) throw enrollmentError;

    if (!enrollment) {
      res.status(404).json({
        success: false,
        message: "Lesson not found in your enrolled courses.",
      });
      return;
    }

    const { data: progress, error: progressError } = await supabase
      .from("lesson_progress")
      .select("id")
      .eq("student_id", user.id)
      .eq("lesson_id", lessonId)
      .limit(1)
      .maybeSingle();

    if (progressError) throw progressError;

    res.json({
      success: true,
      lesson,
      completed: Boolean(progress),
    });
  } catch (error) {
    console.error("Lesson retrieval error:", error);

    res.status(500).json({
      success: false,
      message: "Lesson could not be loaded.",
    });
  }
});

// COMPLETE LESSON
app.post("/api/student/lessons/:lessonId/complete", requireAuth, async (req, res) => {
  try {
    const user = res.locals.user;
    const supabase = res.locals.supabase;
    const lessonId = String(req.params.lessonId);

    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("id, course_id")
      .eq("id", lessonId)
      .maybeSingle();

    if (lessonError) throw lessonError;

    if (!lesson) {
      res.status(404).json({
        success: false,
        message: "Lesson not found.",
      });
      return;
    }

    const { data: enrollment, error: enrollmentError } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", lesson.course_id)
      .maybeSingle();

    if (enrollmentError) throw enrollmentError;

    if (!enrollment) {
      res.status(404).json({
        success: false,
        message: "Lesson not found in your enrolled courses.",
      });
      return;
    }

    const { data: existing, error: existingError } = await supabase
      .from("lesson_progress")
      .select("id")
      .eq("student_id", user.id)
      .eq("lesson_id", lessonId)
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing) {
      const { error: insertError } = await supabase
        .from("lesson_progress")
        .insert({
          student_id: user.id,
          lesson_id: lessonId,
        });

      if (insertError) throw insertError;
    }

    res.json({
      success: true,
      completed: true,
    });
  } catch (error) {
    console.error("Lesson completion error:", error);

    res.status(500).json({
      success: false,
      message: "Lesson completion could not be saved.",
    });
  }
});

// UNKNOWN API ROUTES
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
