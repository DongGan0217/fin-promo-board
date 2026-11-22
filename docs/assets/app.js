/* fin-promo-board — 바닐라 JS. data.json(언론 보도 인사만)을 읽어 회사별·최신 발표·인물 검색을 그린다.
   라우트: #/ · #/company/<id>[?s=2026S] · #/latest · #/search[?q=…]  (카톡 링크로 회사 바로 열기) */
(function () {
  "use strict";
  var LEVELS = ["CEO", "임원", "본부장", "부서장", "지점장"];
  var GROUPS = [{ label: "CEO · 임원", lv: ["CEO", "임원"] }, { label: "본부장", lv: ["본부장"] }, { label: "부서장", lv: ["부서장"] }];
  var KINDS = ["승진", "신규선임", "전보"];
  var KCLS = { "승진": "p", "신규선임": "n", "전보": "t" };
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];
  var NOTE = "언론 보도 기반 자동 정리 · 생성형 AI 활용 · 정정 요청은 원문 기사 참고";
  var PAGE = 5, SEARCH_PAGE = 20;
  var D = null, CO = {}, app = document.getElementById("app");
  var S = { season: null, sector: "전체", q: "", field: "all", open: {}, more: {}, br: null, searchMore: 0 };
  var mq = window.matchMedia("(min-width:1024px)");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ms(name, fill) { return '<span class="ms' + (fill ? " f" : "") + '" aria-hidden="true">' + name + "</span>"; }
  function md(a) { return a ? (+a.slice(5, 7)) + "." + a.slice(8, 10) : ""; }
  function num(n) { return n.toLocaleString("ko-KR"); }
  function lvIdx(l) { var i = LEVELS.indexOf(l); return i < 0 ? 9 : i; }
  function seasonTitle(s) {
    if (!s) return "인사";
    var y = +s.slice(0, 4);
    return s.slice(4) === "S" ? y + "년 하반기 인사" : (y + 1) + "년 상반기 인사";
  }
  function seasonSub(s) { return s && s.slice(4) === "S" ? "3~10월 발표분" : "11~2월 발표분"; }
  function badge(k) { return '<span class="bd ' + (KCLS[k] || "t") + '">' + esc(k) + "</span>"; }
  function link(u, cls) {
    return u ? '<a class="lnk' + (cls ? " " + cls : "") + '" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">원문' + ms("north_east") + "</a>" : "";
  }
  function hl(text, q) {
    text = String(text || "");
    if (!q) return esc(text);
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<span class="hl">' + esc(text.slice(i, i + q.length)) + "</span>" + esc(text.slice(i + q.length));
  }
  function desk() { return mq.matches; }

  // ── 데이터 ────────────────────────────────────────────────────────
  function ev(season) { return D.events.filter(function (e) { return e.season === season; }); }
  function people(list) { var s = {}; list.forEach(function (e) { s[e.company + "|" + e.name] = 1; }); return Object.keys(s).length; }
  function byCompany(season) {
    var m = {};
    ev(season).forEach(function (e) { (m[e.company] = m[e.company] || []).push(e); });
    return m;
  }
  function stats(list) {
    var k = {}, urls = {}, last = "";
    list.forEach(function (e) {
      k[e.kind] = (k[e.kind] || 0) + 1;
      if (e.url) urls[e.url] = 1;
      if (e.announced && e.announced > last) last = e.announced;
    });
    return { n: list.length, kinds: k, urls: Object.keys(urls).length, last: last };
  }
  function sortEv(a, b) {
    return lvIdx(a.level) - lvIdx(b.level) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }
  function kindSum(k) {
    return KINDS.filter(function (x) { return k[x]; }).map(function (x) { return badge(x) + '<span class="g">' + k[x] + "</span>"; }).join("");
  }

  // ── 공통 조각 ────────────────────────────────────────────────────
  function themeBtn(extra) {
    var dark = isDark();
    return '<button class="thm tap' + (extra || "") + '" type="button" data-act="theme" aria-label="화면 테마 바꾸기">' + ms(dark ? "light_mode" : "dark_mode") + "</button>";
  }
  function seasonBtn() {
    return '<button class="a-l1 tap" type="button" data-act="season">' + esc(seasonTitle(S.season)) + ms("expand_more") + "</button>";
  }
  function header(withSummary, brand) {
    var h = '<div class="a-hd">' + (brand !== false ? '<div class="a-br m-only">금융권 인사 보드</div>' : "") + themeBtn(" m-only") + seasonBtn();
    if (withSummary) {
      var bc = byCompany(S.season), n = Object.keys(bc).length;
      h += '<div class="a-l1c"><span>' + esc(S.season) + "</span><span>" + D.companies.length + "개사 중 " + n + "개사 발표</span><span>" +
        num(people(ev(S.season))) + "명</span></div>";
    }
    return h + "</div>";
  }
  function footer() {
    var ts = D.generated_at ? D.generated_at.slice(0, 16).replace("T", " ").replace(/-/g, ".") : "";
    return '<div class="fn">' + NOTE + (ts ? "<br>데이터 기준 " + esc(ts) : "") + "</div>";
  }
  function row(e, opt) {
    opt = opt || {};
    var q = opt.q || "";
    var l2 = "";
    if (opt.company) l2 += '<div class="l2">' + hl(CO[e.company] ? CO[e.company].name : e.company, opt.f === "co" || opt.f === "all" ? q : "") +
      " · " + esc(e.level) + (opt.season ? " · " + esc(e.season) : "") + "</div>";
    if (e.prev_title) l2 += '<div class="l2">← ' + hl(e.prev_title, opt.f === "ti" || opt.f === "all" ? q : "") + "</div>";
    if (e.concurrent) l2 += '<div><span class="dual">지주·은행 겸직</span></div>';
    var nq = opt.f === "nm" || opt.f === "all" ? q : "", tq = opt.f === "ti" || opt.f === "all" ? q : "";
    return '<div class="a-pr"><div class="tx"><div class="l1"><b>' + hl(e.name, nq) + "</b>" + hl(e.title, tq) + "</div>" + l2 +
      '</div><div class="rt">' + badge(e.kind) + '<span class="m"><span>' + md(e.announced) + "</span>" + link(e.url) + "</span></div></div>";
  }

  // ── 회사별 ───────────────────────────────────────────────────────
  function sectorCompanies(sector) { return D.companies.filter(function (c) { return c.sector === sector; }); }
  function companyItem(c, list, sel) {
    if (!list) {
      return '<div class="a-co off"><span class="a-av">' + esc(c.name.charAt(0)) + '</span><div class="tx"><b>' + esc(c.name) +
        "</b><span>아직 발표 전</span></div></div>";
    }
    var st = stats(list);
    return '<a class="a-co tap' + (sel ? " sel" : "") + '" href="#/company/' + encodeURIComponent(c.id) + '"><span class="a-av">' + esc(c.name.charAt(0)) +
      '</span><div class="tx"><b>' + esc(c.name) + "</b><span>" + (st.last ? md(st.last) + " 발표" : "발표") + '</span></div><span class="ct">' +
      people(list) + "<small>명</small></span>" + (desk() ? "" : ms("chevron_right")) + "</a>";
  }
  function sectorCard(sector, bc, selId, all) {
    var cos = sectorCompanies(sector), on = cos.filter(function (c) { return bc[c.id]; });
    if (all && !on.length) return "";
    var h = '<div class="a-card"><div class="a-st"><b>' + esc(sector) + "</b><small>" + cos.length + "개사 중 " + on.length + "개사 발표</small></div>";
    cos.forEach(function (c) { if (bc[c.id]) h += companyItem(c, bc[c.id], c.id === selId); });
    if (all) {
      if (cos.length > on.length) h += '<div class="a-offs">발표 전 ' + (cos.length - on.length) + "개사</div>";
    } else cos.forEach(function (c) { if (!bc[c.id]) h += companyItem(c, null); });
    return h + "</div>";
  }
  function chips(bc) {
    var h = '<div class="a-chips" role="tablist"><button type="button" class="tap' + (S.sector === "전체" ? " on" : "") + '" data-sector="전체">전체</button>';
    D.sectors.forEach(function (s) {
      var n = sectorCompanies(s).filter(function (c) { return bc[c.id]; }).length;
      h += '<button type="button" class="tap' + (S.sector === s ? " on" : "") + '" data-sector="' + esc(s) + '">' + esc(s) + " <i>" + n + "</i></button>";
    });
    return h + "</div>";
  }
  function listHtml(bc, selId) {
    var secs = S.sector === "전체" ? D.sectors : [S.sector];
    var h = secs.map(function (s) { return sectorCard(s, bc, selId, S.sector === "전체"); }).join("");
    return h || '<div class="a-card"><div class="a-empty"><b>발표 없음</b><span>이 시즌에 발표된 인사가 없어요</span></div></div>';
  }
  function viewCompanies() {
    var bc = byCompany(S.season);
    var h = header(true) + chips(bc);
    if (!desk()) return h + listHtml(bc) + footer();
    var secs = S.sector === "전체" ? D.sectors : [S.sector], first = null;
    secs.some(function (s) { return sectorCompanies(s).some(function (c) { if (bc[c.id]) { first = c.id; return true; } }); });
    return h + '<div class="dk-grid"><div>' + listHtml(bc, first) + '</div><div class="dk-detail">' +
      (first ? detailBody(first, bc[first]) : "") + "</div></div>" + footer();
  }

  // ── 회사 상세 ────────────────────────────────────────────────────
  function groupCard(g, list, cid) {
    var key = cid + "|" + g.label, open = S.open[key] !== false, more = S.more[key];
    var h = '<div class="a-card"><button type="button" class="a-st" data-open="' + esc(key) + '" aria-expanded="' + open + '"><b>' + esc(g.label) +
      "</b><em>" + list.length + '</em><span class="sp"></span>' + ms(open ? "expand_less" : "expand_more") + "</button>";
    if (open) {
      var show = more ? list : list.slice(0, PAGE);
      h += show.map(function (e) { return row(e); }).join("");
      if (list.length > show.length) h += '<button type="button" class="a-more tap" data-more="' + esc(key) + '">' + (list.length - show.length) + "명 더 보기" + ms("expand_more") + "</button>";
    }
    return h + "</div>";
  }
  function branchCard(list, cid) {
    var key = cid + "|지점장", def = desk(), open = S.open[key] === undefined ? def : S.open[key];
    var h = '<div class="a-card"><button type="button" class="a-st" data-open="' + esc(key) + '" aria-expanded="' + open + '"><b>지점장</b><em>' + list.length +
      '</em><span class="sp"></span>' + ms(open ? "expand_less" : "expand_more") + "</button>";
    if (!open) return h + "</div>";
    var kinds = KINDS.filter(function (k) { return k !== "신규선임" || list.some(function (e) { return e.kind === k; }); });
    var regs = (D.regions || []).filter(function (r) { return list.some(function (e) { return e.region === r; }); });
    var br = S.br && S.br.cid === cid ? S.br : null;
    function cnt(r, k) { return list.filter(function (e) { return (r === "*" || e.region === r) && (k === "*" || e.kind === k); }).length; }
    h += '<div class="b-hint"><span>칸을 누르면 명단</span><span>지역은 지점명 기준 추정</span></div><table class="b-mx"><thead><tr><th>지역</th>' +
      kinds.map(function (k) { return "<th>" + esc(k) + "</th>"; }).join("") + "<th>계</th></tr></thead><tbody>";
    regs.forEach(function (r) {
      var rowOn = br && br.r === r && br.k === "*";
      h += '<tr class="' + (rowOn ? "rg-on" : "") + '"><td><button type="button" data-br="' + esc(r) + '|*">' + esc(r) + "</button></td>";
      kinds.forEach(function (k) {
        var n = cnt(r, k), on = br && br.r === r && br.k === k;
        h += '<td class="c' + (n ? "" : " z") + (on ? " on" : "") + '"><button type="button"' + (n ? ' data-br="' + esc(r) + "|" + esc(k) + '"' : " disabled") + ">" + n + "</button></td>";
      });
      h += '<td class="tt">' + cnt(r, "*") + "</td></tr>";
    });
    h += '<tr class="ft"><td>합계</td>' + kinds.map(function (k) { return "<td>" + cnt("*", k) + "</td>"; }).join("") + "<td>" + list.length + "</td></tr></tbody></table>";
    if (br) {
      var pick = list.filter(function (e) { return (br.r === "*" || e.region === br.r) && (br.k === "*" || e.kind === br.k); })
        .sort(function (a, b) { return a.title < b.title ? -1 : a.title > b.title ? 1 : 0; });
      var label = (br.r === "*" ? "전체 지역" : br.r) + (br.k === "*" ? "" : " · " + br.k);
      h += '<div class="b-flt"><button type="button" class="tap" data-br="">' + esc(label) + " " + pick.length + ms("close") + "</button></div>";
      h += '<div class="b-gl">' + esc(label) + " <em>" + pick.length + "</em></div>" + pick.map(brRow).join("");
      if (br.r !== "*" && br.k !== "*") {
        var rest = list.filter(function (e) { return e.region === br.r && e.kind !== br.k; });
        if (rest.length) h += '<div class="b-gl">같은 지역 다른 구분 <em>' + rest.length + "</em></div>" + rest.map(brRow).join("");
      }
    }
    return h + '<div style="height:8px"></div></div>';
  }
  function brRow(e) {
    var m = (e.prev_title ? "← " + e.prev_title + " · " : "") + md(e.announced);
    return '<div class="b-r1">' + badge(e.kind) + '<div class="tx"><b>' + esc(e.name) + "</b>" + esc(e.title) + '<span class="m">' + esc(m) + "</span></div>" + link(e.url, "lk") + "</div>";
  }
  function detailBody(cid, list) {
    var c = CO[cid], st = stats(list || []);
    list = (list || []).slice().sort(sortEv);
    var h = '<div class="a-l2">' + esc(c.name) + '</div><div class="a-l2s"><span>' + esc(c.sector) + "</span>" +
      (st.last ? "<span>" + md(st.last) + " 발표</span>" : "") + (st.urls ? "<span>원문 기사 " + st.urls + "건</span>" : "") + "</div>";
    if (!list.length) return h + '<div class="a-card"><div class="a-empty"><b>' + esc(seasonTitle(S.season)) + "</b><span>아직 발표 전</span></div></div>";
    h += '<div class="a-sum"><span class="n">' + people(list) + "명</span>" + kindSum(st.kinds) + "</div>";
    var left = "", empties = [];
    function flush() { if (empties.length) { left += '<div class="a-card"><div class="a-empty"><b>' + esc(empties.join(" · ")) + "</b><span>이번 시즌 발표 없음</span></div></div>"; empties = []; } }
    GROUPS.forEach(function (g) {
      var gl = list.filter(function (e) { return g.lv.indexOf(e.level) >= 0; });
      if (!gl.length) { empties.push(g.label); return; }
      flush();
      left += groupCard(g, gl, cid);
    });
    var bl = list.filter(function (e) { return e.level === "지점장"; });
    var right = bl.length ? branchCard(bl, cid) : "";
    if (!bl.length) empties.push("지점장");
    flush();
    return h + (desk() ? '<div class="dk-cols"><div>' + left + "</div><div>" + right + "</div></div>" : left + right);
  }
  function viewCompany(cid) {
    var bc = byCompany(S.season);
    if (desk()) {
      var sec = CO[cid].sector;
      if (S.sector !== "전체" && S.sector !== sec) S.sector = sec;
      return header(true) + chips(bc) + '<div class="dk-grid"><div>' + listHtml(bc, cid) + '</div><div class="dk-detail">' + detailBody(cid, bc[cid]) + "</div></div>" + footer();
    }
    return '<div class="a-top"><a class="bk tap" href="#/" aria-label="뒤로">' + ms("arrow_back") + '</a><span class="sp"></span>' + themeBtn() +
      '</div><div class="a-hd" style="padding-top:0">' + seasonBtn() + "</div>" + detailBody(cid, bc[cid]) + footer();
  }

  // ── 최신 발표 ────────────────────────────────────────────────────
  function dateLabel(a) {
    if (!a) return "발표일 미상";
    var d = new Date(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
    return (+a.slice(5, 7)) + "월 " + (+a.slice(8, 10)) + "일 (" + DOW[d.getDay()] + ")";
  }
  function viewLatest() {
    var groups = {};
    ev(S.season).forEach(function (e) {
      var k = (e.announced || "") + "|" + e.company;
      (groups[k] = groups[k] || []).push(e);
    });
    var keys = Object.keys(groups).sort(function (a, b) {
      var da = a.split("|")[0], db = b.split("|")[0];
      if (da !== db) return !da ? 1 : !db ? -1 : da < db ? 1 : -1;
      return people(groups[b]) - people(groups[a]);
    });
    var h = header(false) + '<div class="a-l2" style="padding-top:0;font-size:18px;font-weight:600">최신 발표</div><div class="a-l2s"><span>발표일 최신순</span></div>';
    var cur = null;
    if (!keys.length) h += '<p class="a-hint">이 시즌에 발표된 인사가 없어요</p>';
    keys.forEach(function (k) {
      var d = k.split("|")[0], cid = k.split("|")[1], list = groups[k].slice().sort(sortEv), st = stats(list), c = CO[cid] || { name: cid, sector: "" };
      if (d !== cur) { cur = d; h += '<div class="a-dt">' + esc(dateLabel(d)) + "</div>"; }
      h += '<a class="a-card a-fc tap" href="#/company/' + encodeURIComponent(cid) + '"><div class="a-fh"><span class="a-av">' + esc(c.name.charAt(0)) + '</span><div class="tx"><b>' +
        esc(c.name) + "</b><span>" + esc(c.sector) + '</span></div><span class="ct">' + people(list) + "<small>명</small></span></div>" +
        '<div class="a-fb">' + KINDS.filter(function (x) { return st.kinds[x]; }).map(function (x) { return "<span>" + badge(x) + st.kinds[x] + "</span>"; }).join("") + "</div>" +
        list.slice(0, 2).map(function (e) {
          return '<div class="a-fp"><b>' + esc(e.name) + "</b><span>" + esc(e.title) + '</span><span class="o">' + (e.prev_title ? "← " + esc(e.prev_title) : "") + "</span>" + badge(e.kind) + "</div>";
        }).join("") + "</a>";
    });
    return h + footer();
  }

  // ── 인물 검색 ────────────────────────────────────────────────────
  function matches(q) {
    var ql = q.toLowerCase(), r = { nm: [], co: [], ti: [] };
    D.events.forEach(function (e) {
      if (e.name.toLowerCase().indexOf(ql) >= 0) r.nm.push(e);
      if ((CO[e.company] ? CO[e.company].name : "").toLowerCase().indexOf(ql) >= 0) r.co.push(e);
      if ((e.title + " " + (e.prev_title || "")).toLowerCase().indexOf(ql) >= 0) r.ti.push(e);
    });
    var seen = {}, all = [];
    r.nm.concat(r.co, r.ti).forEach(function (e) { var k = D.events.indexOf(e); if (!seen[k]) { seen[k] = 1; all.push(e); } });
    r.all = all;
    var srt = function (a, b) { return a.season < b.season ? 1 : a.season > b.season ? -1 : sortEv(a, b); };
    ["nm", "co", "ti", "all"].forEach(function (k) { r[k].sort(srt); });
    return r;
  }
  function searchResults() {
    var q = S.q.trim();
    if (!q) return '<p class="a-hint">이름 · 회사 · 직위로 찾아보세요</p>';
    var r = matches(q), list = r[S.field], show = list.slice(0, SEARCH_PAGE * (1 + S.searchMore));
    var f = [["all", "전체"], ["nm", "이름"], ["co", "회사"], ["ti", "직위"]];
    var h = '<div class="a-chips">' + f.map(function (x) {
      return '<button type="button" class="tap' + (S.field === x[0] ? " on" : "") + '" data-field="' + x[0] + '">' + x[1] + " <i>" + r[x[0]].length + "</i></button>";
    }).join("") + "</div>";
    if (!list.length) return h + '<p class="a-hint">찾는 인물이 없어요</p>';
    h += '<div class="a-card"><div class="a-st"><b>' + list.length + "건</b><small>" + esc(D.seasons.join(" · ")) + " 전체 시즌</small></div>" +
      show.map(function (e) { return row(e, { company: true, season: true, q: q, f: S.field }); }).join("");
    if (list.length > show.length) h += '<button type="button" class="a-more tap" data-act="smore">' + (list.length - show.length) + "건 더 보기" + ms("expand_more") + "</button>";
    return h + "</div>";
  }
  function viewSearch() {
    return '<div class="a-hd"><div class="a-br m-only">금융권 인사 보드</div>' + themeBtn(" m-only") + '<div class="a-l1">인물 검색</div></div>' +
      '<label class="a-srch">' + ms("search") + '<input id="q" type="search" placeholder="이름 · 회사 · 직위" autocomplete="off" value="' + esc(S.q) + '">' +
      (S.q ? '<button type="button" class="clr" data-act="clear" aria-label="지우기">' + ms("cancel", true) + "</button>" : "") +
      '</label><div id="results">' + searchResults() + "</div>" + footer();
  }

  // ── 시즌 시트 ────────────────────────────────────────────────────
  function openSheet() {
    var h = '<div class="a-scrim" data-act="close"></div><div class="a-sheet" role="dialog" aria-label="시즌 선택"><div class="hd"></div><h4>시즌 선택</h4><p>정기 인사는 1월(W)·7월(S)에 몰려요</p>';
    D.seasons.forEach(function (s) {
      var on = s === S.season;
      h += '<button type="button" class="a-opt tap' + (on ? " on" : "") + '" data-season="' + esc(s) + '"><div class="tx"><b>' + esc(seasonTitle(s)) + "</b><span>" +
        esc(s) + " · " + seasonSub(s) + " · " + num(people(ev(s))) + "명</span></div>" + (on ? ms("check_circle", true) : "") + "</button>";
    });
    document.getElementById("sheet").innerHTML = h + "</div>";
  }
  function closeSheet() { document.getElementById("sheet").innerHTML = ""; }

  // ── 테마 ─────────────────────────────────────────────────────────
  function isDark() {
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function toggleTheme() {
    var t = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("fpb-theme", t); } catch (e) { /* 저장 불가 무시 */ }
    render();
  }

  // ── 라우터 ───────────────────────────────────────────────────────
  function route() {
    var h = location.hash.replace(/^#\/?/, ""), qs = "", i = h.indexOf("?");
    if (i >= 0) { qs = h.slice(i + 1); h = h.slice(0, i); }
    var p = {};
    qs.split("&").forEach(function (kv) { if (kv) { var a = kv.split("="); p[decodeURIComponent(a[0])] = decodeURIComponent(a[1] || ""); } });
    var parts = h.split("/").filter(Boolean).map(decodeURIComponent);
    return { name: parts[0] || "", id: parts[1], p: p };
  }
  function render() {
    if (!D) return;
    var r = route(), tab = "co", html;
    if (r.p.s && D.seasons.indexOf(r.p.s) >= 0) S.season = r.p.s;
    if (r.name === "company" && CO[r.id]) {
      if (!r.p.s && !D.events.some(function (e) { return e.company === r.id && e.season === S.season; })) {
        var hit = D.seasons.filter(function (s) { return D.events.some(function (e) { return e.company === r.id && e.season === s; }); })[0];
        if (hit) S.season = hit;
      }
      html = viewCompany(r.id);
      document.title = CO[r.id].name + " · 금융권 인사 보드";
    } else if (r.name === "latest") { tab = "latest"; html = viewLatest(); document.title = "최신 발표 · 금융권 인사 보드"; }
    else if (r.name === "search") {
      tab = "search";
      if (r.p.q !== undefined && r.p.q !== S.q) S.q = r.p.q;
      html = viewSearch(); document.title = "인물 검색 · 금융권 인사 보드";
    } else { html = viewCompanies(); document.title = "금융권 인사 보드"; }
    app.className = tab === "co" ? "" : "narrow";
    app.innerHTML = html;
    [].forEach.call(document.querySelectorAll("[data-tab]"), function (a) {
      var on = a.getAttribute("data-tab") === tab;
      a.classList.toggle("on", on);
      var icon = a.querySelector(".ms");
      if (icon) icon.classList.toggle("f", on);
    });
    var tb = document.querySelector(".gnb .thm .ms");
    if (tb) tb.textContent = isDark() ? "light_mode" : "dark_mode";
    var g = document.getElementById("gnb-q");
    if (g && document.activeElement !== g) g.value = tab === "search" ? S.q : "";
  }
  function rerenderKeepScroll() { var y = window.scrollY; render(); window.scrollTo(0, y); }

  document.addEventListener("click", function (ev0) {
    var t = ev0.target.closest("[data-act],[data-sector],[data-open],[data-more],[data-br],[data-season],[data-field]");
    if (!t) return;
    var a = t.getAttribute("data-act");
    if (a === "theme") return toggleTheme();
    if (a === "season") return openSheet();
    if (a === "close") return closeSheet();
    if (a === "clear") { S.q = ""; render(); var q = document.getElementById("q"); if (q) q.focus(); return; }
    if (a === "smore") { S.searchMore++; document.getElementById("results").innerHTML = searchResults(); return; }
    if (t.hasAttribute("data-season")) {
      S.season = t.getAttribute("data-season"); S.br = null; closeSheet();
      var r = route();
      if (r.p.s) location.hash = "#/" + (r.name ? r.name + (r.id ? "/" + encodeURIComponent(r.id) : "") : ""); else render();
      return;
    }
    if (t.hasAttribute("data-sector")) {
      S.sector = t.getAttribute("data-sector");
      if (route().name === "company") location.hash = "#/"; else rerenderKeepScroll();
      return;
    }
    if (t.hasAttribute("data-open")) {
      var k = t.getAttribute("data-open"), def = /\|지점장$/.test(k) ? desk() : true;
      S.open[k] = !(S.open[k] === undefined ? def : S.open[k]);
      return rerenderKeepScroll();
    }
    if (t.hasAttribute("data-more")) { S.more[t.getAttribute("data-more")] = 1; return rerenderKeepScroll(); }
    if (t.hasAttribute("data-br")) {
      var v = t.getAttribute("data-br"), cid = route().id;
      if (!v) S.br = null;
      else {
        var rk = v.split("|");
        S.br = S.br && S.br.cid === cid && S.br.r === rk[0] && S.br.k === rk[1] ? null : { cid: cid, r: rk[0], k: rk[1] };
      }
      return rerenderKeepScroll();
    }
    if (t.hasAttribute("data-field")) { S.field = t.getAttribute("data-field"); S.searchMore = 0; document.getElementById("results").innerHTML = searchResults(); }
  });
  document.addEventListener("input", function (e0) {
    if (e0.target.id === "q") {
      S.q = e0.target.value; S.searchMore = 0;
      document.getElementById("results").innerHTML = searchResults();
      var g = document.getElementById("gnb-q"); if (g) g.value = S.q;
    } else if (e0.target.id === "gnb-q") {
      S.q = e0.target.value; S.searchMore = 0;
      if (route().name !== "search") location.hash = "#/search";
      else { var r0 = document.getElementById("results"), q0 = document.getElementById("q"); if (r0) r0.innerHTML = searchResults(); if (q0) q0.value = S.q; }
    }
  });
  document.addEventListener("keydown", function (e0) { if (e0.key === "Escape") closeSheet(); });
  window.addEventListener("hashchange", function () { closeSheet(); render(); window.scrollTo(0, 0); });
  mq.addEventListener ? mq.addEventListener("change", render) : mq.addListener(render);
  var sysDark = window.matchMedia("(prefers-color-scheme: dark)");
  sysDark.addEventListener ? sysDark.addEventListener("change", render) : sysDark.addListener(render);

  fetch("data.json", { cache: "no-cache" }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (d) {
    D = d;
    d.companies.forEach(function (c) { CO[c.id] = c; });
    S.season = d.default_season || d.seasons[0] || null;
    render();
  }).catch(function (e) {
    app.innerHTML = '<p class="a-hint">데이터를 불러오지 못했어요 (' + esc(e.message) + ")</p>";
  });
})();
