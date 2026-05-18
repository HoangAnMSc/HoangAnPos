import { createHash } from "node:crypto";
import { authorizeApiRequest } from "./_auth.js";

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function createSignature(publicId, timestamp, apiSecret) {
  return createHash("sha1")
    .update(`invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");
}

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  return { apiKey, apiSecret, cloudName };
}

function createBasicAuthHeader(apiKey, apiSecret) {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

export default async function handler(request, response) {
  const auth = await authorizeApiRequest(
    request,
    request.method === "POST"
      ? ["cloudinary-images.delete"]
      : ["cloudinary-images", "products.create", "products.update"]
  );

  if (!auth.ok) {
    sendJson(response, auth.status, { message: auth.message, ok: false });
    return;
  }

  const config = getCloudinaryConfig();

  if (!config) {
    sendJson(response, 500, {
      message: "Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.",
      ok: false,
    });
    return;
  }

  if (request.method === "GET") {
    await listCloudinaryImages(response, config);
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { message: "Method not allowed.", ok: false });
    return;
  }

  const publicId =
    typeof request.body?.publicId === "string" ? request.body.publicId.trim() : "";

  if (!publicId) {
    sendJson(response, 400, { message: "Missing publicId.", ok: false });
    return;
  }

  await deleteCloudinaryImage(response, config, publicId);
}

async function listCloudinaryImages(response, { apiKey, apiSecret, cloudName }) {
  const resources = [];
  let nextCursor = "";

  try {
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
      const data = await cloudinaryResponse.json();

      if (!cloudinaryResponse.ok || data.error) {
        sendJson(response, cloudinaryResponse.status || 500, {
          message: data.error?.message || "Cloudinary list request failed.",
          ok: false,
        });
        return;
      }

      resources.push(...(data.resources ?? []));
      nextCursor = data.next_cursor ?? "";
    } while (nextCursor);

    sendJson(response, 200, { ok: true, resources });
  } catch (error) {
    sendJson(response, 500, {
      message: error instanceof Error ? error.message : "Cloudinary list request failed.",
      ok: false,
    });
  }
}

async function deleteCloudinaryImage(response, { apiKey, apiSecret, cloudName }, publicId) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createSignature(publicId, timestamp, apiSecret);
  const formData = new FormData();
  formData.append("api_key", apiKey);
  formData.append("invalidate", "true");
  formData.append("public_id", publicId);
  formData.append("signature", signature);
  formData.append("timestamp", timestamp);

  try {
    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        body: formData,
        method: "POST",
      }
    );
    const data = await cloudinaryResponse.json();

    if (!cloudinaryResponse.ok || data.error) {
      sendJson(response, cloudinaryResponse.status || 500, {
        message: data.error?.message || "Cloudinary delete request failed.",
        ok: false,
        result: data.result,
      });
      return;
    }

    sendJson(response, 200, {
      ok: data.result === "ok" || data.result === "not found",
      result: data.result,
    });
  } catch (error) {
    sendJson(response, 500, {
      message: error instanceof Error ? error.message : "Cloudinary delete request failed.",
      ok: false,
    });
  }
}
