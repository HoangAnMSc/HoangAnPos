import type { ProductEditorInput } from "../features/products/types";
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from "./localDraft";

export const productEditorTabs = ["general", "specifications", "variants", "images", "seo"] as const;
export type ProductEditorTab = (typeof productEditorTabs)[number];
export type ProductEditorDraft = {
  form: ProductEditorInput;
  editorTab: ProductEditorTab;
  hasVariants: boolean;
  dirtyDimensions: boolean;
  open?: boolean;
};

export function productEditorDraftKey(accountKey: string, productId?: string) {
  return `${accountKey}:${productId ?? "new"}`;
}

export function readProductEditorDraft(key: string): ProductEditorDraft | null {
  const saved = readLocalDraft<ProductEditorDraft | { targetKey: string } | null>(key, null);
  const draft = saved && typeof saved === "object" && "targetKey" in saved
    ? typeof saved.targetKey === "string" && saved.targetKey.startsWith(`${key}:`)
      ? readLocalDraft<ProductEditorDraft | null>(saved.targetKey, null)
      : null
    : saved;
  if (!draft || typeof draft !== "object" || !draft.form || typeof draft.form !== "object") return null;
  const { form } = draft;
  if (typeof form.name !== "string" || typeof form.slug !== "string" ||
    (form.id !== undefined && typeof form.id !== "string") ||
    !Array.isArray(form.specifications) || !Array.isArray(form.variant_attributes) ||
    !Array.isArray(form.variants) || !Array.isArray(form.images) ||
    !productEditorTabs.some((tab) => tab === draft.editorTab) ||
    typeof draft.hasVariants !== "boolean" || typeof draft.dirtyDimensions !== "boolean" ||
    (draft.open !== undefined && typeof draft.open !== "boolean")) return null;
  return draft;
}

export function findProductEditorDraft(accountKey: string, productId?: string) {
  const saved = readProductEditorDraft(productEditorDraftKey(accountKey, productId));
  if (saved && saved.form.id === productId) return saved;
  // Also recover drafts saved by the previous single-draft implementation.
  const previous = readProductEditorDraft(accountKey);
  return previous?.form.id === productId ? previous : null;
}

export function writeProductEditorDraft(accountKey: string, draft: ProductEditorDraft) {
  const targetKey = productEditorDraftKey(accountKey, draft.form.id);
  writeLocalDraft(targetKey, draft);
  // Keep one copy of large SKU matrices; the account key only tracks the editor.
  writeLocalDraft(accountKey, { targetKey });
}

export function clearProductEditorDraft(accountKey: string, productId?: string) {
  const active = readProductEditorDraft(accountKey);
  clearLocalDraft(productEditorDraftKey(accountKey, productId));
  if (active?.form.id === productId) clearLocalDraft(accountKey);
}
