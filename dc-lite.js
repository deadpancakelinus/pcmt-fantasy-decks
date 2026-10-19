/* dc-lite: a small runtime for PCMT Fantasy Decks pages.
 * Each page ships its template as JSON (#dc-tree), its logic class as text (#dc-logic) and its props (#dc-props).
 * Template rules: {{ path }} holes, <sc-if value>, <sc-for list as>, on* event attributes, class -> className.
 */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var BOOL_PROPS = { disabled: 1, checked: 1, hidden: 1, readonly: 1, selected: 1, multiple: 1, autofocus: 1, required: 1 };
  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.'), v;
    for (var i = scope.length - 1; i >= 0; i--) {
      if (scope[i] && Object.prototype.hasOwnProperty.call(scope[i], parts[0])) { v = scope[i][parts[0]]; break; }
    }
    for (var j = 1; j < parts.length && v != null; j++) v = v[parts[j]];
    return v;
  }
  // Whole-value hole -> raw value; mixed -> string.
  function evalAttr(str, scope) {
    var m = /^\{\{\s*([^}]*?)\s*\}\}$/.exec(str);
    if (m) return lookup(m[1], scope);
    if (str.indexOf('{{') < 0) return str;
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null || v === false || v === true ? (v === true ? 'true' : '') : String(v); });
  }
  function textOf(v) { return v == null || v === false || v === true ? '' : String(v); }

  // ---- build a fresh virtual list from the template ----
  function build(nodes, scope, out) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (typeof n === 'string') {
        if (n.indexOf('{{') < 0) { out.push({ t: n }); continue; }
        var re = /\{\{\s*([^}]*?)\s*\}\}/g, last = 0, m, s = '';
        while ((m = re.exec(n))) { s += n.slice(last, m.index) + textOf(lookup(m[1], scope)); last = re.lastIndex; }
        out.push({ t: s + n.slice(last) });
        continue;
      }
      var tag = n[0], attrs = n[1], kids = n[2];
      if (tag === 'sc-if') {
        if (evalAttr(attrs.value || '', scope)) build(kids, scope, out);
        continue;
      }
      if (tag === 'sc-for') {
        var list = evalAttr(attrs.list || '', scope), as = attrs.as || 'item';
        if (list && list.length) for (var k = 0; k < list.length; k++) {
          var fr = { $index: k }; fr[as] = list[k];
          build(kids, scope.concat([fr]), out);
        }
        continue;
      }
      var a = {}, on = {};
      for (var key in attrs) {
        if (key.indexOf('hint-') === 0) continue;
        var val = evalAttr(attrs[key], scope);
        if (/^on[A-Z]/.test(key)) { if (typeof val === 'function') on[key.slice(2).toLowerCase()] = val; continue; }
        if (typeof val === 'function') continue;
        a[key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key] = val;
      }
      var ch = [];
      build(kids, scope, ch);
      out.push({ tag: tag, a: a, on: on, c: ch });
    }
    return out;
  }

  // ---- patch the real DOM to match the virtual list ----
  function dispatch(e) { var h = this.__on && this.__on[e.type]; if (h) h(e); }
  function setAttr(el, k, v) {
    var prev = el.__a ? el.__a[k] : undefined;
    if (prev === v && el.__a && (k in el.__a)) return;
    (el.__a || (el.__a = {}))[k] = v;
    if (k === 'value' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
      var s = v == null ? '' : String(v); if (el.value !== s) el.value = s; return;
    }
    var lk = k.toLowerCase();
    if (BOOL_PROPS[lk] && !el.namespaceURI.match(/svg/)) {
      if (lk === 'readonly') el.readOnly = !!v; else el[lk] = !!v;
      if (v && v !== 'false') el.setAttribute(k, ''); else el.removeAttribute(k);
      return;
    }
    if (v == null || v === false && k.indexOf('aria-') !== 0) { el.removeAttribute(k); return; }
    el.setAttribute(k, v === true && k.indexOf('aria-') !== 0 ? '' : String(v));
  }
  function create(v, ns) {
    if (v.t !== undefined) { var tn = document.createTextNode(v.t); tn.__t = v.t; return tn; }
    var isSvg = ns || v.tag === 'svg';
    var el = isSvg ? document.createElementNS(SVG_NS, v.tag) : document.createElement(v.tag);
    patchEl(el, v, isSvg && v.tag !== 'foreignObject');
    return el;
  }
  function patchEl(el, v, svg) {
    var k;
    for (k in v.a) setAttr(el, k, v.a[k]);
    if (el.__a) for (k in el.__a) if (!(k in v.a)) { el.removeAttribute(k); delete el.__a[k]; }
    var ev = el.__on || (el.__on = {});
    for (k in v.on) { if (!ev[k]) el.addEventListener(k === 'change' && /^(INPUT|TEXTAREA)$/.test(el.tagName) ? 'input' : k, dispatch); ev[k] = v.on[k]; }
    if (ev.change && /^(INPUT|TEXTAREA)$/.test(el.tagName)) ev.input = ev.change;
    for (k in ev) if (!(k in v.on) && !(k === 'input' && v.on.change)) ev[k] = null;
    patchKids(el, v.c, svg);
  }
  function patchKids(parent, vs, svg) {
    var nodes = parent.__kids || (parent.__kids = []);
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i], cur = nodes[i];
      if (cur && cur.parentNode !== parent) cur = null;
      if (cur && v.t !== undefined && cur.nodeType === 3) {
        if (cur.__t !== v.t) { cur.nodeValue = v.t; cur.__t = v.t; }
        continue;
      }
      if (cur && v.tag && cur.nodeType === 1 && cur.__tag === v.tag) { patchEl(cur, v, svg || v.tag === 'svg'); continue; }
      var fresh = create(v, svg);
      if (v.tag) fresh.__tag = v.tag;
      if (cur) parent.replaceChild(fresh, cur); else parent.appendChild(fresh);
      nodes[i] = fresh;
    }
    for (var j = vs.length; j < nodes.length; j++) if (nodes[j] && nodes[j].parentNode === parent) parent.removeChild(nodes[j]);
    nodes.length = vs.length;
  }

  // ---- component base ----
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (part, cb) {
    (this.__q || (this.__q = [])).push(part);
    if (cb) (this.__cbs || (this.__cbs = [])).push(cb);
    var self = this;
    if (!this.__pending) { this.__pending = true; Promise.resolve().then(function () { self.__flush(); }); }
  };
  DCLogic.prototype.forceUpdate = function (cb) { if (cb) (this.__cbs || (this.__cbs = [])).push(cb); this.__pending = true; var s = this; Promise.resolve().then(function () { s.__flush(); }); };
  DCLogic.prototype.__flush = function () {
    this.__pending = false;
    var q = this.__q || [], next = Object.assign({}, this.state);
    this.__q = [];
    for (var i = 0; i < q.length; i++) Object.assign(next, typeof q[i] === 'function' ? q[i](next, this.props) : q[i]);
    this.state = next;
    this.__render();
    var cbs = this.__cbs || []; this.__cbs = [];
    cbs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  };
  window.DCLogic = DCLogic;

  function boot() {
    var tree = JSON.parse(document.getElementById('dc-tree').textContent);
    var props = JSON.parse(document.getElementById('dc-props').textContent);
    var src = document.getElementById('dc-logic').textContent;
    var Component = new Function('DCLogic', src + '\n;return Component;')(DCLogic);
    var root = document.getElementById('dc-root');
    var inst = new Component(props);
    inst.props = props;
    if (!inst.state) inst.state = {};
    inst.__render = function () {
      var vals;
      try { vals = inst.renderVals(); } catch (e) { console.error(e); return; }
      patchKids(root, build(tree, [vals], []), false);
    };
    inst.__render();
    if (inst.componentDidMount) inst.componentDidMount();
    window.addEventListener('pagehide', function () { if (inst.componentWillUnmount) inst.componentWillUnmount(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
