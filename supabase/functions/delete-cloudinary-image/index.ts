import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function sha1Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-1", data);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (request.method !== "POST") {
    return jsonResponse({ message: "Method not allowed", ok: false }, 405);
  }

  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");

  if (!cloudName || !apiKey || !apiSecret) {
    return jsonResponse(
      {
        message:
          "Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.",
        ok: false,
      },
      500
    );
  }

  try {
    const body = (await request.json()) as { publicId?: string };
    const publicId = body.publicId?.trim();

    if (!publicId) {
      return jsonResponse({ message: "Missing publicId.", ok: false }, 400);
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const invalidate = "true";
    const signature = await sha1Hex(
      `invalidate=${invalidate}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
    );

    const formData = new FormData();
    formData.append("api_key", apiKey);
    formData.append("invalidate", invalidate);
    formData.append("public_id", publicId);
    formData.append("signature", signature);
    formData.append("timestamp", timestamp);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        body: formData,
        method: "POST",
      }
    );
    const data = (await response.json()) as { result?: string; error?: { message?: string } };

    if (!response.ok || data.error) {
      return jsonResponse(
        {
          message: data.error?.message || "Cloudinary delete request failed.",
          ok: false,
          result: data.result,
        },
        response.status || 500
      );
    }

    return jsonResponse({ ok: data.result === "ok" || data.result === "not found", result: data.result });
  } catch (error) {
    return jsonResponse(
      {
        message: error instanceof Error ? error.message : "Cloudinary delete request failed.",
        ok: false,
      },
      500
    );
  }
});
