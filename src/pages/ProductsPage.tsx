import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Boxes, CheckCircle2, Edit3, ImagePlus, PackagePlus, Search, Trash2 } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { formatCurrency } from "../lib/format";
import { uploadProductImage } from "../lib/cloudinary";
import {
  createProduct,
  deleteProduct,
  fetchProducts,
  updateProduct,
  type ProductInput,
} from "../services/products";
import type { Product } from "../types";

type ProductFormState = {
  name: string;
  sku: string;
  category: string;
  price: string;
  cost_price: string;
  stock: string;
  image_url: string;
  is_active: boolean;
};

const emptyForm: ProductFormState = {
  category: "",
  cost_price: "0",
  image_url: "",
  is_active: true,
  name: "",
  price: "0",
  sku: "",
  stock: "0",
};

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function productToForm(product?: Product | null): ProductFormState {
  if (!product) {
    return emptyForm;
  }

  return {
    category: product.category ?? "",
    cost_price: String(product.cost_price),
    image_url: product.image_url ?? "",
    is_active: product.is_active,
    name: product.name,
    price: String(product.price),
    sku: product.sku ?? "",
    stock: String(product.stock),
  };
}

type ProductFormProps = {
  product?: Product | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: ProductInput, imageFile: File | null) => Promise<void>;
};

