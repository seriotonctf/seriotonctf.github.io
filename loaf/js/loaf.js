(() => {
  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  /* light switch */
  const toggle = $('[data-theme-toggle]');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const dark = root.dataset.theme
        ? root.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { /* private mode */ }
    });
  }

  /* copy buttons on code blocks */
  $$('.prose figure.highlight, .prose > pre').forEach(block => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy';
    button.textContent = 'copy';
    button.addEventListener('click', async () => {
      // in a terminal block, copy the commands and leave prompts and output behind
      const commands = $$('.line.cmd', block).map(line => {
        const copy = line.cloneNode(true);
        $$('.prompt', copy).forEach(prompt => prompt.remove());
        return copy.textContent;
      });
      const code = $('.code pre', block) || $('code', block) || block;
      const text = commands.length ? commands.join('\n') : code.innerText.replace(/\n$/, '');
      try {
        await navigator.clipboard.writeText(text);
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

  /* table of contents: open in the margin on wide screens, follow the reader */
  const contents = $('.contents details');
  if (contents) {
    const wide = matchMedia('(min-width: 80rem)');
    const sync = () => { contents.open = wide.matches; };
    sync();
    wide.addEventListener('change', sync);

    const links = new Map();
    let current;
    let clicked = false; // a clicked entry stays marked until its scroll has settled
    let settle;
    const mark = link => {
      if (link === current) return;
      if (current) current.removeAttribute('aria-current');
      if (link) link.setAttribute('aria-current', 'true');
      current = link;
      // in a long list, keep the marked entry in view
      if (link && wide.matches) {
        const box = contents.getBoundingClientRect();
        const at = link.getBoundingClientRect();
        if (at.top < box.top) contents.scrollTop -= box.top - at.top + 8;
        else if (at.bottom > box.bottom) contents.scrollTop += at.bottom - box.bottom + 8;
      }
    };
    // the current section is the last heading that has reached the top of the window
    const follow = () => {
      let link = null;
      for (const [heading, a] of links) {
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
    $$('a', contents).forEach(a => {
      const id = decodeURIComponent(a.hash.slice(1));
      const heading = id && document.getElementById(id);
      if (heading) links.set(heading, a);
      a.addEventListener('click', () => {
        if (!wide.matches) contents.open = false;
        if (!heading) return;
        clicked = true;
        mark(a);
        release();
      });
    });
    if (links.size) {
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
  const prose = $('.prose');
  if (filter && prose) {
    const input = $('input', filter);
    const note = $('span', filter);
    const sections = [];
    [...prose.children].forEach(el => {
      if (/^H[1-6]$/.test(el.tagName)) sections.push({ level: +el.tagName[1], heading: el, body: [] });
      else if (sections.length) sections[sections.length - 1].body.push(el);
    });
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
      note.textContent = !terms.length ? '' : count ? count + ' of ' + sections.length : 'no section matches';
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

  /* search */
  const search = $('dialog.search');
  if (search && search.showModal) {
    const input = $('input', search);
    const list = $('.search-results', search);
    const note = $('.search-note', search);
    const hint = note.textContent;
    let index;

    const load = () => {
      if (index) return index;
      const url = search.dataset.index;
      index = fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(res.status);
          return res.text();
        })
        .then(body => {
          const strip = html => new DOMParser().parseFromString((html || '').replace(/</g, ' <'), 'text/html').body.textContent.replace(/\s+/g, ' ');
          if (/\.json$/.test(url)) {
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
          note.textContent = 'no search index found. install hexo-generator-searchdb and regenerate.';
          return [];
        });
      return index;
    };

    const marked = (text, terms) => {
      const frag = document.createDocumentFragment();
      const pattern = new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
      text.split(pattern).forEach((part, i) => {
        if (i % 2) {
          const mark = document.createElement('mark');
          mark.textContent = part;
          frag.append(mark);
        } else if (part) {
          frag.append(part);
        }
      });
      return frag;
    };

    const run = async () => {
      const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      const entries = await load();
      if (terms.join(' ') !== input.value.toLowerCase().split(/\s+/).filter(Boolean).join(' ')) return;
      list.textContent = '';
      if (!terms.length) {
        if (index) note.textContent = hint;
        note.hidden = false;
        return;
      }
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
        hits.push({ entry, score, at: text.indexOf(terms[0]) });
      });
      hits.sort((a, b) => b.score - a.score);
      hits.slice(0, 12).forEach(({ entry, at }) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = entry.url;
        a.append(marked(entry.title, terms));
        if (at > -1) {
          const start = Math.max(0, at - 40);
          const small = document.createElement('small');
          small.append(marked((start ? '…' : '') + entry.text.slice(start, start + 140).trim() + '…', terms));
          a.append(small);
        }
        li.append(a);
        list.append(li);
      });
      if (index) {
        note.hidden = hits.length > 0;
        note.textContent = 'nothing. the cat looked everywhere.';
      }
    };

    const open = () => {
      if (search.open) return;
      search.showModal();
      input.select();
      load();
    };

    $$('[data-search]').forEach(button => button.addEventListener('click', open));
    input.addEventListener('input', run);
    search.addEventListener('click', event => { if (event.target === search) search.close(); });
    search.addEventListener('keydown', event => {
      const links = $$('a', list);
      if (event.key === 'Enter' && event.target === input && links[0]) {
        links[0].click();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const at = links.indexOf(document.activeElement);
        const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
        (links[next] || (next < 0 ? input : links[links.length - 1]) || input).focus();
      }
    });
    document.addEventListener('keydown', event => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
      if ((event.key === '/' && !typing) || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        open();
      }
    });
  }
})();
