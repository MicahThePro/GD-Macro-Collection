const BASE_URL = 'https://github.com/MicahThePro/GD-Macro-Collection/raw/refs/heads/main';
const REPO_OWNER = 'MicahThePro';
const REPO_NAME = 'GD-Macro-Collection';
const REPO_BRANCH = 'main';
const GITHUB_TREE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REPO_BRANCH}?recursive=1`;
const GITHUB_COMMIT_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits`;
const REPO_ARCHIVE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_BRANCH}.zip`;
const POLL_INTERVAL_MS = 300000; // 5 minutes
const RECENT_HIGHLIGHT_MS = 10000;

const collectionElement = document.getElementById('collection');
const breadcrumbElement = document.getElementById('breadcrumb');
const filterInput = document.getElementById('filterInput');
const downloadAllButton = document.getElementById('downloadAll');
const settingsInfoButton = document.getElementById('showSettingsInfo');
const runInfoButton = document.getElementById('showRunInfo');
const settingsInfoModal = document.getElementById('settingsInfoModal');
const runInfoModal = document.getElementById('runInfoModal');
const closeSettingsInfoButton = document.getElementById('closeSettingsInfo');
const closeRunInfoButton = document.getElementById('closeRunInfo');
const fpsGifPlaceholder = document.getElementById('fpsGifPlaceholder');
const tpsGifPlaceholder = document.getElementById('tpsGifPlaceholder');
const toast = document.getElementById('toast');

const GROUP_LABELS = {
  'main-levels': 'Main Levels',
  'rated-custom-levels': 'Rated Custom Levels',
  'unrated-custom-levels': 'Unrated Custom Levels',
};

function groupHasSubgroups(group) {
  return group === 'rated-custom-levels' || group === 'unrated-custom-levels';
}

function groupHasCategories(group) {
  return group === 'main-levels' || groupHasSubgroups(group);
}

let macros = [];
let state = {
  view: 'groups',
  group: null,
  subgroup: null,
  category: null,
};
let previousViewSignature = '';
let highlightPaths = new Set();
let pollingIntervalId = null;

function createUrl(path) {
  return `${BASE_URL}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function parseTitleAndId(filename) {
  const base = filename.replace(/\.slc$/i, '');
  const splitIndex = base.lastIndexOf(' - ');
  if (splitIndex === -1) {
    return { title: base, id: '' };
  }
  return {
    title: base.slice(0, splitIndex),
    id: base.slice(splitIndex + 3),
  };
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

function updateMacroCount() {
  const macroCountElement = document.getElementById('macroCount');
  if (!macroCountElement) return;
  const totalMacros = macros.length;
  macroCountElement.textContent = `${totalMacros.toLocaleString()} macros available across the full collection.`;
}

function setLoading(message) {
  collectionElement.innerHTML = `<p class="card-subtitle">${message}</p>`;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('Clipboard API failed, falling back to execCommand', error);
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (error) {
    console.warn('execCommand copy failed', error);
  }

  document.body.removeChild(textarea);
  return success;
}

function getViewSignature() {
  return `${state.view}|${state.group || ''}|${state.subgroup || ''}|${state.category || ''}|${filterInput.value.trim().toLowerCase()}`;
}

function collectCurrentVisiblePaths() {
  if (state.view !== 'macros') {
    return new Set();
  }
  return new Set(macros
    .filter((macro) => macro.group === state.group)
    .filter((macro) => state.subgroup ? macro.subgroup === state.subgroup : true)
    .filter((macro) => state.category ? macro.category === state.category : true)
    .map((macro) => macro.path));
}

function markRecentMacros(newPaths) {
  highlightPaths.clear();
  newPaths.forEach((path) => highlightPaths.add(path));
  window.setTimeout(() => {
    highlightPaths.clear();
    if (state.view === 'macros') {
      renderCollection(filterInput.value);
    }
  }, RECENT_HIGHLIGHT_MS);
}

function buildMacroCard(macro) {
  const { title, id } = parseTitleAndId(macro.filename);
  const url = createUrl(macro.path);

  const card = document.createElement('article');
  card.className = 'card';
  if (highlightPaths.has(macro.path)) {
    card.classList.add('highlight');
  }
  card.dataset.title = title.toLowerCase();
  card.dataset.group = macro.group.toLowerCase();
  card.dataset.category = macro.category.toLowerCase();
  card.dataset.id = id.toLowerCase();

  const nameRow = document.createElement('div');
  nameRow.className = 'card-row';
  const subtitleParts = [];
  if (macro.subgroup) subtitleParts.push(macro.subgroup);
  if (macro.category) subtitleParts.push(macro.category);
  subtitleParts.push(GROUP_LABELS[macro.group] || macro.group);
  nameRow.innerHTML = `
    <div>
      <p class="card-title">${title}</p>
      <p class="card-subtitle">${subtitleParts.join(' • ')}</p>
    </div>
    <span class="tag">${macro.filename}</span>
  `;

  const noteText = title === 'Future Funk' && id === '44062068'
    ? 'This macro targets a random timing event when collecting the 3rd coin. It was recorded to click more than 55 times for that specific run, so the macro will always use that behavior even if the game state varies.'
    : '';
  const noteRow = document.createElement('p');
  if (noteText) {
    noteRow.className = 'macro-note';
    noteRow.textContent = noteText;
  }

  const infoRow = document.createElement('div');
  infoRow.className = 'card-row';
  const idText = macro.group === 'main-levels' ? '' : id ? `ID: ${id}` : 'No ID available';
  infoRow.innerHTML = `
    <div class="card-subtitle">${idText}</div>
    <div class="card-actions">
      <a href="${url}" target="_blank" rel="noopener noreferrer">Download</a>
      <button type="button">Copy Link</button>
    </div>
  `;

  const idContainer = infoRow.querySelector('.card-subtitle');
  if (id && macro.group !== 'main-levels') {
    idContainer.classList.add('copyable-id');
    idContainer.setAttribute('role', 'button');
    idContainer.setAttribute('tabindex', '0');
    idContainer.addEventListener('click', async () => {
      const copied = await copyTextToClipboard(id);
      if (copied) {
        showToast('Level ID copied to clipboard');
      } else {
        showToast('Unable to copy level ID');
      }
    });
    idContainer.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const copied = await copyTextToClipboard(id);
        if (copied) {
          showToast('Level ID copied to clipboard');
        } else {
          showToast('Unable to copy level ID');
        }
      }
    });
  }

  card.appendChild(nameRow);
  if (noteText) {
    card.appendChild(noteRow);
  }
  card.appendChild(infoRow);

  const copyButton = infoRow.querySelector('button');
  copyButton.addEventListener('click', async () => {
    const copied = await copyTextToClipboard(url);
    if (copied) {
      showToast('Link copied to clipboard');
    } else {
      window.prompt('Copy this URL', url);
      showToast('Use the prompt to copy the link');
    }
  });

  return card;
}

