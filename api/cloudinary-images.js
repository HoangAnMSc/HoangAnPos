import { createHash } from "node:crypto";
import { authorizeApiRequest, userHasAnyPermission } from "./_auth.js";

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function createSignature(parameters, apiSecret) {
  const payload = Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1")
    .update(`${payload}${apiSecret}`)
    .digest("hex");
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;

  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk ?? "");
      if (body.length > 1_000_000) reject(new Error("Request body is too large."));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
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
  let body = {};
  if (request.method === "POST") {
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendJson(response, 400, {
        message: error instanceof Error ? error.message : "Invalid JSON body.",
        ok: false,
      });
      return;
    }
  }

  const signingUpload = request.method === "POST" && body.action === "sign-upload";
  const auth = await authorizeApiRequest(
    request,
    signingUpload
      ? [
          "cloudinary-images.upload",
          "products.create",
          "products.update",
          "pos.payment-proof.upload",
          "payment-settings.update",
          "attendance.clock",
          "cash-management.reconciliation.update",
        ]
      : request.method === "POST"
      ? ["cloudinary-images.delete"]
      : [
          "cloudinary-images",
          "orders",
          "payment-settings.update",
          "products.create",
          "products.update",
        ]
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
    const rawScope = Array.isArray(request.query?.scope)
      ? request.query.scope[0]
      : request.query?.scope;
    const scope = typeof rawScope === "string" && rawScope.trim() ? rawScope.trim() : "products";
    const scopes = {
      invoices: {
        permissions: ["orders"],
        prefixes: ["hoang-an-pos/payment-proofs/"],
      },
      "payment-qr": {
        permissions: ["payment-settings.update"],
        prefixes: ["hoang-an-pos/payment-qr/"],
      },
      products: {
        permissions: ["cloudinary-images", "products.create", "products.update"],
        prefixes: ["hoang-an-pos/products/"],
      },
    };
    const requestedScope = scopes[scope];

    if (!requestedScope) {
      sendJson(response, 400, { message: "Image scope is not allowed.", ok: false });
      return;
    }

    if (!(await userHasAnyPermission(auth.admin, auth.user, requestedScope.permissions))) {
      sendJson(response, 403, { message: "Permission denied for this image scope.", ok: false });
      return;
    }

    await listCloudinaryImages(response, config, requestedScope.prefixes);
    return;
  }

  if (signingUpload) {
    const folderPermissions = {
      "hoang-an-pos/payment-proofs": ["pos.payment-proof.upload"],
      "hoang-an-pos/payment-qr": ["payment-settings.update"],
      "hoang-an-pos/cash-reconciliation": [
        "attendance.clock",
        "cash-management.reconciliation.update",
      ],
      "hoang-an-pos/products": [
        "cloudinary-images.upload",
        "products.create",
        "products.update",
      ],
    };
    const folder = typeof body.folder === "string" ? body.folder.trim() : "";
    const allowedPermissions = folderPermissions[folder];

    if (!allowedPermissions) {
      sendJson(response, 400, { message: "Upload folder is not allowed.", ok: false });
      return;
    }

    if (!(await userHasAnyPermission(auth.admin, auth.user, allowedPermissions))) {
      sendJson(response, 403, { message: "Permission denied for this upload folder.", ok: false });
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const format = "webp";
    const transformation = "q_20";
    const assetFolder = folder;
    const publicIdPrefix = folder;
    sendJson(response, 200, {
      assetFolder,
      apiKey: config.apiKey,
      cloudName: config.cloudName,
      folder,
      ok: true,
      signature: createSignature({ asset_folder: assetFolder, format, public_id_prefix: publicIdPrefix, timestamp, transformation }, config.apiSecret),
      timestamp,
    });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { message: "Method not allowed.", ok: false });
    return;
  }

  const publicId = typeof body.publicId === "string" ? body.publicId.trim() : "";

  if (!publicId) {
    sendJson(response, 400, { message: "Missing publicId.", ok: false });
    return;
  }

  await deleteCloudinaryImage(response, config, publicId);
}

async function listCloudinaryImages(response, { apiKey, apiSecret, cloudName }, allowedPrefixes) {
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

      resources.push(
        ...(data.resources ?? []).filter(
          (resource) =>
            !allowedPrefixes ||
            allowedPrefixes.some((prefix) => resource.public_id?.startsWith(prefix))
        )
      );
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
  const signature = createSignature({ invalidate: true, public_id: publicId, timestamp }, apiSecret);
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
