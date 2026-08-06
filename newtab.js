(function(){
  "use strict";

  if(!(window.chrome && chrome.bookmarks)){
    document.getElementById('banner').style.display = 'flex';
    document.getElementById('banner').classList.add('error');
    document.getElementById('bannerText').textContent =
      '⚠️ 无法访问 Chrome 书签接口。请通过「加载已解压的扩展程序」把这个文件夹作为扩展安装后，再打开新标签页使用——不能直接双击这个 HTML 文件打开。';
    document.getElementById('bannerClose').addEventListener('click', () => {
      document.getElementById('banner').style.display = 'none';
    });
    return;
  }

  /* ================= State ================= */
  const state = {
    tree: {id:'0', type:'folder', title:'root', children:[]},
    currentView: 'all',
    selection: new Set(),
    lastClickedId: null,
    searchQuery: '',
    collapsed: new Set(),
    typeFilter: 'all',       // all | youtube | other
    sort: 'date_desc',       // date_desc | date_asc | title_asc | title_desc
    cardSize: 'md',          // sm | md | lg
    darkMode: false,
    deadIds: new Set(),
  };

  /* ================= Chrome bookmarks <-> internal model ================= */
  function toInternal(node, parentId){
    const isFolder = node.url === undefined;
    return {
      id: node.id,
      type: isFolder ? 'folder' : 'bookmark',
      title: node.title || (isFolder ? '未命名文件夹' : node.url),
      url: node.url,
      dateAdded: node.dateAdded,
      parentId: parentId,
      children: isFolder ? (node.children || []).map(c => toInternal(c, node.id)) : undefined,
    };
  }

  let reloadTimer = null;
  function scheduleReload(){
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(doReload, 150);
  }
  function doReload(){
    chrome.bookmarks.getTree((nodes) => {
      const root = toInternal(nodes[0], null);
      root.id = '0';
      state.tree = root;
      // if current folder view no longer exists (e.g. deleted), fall back to "all"
      if(state.currentView.startsWith('folder:')){
        const fid = state.currentView.slice(7);
        if(!findNode(state.tree, fid)) state.currentView = 'all';
      }
      render();
    });
  }

  ['onCreated','onRemoved','onChanged','onMoved','onChildrenReordered','onImportEnded'].forEach(evt => {
    if(chrome.bookmarks[evt]) chrome.bookmarks[evt].addListener(scheduleReload);
  });

  /* ================= Helpers ================= */
  function findNode(node, id){
    if(node.id === id) return node;
    if(node.children){
      for(const c of node.children){
        const r = findNode(c, id);
        if(r) return r;
      }
    }
    return null;
  }
  function allFolders(node, acc){
    acc = acc || [];
    if(node.type === 'folder'){
      acc.push(node);
      node.children.forEach(c => allFolders(c, acc));
    }
    return acc;
  }
  function allBookmarks(node, acc, path){
    acc = acc || [];
    path = path || [];
    if(node.type === 'bookmark'){
      acc.push({node, path});
    } else if(node.children){
      node.children.forEach(c => allBookmarks(c, acc, node.id === '0' ? path : path.concat(node.title)));
    }
    return acc;
  }
  function countBookmarks(node){
    if(node.type === 'bookmark') return 1;
    return (node.children||[]).reduce((s,c) => s + countBookmarks(c), 0);
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function normalizeUrl(url){
    try{
      const u = new URL(url);
      return (u.hostname.replace('www.','') + u.pathname.replace(/\/$/, '') + u.search).toLowerCase();
    }catch(e){ return (url||'').toLowerCase().trim(); }
  }
  function computeDuplicateGroups(){
    const map = new Map();
    allBookmarks(state.tree).forEach(({node, path}) => {
      if(!node.url) return;
      const key = normalizeUrl(node.url);
      if(!map.has(key)) map.set(key, []);
      map.get(key).push({node, path});
    });
    const groups = [];
    map.forEach((items) => { if(items.length > 1) groups.push({items}); });
    return groups;
  }
  function computeGroupSuggestions(){
    const byDomain = new Map();
    allBookmarks(state.tree).forEach(({node}) => {
      const d = domainOf(node.url);
      if(!d) return;
      if(!byDomain.has(d)) byDomain.set(d, []);
      byDomain.get(d).push(node);
    });
    const suggestions = [];
    byDomain.forEach((nodes, domain) => {
      if(nodes.length < 3) return;
      const parentIds = new Set(nodes.map(n => n.parentId));
      if(parentIds.size === 1) return; // already all together, nothing to suggest
      suggestions.push({ domain, ids: nodes.map(n => n.id), count: nodes.length });
    });
    suggestions.sort((a,b) => b.count - a.count);
    return suggestions.slice(0, 12);
  }
  function sortItems(items){
    const arr = items.slice();
    switch(state.sort){
      case 'date_asc': arr.sort((a,b) => (a.node.dateAdded||0) - (b.node.dateAdded||0)); break;
      case 'title_asc': arr.sort((a,b) => (a.node.title||'').localeCompare(b.node.title||'', 'zh')); break;
      case 'title_desc': arr.sort((a,b) => (b.node.title||'').localeCompare(a.node.title||'', 'zh')); break;
      case 'date_desc':
      default: arr.sort((a,b) => (b.node.dateAdded||0) - (a.node.dateAdded||0)); break;
    }
    return arr;
  }

  function getYouTubeId(url){
    try{
      const u = new URL(url);
      const host = u.hostname.replace('www.','');
      if(host === 'youtu.be'){
        return u.pathname.slice(1).split('/')[0] || null;
      }
      if(host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com'){
        if(u.pathname === '/watch') return u.searchParams.get('v');
        if(u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
        if(u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
      }
    }catch(e){}
    return null;
  }
  function domainOf(url){
    try{ return new URL(url).hostname.replace('www.',''); }catch(e){ return url; }
  }
  function faviconUrl(url){
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', url);
    u.searchParams.set('size', '32');
    return u.toString();
  }
  const GRADIENTS = [
    'linear-gradient(135deg,#6366f1,#8b5cf6)',
    'linear-gradient(135deg,#0ea5e9,#22d3ee)',
    'linear-gradient(135deg,#f59e0b,#f97316)',
    'linear-gradient(135deg,#10b981,#22c55e)',
    'linear-gradient(135deg,#ec4899,#f43f5e)',
    'linear-gradient(135deg,#64748b,#334155)',
  ];
  function gradientFor(seed){
    let h = 0;
    for(let i=0;i<seed.length;i++) h = (h*31 + seed.charCodeAt(i)) >>> 0;
    return GRADIENTS[h % GRADIENTS.length];
  }

  /* ================= Rendering ================= */
  const folderTreeEl = document.getElementById('folderTree');
  const virtualViewsEl = document.getElementById('virtualViews');
  const gridEl = document.getElementById('grid');
  const emptyStateEl = document.getElementById('emptyState');
  const mainTitleEl = document.getElementById('mainTitle');
  const mainSubEl = document.getElementById('mainSub');

  function renderVirtualViews(){
    const total = countBookmarks(state.tree);
    const dupCount = computeDuplicateGroups().reduce((s,g) => s + g.items.length, 0);
    virtualViewsEl.innerHTML = '';
    virtualViewsEl.appendChild(makeTreeRow({label:'📚 全部书签', count: total, view:'all'}));
    virtualViewsEl.appendChild(makeTreeRow({label:'🔁 重复书签', count: dupCount, view:'duplicates'}));
  }

  function makeTreeRow({label, count, view, depth, folderId, hasChildren, expanded}){
    const row = document.createElement('div');
    row.className = 'tree-item' + (state.currentView === view ? ' active' : '');
    row.style.marginLeft = depth ? (depth*10)+'px' : '0px';

    const caret = document.createElement('span');
    caret.className = 'caret' + (hasChildren ? (expanded ? '' : ' collapsed') : ' empty');
    caret.innerHTML = hasChildren ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>' : '';
    if(hasChildren){
      caret.addEventListener('click', (e) => {
        e.stopPropagation();
        if(state.collapsed.has(folderId)) state.collapsed.delete(folderId);
        else state.collapsed.add(folderId);
        render();
      });
    }
    row.appendChild(caret);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = label;
    row.appendChild(name);

    const countEl = document.createElement('span');
    countEl.className = 'count';
    countEl.textContent = count;
    row.appendChild(countEl);

    row.addEventListener('click', () => {
      state.currentView = view;
      clearSelection();
      render();
    });

    if(folderId){
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        handleDrop(folderId);
      });
    }
    return row;
  }

  function renderFolderTree(){
    folderTreeEl.innerHTML = '';
    function walk(node, depth){
      node.children.filter(c => c.type === 'folder').forEach(f => {
        const hasChildren = f.children.some(c => c.type === 'folder');
        const row = makeTreeRow({
          label: '📁 ' + f.title,
          count: countBookmarks(f),
          view: 'folder:' + f.id,
          depth,
          folderId: f.id,
          hasChildren,
          expanded: !state.collapsed.has(f.id),
        });
        folderTreeEl.appendChild(row);
        if(hasChildren && !state.collapsed.has(f.id)){
          walk(f, depth+1);
        }
      });
    }
    walk(state.tree, 0);
  }

  function currentBookmarks(){
    const q = state.searchQuery.trim().toLowerCase();
    let items;
    if(state.currentView === 'all'){
      items = allBookmarks(state.tree).map(x => ({node:x.node, path: x.path.join(' / ')}));
    } else if(state.currentView === 'duplicates'){
      items = [];
      computeDuplicateGroups().forEach(g => {
        g.items.forEach(it => items.push({node: it.node, path: it.path.join(' / '), dupCount: g.items.length}));
      });
    } else if(state.currentView.startsWith('folder:')){
      const fid = state.currentView.slice(7);
      const f = findNode(state.tree, fid);
      items = f ? f.children.filter(c => c.type === 'bookmark').map(n => ({node:n, path:null})) : [];
    } else {
      items = [];
    }
    if(q){
      items = items.filter(({node}) => (node.title||'').toLowerCase().includes(q) || (node.url||'').toLowerCase().includes(q));
    }
    if(state.typeFilter === 'youtube'){
      items = items.filter(({node}) => !!getYouTubeId(node.url));
    } else if(state.typeFilter === 'other'){
      items = items.filter(({node}) => !getYouTubeId(node.url));
    }
    return sortItems(items);
  }

  function renderMainHeader(){
    if(state.currentView === 'all'){
      mainTitleEl.textContent = '📚 全部书签';
    } else if(state.currentView === 'duplicates'){
      mainTitleEl.textContent = '🔁 重复书签';
    } else if(state.currentView.startsWith('folder:')){
      const fid = state.currentView.slice(7);
      const f = findNode(state.tree, fid);
      mainTitleEl.textContent = f ? ('📁 ' + f.title) : '';
    }
    const items = currentBookmarks();
    mainSubEl.textContent = items.length + ' 项' + (state.searchQuery ? '（已按关键词筛选）' : '');
    document.getElementById('autoSelectDupBtn').style.display = state.currentView === 'duplicates' ? 'inline-flex' : 'none';
  }

  function renderCard({node, path, dupCount}){
    const card = document.createElement('div');
    card.className = 'card' + (state.selection.has(node.id) ? ' selected' : '');
    card.draggable = true;
    card.dataset.id = node.id;

    const thumb = document.createElement('div');
    thumb.className = 'card-thumb';
    const ytId = getYouTubeId(node.url);
    if(ytId){
      const img = document.createElement('img');
      img.className = 'thumb-img';
      img.loading = 'lazy';
      img.src = 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg';
      img.alt = '';
      thumb.appendChild(img);
      const play = document.createElement('div');
      play.className = 'yt-play';
      play.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';
      thumb.appendChild(play);
      const badge = document.createElement('div');
      badge.className = 'yt-badge';
      badge.textContent = 'YouTube';
      thumb.appendChild(badge);
    } else {
      thumb.classList.add('generic');
      thumb.style.backgroundImage = gradientFor(domainOf(node.url));
      const favWrap = document.createElement('div');
      favWrap.className = 'favicon-big';
      const favImg = document.createElement('img');
      favImg.loading = 'lazy';
      favImg.src = faviconUrl(node.url);
      favImg.alt = '';
      favImg.onerror = function(){
        this.remove();
        const letter = document.createElement('span');
        letter.className = 'fallback-letter';
        letter.textContent = (domainOf(node.url)[0] || '?').toUpperCase();
        favWrap.appendChild(letter);
      };
      favWrap.appendChild(favImg);
      thumb.appendChild(favWrap);
    }
    if(state.deadIds.has(node.id)){
      const deadBadge = document.createElement('div');
      deadBadge.className = 'dead-badge';
      deadBadge.textContent = '⚠ 可能失效';
      thumb.appendChild(deadBadge);
    } else if(dupCount && dupCount > 1){
      const dupBadge = document.createElement('div');
      dupBadge.className = 'dup-badge';
      dupBadge.textContent = '重复 ×' + dupCount;
      thumb.appendChild(dupBadge);
    }
    card.appendChild(thumb);

    const body = document.createElement('div');
    body.className = 'card-body';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = node.title || node.url;
    body.appendChild(title);
    const dom = document.createElement('div');
    dom.className = 'card-domain';
    const favSm = document.createElement('img');
    favSm.src = faviconUrl(node.url);
    favSm.onerror = function(){ this.style.visibility='hidden'; };
    dom.appendChild(favSm);
    const domText = document.createElement('span');
    domText.textContent = path ? (domainOf(node.url) + '  ·  ' + path) : domainOf(node.url);
    dom.appendChild(domText);
    body.appendChild(dom);
    card.appendChild(body);

    const selBox = document.createElement('div');
    selBox.className = 'card-select';
    selBox.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>';
    selBox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSelect(node.id);
    });
    card.appendChild(selBox);

    const openBtn = document.createElement('a');
    openBtn.className = 'card-open';
    openBtn.href = node.url;
    openBtn.target = '_blank';
    openBtn.rel = 'noopener noreferrer';
    openBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>';
    openBtn.addEventListener('click', (e) => e.stopPropagation());
    card.appendChild(openBtn);

    card.addEventListener('click', (e) => {
      if(e.shiftKey && state.lastClickedId){
        rangeSelect(state.lastClickedId, node.id);
      } else if(e.ctrlKey || e.metaKey){
        toggleSelect(node.id);
      } else if(state.selection.size > 0){
        toggleSelect(node.id);
      } else {
        window.open(node.url, '_blank', 'noopener,noreferrer');
      }
    });

    card.addEventListener('dragstart', (e) => {
      if(!state.selection.has(node.id)){
        state.selection = new Set([node.id]);
        renderSelectionUI();
      }
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', JSON.stringify(Array.from(state.selection)));
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));

    return card;
  }

  function renderGrid(){
    gridEl.className = 'grid size-' + state.cardSize;
    const items = currentBookmarks();
    gridEl.innerHTML = '';
    if(items.length === 0){
      emptyStateEl.style.display = 'flex';
      return;
    }
    emptyStateEl.style.display = 'none';
    items.forEach(item => gridEl.appendChild(renderCard(item)));
  }

  function renderMoveSelect(){
    const sel = document.getElementById('moveSelect');
    sel.innerHTML = '';
    allFolders(state.tree).filter(f => f.id !== '0').forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.title;
      sel.appendChild(opt);
    });
  }

  function renderSelectionUI(){
    document.querySelectorAll('.card').forEach(c => {
      c.classList.toggle('selected', state.selection.has(c.dataset.id));
    });
    const bar = document.getElementById('selectionBar');
    const n = state.selection.size;
    document.getElementById('selectionCount').textContent = '已选择 ' + n + ' 项';
    bar.classList.toggle('show', n > 0);
  }

  function render(){
    renderVirtualViews();
    renderFolderTree();
    renderMainHeader();
    renderGrid();
    renderMoveSelect();
    renderSelectionUI();
  }

  /* ================= Selection logic ================= */
  function toggleSelect(id){
    if(state.selection.has(id)) state.selection.delete(id);
    else state.selection.add(id);
    state.lastClickedId = id;
    renderSelectionUI();
  }
  function rangeSelect(fromId, toId){
    const items = currentBookmarks().map(x => x.node.id);
    const i1 = items.indexOf(fromId), i2 = items.indexOf(toId);
    if(i1 === -1 || i2 === -1) return toggleSelect(toId);
    const [lo, hi] = i1 < i2 ? [i1,i2] : [i2,i1];
    for(let i=lo;i<=hi;i++) state.selection.add(items[i]);
    state.lastClickedId = toId;
    renderSelectionUI();
  }
  function clearSelection(){
    state.selection = new Set();
    renderSelectionUI();
  }

  /* ================= Mutations via chrome.bookmarks ================= */
  function moveNodesLive(ids, targetFolderId, onDone){
    const jobs = ids.filter(id => id !== targetFolderId).map(id =>
      new Promise((resolve) => chrome.bookmarks.move(id, {parentId: targetFolderId}, () => resolve()))
    );
    Promise.all(jobs).then(() => { doReload(); if(onDone) onDone(); });
  }
  function deleteNodesLive(ids, onDone){
    const jobs = ids.map(id => new Promise((resolve) => chrome.bookmarks.removeTree(id, () => resolve())));
    Promise.all(jobs).then(() => { doReload(); if(onDone) onDone(); });
  }
  function createFolderLive(title, thenMoveIds){
    const parentId = (state.tree.children[0] && state.tree.children[0].id) || '1';
    chrome.bookmarks.create({parentId, title}, (newFolder) => {
      if(thenMoveIds && thenMoveIds.length){
        moveNodesLive(thenMoveIds, newFolder.id, () => showToast('已创建文件夹「' + title + '」并移动 ' + thenMoveIds.length + ' 项'));
      } else {
        doReload();
        showToast('已创建文件夹「' + title + '」');
      }
    });
  }

  function handleDrop(targetFolderId){
    if(state.selection.size === 0) return;
    const ids = Array.from(state.selection);
    const target = findNode(state.tree, targetFolderId);
    const n = ids.length;
    moveNodesLive(ids, targetFolderId, () => {
      clearSelection();
      showToast('已移动 ' + n + ' 项到「' + target.title + '」');
    });
  }

  /* ================= Drop zones ================= */
  document.getElementById('trashZone').addEventListener('dragover', (e) => {
    e.preventDefault();
    document.getElementById('trashZone').classList.add('drag-over');
  });
  document.getElementById('trashZone').addEventListener('dragleave', () => {
    document.getElementById('trashZone').classList.remove('drag-over');
  });
  document.getElementById('trashZone').addEventListener('drop', (e) => {
    e.preventDefault();
    document.getElementById('trashZone').classList.remove('drag-over');
    if(state.selection.size === 0) return;
    openModal('confirmDelete', {ids: Array.from(state.selection)});
  });

  document.getElementById('newFolderBtn').addEventListener('dragover', (e) => {
    e.preventDefault();
    document.getElementById('newFolderBtn').classList.add('drag-over');
  });
  document.getElementById('newFolderBtn').addEventListener('dragleave', () => {
    document.getElementById('newFolderBtn').classList.remove('drag-over');
  });
  document.getElementById('newFolderBtn').addEventListener('drop', (e) => {
    e.preventDefault();
    document.getElementById('newFolderBtn').classList.remove('drag-over');
    const ids = state.selection.size ? Array.from(state.selection) : null;
    openModal('newFolder', {thenMoveIds: ids});
  });
  document.getElementById('newFolderBtn').addEventListener('click', () => {
    openModal('newFolder', {thenMoveIds: null});
  });

  /* ================= Selection bar buttons ================= */
  document.getElementById('moveBtn').addEventListener('click', () => {
    const targetId = document.getElementById('moveSelect').value;
    if(state.selection.size === 0 || !targetId) return;
    handleDrop(targetId);
  });
  document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
    if(state.selection.size === 0) return;
    openModal('confirmDelete', {ids: Array.from(state.selection)});
  });
  document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);
  document.getElementById('refreshBtn').addEventListener('click', () => { doReload(); showToast('已刷新'); });

  /* ================= Search / filter / sort ================= */
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    render();
  });
  document.getElementById('typeFilter').addEventListener('change', (e) => {
    state.typeFilter = e.target.value;
    render();
  });
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });

  /* ================= Duplicate detection ================= */
  document.getElementById('autoSelectDupBtn').addEventListener('click', () => {
    const groups = computeDuplicateGroups();
    const toSelect = [];
    groups.forEach(g => {
      const sorted = g.items.slice().sort((a,b) => (a.node.dateAdded||0) - (b.node.dateAdded||0));
      sorted.slice(1).forEach(it => toSelect.push(it.node.id)); // keep earliest, select the rest
    });
    state.selection = new Set(toSelect);
    renderSelectionUI();
    showToast(toSelect.length ? ('已选中 ' + toSelect.length + ' 个多余的重复项，可以直接删除') : '没有发现多余的重复项');
  });

  /* ================= Smart grouping suggestions ================= */
  document.getElementById('groupSuggestBtn').addEventListener('click', () => {
    openModal('suggestGroups', {suggestions: computeGroupSuggestions()});
  });

  /* ================= Dead-link detection (best-effort) ================= */
  document.getElementById('deadLinkBtn').addEventListener('click', async () => {
    const items = currentBookmarks();
    if(items.length === 0){ showToast('当前视图没有书签'); return; }
    const btn = document.getElementById('deadLinkBtn');
    const progressEl = document.getElementById('scanProgress');
    btn.disabled = true;
    state.deadIds = new Set();
    let done = 0;
    let idx = 0;
    const CONCURRENCY = 6;
    async function worker(){
      while(idx < items.length){
        const my = idx++;
        const node = items[my].node;
        if(!/^https?:\/\//i.test(node.url || '')){
          done++; progressEl.textContent = '检测中 ' + done + '/' + items.length;
          continue;
        }
        try{
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6000);
          await fetch(node.url, {mode:'no-cors', signal: ctrl.signal, cache:'no-store'});
          clearTimeout(timer);
        }catch(e){
          state.deadIds.add(node.id);
        }
        done++;
        progressEl.textContent = '检测中 ' + done + '/' + items.length;
      }
    }
    await Promise.all(Array.from({length: CONCURRENCY}, worker));
    btn.disabled = false;
    progressEl.textContent = '';
    renderGrid();
    showToast('检测完成，发现 ' + state.deadIds.size + ' 个可能失效的链接（受浏览器限制，此结果仅供参考）');
  });

  /* ================= Appearance settings ================= */
  const appearanceBtn = document.getElementById('appearanceBtn');
  const appearancePopover = document.getElementById('appearancePopover');
  appearanceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    appearancePopover.style.display = appearancePopover.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', (e) => {
    if(appearancePopover.style.display !== 'none' && !appearancePopover.contains(e.target) && e.target !== appearanceBtn){
      appearancePopover.style.display = 'none';
    }
  });
  function updateSizeToggleUI(){
    document.querySelectorAll('#sizeToggle button').forEach(b => b.classList.toggle('active', b.dataset.size === state.cardSize));
  }
  document.querySelectorAll('#sizeToggle button').forEach(b => {
    b.addEventListener('click', () => {
      state.cardSize = b.dataset.size;
      localStorage.setItem('bm_card_size', state.cardSize);
      updateSizeToggleUI();
      renderGrid();
    });
  });
  const darkToggle = document.getElementById('darkModeToggle');
  darkToggle.addEventListener('change', () => {
    state.darkMode = darkToggle.checked;
    localStorage.setItem('bm_dark', state.darkMode ? '1' : '0');
    document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : '');
  });

  /* ================= Modal ================= */
  const modalOverlay = document.getElementById('modalOverlay');
  const modalBox = document.getElementById('modalBox');
  function closeModal(){ modalOverlay.classList.remove('show'); modalBox.innerHTML=''; }
  modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeModal(); });

  function openModal(type, payload){
    modalBox.className = 'modal';
    if(type === 'newFolder'){
      modalBox.innerHTML = `
        <h3>新建文件夹</h3>
        <input type="text" id="newFolderName" placeholder="文件夹名称" autofocus>
        <div class="modal-actions">
          <button class="btn ghost small" id="modalCancel">取消</button>
          <button class="btn primary small" id="modalConfirm">创建</button>
        </div>`;
      modalOverlay.classList.add('show');
      const input = document.getElementById('newFolderName');
      input.focus();
      const confirm = () => {
        const name = input.value.trim() || '新建文件夹';
        closeModal();
        createFolderLive(name, payload && payload.thenMoveIds);
        clearSelection();
      };
      document.getElementById('modalConfirm').addEventListener('click', confirm);
      document.getElementById('modalCancel').addEventListener('click', closeModal);
      input.addEventListener('keydown', (e) => { if(e.key === 'Enter') confirm(); if(e.key==='Escape') closeModal(); });
    } else if(type === 'confirmDelete'){
      modalBox.innerHTML = `
        <h3>删除所选项？</h3>
        <p>将从 Chrome 书签中删除 ${payload.ids.length} 项，此操作不可撤销。</p>
        <div class="modal-actions">
          <button class="btn ghost small" id="modalCancel">取消</button>
          <button class="btn primary small" id="modalConfirm" style="background:#c62828;border-color:#c62828;">删除</button>
        </div>`;
      modalOverlay.classList.add('show');
      document.getElementById('modalConfirm').addEventListener('click', () => {
        const n = payload.ids.length;
        closeModal();
        deleteNodesLive(payload.ids, () => showToast('已删除 ' + n + ' 项'));
        clearSelection();
      });
      document.getElementById('modalCancel').addEventListener('click', closeModal);
    } else if(type === 'suggestGroups'){
      const list = payload.suggestions;
      if(list.length === 0){
        modalBox.innerHTML = `
          <h3>智能分组建议</h3>
          <p>暂时没有发现明显可以归到一起的书签。当同一个网站有 3 个以上书签分散在不同文件夹时，这里会给出建议。</p>
          <div class="modal-actions">
            <button class="btn primary small" id="modalCancel">知道了</button>
          </div>`;
        modalOverlay.classList.add('show');
        document.getElementById('modalCancel').addEventListener('click', closeModal);
        return;
      }
      modalBox.className = 'modal wide';
      modalBox.innerHTML = `
        <h3>智能分组建议</h3>
        <p>下面这些网站的书签分散在不同地方，可以一键归到同一个新文件夹：</p>
        <div id="suggestList"></div>
        <div class="modal-actions">
          <button class="btn ghost small" id="modalCancel">关闭</button>
        </div>`;
      const listEl = modalBox.querySelector('#suggestList');
      list.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'suggest-row';
        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML = `<div>${escapeHtml(s.domain)}</div><div class="n">${s.count} 项，分散在不同文件夹</div>`;
        row.appendChild(info);
        const btn = document.createElement('button');
        btn.className = 'btn small primary';
        btn.textContent = '归到一起';
        btn.addEventListener('click', () => {
          btn.disabled = true;
          btn.textContent = '已整理';
          row.style.opacity = '0.5';
          createFolderLive(s.domain, s.ids);
        });
        row.appendChild(btn);
        listEl.appendChild(row);
      });
      modalOverlay.classList.add('show');
      document.getElementById('modalCancel').addEventListener('click', closeModal);
    }
  }

  /* ================= Toast ================= */
  let toastTimer = null;
  function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ================= JSON backup export (read-only safety net) ================= */
  document.getElementById('saveJsonBtn').addEventListener('click', () => {
    chrome.bookmarks.getTree((nodes) => {
      const blob = new Blob([JSON.stringify(nodes, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chrome_bookmarks_备份_' + new Date().toISOString().slice(0,10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast('已导出书签备份');
    });
  });

  /* ================= Init ================= */
  state.cardSize = localStorage.getItem('bm_card_size') || 'md';
  state.darkMode = localStorage.getItem('bm_dark') === '1';
  document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : '');
  darkToggle.checked = state.darkMode;
  updateSizeToggleUI();
  doReload();
})();
