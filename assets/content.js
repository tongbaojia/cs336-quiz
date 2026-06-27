/* CS336 Companion — content block renderer.
   A lecture section has `blocks: []`, each block is an object with ONE shape:
     { h: "subheading" }
     { p: "html paragraph; inline <code>x</code> and $tex$ allowed" }
     { list: ["item html", ...], ordered?: true }
     { callout: "html", kind: "key|insight|pitfall|connection|note", title?: "Label" }
     { code: "source", lang?: "python" }
     { math: "block tex (no $$)" }
     { table: { head: ["A","B"], rows: [["1","2"], ...] } }
     { quote: "html", cite?: "source" }
*/
(function () {
  "use strict";
  const esc = window.CS336.esc;

  const CALLOUT_LABEL = {
    key: "Key idea", insight: "Insight", pitfall: "Pitfall / gotcha",
    connection: "Connection", note: "Note",
  };

  function renderBlock(b) {
    if (b == null) return "";
    if (b.h != null) return `<h3 class="b-h">${b.h}</h3>`;
    if (b.p != null) return `<p class="b-p">${b.p}</p>`;
    if (b.list != null) {
      const tag = b.ordered ? "ol" : "ul";
      const cls = b.ordered ? "b-ol" : "b-ul";
      const items = b.list.map(x => `<li class="b-li">${x}</li>`).join("");
      return `<${tag} class="${cls}">${items}</${tag}>`;
    }
    if (b.callout != null) {
      const kind = b.kind || "key";
      const label = b.title || CALLOUT_LABEL[kind] || "Note";
      return `<div class="callout ${kind}"><div class="cl-title">${esc(label)}</div>${b.callout}</div>`;
    }
    if (b.code != null) {
      const lang = b.lang || "text";
      return `<div class="b-code"><div class="lang">${esc(lang)}</div><pre>${esc(b.code)}</pre></div>`;
    }
    if (b.math != null) {
      return `<div class="b-math">$$${b.math}$$</div>`;
    }
    if (b.table != null) {
      const head = (b.table.head || []).map(h => `<th>${h}</th>`).join("");
      const rows = (b.table.rows || []).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("");
      return `<div class="b-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    if (b.quote != null) {
      const cite = b.cite ? `<span class="cite">— ${b.cite}</span>` : "";
      return `<blockquote class="b-quote">${b.quote}${cite}</blockquote>`;
    }
    return "";
  }

  function renderBlocks(blocks) {
    return (blocks || []).map(renderBlock).join("");
  }

  window.CS336.renderBlocks = renderBlocks;
})();
