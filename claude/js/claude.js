(() => {
  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  // localStorage that never throws (private mode, blocked storage)
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* nothing to do */ }
    }
  };

  /* light and dark */
  const toggleTheme = () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { /* private mode */ }
  };
  $$('[data-theme-toggle]').forEach(button => button.addEventListener('click', toggleTheme));

  /* 404: show the path that was asked for */
  $$('[data-path]').forEach(el => { el.textContent = decodeURIComponent(location.pathname); });

  const copyText = text => navigator.clipboard.writeText(text);
  const commandOf = line => {
    const copy = line.cloneNode(true);
    $$('.prompt', copy).forEach(prompt => prompt.remove());
    return copy.textContent;
  };

  /* copy buttons on code blocks */
  $$('.prose figure.highlight, .prose > pre').forEach(block => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy';
    button.textContent = 'copy';
    button.addEventListener('click', async () => {
      // in a terminal block, copy the commands and leave prompts and output behind
      const commands = $$('.line.cmd', block).map(commandOf);
      const code = $('.code pre', block) || $('code', block) || block;
      const text = commands.length ? commands.join('\n') : code.innerText.replace(/\n$/, '');
      try {
        await copyText(text);
        button.textContent = 'copied';
        button.classList.add('done');
      } catch (e) {
        button.textContent = 'failed';
      }
      setTimeout(() => {
        button.textContent = 'copy';
        button.classList.remove('done');
      }, 1400);
    });
    if (block.tagName === 'PRE') {
      // a scrolling <pre> would carry the button away with it
      const holder = document.createElement('div');
      holder.style.position = 'relative';
      block.before(holder);
      holder.append(block, button);
    } else {
      block.append(button);
    }
  });

  /* a post's sections: each heading and what follows it */
  const prose = $('.prose');
  const sections = [];
  if (prose) {
    [...prose.children].forEach(el => {
      if (/^H[1-6]$/.test(el.tagName)) sections.push({ level: +el.tagName[1], heading: el, body: [] });
      else if (sections.length) sections[sections.length - 1].body.push(el);
    });
  }

  /* contents as todos: tick off what has been read, mark where the reader is */
  const todos = $('.todos details');
  if (todos) {
    const wide = matchMedia('(min-width: 80rem)');
    const sync = () => { todos.open = wide.matches; };
    sync();
    wide.addEventListener('change', sync);

    const entries = []; // [heading, link] in page order
    let current;
    let clicked = false; // a clicked entry stays marked until its scroll has settled
    let settle;
    const mark = link => {
      if (link === current) return;
      current = link;
      let passed = Boolean(link);
      entries.forEach(([, a]) => {
        if (a === link) {
          passed = false;
          a.setAttribute('aria-current', 'true');
          a.classList.remove('done');
        } else {
          a.removeAttribute('aria-current');
          a.classList.toggle('done', passed);
        }
      });
      // in a long list, keep the marked entry in view
      if (link && wide.matches) {
        const box = todos.getBoundingClientRect();
        const at = link.getBoundingClientRect();
        if (at.top < box.top) todos.scrollTop -= box.top - at.top + 8;
        else if (at.bottom > box.bottom) todos.scrollTop += at.bottom - box.bottom + 8;
      }
    };
    // the current section is the last heading that has reached the top of the window
    const follow = () => {
      let link = null;
      for (const [heading, a] of entries) {
        if (heading.hidden) continue;
        if (heading.getBoundingClientRect().top > 48) break;
        link = a;
      }
      mark(link);
    };
    const release = () => {
      clearTimeout(settle);
      settle = setTimeout(() => { clicked = false; }, 150);
    };
    $$('a', todos).forEach(a => {
      const id = decodeURIComponent(a.hash.slice(1));
      const heading = id && document.getElementById(id);
      if (heading) entries.push([heading, a]);
      a.addEventListener('click', () => {
        if (!wide.matches) todos.open = false;
        if (!heading) return;
        clicked = true;
        mark(a);
        release();
      });
    });
    if (entries.length) {
      let queued = false;
      addEventListener('scroll', () => {
        if (clicked) return release();
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          if (!clicked) follow();
        });
      }, { passive: true });
      follow();
    }
  }

  /* home: filter the list by type */
  const types = $('.types');
  if (types) {
    const buttons = $$('button', types);
    const show = type => {
      if (!buttons.some(button => button.dataset.type === type)) type = '';
      buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.type === type)));
      $$('.year-group').forEach(group => {
        let any = false;
        $$('li', group).forEach(li => {
          li.hidden = Boolean(type) && !li.dataset.types.split('|').includes(type);
          any = any || !li.hidden;
        });
        group.hidden = !any;
      });
    };
    types.hidden = false;
    buttons.forEach(button => button.addEventListener('click', () => {
      const type = button.dataset.type;
      history.replaceState(null, '', type ? '#' + encodeURIComponent(type) : location.pathname + location.search);
      show(type);
    }));
    show(decodeURIComponent(location.hash.slice(1)));
  }

  /* long posts: filter sections by what you type */
  const filter = $('.section-filter');
  if (filter && sections.length) {
    const input = $('input', filter);
    const note = $('em', filter);
    sections.forEach(section => {
      section.text = [section.heading, ...section.body].map(el => el.textContent).join(' ').toLowerCase();
    });
    filter.hidden = false;
    input.addEventListener('input', () => {
      const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      const hit = sections.map(section => terms.every(term => section.text.includes(term)));
      // keep the headings above a match so it stays in context
      const keep = hit.slice();
      hit.forEach((matched, i) => {
        if (!matched) return;
        let level = sections[i].level;
        for (let j = i - 1; j >= 0 && level > 1; j--) {
          if (sections[j].level < level) { keep[j] = true; level = sections[j].level; }
        }
      });
      sections.forEach((section, i) => {
        section.heading.hidden = !keep[i];
        section.body.forEach(el => { el.hidden = !hit[i]; });
      });
      const count = hit.filter(Boolean).length;
      note.textContent = !terms.length ? '' : count ? count + ' of ' + sections.length : 'no matches';
    });
  }

  /* click an image to see it properly */
  const zoomable = $$('.prose img').filter(img => !img.closest('a'));
  if (zoomable.length && window.HTMLDialogElement) {
    const zoom = document.createElement('dialog');
    zoom.className = 'zoom';
    const big = document.createElement('img');
    zoom.append(big);
    zoom.addEventListener('click', () => zoom.close());
    document.body.append(zoom);
    zoomable.forEach(img => img.addEventListener('click', () => {
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      zoom.showModal();
    }));
  }

  /* ---------- the prompt ---------- */

  const bar = $('.bar');
  if (!bar) return;

  const input = $('input', bar);
  const panel = $('.panel', bar);
  const head = $('.panel-head', bar);
  const list = $('.panel-list', bar);
  const note = $('.panel-note', bar);
  const commands = JSON.parse($('.commands', bar).textContent);
  const session = JSON.parse($('.session', bar).textContent);
  const indexUrl = bar.dataset.index;
  let index;       // promise of [{ title, url, text }]
  let items = [];  // rows the panel is showing
  let selected = 0;
  let modal = null; // a question that must be answered: { cancel }

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* panel */

  const marked = (text, terms) => {
    const frag = document.createDocumentFragment();
    if (!terms || !terms.length) { frag.append(text); return frag; }
    const pattern = new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    text.split(pattern).forEach((part, i) => {
      if (i % 2) frag.append(el('mark', '', part));
      else if (part) frag.append(part);
    });
    return frag;
  };

  const select = at => {
    selected = Math.max(0, Math.min(items.length - 1, at));
    $$('li', list).forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === selected));
      if (i === selected) li.scrollIntoView({ block: 'nearest' });
    });
  };

  // rows: [{ name, hint, url?, run?, pick?, terms?, color? }]
  // opts: { message, head (node), start (selected row) }
  const show = (rows, opts = {}) => {
    list.textContent = '';
    head.textContent = '';
    if (opts.head) head.append(opts.head);
    items = rows;
    // commands and settings line up in two columns; search results do not
    list.classList.toggle('short', rows.some(row => !row.terms));
    rows.forEach((row, i) => {
      const li = el('li');
      li.setAttribute('role', 'option');
      const a = el('a');
      a.href = row.url || '#';
      const name = el('b');
      if (row.color) {
        const dot = el('span', 'dot', '●');
        dot.style.color = row.color;
        name.append(dot);
      }
      name.append(marked(row.name, row.terms));
      a.append(name);
      if (row.hint) {
        const hint = el('small');
        hint.append(marked(row.hint, row.terms));
        a.append(hint);
      }
      a.addEventListener('click', event => {
        if (row.url && !row.pick) return;
        event.preventDefault();
        run(row);
      });
      a.addEventListener('mousemove', () => { if (selected !== i) select(i); });
      li.append(a);
      list.append(li);
    });
    note.className = 'panel-note';
    note.textContent = opts.message || '';
    panel.hidden = !rows.length && !opts.message && !opts.head;
    select(opts.start || 0);
  };

  const close = () => {
    if (modal) { const { cancel } = modal; modal = null; cancel(); }
    panel.hidden = true;
    items = [];
  };

  const say = message => show([], { message });

  /* model */

  const models = session.models;
  const model = () => {
    const saved = store.get('cc-model', '');
    return models.find(m => m.name === saved) || models[0];
  };
  const paintModel = () => $$('[data-model]').forEach(node => { node.textContent = model().name; });
  paintModel();

  /* effort */

  const EFFORTS = [
    { id: 'low', about: 'quick answers' },
    { id: 'medium', about: 'balanced' },
    { id: 'high', about: 'thinks things through' },
    { id: 'xhigh', about: 'for hard problems' },
    { id: 'max', about: 'no limit on thinking' }
  ];
  const effort = () => EFFORTS.find(e => e.id === store.get('cc-effort', 'high')) || EFFORTS[2];
  const paintEffort = () => $$('[data-effort]').forEach(node => { node.textContent = effort().id; });
  paintEffort();

  /* modes, in the order shift+tab walks them */

  const MODES = [
    { id: 'default', label: '? for shortcuts', about: 'asks before opening links to other sites' },
    { id: 'edits', label: '⏵⏵ accept edits on', about: 'click a command to copy it' },
    { id: 'plan', label: '⏸ plan mode on', about: 'posts show their outline; click a heading to open it' },
    { id: 'auto', label: '⏵⏵ auto mode on', about: 'https links open without asking, anything else still asks' },
    { id: 'bypass', label: '⏵⏵ bypass permissions on', about: 'links open without asking' }
  ];
  const modeLabel = $('[data-mode-label]', bar);
  let mode = MODES.find(m => m.id === store.get('cc-mode', 'default')) || MODES[0];

  const planOutline = on => {
    sections.forEach(section => {
      section.heading.classList.toggle('plan-head', on);
      section.heading.classList.remove('open');
      section.body.forEach(node => node.classList.toggle('plan-hide', on));
    });
  };
  sections.forEach(section => section.heading.addEventListener('click', event => {
    if (mode.id !== 'plan' || event.target.closest('a')) return;
    const open = section.heading.classList.toggle('open');
    section.body.forEach(node => node.classList.toggle('plan-hide', !open));
  }));

  const setMode = next => {
    mode = next;
    store.set('cc-mode', mode.id);
    if (mode.id === 'default') delete root.dataset.mode;
    else root.dataset.mode = mode.id;
    modeLabel.textContent = '';
    modeLabel.append(mode.label);
    if (mode.id !== 'default') modeLabel.append(el('span', 'mode-hint', ' (shift+tab to cycle)'));
    planOutline(mode.id === 'plan');
  };
  const cycleMode = () => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  setMode(mode);
  $('[data-mode-cycle]', bar).addEventListener('click', cycleMode);

  /* accept edits: a click on a command copies it */
  document.addEventListener('click', event => {
    if (mode.id !== 'edits') return;
    const line = event.target.closest && event.target.closest('.terminal .line.cmd');
    if (!line || String(getSelection())) return;
    copyText(commandOf(line)).then(() => {
      line.classList.add('took');
      setTimeout(() => line.classList.remove('took'), 500);
    }, () => {});
  });

  /* /compact */

  const setCompact = on => {
    if (on) root.dataset.compact = '';
    else delete root.dataset.compact;
    store.set('cc-compact', on);
  };
  setCompact(store.get('cc-compact', false));

  /* context: how far down the page, and what the page weighs */

  const ctx = $('.ctx', bar);
  const ctxFill = $('.meter i', bar);
  const ctxText = $('[data-ctx]', bar);
  const progress = () => {
    const room = root.scrollHeight - innerHeight;
    return room > 0 ? Math.min(1, Math.max(0, scrollY / room)) : 1;
  };
  const paintContext = () => {
    const used = Math.round(progress() * 100);
    ctxFill.style.width = used + '%';
    ctxText.textContent = used + '%';
    ctx.classList.toggle('full', used >= 90);
  };
  let painting = false;
  addEventListener('scroll', () => {
    if (painting) return;
    painting = true;
    requestAnimationFrame(() => { painting = false; paintContext(); });
  }, { passive: true });
  addEventListener('resize', paintContext);
  paintContext();

  const short = n => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
  const weigh = () => {
    const main = $('main');
    const tokens = text => Math.round(text.length / 4);
    const code = $$('figure.highlight .code, .prose > pre, .prose > div > pre', main).map(node => node.textContent).join('');
    const all = main.textContent;
    const images = $$('img', main).length;
    return [
      { name: 'Prose', tokens: Math.max(0, tokens(all) - tokens(code)), color: 'var(--accent)' },
      { name: 'Code blocks', tokens: tokens(code), color: 'var(--blue)' },
      { name: 'Images', tokens: images * 1500, color: 'var(--green)', count: images }
    ];
  };

  /* reading history, for /resume */

  const post = $('[data-post]');
  const here = location.pathname;
  const remember = () => {
    if (!post) return;
    const history = store.get('cc-history', []).filter(entry => entry.url !== here);
    history.unshift({ url: here, title: post.dataset.post, read: Math.round(progress() * 100), at: Date.now() });
    store.set('cc-history', history.slice(0, 8));
  };
  if (post) {
    remember();
    addEventListener('pagehide', remember);
  }
  const ago = at => {
    const minutes = Math.round((Date.now() - at) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + 'm ago';
    if (minutes < 1440) return Math.round(minutes / 60) + 'h ago';
    return Math.round(minutes / 1440) + 'd ago';
  };

  /* permissions: ask before a link leaves the site */

  const allowed = () => store.get('cc-allowed', []);
  const go = (url, link) => {
    if (link && link.target === '_blank') window.open(url, '_blank', 'noopener');
    else location.href = url;
  };
  const ask = (url, link) => {
    const host = new URL(url).host;
    const box = el('div', 'permit');
    const title = el('p');
    title.append(el('b', '', 'Fetch'));
    box.append(title, el('p', 'url', url), el('p', 'dim', 'Do you want to open this link?'));
    const done = () => { modal = null; input.value = ''; close(); };
    show([
      { name: '1. Yes', pick: () => { done(); go(url, link); } },
      { name: '2. Yes, and don\'t ask again for ' + host, pick: () => { store.set('cc-allowed', [...allowed(), host]); done(); go(url, link); } },
      { name: '3. No', hint: 'esc', pick: done }
    ], { head: box });
    list.classList.remove('short');
    modal = { cancel: () => {} };
    input.focus();
  };
  if (session.permissions) {
    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest && event.target.closest('a[href]');
      if (!link || bar.contains(link)) return;
      let url;
      try { url = new URL(link.href); } catch (e) { return; }
      if (!/^https?:$/.test(url.protocol) || url.host === location.host) return;
      if (mode.id === 'bypass' || (mode.id === 'auto' && url.protocol === 'https:')) return;
      if (allowed().includes(url.host)) return;
      event.preventDefault();
      ask(url.href, link);
    });
  }

  /* search */

  const load = () => {
    if (index) return index;
    if (!indexUrl) return (index = Promise.resolve([]));
    index = fetch(indexUrl)
      .then(res => {
        if (!res.ok) throw new Error(res.status);
        return res.text();
      })
      .then(body => {
        const strip = html => new DOMParser().parseFromString((html || '').replace(/</g, ' <'), 'text/html').body.textContent.replace(/\s+/g, ' ');
        if (/\.json$/.test(indexUrl)) {
          const data = JSON.parse(body);
          return (Array.isArray(data) ? data : data.posts || []).map(item => ({
            title: item.title || 'untitled',
            url: item.url || item.path,
            text: strip(item.content || item.text)
          }));
        }
        const xml = new DOMParser().parseFromString(body, 'text/xml');
        return $$('entry', xml).map(entry => ({
          title: ($('title', entry) || {}).textContent || 'untitled',
          url: ($('url', entry) || {}).textContent,
          text: strip(($('content', entry) || {}).textContent)
        }));
      })
      .catch(() => {
        index = null;
        return null;
      });
    return index;
  };

  const VERBS = ['Searching', 'Pondering', 'Brewing', 'Noodling', 'Percolating', 'Spelunking', 'Rummaging'];
  const search = async value => {
    const terms = value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!index) {
      show([], { message: VERBS[Math.floor(Math.random() * VERBS.length)] + '…' });
      note.classList.add('thinking');
    }
    const entries = await load();
    if (input.value.trim() !== value) return; // the reader kept typing
    if (!entries) return say('No search index found. Install hexo-generator-search and regenerate.');
    const hits = [];
    entries.forEach(entry => {
      const title = entry.title.toLowerCase();
      const text = entry.text.toLowerCase();
      let score = 0;
      for (const term of terms) {
        const inTitle = title.includes(term);
        if (!inTitle && !text.includes(term)) return;
        score += inTitle ? 10 : 1;
      }
      const at = text.indexOf(terms[0]);
      const start = Math.max(0, at - 30);
      hits.push({
        score,
        name: entry.title,
        hint: at > -1 ? (start ? '…' : '') + entry.text.slice(start, start + 120).trim() : '',
        url: entry.url,
        terms
      });
    });
    hits.sort((a, b) => b.score - a.score);
    show(hits.slice(0, 8), { message: hits.length ? '' : 'No posts match "' + value + '".' });
  };

  /* commands */

  const shortcuts = [
    { name: '/', hint: 'focus the prompt and list commands' },
    { name: 'ctrl+k', hint: 'focus the prompt' },
    { name: 'shift+tab', hint: 'cycle modes: default, accept edits, plan, auto, bypass permissions' },
    { name: '↑ ↓', hint: 'move through results' },
    { name: 'enter', hint: 'open the selected result' },
    { name: 'tab', hint: 'complete a command' },
    { name: 'esc', hint: 'clear the prompt' }
  ];

  const actions = {
    theme: () => { toggleTheme(); input.value = ''; close(); },
    top: () => { scrollTo({ top: 0, behavior: 'smooth' }); input.value = ''; close(); input.blur(); },
    help: () => { input.value = '/'; update(); },
    export: () => { input.value = ''; close(); input.blur(); print(); },
    random: async () => {
      const entries = await load();
      if (entries && entries.length) location.href = entries[Math.floor(Math.random() * entries.length)].url;
      else say('No search index found, so there is nothing to pick from.');
    },
    compact: () => {
      const on = !('compact' in root.dataset);
      setCompact(on);
      const blocks = $$('figure.terminal').length;
      say(on
        ? 'Compacted. Command output is hidden' + (blocks ? ' in ' + blocks + ' code blocks on this page' : '') + '. Run /compact again to bring it back.'
        : 'Command output is back.');
    },
    clear: () => {
      setMode(MODES[0]);
      setCompact(false);
      const sectionInput = $('.section-filter input');
      if (sectionInput && sectionInput.value) { sectionInput.value = ''; sectionInput.dispatchEvent(new Event('input')); }
      input.value = '';
      say('Cleared. Mode, compaction and filters are back to their defaults.');
    },
    model: () => {
      const current = model().name;
      show(models.map(m => ({
        name: (m.name === current ? '✔ ' : '  ') + m.name,
        hint: [m.hint, m.id].filter(Boolean).join(' · '),
        pick: () => { store.set('cc-model', m.name); paintModel(); say('Set model to ' + m.name + '. It only changes the name in the status line; a person wrote the posts.'); }
      })), { head: el('p', 'dim', 'Select model'), start: Math.max(0, models.findIndex(m => m.name === current)) });
    },
    effort: () => {
      const current = effort().id;
      show(EFFORTS.map(e => ({
        name: (e.id === current ? '✔ ' : '  ') + e.id,
        hint: e.about,
        pick: () => { store.set('cc-effort', e.id); paintEffort(); say('Set effort to ' + e.id + '. The posts stay the same length.'); }
      })), { head: el('p', 'dim', 'Select effort'), start: EFFORTS.findIndex(e => e.id === current) });
    },
    status: () => {
      const appearance = root.dataset.theme || 'system (' + (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') + ')';
      show([
        { name: 'Model', hint: [model().name, model().id].filter(Boolean).join(' · ') },
        { name: 'Effort', hint: effort().id + ': ' + effort().about },
        { name: 'Mode', hint: (mode.id === 'default' ? 'default' : mode.label.replace(/^\S+\s/, '').replace(/ on$/, '')) + ': ' + mode.about },
        { name: 'Appearance', hint: appearance },
        { name: 'Compact', hint: 'compact' in root.dataset ? 'on, command output hidden' : 'off' },
        { name: 'Posts', hint: String(session.posts) },
        { name: 'Allowed sites', hint: String(allowed().length) }
      ], { head: el('p', 'dim', 'Status') });
    },
    context: () => {
      const parts = weigh();
      const used = parts.reduce((sum, part) => sum + part.tokens, 0);
      const box = el('div');
      box.append(el('p', '', model().name + ' · ' + short(used) + ' / ' + short(session.window) + ' tokens (' + (used / session.window * 100).toFixed(1) + '%)'));
      const usage = el('div', 'usage');
      parts.forEach(part => {
        if (!part.tokens) return;
        const cell = el('i');
        cell.style.background = part.color;
        cell.style.width = (part.tokens / session.window * 100) + '%';
        usage.append(cell);
      });
      box.append(usage, el('p', 'dim', 'Estimated from this page, at about 4 characters per token. You have read ' + Math.round(progress() * 100) + '% of it.'));
      show(parts.map(part => ({
        name: part.name,
        hint: short(part.tokens) + ' tokens' + (part.count !== undefined ? ' (' + part.count + ' × ~1.5k)' : '') + ' · ' + (part.tokens / session.window * 100).toFixed(1) + '%',
        color: part.color
      })).concat({
        name: 'Free space',
        hint: short(Math.max(0, session.window - used)) + ' tokens · ' + Math.max(0, 100 - used / session.window * 100).toFixed(1) + '%',
        color: 'var(--faint)'
      }), { head: box });
    },
    resume: () => {
      const history = store.get('cc-history', []).filter(entry => entry.url !== here);
      if (!history.length) return say('Nothing to resume yet. Posts you open are remembered in this browser.');
      show(history.map(entry => ({
        name: entry.title,
        hint: entry.read + '% read · ' + ago(entry.at),
        url: entry.url
      })), { head: el('p', 'dim', 'Resume a post') });
      list.classList.remove('short');
    },
    permissions: () => {
      if (!session.permissions) return say('This blog does not ask before opening links.');
      const hosts = allowed();
      if (!hosts.length) return say('No sites allowed yet. When a link asks to open, pick "don\'t ask again" to add its site here.');
      show(hosts.map(host => ({
        name: host,
        hint: 'enter to remove',
        pick: () => { store.set('cc-allowed', allowed().filter(h => h !== host)); actions.permissions(); }
      })), { head: el('p', 'dim', 'Sites that open without asking') });
      list.classList.remove('short');
    }
  };

  const run = row => {
    if (!row) return;
    if (row.pick) row.pick();
    else if (row.url) location.href = row.url;
    else if (actions[row.run]) actions[row.run]();
  };

  const update = () => {
    if (modal) return;
    const value = input.value.trim();
    if (!value) return close();
    if (value === '?') return show(shortcuts);
    if (value.startsWith('/')) {
      const rows = commands.filter(command => command.name.startsWith(value.toLowerCase()));
      return show(rows, { message: rows.length ? '' : 'No command matches ' + value + '. Try /help.' });
    }
    search(value);
  };

  $$('[data-run]', bar).forEach(button => button.addEventListener('click', () => {
    input.value = '';
    input.focus();
    actions[button.dataset.run]();
  }));

  input.addEventListener('input', () => {
    // a pending question is answered with 1, 2 or 3
    if (modal) {
      const pick = items[Number(input.value.trim()) - 1];
      input.value = '';
      if (pick) run(pick);
      return;
    }
    update();
  });
  input.addEventListener('focus', () => { load(); if (panel.hidden) update(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      cycleMode();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!items.length) return;
      event.preventDefault();
      select(selected + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(items[selected]);
    } else if (event.key === 'Tab' && !modal && input.value.startsWith('/') && items[selected]) {
      event.preventDefault();
      input.value = items[selected].name;
      update();
    } else if (event.key === 'Escape') {
      input.value = '';
      close();
      input.blur();
    }
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || bar.contains(event.target)) return;
    close();
  });
  document.addEventListener('keydown', event => {
    const target = event.target;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
    const palette = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
    if (event.key === 'Tab' && event.shiftKey && target === document.body) {
      // only when nothing is focused, so shift+tab still walks back through links
      event.preventDefault();
      cycleMode();
    } else if (palette || (!typing && (event.key === '/' || event.key === '?'))) {
      event.preventDefault();
      input.focus();
      if (!palette && !modal) { input.value = event.key; update(); }
    }
  });
})();
