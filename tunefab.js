var H = (e, t, o) =>
  new Promise((i, a) => {
    var l = (c) => {
        try {
          d(o.next(c));
        } catch (m) {
          a(m);
        }
      },
      n = (c) => {
        try {
          d(o.throw(c));
        } catch (m) {
          a(m);
        }
      },
      d = (c) => (c.done ? i(c.value) : Promise.resolve(c.value).then(l, n));
    d((o = o.apply(e, t)).next());
  });
import se from "./spotify-music-converter-online-api.js";
const _ = new se("https://member.tunefab.com/"),
  h = {
    rule_tag: "tf_all_online_v1.0",
    target_type: "SY",
    permission_tag: "smc",
    timeout: 6e4,
    maxDownloads: 2,
  },
  p = {
    isParsing: !1,
    analysisData: [],
    vipInfo: null,
    currentUrl: "",
    downloadedSongs: new Set(),
  },
  O = {
    download: "Descargar MP3",
    downloaded: "Descargado",
    unlock: "Comprar ahora",
    unknownTitle: "T\xEDtulo desconocido",
    unknownArtist: "Artista desconocido",
  },
  ce =
    "https://img.tunefab.es/uploads/page/product/spotify-music-converter-online/icon-lock.svg";
let r = {};
function J() {
  ((r = {
    urlInput: document.querySelector(".url"),
    onlineBtn: document.querySelector(".online-btn"),
    onlineInfo: document.querySelector(".online-info"),
    infoDefault: document.querySelector(".info-default"),
    errorNosupport: document.querySelector(".error-nosupport"),
    errorFail: document.querySelector(".error-fail"),
    errorTimeout: document.querySelector(".error-timeout"),
    errorEpisode: document.querySelector(".error-episode"),
    errorShow: document.querySelector(".error-show"),
    errorUser: document.querySelector(".error-user"),
    errorKeyboard: document.querySelector(".error-keyboard"),
    onlineGuide: document.querySelector(".online-guide"),
    onlineLoading: document.querySelector(".online-loading"),
    analysisResult: document.querySelector(".analysis-result"),
    loadMoreBtn: document.querySelector(".analysis-result .load-more-btn"),
    popBuy: document.querySelector(".pop-buy"),
    popMore: document.querySelector(".pop-more"),
    popPrice: document.querySelector(".pop-price"),
  }),
    P(),
    b(r.infoDefault, "flex"),
    y(r.onlineLoading),
    oe(),
    y(r.popBuy),
    y(r.popMore),
    y(r.popPrice),
    ue(),
    be(),
    _e(),
    Le(),
    ke(),
    W(),
    setTimeout(() => {
      R();
    }, 500));
}
function ue() {
  const e = () => {
    const t = r.urlInput.value.trim();
    if ((b(r.onlineInfo, "block"), !t)) {
      (P(), b(r.infoDefault, "flex"));
      return;
    }
    Y(t) || t.startsWith("spotify:") ? me(t) : (P(), b(r.infoDefault, "flex"));
  };
  (r.urlInput.addEventListener("input", e),
    r.urlInput.addEventListener("paste", () => setTimeout(e, 0)),
    r.urlInput.addEventListener("keydown", (t) => {
      t.key === "Enter" && (t.preventDefault(), j(t));
    }),
    r.onlineBtn.addEventListener("click", j));
}
function Y(e) {
  const t = (e || "").trim();
  return t.length > 0 && (t.startsWith("http://") || t.startsWith("https://"));
}
function de(e) {
  return (e || "").trim().length > 0;
}
function Z(e) {
  return z(e).valid;
}
function j(e) {
  var o;
  if (
    ((o = e == null ? void 0 : e.preventDefault) == null || o.call(e),
    r.onlineBtn.classList.contains("loading") || p.isParsing)
  )
    return;
  const t = r.urlInput.value.trim();
  if (de(t)) {
    if ((Y(t) || t.startsWith("spotify:")) && !Z(t)) {
      P();
      const i = z(t);
      b(i.errorElement || r.errorNosupport, "flex");
      return;
    }
    pe(t);
  }
}
function fe(e) {
  var a, l, n, d;
  if (!e) return [];
  const t =
    (l = (a = e.data) == null ? void 0 : a.data) == null ? void 0 : l.list;
  if (Array.isArray(t)) return t;
  const o = (n = e.data) == null ? void 0 : n.list;
  if (Array.isArray(o)) return o;
  const i = (d = e.data) == null ? void 0 : d.data;
  return Array.isArray(i) ? i : [];
}
function ee(e) {
  (r.onlineBtn.classList.remove("loading"),
    y(r.onlineLoading),
    b(r.onlineInfo, "block"),
    P(),
    b(e, "flex"));
}
function pe(e) {
  return H(this, null, function* () {
    var o, i, a, l, n, d;
    if (p.isParsing) return;
    ((p.isParsing = !0),
      (p.currentUrl = e),
      W(),
      r.onlineBtn.classList.add("loading"),
      P(),
      y(r.infoDefault),
      b(r.onlineLoading, "flex"),
      oe());
    const t = setTimeout(() => {
      (_.cancelRequest && _.cancelRequest(), ee(r.errorTimeout));
    }, h.timeout);
    try {
      let c, m;
      if (Z(e)) {
        const f = yield _.analyseAudio(
          e,
          h.target_type,
          h.permission_tag,
          h.rule_tag,
        );
        ((c =
          ((o = f == null ? void 0 : f.data) == null ? void 0 : o.key) ||
          ((a = (i = f == null ? void 0 : f.data) == null ? void 0 : i.data) ==
          null
            ? void 0
            : a.key)),
          (m = "music_analyse"));
      } else {
        if (typeof _.musicSearch != "function")
          throw new Error("musicSearch is not available");
        const f = yield _.musicSearch(
          e,
          h.target_type,
          h.permission_tag,
          h.rule_tag,
        );
        ((c =
          ((l = f == null ? void 0 : f.data) == null ? void 0 : l.key) ||
          ((d = (n = f == null ? void 0 : f.data) == null ? void 0 : n.data) ==
          null
            ? void 0
            : d.key)),
          (m = "music_search"));
      }
      if (!c) throw new Error("Parse failed");
      const g = yield _.searchTask(c, m, h.permission_tag, h.rule_tag);
      clearTimeout(t);
      const w = fe(g);
      if (!w.length) throw new Error("No analysis result");
      ((p.analysisData = w),
        ge(w),
        y(r.onlineLoading),
        y(r.onlineInfo),
        r.onlineBtn.classList.remove("loading"),
        yield R(),
        N());
    } catch (c) {
      (clearTimeout(t), ee(r.errorFail));
    } finally {
      p.isParsing = !1;
    }
  });
}
function me(e) {
  if ((P(), !e)) return (b(r.infoDefault, "flex"), !1);
  const t = z(e);
  return t.valid
    ? (b(r.infoDefault, "flex"), !0)
    : (b(t.errorElement, "flex"), !1);
}
function z(e) {
  const t = (e || "").trim();
  return t.includes("spotify.com") ||
    t.includes("spotify.link") ||
    t.startsWith("spotify:")
    ? t.includes("/user/") || t.includes(":user:")
      ? { valid: !1, errorElement: r.errorUser }
      : t.includes("/show/") || t.includes(":show:")
        ? { valid: !1, errorElement: r.errorShow }
        : t.includes("/episode/") || t.includes(":episode:")
          ? { valid: !1, errorElement: r.errorEpisode }
          : [
                "/track/",
                "/album/",
                "/playlist/",
                ":track:",
                ":album:",
                ":playlist:",
              ].some((l) => t.includes(l))
            ? { valid: !0 }
            : { valid: !1, errorElement: r.errorNosupport }
    : { valid: !1, errorElement: r.errorNosupport };
}
function te(e) {
  const t =
    (e == null ? void 0 : e.id) ||
    (e == null ? void 0 : e.songId) ||
    (e == null ? void 0 : e.trackId);
  return t != null && t !== "" ? String(t) : "";
}
function Q() {
  const e = X() || {},
    t = Number.isFinite(e.incre_value_count) ? e.incre_value_count : null,
    o = Number.isFinite(e.incre_value_over) ? e.incre_value_over : null,
    i = Number.isFinite(e.incre_value)
      ? e.incre_value
      : t !== null && o !== null
        ? Math.max(0, t - o)
        : null;
  return i === null || o === null ? null : { total: t, used: i, left: o };
}
function ye(e) {
  return new Promise((t) => setTimeout(t, e));
}
function he(e, t, o = 6, i = 100) {
  return H(this, null, function* () {
    for (let a = 0; a < o; a++) {
      yield R();
      const l = Q();
      if (l && ((e != null && l.used > e) || (t != null && l.left < t)))
        return !0;
      yield ye(i);
    }
    return !1;
  });
}
function ne() {
  const e = p.currentUrl;
  return e
    ? `https://member.tunefab.com/login?url=${encodeURIComponent(e)}`
    : "https://member.tunefab.com/login";
}
function W() {
  r.loadMoreBtn && (r.loadMoreBtn.href = ne());
}
function oe() {
  if (!r.analysisResult) return;
  const e = r.analysisResult.querySelector(".analysis-table"),
    t = e ? e.querySelector("tbody") : null,
    o = r.analysisResult.querySelector(".analysis-list-mobile");
  (t && (t.innerHTML = ""),
    o && (o.innerHTML = ""),
    r.analysisResult.classList.remove("is-visible"),
    (r.analysisResult.style.visibility = "hidden"),
    (r.analysisResult.style.height = "0"));
}
function X() {
  var t, o, i, a, l, n;
  const e = `incre_value_${h.permission_tag}_music_download`;
  return (n =
    (l =
      (i = (t = p.vipInfo) == null ? void 0 : t[e]) != null
        ? i
        : (o = p.vipInfo) == null
          ? void 0
          : o.incre_value_smc_music_download) != null
      ? l
      : (a = p.vipInfo) == null
        ? void 0
        : a.incre_value_music_download) != null
    ? n
    : { incre_value_over: null, incre_value: null, incre_value_count: null };
}
function ve(e) {
  var n, d;
  const t = String(e || "");
  if (!t) return "unlock";
  const o = p.downloadedSongs.has(t);
  if (
    ((n = p.vipInfo) == null ? void 0 : n.is_vip) === !0 ||
    ((d = p.vipInfo) == null ? void 0 : d.is_vip) === 1
  )
    return o ? "downloaded" : "downloadable";
  if (o) return "downloaded";
  const a = X(),
    l = a == null ? void 0 : a.incre_value_over;
  return l == null ? "downloadable" : l <= 0 ? "unlock" : "downloadable";
}
function C(e, t, o) {
  const i = ve(t),
    a = String(t || "");
  (e.removeAttribute("disabled"),
    (e.style.cursor = ""),
    (e.style.pointerEvents = ""),
    e.setAttribute("data-song-id", a),
    e.setAttribute("data-item", JSON.stringify(o)),
    e.setAttribute("data-state", i),
    e.classList.remove(
      "btn-downloaded",
      "btn-unlock",
      "btn-download",
      "is-downloading",
    ),
    i === "downloaded"
      ? (e.classList.add("btn-downloaded"),
        (e.innerHTML = `<span>${O.downloaded}</span>`),
        (e.href = "#"),
        (e.onclick = (l) => (l.preventDefault(), !1)))
      : i === "unlock"
        ? (e.classList.add("btn-unlock"),
          (e.innerHTML = `<span class="unlock-text">${O.unlock}</span><span class="unlock-icon"><img src="${ce}" alt="desbloquear"></span>`),
          (e.href = "#"),
          (e.onclick = (l) => (l.preventDefault(), U(), !1)))
        : (e.classList.add("btn-download"),
          (e.innerHTML = `<span>${O.download}</span>`),
          (e.href = "#"),
          (e.onclick = (l) => (l.preventDefault(), Ee(o, e), !1))));
}
function N() {
  if (!r.analysisResult) return;
  const e = r.analysisResult.querySelector(".analysis-table"),
    t = e ? e.querySelector("tbody") : null;
  t &&
    t.querySelectorAll(".analysis-row").forEach((i) => {
      const a = i.querySelector(".download-btn");
      if (!a) return;
      const l = a.getAttribute("data-song-id"),
        n = a.getAttribute("data-item");
      if (!(!l || !n))
        try {
          C(a, l, JSON.parse(n));
        } catch (d) {}
    });
  const o = r.analysisResult.querySelector(".analysis-list-mobile");
  o &&
    o.querySelectorAll(".analysis-card-mobile").forEach((i) => {
      const a = i.querySelector(".download-btn-mobile");
      if (!a) return;
      const l = a.getAttribute("data-song-id"),
        n = a.getAttribute("data-item");
      if (!(!l || !n))
        try {
          C(a, l, JSON.parse(n));
        } catch (d) {}
    });
}
function ge(e) {
  if (!r.analysisResult) return;
  const t = r.analysisResult.querySelector(".analysis-table"),
    o = t ? t.querySelector("tbody") : null,
    i = r.analysisResult.querySelector(".analysis-list-mobile");
  if (!o || !i) return;
  const a = e.slice(0, 10),
    l =
      "https://img.tunefab.es/uploads/page/product/spotify-music-converter-online/default-cover.png";
  (a.forEach((n, d) => {
    const c = te(n) || `song_${d}_${Date.now()}`,
      m =
        n.artist ||
        n.author ||
        (Array.isArray(n.artists) ? n.artists.join(", ") : ""),
      g = document.createElement("tr");
    g.className = "analysis-row";
    const w = document.createElement("td");
    w.className = "analysis-title-cell";
    const f = document.createElement("div");
    f.className = "title-wrapper";
    const L = document.createElement("img");
    ((L.className = "analysis-img"),
      (L.src = n.image || n.cover || n.album_cover || l),
      (L.alt = n.name || n.title || "Cover"),
      f.appendChild(L));
    const T = document.createElement("span");
    ((T.className = "analysis-title"),
      (T.textContent = n.name || n.title || O.unknownTitle),
      f.appendChild(T),
      w.appendChild(f),
      g.appendChild(w));
    const A = document.createElement("td");
    ((A.className = "analysis-singer-cell"),
      (A.textContent = m || "-"),
      g.appendChild(A));
    const x = document.createElement("td");
    ((x.className = "analysis-album-cell"),
      (x.textContent = n.album || n.albumName || "-"),
      g.appendChild(x));
    const B = document.createElement("td");
    ((B.className = "analysis-duration-cell"),
      (B.textContent = Ie(n.duration)),
      g.appendChild(B));
    const S = document.createElement("td");
    S.className = "analysis-action-cell";
    const k = document.createElement("a");
    ((k.className = "download-btn"),
      (k.target = "_self"),
      (k.rel = "noopener"),
      C(k, c, n),
      S.appendChild(k),
      g.appendChild(S),
      o.appendChild(g));
    const I = document.createElement("div");
    I.className = "analysis-card-mobile";
    const v = document.createElement("img");
    ((v.className = "card-img-mobile"),
      (v.src = n.image || n.cover || n.album_cover || l),
      (v.alt = n.name || n.title || "Cover"));
    const q = document.createElement("div");
    q.className = "card-content-mobile";
    const s = document.createElement("div");
    ((s.className = "card-title-mobile"),
      (s.textContent = n.name || n.title || O.unknownTitle));
    const u = document.createElement("div");
    ((u.className = "card-singer-mobile"),
      (u.textContent = m || "-"),
      q.appendChild(s),
      q.appendChild(u));
    const E = document.createElement("a");
    ((E.className = "download-btn-mobile"),
      (E.target = "_self"),
      (E.rel = "noopener"),
      C(E, c, n),
      I.appendChild(v),
      I.appendChild(q),
      I.appendChild(E),
      i.appendChild(I));
  }),
    r.analysisResult.classList.add("is-visible"),
    (r.analysisResult.style.visibility = "visible"),
    (r.analysisResult.style.height = "auto"),
    W());
}
function re(e, t) {
  const o = e.querySelector("span");
  o && (o.textContent = `${Math.max(0, Math.min(100, Math.round(t)))}%`);
}
function we(e, t) {
  let o = 0;
  const i = setInterval(() => {
    ((o = Math.min(99, o + 1)), e(o), o >= 99 && clearInterval(i));
  }, 300);
  return {
    stop(a = 100) {
      (clearInterval(i), t(a));
    },
  };
}
function ae(e) {
  var t, o, i, a, l, n, d, c;
  try {
    const m =
        (l =
          (a =
            (o = e == null ? void 0 : e.status) != null
              ? o
              : (t = e == null ? void 0 : e.data) == null
                ? void 0
                : t.status) != null
            ? a
            : (i = e == null ? void 0 : e.response) == null
              ? void 0
              : i.status) != null
          ? l
          : e == null
            ? void 0
            : e.code,
      g =
        ((e == null ? void 0 : e.message) ||
          ((n = e == null ? void 0 : e.data) == null ? void 0 : n.message) ||
          ((c =
            (d = e == null ? void 0 : e.response) == null ? void 0 : d.data) ==
          null
            ? void 0
            : c.message) ||
          "") + "";
    return m === 462 || /Exceeded\s+usage\s+times/i.test(g);
  } catch (m) {
    return !1;
  }
}
function Se(e) {
  return H(this, null, function* () {
    var t;
    for (let o = 0; o < 90; o++) {
      const i = yield _.executeSearchTask(e);
      if ((t = i == null ? void 0 : i.data) != null && t.finish) return i;
      yield new Promise((a) => setTimeout(a, 1e3));
    }
    return null;
  });
}
function Ee(e, t) {
  return H(this, null, function* () {
    var f, L, T, A, x, B, S, k, I;
    if (
      t.getAttribute("data-state") === "downloaded" ||
      t.classList.contains("is-downloading")
    )
      return;
    yield R();
    const o = Q(),
      i = o ? o.used : null,
      a = o ? o.left : null,
      l = te(e);
    if (!l) return;
    const n =
        ((f = p.vipInfo) == null ? void 0 : f.is_vip) === !0 ||
        ((L = p.vipInfo) == null ? void 0 : L.is_vip) === 1,
      d = X(),
      c =
        (x =
          (A = (T = Q()) == null ? void 0 : T.left) != null
            ? A
            : d == null
              ? void 0
              : d.incre_value_over) != null
          ? x
          : null;
    if (!n && c !== null && c <= 0) {
      (N(), K());
      return;
    }
    (t.classList.add("is-downloading"),
      t.setAttribute("disabled", "true"),
      (t.style.cursor = "not-allowed"),
      (t.style.pointerEvents = "none"));
    let m = !1;
    const g = p.downloadedSongs.size,
      w = we(
        (v) => re(t, v),
        (v) => {
          (re(t, v),
            v === 100 && l && (p.downloadedSongs.add(l), C(t, l, e), (m = !0)));
        },
      );
    try {
      const v = yield _.downloadList(
        [l],
        h.permission_tag,
        "128",
        h.rule_tag,
        h.target_type,
      );
      if (ae(v)) {
        (w.stop(0),
          p.downloadedSongs.delete(l),
          yield R(),
          C(t, l, e),
          N(),
          K());
        return;
      }
      if (!((B = v == null ? void 0 : v.data) != null && B.key))
        throw new Error("no_key");
      const q = _.createSearchTask(
        v.data.key,
        "music_batch_download",
        h.permission_tag,
        h.rule_tag,
        h.target_type,
      );
      yield Se(q);
      const s = yield _.executeSearchTask(q);
      if (ae(s)) {
        (w.stop(0),
          p.downloadedSongs.delete(l),
          yield R(),
          C(t, l, e),
          N(),
          K());
        return;
      }
      if (
        ((S = s == null ? void 0 : s.data) == null ? void 0 : S.status) ===
          "200" &&
        (I = (k = s == null ? void 0 : s.data) == null ? void 0 : k.data) !=
          null &&
        I.download
      ) {
        w.stop(100);
        const u = document.createElement("a");
        ((u.href = s.data.data.download),
          (u.download =
            ((e == null ? void 0 : e.name) ||
              (e == null ? void 0 : e.title) ||
              "download") + ".mp3"),
          document.body.appendChild(u),
          u.click(),
          document.body.removeChild(u),
          p.downloadedSongs.has(l) || p.downloadedSongs.add(l),
          C(t, l, e),
          yield he(i, a),
          N(),
          g === 0 && setTimeout(() => U(), 1e3));
      } else throw new Error("no_download_link");
    } catch (v) {
      (w.stop(0), m || (p.downloadedSongs.delete(l), C(t, l, e)));
    } finally {
      (t.classList.remove("is-downloading"),
        setTimeout(() => {
          (t.removeAttribute("disabled"),
            (t.style.cursor = "pointer"),
            (t.style.pointerEvents = ""),
            t.getAttribute("data-state") !== "downloaded" && !m && C(t, l, e));
        }, 600));
    }
  });
}
function be() {
  r.popMore.querySelectorAll(".pop-close").forEach((o) => {
    o.addEventListener("click", () => y(r.popMore));
  });
  const t = r.popMore.querySelector(".pop-overlay");
  t && t.addEventListener("click", () => y(r.popMore));
}
function K() {
  (b(r.popMore, "flex"), W());
  const e = ne();
  r.popMore.querySelectorAll(".more-login").forEach((o) => {
    ((o.href = e), (o.target = "_blank"));
  });
}
function _e() {
  if (!r.popBuy) return;
  const e = r.popBuy.querySelectorAll(".buy-card-item"),
    t = r.popBuy.querySelectorAll(".buy-btn");
  (t.forEach((a) => {
    a.getAttribute("product") === "year"
      ? (a.style.display = "block")
      : (a.style.display = "none");
  }),
    e.forEach((a) => {
      a.addEventListener("click", function () {
        const l = this.getAttribute("data-plan");
        (e.forEach((n) => n.classList.remove("active")),
          r.popBuy
            .querySelectorAll(`.buy-card-item[data-plan="${l}"]`)
            .forEach((n) => {
              n.classList.add("active");
            }),
          t.forEach((n) => {
            n.getAttribute("product") === l
              ? (n.style.display = "block")
              : (n.style.display = "none");
          }));
      });
    }));
  const o = r.popBuy.querySelector(".buy-close");
  o &&
    o.addEventListener("click", function (a) {
      (a.preventDefault(), y(r.popBuy));
    });
  const i = r.popBuy.querySelector(".pop-overlay");
  i && i.addEventListener("click", () => y(r.popBuy));
}
function Le() {
  if (!r.popPrice) return;
  const e = r.popPrice.querySelectorAll(".buy-card-item");
  (e.forEach((o) => {
    o.addEventListener("click", function () {
      const i = this.getAttribute("data-plan");
      (e.forEach((a) => a.classList.remove("active")),
        r.popPrice
          .querySelectorAll(`.buy-card-item[data-plan="${i}"]`)
          .forEach((a) => {
            a.classList.add("active");
          }));
    });
  }),
    r.popPrice.querySelectorAll(".buy-close, .pop-close").forEach((o) => {
      o.addEventListener("click", function (i) {
        (i.preventDefault(), y(r.popPrice));
      });
    }));
  const t = r.popPrice.querySelector(".pop-overlay");
  t && t.addEventListener("click", () => y(r.popPrice));
}
function ke() {
  const e = document.querySelector(".header .to-buy");
  e &&
    e.addEventListener("click", function (t) {
      (t.preventDefault(), U());
    });
}
function U() {
  (r.popPrice.querySelectorAll(".buy-card-item").forEach((t) => {
    t.getAttribute("data-plan") === "year"
      ? t.classList.add("active")
      : t.classList.remove("active");
  }),
    b(r.popPrice, "flex"));
}
function Ae() {
  if (!r.popBuy) {
    U();
    return;
  }
  const e = r.popBuy.querySelectorAll(".buy-card-item"),
    t = r.popBuy.querySelectorAll(".buy-btn");
  (e.forEach((o) => {
    o.getAttribute("data-plan") === "year"
      ? o.classList.add("active")
      : o.classList.remove("active");
  }),
    t.forEach((o) => {
      o.getAttribute("product") === "year"
        ? (o.style.display = "block")
        : (o.style.display = "none");
    }),
    b(r.popBuy, "flex"));
}
function Ie(e) {
  if (!e) return "-";
  const t = typeof e == "number" ? e : parseInt(e, 10),
    o = t > 1e3 ? Math.floor(t / 1e3) : t,
    i = Math.floor(o / 60),
    a = o % 60;
  return `${i}:${a < 10 ? "0" + a : a}`;
}
function P() {
  (y(r.infoDefault),
    y(r.errorNosupport),
    y(r.errorFail),
    y(r.errorTimeout),
    y(r.errorEpisode),
    y(r.errorShow),
    y(r.errorUser),
    y(r.errorKeyboard));
}
function b(e, t = "flex") {
  e && (e.style.display = t);
}
function y(e) {
  e && (e.style.display = "none");
}
function R() {
  return _.vipInfo(h.permission_tag, h.rule_tag)
    .then((e) => {
      if (e.data) {
        p.vipInfo = e.data;
        const t = e.data.incre_value_smc_music_download;
        (t && (h.maxDownloads = t.incre_value_count || 2),
          e.data.is_vip && (h.maxDownloads = 999),
          N());
      }
    })
    .catch(() => {});
}
const le = () => {
  $(window).width() <= 768
    ? $("input.url").attr("placeholder", "Enlace de Spotify o b\xFAsqueda")
    : $("input.url").attr(
        "placeholder",
        "Pega el enlace de Spotify o busca una canci\xF3n/artista",
      );
};
(le(),
  $(window).resize(function () {
    le();
  }),
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", J)
    : J());
