import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Runs the Vercel functions in api/ during `npm run dev`, so the AI step can be tried locally.
 * Keys come from the terminal's environment only. With no key the endpoint answers 503
 * and the app keeps the template brief.
 */
function devApi(): Plugin {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/(brief|extract)(\?|$)/);
        if (!match) return next();
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const raw = Buffer.concat(chunks).toString("utf8");
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`);
          const vres = Object.assign(res, {
            status(code: number) {
              res.statusCode = code;
              return vres;
            },
            json(body: unknown) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(body));
              return vres;
            },
          });
          await mod.default(Object.assign(req, { body: raw ? JSON.parse(raw) : undefined }), vres);
        } catch {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "dev_api_error" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
} as Parameters<typeof defineConfig>[0]);
