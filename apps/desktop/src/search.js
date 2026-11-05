'use strict';

const queryElement = document.getElementById('query');
const summaryElement = document.getElementById('summary');
const resultsElement = document.getElementById('results');
const emptyElement = document.getElementById('empty');
const errorElement = document.getElementById('error');
const paginationElement = document.getElementById('pagination');

function render() {
    try {
        const encoded = window.location.hash.slice(1);
        if (!encoded) throw new Error('Search results are unavailable. Enter a search phrase in the browser bar.');
        const data = JSON.parse(decodeURIComponent(encoded));
        if (!data || typeof data !== 'object' || !Array.isArray(data.results)) {
            throw new Error('Peanut Browsing returned an invalid results document.');
        }
        queryElement.textContent = data.query || 'Search';
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
