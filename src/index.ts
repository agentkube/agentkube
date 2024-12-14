import express, { Request, Response, Application } from "express";
import cors from "cors";
import routes from "../routes/routes";
import { prisma } from "../connectors/prisma";
import morgan from "morgan";
import redis from "../connectors/redis";

const app: Application = express();
const port = process.env.PORT || 8765;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Health check
app.get("/healthz", (_: Request, res: Response) => {
  res.json({ status: "healthy" });
});

// API routes
app.use("/api", routes);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log("Successfully connected to database");

    redis
      .ping()
      .then((response) => {
        console.log("Redis connection test:", response); // Should print 'PONG'
      })
      .catch((error) => {
        console.error("Redis connection failed:", error);
      });

    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
      console.log(`Server running at http://localhost:${port}/healthz`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log(
    "SIGTERM received. Closing HTTP server and database connection..."
  );
  await prisma.$disconnect();
  process.exit(0);
});
