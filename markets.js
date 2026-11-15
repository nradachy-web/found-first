/* Filter existing links. Every market is crawlable and usable without JavaScript. */
(() => {
  const search = document.getElementById('market-search');
  const state = document.getElementById('market-state');
  const kind = document.getElementById('market-kind');
  const list = document.getElementById('market-list');
  if (!search || !kind || !list) return;
  search.closest('form').hidden = false;
  const rows = Array.from(list.querySelectorAll('.directory-row'));
  const count = document.getElementById('market-count');
  const empty = document.getElementById('market-empty');
  const normalize = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\bsaint\b/g, 'st').replace(/\s+/g, ' ').trim();
  function update() {
    const query = normalize(search.value);
    let matches = 0;
    for (const row of rows) {
      const text = normalize(row.dataset.market + ' ' + row.dataset.state + ' ' + row.dataset.code);
      const show = query.split(' ').every(term => text.includes(term)) && (!state || !state.value || row.dataset.state === state.value) && (!kind.value || row.dataset.kind === kind.value);
      row.hidden = !show;
      if (show) matches++;
    }
    count.textContent = `${matches} ${matches === 1 ? 'market' : 'markets'} shown`;
    empty.hidden = matches > 0;
  }
  search.addEventListener('input', update);
  state?.addEventListener('change', update);
  kind.addEventListener('change', update);
  document.getElementById('market-reset').addEventListener('click', () => {
    search.value = '';
    if (state) state.value = '';
    kind.value = '';
    update();
    search.focus();
  });
  update();
})();