function renderBreadcrumb() {
  breadcrumbElement.innerHTML = '';
  const rootButton = document.createElement('button');
  rootButton.textContent = 'Home';
  rootButton.addEventListener('click', () => {
    state = { view: 'groups', group: null, subgroup: null, category: null };
    filterInput.value = '';
    renderBreadcrumb();
    renderCollection();
  });

  breadcrumbElement.appendChild(rootButton);

  if (state.view !== 'groups') {
    const separator = document.createElement('span');
    separator.className = 'separator';
    separator.textContent = '›';
    breadcrumbElement.appendChild(separator);

    const groupButton = document.createElement('button');
    groupButton.textContent = GROUP_LABELS[state.group] || state.group;
    groupButton.addEventListener('click', () => {
      if (groupHasSubgroups(state.group)) {
        state = { view: 'subgroups', group: state.group, subgroup: null, category: null };
      } else {
        state = { view: 'categories', group: state.group, subgroup: null, category: null };
      }
      renderBreadcrumb();
      renderCollection();
    });
    breadcrumbElement.appendChild(groupButton);
  }

  if (state.view === 'subgroups' || state.view === 'categories' || state.view === 'macros') {
    if (state.subgroup) {
      const separator = document.createElement('span');
      separator.className = 'separator';
      separator.textContent = '›';
      breadcrumbElement.appendChild(separator);

      const subgroupButton = document.createElement('button');
      subgroupButton.textContent = state.subgroup;
      subgroupButton.addEventListener('click', () => {
        state = { view: 'subgroups', group: state.group, subgroup: null, category: null };
        renderBreadcrumb();
        renderCollection();
      });
      breadcrumbElement.appendChild(subgroupButton);
    }
  }

  if (state.view === 'categories' && state.category) {
    const separator = document.createElement('span');
    separator.className = 'separator';
    separator.textContent = '›';
    breadcrumbElement.appendChild(separator);

    const categoryLabel = document.createElement('span');
    categoryLabel.textContent = state.category;
    breadcrumbElement.appendChild(categoryLabel);
  }
}

