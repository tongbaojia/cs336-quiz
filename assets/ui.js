/* CS336 Companion — shared quality-of-life helpers (toast, code copy, back-to-top) */
(function () {
  "use strict";
  const C = window.CS336 = window.CS336 || {};

  let toastTimer = null;
  function toast(msg) {
    let el = document.getElementById("cs-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "cs-toast";
      el.className = "cs-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) {}
      document.body.removeChild(ta);
      return ok;
    }
  }

  // add a "Copy" button to every code block under root
  function enhanceCode(root) {
    (root || document).querySelectorAll(".b-code").forEach(block => {
      if (block.querySelector(".code-copy")) return;
      const bar = block.querySelector(".lang");
      const pre = block.querySelector("pre");
      if (!bar || !pre) return;
      const btn = document.createElement("button");
      btn.className = "code-copy";
      btn.type = "button";
      btn.textContent = "Copy";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      btn.onclick = async () => {
        const ok = await copyText(pre.textContent);
        btn.textContent = ok ? "Copied" : "Failed";
        toast(ok ? "Code copied" : "Copy failed");
        setTimeout(() => { btn.textContent = "Copy"; }, 1300);
      };
      bar.appendChild(btn);
    });
  }

  function mountBackToTop() {
    if (document.getElementById("cs-top")) return;
    const b = document.createElement("button");
    b.id = "cs-top"; b.className = "cs-top"; b.type = "button";
    b.setAttribute("aria-label", "Back to top");
    b.innerHTML = "\u2191";
    b.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    document.body.appendChild(b);
    const onScroll = () => b.classList.toggle("show", window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  C.toast = toast;
  C.copyText = copyText;
  C.enhanceCode = enhanceCode;

  document.addEventListener("DOMContentLoaded", mountBackToTop);
})();
