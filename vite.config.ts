import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function sendJson(response: { end: (body: string) => void; setHeader: (name: string, value: string) => void; statusCode: number }, statusCode: number, body: Record<string, unknown>) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

async function sha1Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-1", data);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

function readRequestBody(request: DevApiRequest) {
  return new Promise<string>((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += String(chunk ?? "");
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function deleteCloudinaryImage(
  env: Record<string, string>,
  publicId: string
) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      body: {
        message: "Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.",
        ok: false,
      },
      status: 500,
    };
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await sha1Hex(
    `invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
  );
  const formData = new FormData();
  formData.append("api_key", apiKey);
  formData.append("invalidate", "true");
  formData.append("public_id", publicId);
  formData.append("signature", signature);
  formData.append("timestamp", timestamp);

  const cloudinaryResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    {
      body: formData,
      method: "POST",
    }
  );
  const data = (await cloudinaryResponse.json()) as {
    error?: { message?: string };
    result?: string;
  };

  if (!cloudinaryResponse.ok || data.error) {
    return {
      body: {
        message: data.error?.message || "Cloudinary delete request failed.",
        ok: false,
        result: data.result,
      },
      status: cloudinaryResponse.status || 500,
    };
  }

  return {
    body: { ok: data.result === "ok" || data.result === "not found", result: data.result },
    status: 200,
  };
}

function createBasicAuthHeader(apiKey: string, apiSecret: string) {
  return `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;
}

async function listCloudinaryImages(env: Record<string, string>) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      body: {
        message: "Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.",
        ok: false,
      },
      status: 500,
    };
  }

  const resources = [];
  let nextCursor = "";

  do {
    const params = new URLSearchParams({
      direction: "desc",
      max_results: "500",
    });

    if (nextCursor) {
      params.set("next_cursor", nextCursor);
    }

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${params.toString()}`,
      {
        headers: {
          Authorization: createBasicAuthHeader(apiKey, apiSecret),
        },
      }
    );
    const data = (await cloudinaryResponse.json()) as {
      error?: { message?: string };
      next_cursor?: string;
      resources?: unknown[];
    };

    if (!cloudinaryResponse.ok || data.error) {
      return {
        body: {
          message: data.error?.message || "Cloudinary list request failed.",
          ok: false,
        },
        status: cloudinaryResponse.status || 500,
      };
    }

    resources.push(...(data.resources ?? []));
    nextCursor = data.next_cursor ?? "";
  } while (nextCursor);

  return {
    body: { ok: true, resources },
    status: 200,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    define: {
      "import.meta.env.CLOUDINARY_CLOUD_NAME": JSON.stringify(
        env.CLOUDINARY_CLOUD_NAME ?? env.VITE_CLOUDINARY_CLOUD_NAME ?? ""
      ),
      "import.meta.env.CLOUDINARY_UPLOAD_PRESET": JSON.stringify(
        env.CLOUDINARY_UPLOAD_PRESET ?? env.VITE_CLOUDINARY_UPLOAD_PRESET ?? ""
      ),
    },
    plugins: [
      react(),
      {
        configureServer(server) {
          server.middlewares.use("/api/cloudinary-images", async (request, response) => {
            const apiRequest = request as unknown as DevApiRequest;
            const apiResponse = response as unknown as DevApiResponse;

            if (apiRequest.method === "GET") {
              try {
                const result = await listCloudinaryImages(env);
                sendJson(apiResponse, result.status, result.body);
              } catch (error) {
                sendJson(apiResponse, 500, {
                  message:
                    error instanceof Error ? error.message : "Cloudinary list request failed.",
                  ok: false,
                });
              }
              return;
            }

            if (apiRequest.method !== "POST") {
              sendJson(apiResponse, 405, { message: "Method not allowed.", ok: false });
              return;
            }

            try {
              const rawBody = await readRequestBody(apiRequest);
              const body = JSON.parse(rawBody || "{}") as { publicId?: string };
              const publicId = body.publicId?.trim();

              if (!publicId) {
                sendJson(apiResponse, 400, { message: "Missing publicId.", ok: false });
                return;
              }

              const result = await deleteCloudinaryImage(env, publicId);
              sendJson(apiResponse, result.status, result.body);
            } catch (error) {
              sendJson(apiResponse, 500, {
                message:
                  error instanceof Error ? error.message : "Cloudinary delete request failed.",
                ok: false,
              });
            }
          });
        },
        name: "local-cloudinary-delete-api",
      },
    ],
  };
});
