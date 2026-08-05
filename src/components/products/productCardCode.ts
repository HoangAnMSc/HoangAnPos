export function getDefaultCardCode(mode: "card" | "pos") {
  const html = `<article class="card-shell ${mode === "pos" ? "card-pos" : "card-product"}">
  <div class="media"><img src="{{image_url}}" alt="{{name}}" /></div>
  <div class="content">
    <h3 class="name">{{name}}</h3>
    <p class="category">{{category}}</p>
    <p class="attributes">{{attributes}}</p>
    <div class="bottom">
      <strong class="price">{{price}}</strong>
      <span class="stock">{{shelf_stock_text}}</span>
      ${mode === "pos" ? '<span class="quantity">− {{quantity}} +</span>' : ""}
    </div>
  </div>
</article>`;
  const css = `:host { display: block; width: 100%; height: 100%; min-width: 0; container-type: inline-size; }
* { box-sizing: border-box; }
.card-shell { display: flex; min-width: 0; height: 100%; min-height: 226px; flex-direction: column; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; color: #0f172a; font-family: inherit; box-shadow: 0 3px 12px rgba(15,23,42,.05); }
.card-pos { min-height: 210px; }
.media { aspect-ratio: 1.6; width: 100%; flex: none; overflow: hidden; background: #f8fafc; }
.media img { display: block; width: 100%; height: 100%; object-fit: cover; }
.media:has(img[src=""]) { display: none; }
.content { display: flex; min-width: 0; flex: 1; flex-direction: column; padding: 10px; }
.name { display: -webkit-box; min-height: 36px; margin: 0; overflow: hidden; font-size: 14px; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.category, .attributes { margin: 5px 0 0; overflow: hidden; color: #64748b; font-size: 11px; font-weight: 600; line-height: 1.35; text-overflow: ellipsis; }
.category { white-space: nowrap; }
.attributes { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.category:empty, .attributes:empty, .stock:empty { display: none; }
.bottom { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: auto; padding-top: 9px; }
.price { min-width: 0; color: #50613e; font-size: 15px; font-weight: 900; white-space: nowrap; }
.stock { width: 100%; overflow: hidden; border-radius: 8px; background: #ecfdf5; padding: 5px 7px; color: #166534; font-size: 10px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.quantity { margin-left: auto; border-radius: 999px; background: #eef3e9; padding: 5px 8px; color: #3f4d31; font-size: 11px; font-weight: 900; }`;
  const responsiveCss = `
@container (max-width: 170px) {
  .card-shell { min-height: 205px; border-radius: 12px; }
  .content { padding: 8px; }
  .name { min-height: 32px; font-size: 12px; }
  .category, .attributes { font-size: 9px; }
  .price { font-size: 13px; }
  .stock { padding: 4px 6px; font-size: 9px; }
  .quantity { padding: 4px 6px; font-size: 10px; }
}`;
  return { html, css: `${css}${responsiveCss}` };
}