function ProductForm({ onCancel, onSubmit, product, submitting }: ProductFormProps) {
  const [form, setForm] = useState<ProductFormState>(() => productToForm(product));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(productToForm(product));
    setImageFile(null);
    setError("");
  }, [product]);

  function updateField(field: keyof ProductFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setImageFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const name = form.name.trim();
    const price = Number(form.price);
    const costPrice = Number(form.cost_price);
    const stock = Number(form.stock);

    if (!name) {
      setError("Tên sản phẩm là bắt buộc.");
      return;
    }

    if ([price, costPrice, stock].some((value) => Number.isNaN(value) || value < 0)) {
      setError("Giá và tồn kho phải là số không âm.");
      return;
    }

    await onSubmit(
      {
        category: normalizeText(form.category),
        cost_price: costPrice,
        image_url: normalizeText(form.image_url),
        is_active: form.is_active,
        name,
        price,
        sku: normalizeText(form.sku),
        stock: Math.floor(stock),
      },
      imageFile
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Tên sản phẩm"
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Cà phê sữa đá"
          required
          value={form.name}
        />
        <Input
          label="Mã SKU"
          onChange={(event) => updateField("sku", event.target.value)}
          placeholder="CF-SUA-01"
          value={form.sku}
        />
        <Input
          label="Nhóm hàng"
          onChange={(event) => updateField("category", event.target.value)}
          placeholder="Đồ uống"
          value={form.category}
        />
        <Select
          label="Trạng thái"
          onChange={(event) => updateField("is_active", event.target.value === "true")}
          value={String(form.is_active)}
        >
          <option value="true">Đang bán</option>
          <option value="false">Tạm ẩn</option>
        </Select>
        <Input
          label="Giá bán"
          min="0"
          onChange={(event) => updateField("price", event.target.value)}
          type="number"
          value={form.price}
        />
        <Input
          label="Giá vốn"
          min="0"
          onChange={(event) => updateField("cost_price", event.target.value)}
          type="number"
          value={form.cost_price}
        />
        <Input
          label="Tồn kho"
          min="0"
          onChange={(event) => updateField("stock", event.target.value)}
          type="number"
          value={form.stock}
        />
        <Input
          label="URL ảnh hiện tại"
          onChange={(event) => updateField("image_url", event.target.value)}
          placeholder="Tự điền sau khi upload Cloudinary"
          value={form.image_url}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-4 rounded-3xl border border-dashed border-coal/15 bg-white/70 p-4 transition hover:border-clay hover:bg-white">
        <div className="rounded-2xl bg-clay/10 p-3 text-clay">
          <ImagePlus className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Tải ảnh lên Cloudinary</p>
          <p className="truncate text-sm text-coal/55">
            {imageFile ? imageFile.name : "Chọn ảnh mới nếu muốn thay ảnh sản phẩm."}
          </p>
        </div>
        <input accept="image/*" className="hidden" onChange={handleFileChange} type="file" />
      </label>

      {form.image_url ? (
        <img
          alt={form.name || "Ảnh sản phẩm"}
          className="h-36 w-full rounded-3xl object-cover"
          src={form.image_url}
        />
      ) : null}

      {error ? (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button onClick={onCancel} type="button" variant="secondary">
          Hủy
        </Button>
        <Button isLoading={submitting} type="submit">
          {product ? "Cập nhật" : "Thêm sản phẩm"}
        </Button>
      </div>
    </form>
  );
}

export function ProductsPage() {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadProducts() {
    setLoading(true);
    setError("");

    try {
      setProducts(await fetchProducts());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không tải được danh sách sản phẩm."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  function openCreateModal() {
    setEditingProduct(null);
    setModalOpen(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setModalOpen(true);
  }

  async function handleSave(input: ProductInput, imageFile: File | null) {
    setSubmitting(true);
    setError("");

    try {
      const imageUrl = imageFile ? await uploadProductImage(imageFile) : input.image_url;
      const payload = { ...input, image_url: imageUrl };

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
      } else {
        await createProduct(payload);
      }

      setModalOpen(false);
      setEditingProduct(null);
      await loadProducts();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Lưu sản phẩm thất bại."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(product: Product) {
    const confirmed = window.confirm(`Xóa sản phẩm "${product.name}"?`);
    if (!confirmed) {
      return;
    }

    setError("");

    try {
      await deleteProduct(product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Xóa sản phẩm thất bại."
      );
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = products.filter((product) =>
    [product.name, product.sku, product.category]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery))
  );
  const activeCount = products.filter((product) => product.is_active).length;
  const stockValue = products.reduce(
    (sum, product) => sum + product.stock * product.cost_price,
    0
  );

  return (
    <div className="space-y-6">
      <ConfigNotice />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm font-extrabold uppercase tracking-wide text-coal/45">
            Tổng sản phẩm
          </p>
          <p className="mt-2 font-display text-3xl font-bold">{products.length}</p>
        </Card>
        <Card>
          <p className="text-sm font-extrabold uppercase tracking-wide text-coal/45">
            Đang bán
          </p>
          <p className="mt-2 font-display text-3xl font-bold">{activeCount}</p>
        </Card>
        <Card>
          <p className="text-sm font-extrabold uppercase tracking-wide text-coal/45">
            Giá trị tồn vốn
          </p>
          <p className="mt-2 font-display text-3xl font-bold">{formatCurrency(stockValue)}</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
            <Input
              className="pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, SKU, nhóm hàng..."
              value={query}
            />
          </div>
          <Button onClick={openCreateModal}>
            <PackagePlus className="h-4 w-4" />
            Thêm sản phẩm
          </Button>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <Spinner />
        ) : filteredProducts.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              description="Thêm sản phẩm đầu tiên để POS có dữ liệu bán hàng."
              icon={Boxes}
              title="Chưa có sản phẩm phù hợp"
            />
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-3xl border border-coal/10">
            <div className="hidden grid-cols-[1.4fr_0.9fr_0.8fr_0.7fr_0.6fr] gap-4 bg-coal px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-white/70 lg:grid">
              <span>Sản phẩm</span>
              <span>Nhóm/SKU</span>
              <span>Giá bán</span>
              <span>Tồn</span>
              <span className="text-right">Thao tác</span>
            </div>
            <div className="divide-y divide-coal/10 bg-white/70">
              {filteredProducts.map((product) => (
                <div
                  className="grid gap-4 p-4 lg:grid-cols-[1.4fr_0.9fr_0.8fr_0.7fr_0.6fr] lg:items-center lg:px-5"
                  key={product.id}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 overflow-hidden rounded-2xl bg-coal/5">
                      {product.image_url ? (
                        <img
                          alt={product.name}
                          className="h-full w-full object-cover"
                          src={product.image_url}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-coal/35">
                          <Boxes className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold">{product.name}</p>
                      <Badge tone={product.is_active ? "green" : "neutral"}>
                        {product.is_active ? "Đang bán" : "Tạm ẩn"}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm">
                    <p className="font-bold">{product.category || "Chưa phân nhóm"}</p>
                    <p className="text-coal/50">{product.sku || "Chưa có SKU"}</p>
                  </div>
                  <p className="font-display text-lg font-bold">{formatCurrency(product.price)}</p>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-moss" />
                    <span className="font-bold">{product.stock}</span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button className="h-10 w-10 p-0" onClick={() => openEditModal(product)} variant="secondary">
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button className="h-10 w-10 p-0" onClick={() => handleDelete(product)} variant="danger">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Modal
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        title={editingProduct ? "Sửa sản phẩm" : "Thêm sản phẩm"}
      >
        <ProductForm
          onCancel={() => setModalOpen(false)}
          onSubmit={handleSave}
          product={editingProduct}
          submitting={submitting}
        />
      </Modal>
    </div>
  );
}
