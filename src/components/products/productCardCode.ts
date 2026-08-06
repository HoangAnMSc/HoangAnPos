export const cardTypedFieldCss = `
.fields { display:flex; min-width:0; flex-wrap:wrap; gap:5px; margin-top:7px; }
.fields:empty { display:none; }
.attributes:has(.product-field) { display:flex!important; min-width:0; flex-wrap:wrap; gap:5px; overflow:visible; white-space:normal; -webkit-line-clamp:unset; }
.product-field { display:inline-flex; min-width:0; max-width:100%; align-items:center; gap:5px; border-radius:7px; background:#f8fafc; padding:4px 6px; color:#475569; font-size:9px; font-weight:700; line-height:1.3; }
.field-label { flex:none; color:#64748b; font-size:8px; font-weight:800; }
.field-label::after { content:":"; }
.field-value { display:flex; min-width:0; align-items:center; gap:4px; overflow:hidden; color:#1e293b; font-weight:800; text-overflow:ellipsis; }
.field-text,.field-code,.field-media { width:100%; }
.field-text .field-value,.field-code .field-value { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
.field-number { background:#eef3e9; color:#40512f; }
.field-number .field-value { color:#40512f; font-size:10px; font-weight:950; }
.field-money { background:#fff7ed; }
.field-money .field-value { color:#9a3412; font-weight:950; }
.field-date { border:1px solid #e2e8f0; background:#fff; }
.field-date .field-value { font-variant-numeric:tabular-nums; }
.field-code { border:1px dashed #cbd5e1; background:#fff; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.field-status { border-radius:999px; }
.field-status.is-positive { background:#dcfce7; color:#166534; }
.field-status.is-muted { background:#f1f5f9; color:#64748b; }
.field-single,.field-multiple { width:100%; align-items:flex-start; }
.choice-list { display:flex; min-width:0; flex-wrap:wrap; gap:4px; }
.choice-chip { display:inline-flex; min-width:0; align-items:center; gap:4px; border:1px solid #dbe3d3; border-radius:999px; background:#fff; padding:2px 5px; color:#334155; }
.choice-color { border:0; background:transparent; padding:1px; }
.choice-swatch { display:block; width:14px; height:14px; flex:none; border:2px solid #fff; border-radius:999px; box-shadow:0 0 0 1px #94a3b8; }
.choice-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.field-media { position:relative; overflow:hidden; padding:4px; }
.field-media .field-label { padding-left:3px; }
.field-media .field-value { flex:1; justify-content:flex-end; }
.field-media img { width:30px; height:30px; flex:none; border-radius:6px; object-fit:cover; }
@container (max-width:170px) {
  .fields { gap:4px; margin-top:5px; }
  .product-field { padding:3px 5px; font-size:8px; }
  .field-label { font-size:7px; }
  .choice-swatch { width:12px; height:12px; }
}`;

const cardOverlayCss = `
.reward-badge,.category { position:absolute; z-index:2; bottom:7px; max-width:calc(55% - 10px); overflow:hidden; border-radius:999px; padding:4px 7px; font-size:8px; font-weight:900; line-height:1; text-overflow:ellipsis; white-space:nowrap; backdrop-filter:blur(7px); }
.reward-badge { left:7px; background:rgba(254,243,199,.94); color:#92400e; }
.category { right:7px; background:rgba(255,255,255,.94); color:#475569; box-shadow:0 1px 4px rgba(15,23,42,.12); }
.reward-badge:empty,.category:empty { display:none; }`;

