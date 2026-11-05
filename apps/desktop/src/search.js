'use strict';

const queryElement = document.getElementById('query');
const summaryElement = document.getElementById('summary');
const resultsElement = document.getElementById('results');
const errorElement = document.getElementById('error');
const emptyElement = document.getElementById('empty');
const paginationElement = document.getElementById('pagination');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-query');

searchInput.addEventListener('input', () => {
    searchInput.setCustomValidity('');
});

searchForm.addEventListener('submit', event => {
    event.preventDefault();
    const query = searchInput.value.trim().replace(/\s+/g, ' ');
    if (!query || query.length > 200) {
        searchInput.setCustomValidity('Enter a search phrase of 1 to 200 characters.');
        searchInput.reportValidity();
        return;
    }
    if (!/[\p{L}\p{N}_]{2,}/u.test(query)) {
        searchInput.setCustomValidity('Enter at least one search term containing two or more characters.');
        searchInput.reportValidity();
        return;
    }
    searchInput.setCustomValidity('');
    window.location.href = 'peanut-search://results/?q=' + encodeURIComponent(query) + '&page=1';
});

function render() {
    try {
        const encoded = window.location.hash.slice(1);
        if (!encoded) throw new Error('Search results are unavailable. Enter a search phrase in the search field.');
        const data = JSON.parse(decodeURIComponent(encoded));
        if (!data || typeof data !== 'object' || !Array.isArray(data.results)) {
            throw new Error('Peanut Browsing returned an invalid results document.');
        }
        queryElement.textContent = data.query || 'Search';
        searchInput.value = data.query || '';
        summaryElement.textContent = Number.isInteger(data.totalResults)
            ? data.totalResults.toLocaleString() + ' matching pages'
            : data.results.length + ' results';
        resultsElement.replaceChildren();
        paginationElement.replaceChildren();
        errorElement.hidden = true;
        if (data.error) {
            errorElement.textContent = data.error;
            errorElement.hidden = false;
        }

        for (const result of data.results) {
            const article = document.createElement('article');
            article.className = 'result';
            const link = document.createElement('a');
            link.className = 'result-title';
            link.href = result.url;
            link.rel = 'noopener noreferrer';
            link.textContent = result.title;
            const address = document.createElement('p');
            address.className = 'result-url';
            address.textContent = result.displayUrl;
            const snippet = document.createElement('p');
            snippet.className = 'result-snippet';
            snippet.textContent = result.snippet;
            article.append(link, address, snippet);
            resultsElement.append(article);
        }
        emptyElement.hidden = data.results.length !== 0 || Boolean(data.error);
        const page = Number.isInteger(data.page) ? data.page : 1;
        const addPageLink = (label, targetPage, accessibleLabel) => {
            const link = document.createElement('a');
            link.className = 'page-link';
            link.href = 'peanut-search://results/?q=' + encodeURIComponent(data.query || '') +
                '&page=' + targetPage;
            link.textContent = label;
            link.setAttribute('aria-label', accessibleLabel);
            paginationElement.append(link);
        };
        if (!data.error && page > 1) addPageLink('Previous', page - 1, 'Previous results page');
        if (!data.error && data.hasNextPage) addPageLink('Next', page + 1, 'Next results page');
    } catch (error) {
        summaryElement.textContent = '';
        paginationElement.replaceChildren();
        errorElement.textContent = error.message || 'Search results could not be displayed.';
        errorElement.hidden = false;
    }
}

render();