function renderCollection(filter = '') {
  collectionElement.innerHTML = '';
  const normalizedFilter = filter.trim().toLowerCase();

  if (state.view === 'groups') {
    const groups = ['main-levels', 'rated-custom-levels', 'unrated-custom-levels'];
    const section = document.createElement('section');
    section.className = 'folder';
    section.innerHTML = `
      <div class="folder-header">
        <div>
          <h2 class="folder-title">Choose a collection</h2>
          <p class="folder-meta">Browse all available macro folders</p>
        </div>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'card-grid';

    groups.forEach((groupName) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-row">
          <div>
            <p class="card-title">${GROUP_LABELS[groupName] || groupName}</p>
            <p class="card-subtitle">Browse ${GROUP_LABELS[groupName] || groupName}</p>
          </div>
          <button class="button secondary">Open</button>
        </div>
      `;
      card.querySelector('button').addEventListener('click', () => {
        if (groupHasSubgroups(groupName)) {
          state = { view: 'subgroups', group: groupName, subgroup: null, category: null };
        } else {
          state = { view: 'categories', group: groupName, subgroup: null, category: null };
        }
        renderBreadcrumb();
        renderCollection();
      });
      grid.appendChild(card);
    });

    section.appendChild(grid);
    collectionElement.appendChild(section);
    return;
  }

  if (state.view === 'subgroups') {
    const subgroups = [...new Set(macros
      .filter((macro) => macro.group === state.group)
      .map((macro) => macro.subgroup))].sort();

    const section = document.createElement('section');
    section.className = 'folder';
    section.innerHTML = `
      <div class="folder-header">
        <div>
          <h2 class="folder-title">${GROUP_LABELS[state.group] || state.group}</h2>
          <p class="folder-meta">Choose a style</p>
        </div>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'card-grid';

    subgroups.forEach((subgroupName) => {
      const subgroupCount = macros.filter((macro) => macro.group === state.group && macro.subgroup === subgroupName).length;
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-row">
          <div>
            <p class="card-title">${subgroupName}</p>
            <p class="card-subtitle">${subgroupCount} macros</p>
          </div>
          <button class="button secondary">Open</button>
        </div>
      `;
      card.querySelector('button').addEventListener('click', () => {
        state = { view: 'categories', group: state.group, subgroup: subgroupName, category: null };
        renderBreadcrumb();
        renderCollection();
      });
      grid.appendChild(card);
    });

    section.appendChild(grid);
    collectionElement.appendChild(section);
    return;
  }

  if (state.view === 'categories') {
    const categories = [...new Set(macros
      .filter((macro) => macro.group === state.group)
      .filter((macro) => state.subgroup ? macro.subgroup === state.subgroup : true)
      .map((macro) => macro.category))].sort();

    const section = document.createElement('section');
    section.className = 'folder';
    section.innerHTML = `
      <div class="folder-header">
        <div>
          <h2 class="folder-title">${GROUP_LABELS[state.group] || state.group}</h2>
          <p class="folder-meta">Pick a difficulty category</p>
        </div>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'card-grid';

    categories.forEach((categoryName) => {
      const categoryCount = macros
        .filter((macro) => macro.group === state.group)
        .filter((macro) => state.subgroup ? macro.subgroup === state.subgroup : true)
        .filter((macro) => macro.category === categoryName).length;
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-row">
          <div>
            <p class="card-title">${categoryName}</p>
            <p class="card-subtitle">${categoryCount} macros</p>
          </div>
          <button class="button secondary">Open</button>
        </div>
      `;
      card.querySelector('button').addEventListener('click', () => {
        state = { view: 'macros', group: state.group, subgroup: state.subgroup, category: categoryName };
        renderBreadcrumb();
        renderCollection();
      });
      grid.appendChild(card);
    });

    section.appendChild(grid);
    collectionElement.appendChild(section);
    return;
  }

  if (state.view === 'macros') {
    const filteredMacros = macros
      .filter((macro) => macro.group === state.group)
      .filter((macro) => state.subgroup ? macro.subgroup === state.subgroup : true)
      .filter((macro) => state.category ? macro.category === state.category : true);
    const searchItems = filteredMacros.filter((macro) => {
      const searchText = `${macro.filename} ${macro.category} ${macro.group}`.toLowerCase();
      return !normalizedFilter || searchText.includes(normalizedFilter);
    });

    const section = document.createElement('section');
    section.className = 'folder';
    section.innerHTML = `
      <div class="folder-header">
        <div>
          <h2 class="folder-title">${state.category}</h2>
          <p class="folder-meta">${searchItems.length} macros in ${GROUP_LABELS[state.group] || state.group}</p>
        </div>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'card-grid';

    searchItems.forEach((macro) => grid.appendChild(buildMacroCard(macro)));

    if (searchItems.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'card-subtitle';
      emptyState.textContent = 'No macros found in this category.';
      section.appendChild(emptyState);
    } else {
      section.appendChild(grid);
    }

    collectionElement.appendChild(section);
    return;
  }
}

function downloadAll() {
  if (macros.length === 0) {
    showToast('No macros loaded yet.');
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = REPO_ARCHIVE_URL;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  showToast('Downloading the full collection as a ZIP.');
}

function getMacroMetadata(path) {
  const parts = path.split('/');
  const group = parts[0];
  if (group === 'main-levels') {
    const category = parts[1] || '';
    const filename = parts.slice(2).join('/') || '';
    return { path, group, subgroup: '', category, filename };
  }

  const subgroup = parts[1] || '';
  const category = parts[2] || '';
  const filename = parts.slice(3).join('/') || '';
  return { path, group, subgroup, category, filename };
}

async function fetchMacroTree() {
  const response = await fetch(GITHUB_TREE_URL, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) {
    const message = data && data.message ? `: ${data.message}` : '';
    throw new Error(`GitHub API returned ${response.status}${message}`);
  }
  return (data.tree || [])
    .filter((node) => node.type === 'blob' && node.path.toLowerCase().endsWith('.slc'))
    .map((node) => getMacroMetadata(node.path))
    .filter((item) => item.group === 'main-levels' || item.group === 'rated-custom-levels' || item.group === 'unrated-custom-levels')
    .sort((a, b) => {
      if (a.group !== b.group) return a.group.localeCompare(b.group);
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.filename.localeCompare(b.filename);
    });
}

async function loadMacros() {
  setLoading('Loading macros from GitHub...');
  try {
    macros = await fetchMacroTree();
    updateMacroCount();
    previousViewSignature = getViewSignature();
    renderBreadcrumb();
    renderCollection();
    startPolling();
  } catch (error) {
    collectionElement.innerHTML = `<p class="card-subtitle">Unable to load macros from GitHub. ${error.message}</p>`;
    console.error(error);
  }
}

async function refreshIfNeeded() {
  try {
    const latestMacros = await fetchMacroTree();
    const latestPaths = new Set(latestMacros.map((macro) => macro.path));
    const currentPaths = new Set(macros.map((macro) => macro.path));
    const addedPaths = [...latestPaths].filter((path) => !currentPaths.has(path));
    const removedPaths = [...currentPaths].filter((path) => !latestPaths.has(path));
    const hasChanges = addedPaths.length > 0 || removedPaths.length > 0;

    if (!hasChanges) {
      return;
    }

    macros = latestMacros;
    updateMacroCount();
    const currentVisiblePaths = collectCurrentVisiblePaths();
    const addedVisiblePaths = addedPaths.filter((path) => currentVisiblePaths.has(path));

    if (addedVisiblePaths.length > 0) {
      markRecentMacros(addedVisiblePaths);
      showToast('New macros were added in this folder.');
    }

    renderBreadcrumb();
    renderCollection(filterInput.value);
    previousViewSignature = getViewSignature();
  } catch (error) {
    console.warn('Auto-refresh failed:', error);
    if (error.message && error.message.includes('rate limit exceeded')) {
      stopPolling();
      showToast('GitHub rate limit hit. Refresh manually later.');
    }
  }
}

function startPolling() {
  if (pollingIntervalId !== null) {
    return;
  }
  pollingIntervalId = window.setInterval(refreshIfNeeded, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollingIntervalId !== null) {
    window.clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
}

filterInput.addEventListener('input', (event) => renderCollection(event.target.value));
downloadAllButton.addEventListener('click', downloadAll);

function loadGifIntoPlaceholder(placeholder, src, alt) {
  if (!placeholder) {
    return;
  }

  placeholder.innerHTML = '';
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  placeholder.appendChild(img);
}

function loadGifPlaceholders() {
  try {
    if (fpsGifPlaceholder) {
      loadGifIntoPlaceholder(fpsGifPlaceholder, 'howtosetfpsto240.gif', 'How to set FPS to 240');
    }

    if (tpsGifPlaceholder) {
      loadGifIntoPlaceholder(tpsGifPlaceholder, 'howtosettpsto240.gif', 'How to set TPS to 240');
    }
  } catch (error) {
    console.warn('Unable to load the GIF previews:', error);
    if (fpsGifPlaceholder) {
      fpsGifPlaceholder.textContent = 'GIF unavailable';
    }
    if (tpsGifPlaceholder) {
      tpsGifPlaceholder.textContent = 'GIF unavailable';
    }
  }
}

function openSettingsInfoModal() {
  settingsInfoModal.classList.add('show');
  settingsInfoModal.setAttribute('aria-hidden', 'false');
  loadGifPlaceholders();
}

function closeSettingsInfoModal() {
  settingsInfoModal.classList.remove('show');
  settingsInfoModal.setAttribute('aria-hidden', 'true');
}

function openRunInfoModal() {
  runInfoModal.classList.add('show');
  runInfoModal.setAttribute('aria-hidden', 'false');
}

function closeRunInfoModal() {
  runInfoModal.classList.remove('show');
  runInfoModal.setAttribute('aria-hidden', 'true');
}

settingsInfoButton.addEventListener('click', openSettingsInfoModal);
runInfoButton.addEventListener('click', openRunInfoModal);
closeSettingsInfoButton.addEventListener('click', closeSettingsInfoModal);
closeRunInfoButton.addEventListener('click', closeRunInfoModal);
settingsInfoModal.addEventListener('click', (event) => {
  if (event.target.hasAttribute('data-close-modal')) {
    closeSettingsInfoModal();
  }
});
runInfoModal.addEventListener('click', (event) => {
  if (event.target.hasAttribute('data-close-modal')) {
    closeRunInfoModal();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (settingsInfoModal.classList.contains('show')) {
      closeSettingsInfoModal();
    }
    if (runInfoModal.classList.contains('show')) {
      closeRunInfoModal();
    }
  }
});

loadMacros();