export function getDefaultCardCode(mode: "card" | "pos") {
  const html = `<article class="card-shell ${mode === "pos" ? "card-pos" : "card-product"}">
  <div class="media">
    <img src="{{image_url}}" alt="{{name}}" />
    <span class="reward-badge">{{reward_points_badge}}</span>
    <span class="category">{{category}}</span>
  </div>
  <div class="content">
    <h3 class="name">{{name}}</h3>
    <div class="fields">{{field_blocks}}</div>
    <p class="stock">{{shelf_stock_text}}</p>
    <div class="bottom">
      <strong class="price">{{price}}</strong>
      ${mode === "pos" ? '<span class="quantity"><i>−</i><b>{{quantity}}</b><i>+</i></span>' : ""}
    </div>
  </div>
</article>`;
  const css = `:host { display: block; width: 100%; height: 100%; min-width: 0; container-type: inline-size; }
* { box-sizing: border-box; }
.card-shell { display: flex; min-width: 0; height: 100%; min-height: 286px; flex-direction: column; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; color: #0f172a; font-family: inherit; box-shadow: 0 3px 12px rgba(15,23,42,.05); transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease; }
.card-shell:hover { border-color: #b7c7a8; box-shadow: 0 10px 24px rgba(15,23,42,.1); transform: translateY(-2px); }
.card-pos { min-height: 270px; }
.media { position:relative; aspect-ratio: 1.14; width: auto; flex: none; margin: 8px 8px 0; overflow: hidden; border-radius: 9px; background: #f8fafc; }
.media img { display: block; width: 100%; height: 100%; padding: 12px; object-fit: cover; transition: transform .3s ease; }
.card-shell:hover .media img { transform: scale(1.03); }
.media:has(img[src=""]) { display: none; }
.content { display: flex; min-width: 0; flex: 1; flex-direction: column; padding: 9px 10px 10px; }
.name { display: -webkit-box; min-height: 34px; margin: 0; overflow: hidden; color: #020617; font-size: 14px; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.stock:empty { display: none; }
.stock { align-self: flex-start; max-width: 100%; margin: 6px 0 0; overflow: hidden; border-radius: 6px; background: #f1f5ed; padding: 3px 6px; color: #587044; font-size: 9px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.bottom { display: flex; min-width: 0; align-items: center; gap: 7px; margin-top: auto; padding-top: 8px; }
.price { min-width: 0; overflow: hidden; color: #40512f; font-size: 15px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.quantity { display: inline-flex; flex: none; align-items: center; gap: 6px; margin-left: auto; color: #1f2937; font-size: 11px; font-style: normal; font-weight: 900; }
.quantity i { display: grid; width: 26px; height: 26px; place-items: center; border: 1px solid #e2e8f0; border-radius: 999px; background: #fff; color: #64748b; font-size: 16px; font-style: normal; line-height: 1; }
.quantity i:last-child { border-color: #344329; background: #344329; color: #fff; }
.quantity b { min-width: 10px; text-align: center; font-size: 11px; }
`;
  const responsiveCss = `@container (max-width: 170px) {
  .card-shell { min-height: 235px; border-radius: 12px; }
  .media { margin: 6px 6px 0; }
  .media img { padding: 8px; }
  .content { padding: 8px; }
  .name { min-height: 32px; font-size: 12px; }
  .price { font-size: 13px; }
  .stock { padding: 3px 5px; font-size: 8px; }
  .quantity { gap: 4px; font-size: 10px; }
  .quantity i { width: 22px; height: 22px; font-size: 14px; }
}`;
  return {
    html,
    css: `${css}${cardTypedFieldCss}${cardOverlayCss}${responsiveCss}`,
  };
}

export type BuiltInCardTemplate = {
  id: string;
  name: string;
  description: string;
  html: string;
  css: string;
};

