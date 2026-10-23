import cors from "cors";
import express from "express";
import "./env.js";
import { ensureCoreSchema } from "./bootstrap/ensureCoreSchema.js";
import adminRoutes from "./routes/admin.js";
import applicationRoutes from "./routes/applications.js";
import authRoutes from "./routes/auth.js";
import courseRoutes from "./routes/courses.js";
import facultyRoutes from "./routes/faculty.js";
import notificationRoutes from "./routes/notifications.js";
import paymentRoutes from "./routes/payments.js";
import universityRoutes from "./routes/university.js";
import { startSchedulers } from "./services/scheduler.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const isSchemaDriftError = (error) =>
  error?.code === "ER_BAD_FIELD_ERROR" || error?.code === "ER_NO_SUCH_TABLE";

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173"
  })
);
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "eduvista-api",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/faculty", facultyRoutes);
app.use("/api/university", universityRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments", paymentRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  if (isSchemaDriftError(err)) {
    return res.status(503).json({
      error:
        "Database schema is out of date. Restart the backend to run migrations or run npm run migrate:schema inside backend."
    });
  }
  res.status(500).json({ error: "Unexpected server error." });
});

const startServer = async () => {
  await ensureCoreSchema();

  app.listen(port, () => {
    console.log(`EDUVISTA API listening on port ${port}`);
    startSchedulers();
  });
};

startServer().catch((error) => {
  console.error("Failed to start EDUVISTA API", error);
  process.exit(1);
});
