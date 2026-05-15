import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { PaymentSettings } from "../types";

export type PaymentSettingsInput = {
  transfer_note?: string | null;
  transfer_qr_url?: string | null;
};

const paymentSettingsId = true;

export async function fetchPaymentSettings() {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("payment_settings")
    .select("*")
    .eq("id", paymentSettingsId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function savePaymentSettings(input: PaymentSettingsInput): Promise<PaymentSettings> {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("payment_settings")
    .upsert(
      {
        id: paymentSettingsId,
        transfer_note: input.transfer_note,
        transfer_qr_url: input.transfer_qr_url,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
