'use strict';

const queryElement = document.getElementById('query');
const summaryElement = document.getElementById('summary');
const resultsElement = document.getElementById('results');
const emptyElement = document.getElementById('empty');
const errorElement = document.getElementById('error');

function render() {
    try {
        const encoded = window.location.hash.slice(1);
        if (!encoded) throw new Error('Search results are unavailable. Enter a search phrase in the browser bar.');
        const data = JSON.parse(decodeURIComponent(encoded));
        queryElement.textContent = data.query || 'Search';
        summaryElement.textContent = Number.isInteger(data.totalResults)
            ? data.totalResults.toLocaleString() + ' matching pages'
            : data.results.length + ' results';
        resultsElement.replaceChildren();

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
        emptyElement.hidden = data.results.length !== 0;
    } catch (error) {
        summaryElement.textContent = '';
        errorElement.textContent = error.message || 'Search results could not be displayed.';
        errorElement.hidden = false;
    }
}

render();
