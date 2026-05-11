import { AlertTriangle } from "lucide-react";
import { isCloudinaryConfigured } from "../../lib/cloudinary";
import { isSupabaseConfigured } from "../../lib/supabase";

export function ConfigNotice() {
  const missingSupabase = !isSupabaseConfigured;
  const missingCloudinary = !isCloudinaryConfigured;

  if (!missingSupabase && !missingCloudinary) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-clay/20 bg-clay/10 p-4 text-sm text-coal">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-clay" />
        <div>
          <p className="font-extrabold">Cần cấu hình môi trường</p>
          <p className="mt-1 leading-6 text-coal/70">
            Tạo file <span className="font-bold">.env</span> từ{" "}
            <span className="font-bold">.env.example</span> và điền các biến còn thiếu:
            {missingSupabase ? " Supabase" : ""}
            {missingSupabase && missingCloudinary ? "," : ""}
            {missingCloudinary ? " Cloudinary" : ""}.
          </p>
        </div>
      </div>
    </div>
  );
}
