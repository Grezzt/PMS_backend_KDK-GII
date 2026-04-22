import "dotenv/config";
import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  seed: {
    command: "node prisma/seed.js",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
