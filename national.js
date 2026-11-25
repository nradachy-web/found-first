(() => {
  const input = document.getElementById('national-search');
  if (!input) return;
  const form = input.closest('form');
  const rows = Array.from(document.querySelectorAll('[data-national-row]'));
  const groups = Array.from(document.querySelectorAll('.national-filter-group'));
  form.hidden = false;
  function filter() {
    const terms = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let count = 0;
    for (const row of rows) { const text = (row.textContent + ' ' + (row.dataset.searchTitle || '')).toLowerCase(); row.hidden = !terms.every(t => text.includes(t)); if (!row.hidden) count++; }
    for (const group of groups) group.hidden = !group.querySelector('[data-national-row]:not([hidden])');
    document.getElementById('national-search-count').textContent = count ? `${count} matching ${count === 1 ? 'guide' : 'guides'}` : 'No matching guide. Try a broader business or service term.';
  }
  input.addEventListener('input', filter);
  filter();
})();
