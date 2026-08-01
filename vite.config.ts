import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function sendJson(
  response: DevApiResponse,
  statusCode: number,
  body: Record<string, unknown>
) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

type DevApiRequest = {
  method?: string;
  on: (event: string, callback: (chunk?: unknown) => void) => void;
};

type DevApiResponse = {
  end: (body: string) => void;
  setHeader: (name: string, value: string) => void;
  statusCode: number;
};

type ProcessLike = {
  cwd: () => string;
  env: Record<string, string | undefined>;
};

function createFileModuleUrl(path: string) {
  const normalizedPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return encodeURI(`file:///${normalizedPath}`);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    define: {
      "import.meta.env.CLOUDINARY_CLOUD_NAME": JSON.stringify(
        env.CLOUDINARY_CLOUD_NAME ?? env.VITE_CLOUDINARY_CLOUD_NAME ?? ""
      ),
    },
    plugins: [
      react(),
      {
        configureServer(server) {
          const registerApi = (route: string, moduleName: string) => {
            server.middlewares.use(route, async (request, response) => {
              const apiRequest = request as unknown as DevApiRequest;
              const apiResponse = response as unknown as DevApiResponse;

              try {
                const processLike = (globalThis as unknown as { process: ProcessLike }).process;
                processLike.env.SUPABASE_URL = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
                processLike.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
                processLike.env.CLOUDINARY_CLOUD_NAME = env.CLOUDINARY_CLOUD_NAME;
                processLike.env.CLOUDINARY_API_KEY = env.CLOUDINARY_API_KEY;
                processLike.env.CLOUDINARY_API_SECRET = env.CLOUDINARY_API_SECRET;
                const moduleUrl = `${createFileModuleUrl(processLike.cwd())}/api/${moduleName}.js`;
                const { default: handler } = await import(moduleUrl);
                await handler(apiRequest, apiResponse);
              } catch (error) {
                sendJson(apiResponse, 500, {
                  message: error instanceof Error ? error.message : "API request failed.",
                  ok: false,
                });
              }
            });
          };

          registerApi("/api/admin-users", "admin-users");
          registerApi("/api/cloudinary-images", "cloudinary-images");
        },
        name: "authenticated-local-api",
      },
    ],
  };
});