export function getBuiltInCardTemplates(
  mode: "card" | "pos",
): BuiltInCardTemplate[] {
  const original = getDefaultCardCode(mode);
  const quantity =
    mode === "pos" ? '<span class="quantity">− {{quantity}} +</span>' : "";

  const compactHtml = `<article class="card-shell compact-card">
  <div class="media">
    <img src="{{image_url}}" alt="{{name}}" />
    <span class="reward-badge">{{reward_points_badge}}</span>
    <span class="category">{{category}}</span>
  </div>
  <div class="content">
    <h3 class="name">{{name}}</h3>
    <div class="fields">{{field_blocks}}</div>
    <div class="bottom">
      <strong class="price">{{price}}</strong>
      ${quantity}
    </div>
    <p class="stock">{{shelf_stock_text}}</p>
  </div>
</article>`;
  const compactCss = `:host { display:block; width:100%; height:100%; min-width:0; container-type:inline-size; }
* { box-sizing:border-box; }
.card-shell { display:grid; grid-template-columns:42% minmax(0,1fr); width:100%; height:100%; min-height:190px; overflow:hidden; border:1px solid #e2e8f0; border-radius:18px; background:#fff; color:#0f172a; font-family:inherit; box-shadow:0 8px 24px rgba(15,23,42,.08); }
.media { position:relative; min-width:0; height:100%; overflow:hidden; background:#f1f5f9; }
.media img { display:block; width:100%; height:100%; object-fit:cover; }
.media:has(img[src=""]) { display:none; }
.content { display:flex; min-width:0; flex-direction:column; padding:14px 12px; }
.name { display:-webkit-box; margin:0; overflow:hidden; font-size:14px; font-weight:900; line-height:1.35; -webkit-box-orient:vertical; -webkit-line-clamp:3; }
.stock:empty { display:none; }
.bottom { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:auto; padding-top:10px; }
.price { color:#50613e; font-size:15px; font-weight:950; white-space:nowrap; }
.quantity { margin-left:auto; border-radius:999px; background:#344329; padding:5px 8px; color:#fff; font-size:10px; font-weight:900; }
.stock { margin:7px 0 0; overflow:hidden; color:#166534; font-size:9px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
@container (max-width:190px) { .card-shell { grid-template-columns:1fr; min-height:235px; } .media { height:105px; } .content { padding:9px; } .name { font-size:12px; -webkit-line-clamp:2; } }`;

  const accentHtml = `<article class="card-shell accent-card">
  <div class="media">
    <img src="{{image_url}}" alt="{{name}}" />
    <span class="reward-badge">{{reward_points_badge}}</span>
    <span class="category">{{category}}</span>
  </div>
  <div class="content">
    <h3 class="name">{{name}}</h3>
    <div class="fields">{{field_blocks}}</div>
    <div class="bottom">
      <div><span class="price-label">Giá bán</span><strong class="price">{{price}}</strong></div>
      ${quantity}
    </div>
    <p class="stock">{{shelf_stock_text}}</p>
  </div>
</article>`;
  const accentCss = `:host { display:block; width:100%; height:100%; min-width:0; container-type:inline-size; }
* { box-sizing:border-box; }
.card-shell { display:flex; width:100%; height:100%; min-height:230px; flex-direction:column; overflow:hidden; border:1px solid #d8e0cf; border-radius:22px; background:linear-gradient(180deg,#fff 0%,#f5f8f1 100%); color:#182112; font-family:inherit; box-shadow:0 12px 30px rgba(58,75,44,.13); }
.media { position:relative; aspect-ratio:1.65; flex:none; overflow:hidden; background:#edf2e8; }
.media::after { position:absolute; inset:auto 0 0; height:45%; background:linear-gradient(transparent,rgba(15,23,42,.38)); content:""; pointer-events:none; }
.media img { display:block; width:100%; height:100%; object-fit:cover; transition:transform .25s ease; }
.card-shell:hover .media img { transform:scale(1.035); }
.media:has(img[src=""]) { display:none; }
.category { right:9px; bottom:9px; }
.reward-badge { left:9px; bottom:9px; }
.stock:empty { display:none; }
.content { display:flex; min-width:0; flex:1; flex-direction:column; padding:11px; }
.name { display:-webkit-box; min-height:36px; margin:0; overflow:hidden; font-size:14px; font-weight:950; line-height:1.3; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
.bottom { display:flex; align-items:flex-end; gap:7px; margin-top:auto; padding-top:9px; }
.bottom > div { min-width:0; }
.price-label { display:block; margin-bottom:1px; color:#7c8b70; font-size:8px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
.price { display:block; overflow:hidden; color:#40512f; font-size:16px; font-weight:950; text-overflow:ellipsis; white-space:nowrap; }
.quantity { margin-left:auto; border:1px solid #bac7ad; border-radius:10px; background:#fff; padding:6px 8px; color:#344329; font-size:10px; font-weight:950; }
.stock { align-self:flex-start; margin:7px 0 0; border-radius:999px; background:#dcfce7; padding:4px 7px; color:#166534; font-size:9px; font-weight:850; }
@container (max-width:170px) { .card-shell { min-height:210px; border-radius:16px; } .content { padding:8px; } .name { min-height:31px; font-size:12px; } .price { font-size:13px; } .category { right:6px; bottom:6px; } }`;

  return [
    {
      id: "original",
      name: "Nguyên bản",
      description: "Giao diện card ban đầu",
      ...original,
    },
    {
      id: "compact",
      name: "Ngang gọn",
      description: "Ảnh trái, nội dung bên phải",
      html: compactHtml,
      css: `${cardTypedFieldCss}${cardOverlayCss}${compactCss}`,
    },
    {
      id: "accent",
      name: "Nổi bật",
      description: "Bo lớn, nhấn mạnh giá bán",
      html: accentHtml,
      css: `${cardTypedFieldCss}${cardOverlayCss}${accentCss}`,
    },
  ];
}
