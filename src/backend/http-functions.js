import { ok, badRequest, serverError } from 'wix-http-functions';
import { searchWeb } from 'backend/webSearch';

function jsonResponse(response, payload) {
    response.headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    };
    response.body = payload;
    return response;
}

export async function get_peanutSearch(request) {
    const query = request && request.query ? request.query.q : '';
    const page = request && request.query ? request.query.page : 1;

    try {
        const result = await searchWeb(query, page);
        return ok(jsonResponse({}, result));
    } catch (error) {
        const message = error && typeof error.message === 'string'
            ? error.message
            : 'Peanut Browsing search is temporarily unavailable.';
        const isInputError = /Enter a search phrase|Search phrases must contain|at least one search term|requested search-results page/.test(message);
        const payload = { status: 'error', error: message };
        if (isInputError) return badRequest(jsonResponse({}, payload));
        return serverError(jsonResponse({}, payload));
    }
}