function qe() {
  const e = document.querySelector(".use-carousel");
  if (!e) return;
  const t = e.querySelector(".use-track"),
    o = e.querySelector(".use-pagination"),
    i = 769,
    a = 0.6,
    l = 3500,
    n = {
      mode: null,
      rafId: null,
      position: 0,
      paused: !1,
      mobileIndex: 0,
      mobileTimer: null,
      clonesAppended: !1,
      resizeTimer: null,
      touchHandlers: null,
      originalCount: t.querySelectorAll(".use-card").length,
    },
    d = 40;
  function c() {
    return window.innerWidth < i;
  }
  function m() {
    return [...t.querySelectorAll(".use-card")];
  }
  function g() {
    return c() ? 16 : 40;
  }
  function w() {
    const s = m();
    return s.length ? s[0].offsetWidth + g() : 0;
  }
  function f() {
    (n.rafId && cancelAnimationFrame(n.rafId),
      n.mobileTimer && clearInterval(n.mobileTimer),
      (n.rafId = null),
      (n.mobileTimer = null),
      (n.position = 0),
      (n.mobileIndex = 0),
      (n.paused = !1),
      (t.style.transition = ""),
      (t.style.transform = ""),
      n.clonesAppended &&
        (m()
          .slice(n.originalCount)
          .forEach((s) => s.remove()),
        (n.clonesAppended = !1)),
      (o.innerHTML = ""),
      (e.onmouseenter = null),
      (e.onmouseleave = null),
      n.touchHandlers &&
        (e.removeEventListener("touchstart", n.touchHandlers.onTouchStart),
        e.removeEventListener("touchmove", n.touchHandlers.onTouchMove),
        e.removeEventListener("touchend", n.touchHandlers.onTouchEnd),
        e.removeEventListener("touchcancel", n.touchHandlers.onTouchEnd),
        (n.touchHandlers = null)));
  }
  function L(s) {
    const u = m();
    if (!u.length) return 0;
    const E = u[0].offsetWidth,
      M = w();
    return (e.offsetWidth - E) / 2 - s * M;
  }
  function T() {
    n.mode === "mobile" &&
      (n.mobileTimer && clearInterval(n.mobileTimer),
      (n.mobileTimer = setInterval(() => {
        S(n.mobileIndex + 1);
      }, l)));
  }
  function A() {
    if (!n.paused) {
      n.position += a;
      const s = t.scrollWidth / 2;
      (s > 0 && n.position >= s && (n.position -= s),
        (t.style.transform = `translate3d(-${n.position}px, 0, 0)`));
    }
    n.rafId = requestAnimationFrame(A);
  }
  function x() {
    (m().forEach((s) => {
      t.appendChild(s.cloneNode(!0));
    }),
      (n.clonesAppended = !0),
      (n.rafId = requestAnimationFrame(A)),
      (e.onmouseenter = () => {
        n.paused = !0;
      }),
      (e.onmouseleave = () => {
        n.paused = !1;
      }));
  }
  function B() {
    o.querySelectorAll(".use-pagination-dot").forEach((s, u) => {
      s.classList.toggle("active", u === n.mobileIndex);
    });
  }
  function S(s, u = !0) {
    const E = n.originalCount;
    n.mobileIndex = ((s % E) + E) % E;
    const M = L(n.mobileIndex);
    ((t.style.transition =
      u && n.mode === "mobile" ? "transform 0.6s ease" : "none"),
      (t.style.transform = `translate3d(${M}px, 0, 0)`),
      B(),
      T());
  }
  function k() {
    o.innerHTML = "";
    for (let s = 0; s < n.originalCount; s += 1) {
      const u = document.createElement("button");
      ((u.type = "button"),
        (u.className = `use-pagination-dot${s === 0 ? " active" : ""}`),
        u.setAttribute("aria-label", `Slide ${s + 1}`),
        u.addEventListener("click", () => {
          S(s);
        }),
        o.appendChild(u));
    }
  }
  function I() {
    let s = 0,
      u = 0,
      E = 0,
      M = !1;
    const F = (D) => {
        c() &&
          ((M = !0),
          (s = D.touches[0].clientX),
          (u = s),
          (E = L(n.mobileIndex)),
          (t.style.transition = "none"),
          n.mobileTimer && clearInterval(n.mobileTimer));
      },
      G = (D) => {
        if (!M) return;
        u = D.touches[0].clientX;
        const ie = u - s;
        t.style.transform = `translate3d(${E + ie}px, 0, 0)`;
      },
      V = () => {
        if (!M) return;
        M = !1;
        const D = u - s;
        D < -d
          ? S(n.mobileIndex + 1)
          : D > d
            ? S(n.mobileIndex - 1)
            : S(n.mobileIndex);
      };
    (e.addEventListener("touchstart", F, { passive: !0 }),
      e.addEventListener("touchmove", G, { passive: !0 }),
      e.addEventListener("touchend", V),
      e.addEventListener("touchcancel", V),
      (n.touchHandlers = { onTouchStart: F, onTouchMove: G, onTouchEnd: V }));
  }
  function v() {
    (k(), S(0, !1), I(), T());
  }
  function q() {
    (f(),
      (n.mode = c() ? "mobile" : "marquee"),
      (t.style.transition =
        n.mode === "mobile" ? "transform 0.6s ease" : "none"),
      n.mode === "marquee" ? x() : v());
  }
  (q(),
    window.addEventListener("resize", () => {
      (clearTimeout(n.resizeTimer),
        (n.resizeTimer = setTimeout(() => {
          const s = c() ? "mobile" : "marquee";
          if (s !== n.mode) {
            q();
            return;
          }
          s === "mobile" && S(n.mobileIndex);
        }, 200)));
    }));
}
$(function () {
  var e = navigator.userAgent.toLowerCase(),
    t = e.includes("mac");
  (t
    ? ($(".btn-mac").show(), $(".btn-win").hide())
    : ($(".btn-win").show(), $(".btn-mac").hide()),
    $(".wrap3 .faq-text").on("click", function () {
      var a = $(this).closest(".faq_item");
      a.toggleClass("active");
    }));
  const o = $(".step-list .step-item"),
    i = new Swiper(".step-swiper", {
      spaceBetween: 50,
      pagination: { el: ".step-swiper-pagination", clickabSle: !0 },
      on: {
        slideChange: function (a) {
          o.removeClass("active").eq(a.activeIndex).addClass("active");
        },
      },
    });
  (o.each((a, l) => {
    $(l).on("click", () => {
      i.slideTo(a);
    });
  }),
    qe(),
    $(".header-arrow").on("click", function () {
      ($(this).toggleClass("active"), $(".header-menu").toggleClass("active"));
    }),
    $(".to-faq").on("click", function (a) {
      a.preventDefault();
      const l = $("#faq");
      $("html, body").animate({ scrollTop: l.offset().top - 80 }, 500);
    }),
    $(".to-try").on("click", function (a) {
      a.preventDefault();
      const l = $("#online-tool"),
        n = $(".online-tool .url");
      $("html, body").animate(
        { scrollTop: l.offset().top - 80 },
        500,
        function () {
          n.trigger("focus");
        },
      );
    }),
    AOS.init({
      disable: function () {
        return window.innerWidth < 768;
      },
    }));
});
