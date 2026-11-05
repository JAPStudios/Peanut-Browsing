#!/usr/bin/env python3
"""Small, first-party website index for Peanut Browsing.

The service indexes pages from explicitly submitted seed sites. It respects
robots.txt, stays on the seed origin, rejects private/local targets, and
requires the shared gateway key for search and crawl operations.
"""
from __future__ import annotations

import hmac
import http.client
from contextlib import contextmanager
import ipaddress
import json
import os
import re
import socket
import sqlite3
import time
import xml.etree.ElementTree as ET
from collections import deque
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urldefrag, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPHandler, HTTPRedirectHandler, HTTPSHandler, ProxyHandler, Request, build_opener


USER_AGENT = "PeanutBrowsingBot/0.1"
MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_TEXT_CHARS = 100_000
DEFAULT_CRAWL_PAGES = 10
MAX_CRAWL_PAGES = 25
MAX_SITEMAP_FILES = 10
MAX_SITEMAP_URLS = 1000
DEFAULT_SEARCH_LIMIT = 20
MAX_SEARCH_LIMIT = 50
DATABASE_PATH = os.environ.get("INDEX_DB_PATH", "/data/index.sqlite")
API_KEY = os.environ.get("PEANUT_SEARCH_API_KEY", "")


def validate_public_url(value: str, resolve: bool = False) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("A valid public website address is required.")
    parsed = urlsplit(value.strip())
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if (parsed.scheme not in ("http", "https") or not hostname or
            parsed.username or parsed.password or
            hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal", ".test", ".invalid"))):
        raise ValueError("Only public HTTP or HTTPS website addresses can be indexed.")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None
    if address and not address.is_global:
        raise ValueError("Private, loopback, and reserved network addresses cannot be indexed.")
    if resolve and not address:
        try:
            records = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
        except OSError as error:
            raise ValueError("The website address could not be resolved.") from error
        if not records or any(not ipaddress.ip_address(record[4][0].split("%")[0]).is_global for record in records):
            raise ValueError("The website address resolves to a private or reserved network.")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))


def same_origin(left: str, right: str) -> bool:
    a, b = urlsplit(left), urlsplit(right)
    return (a.scheme, a.hostname, a.port) == (b.scheme, b.hostname, b.port)


class SafeRedirectHandler(HTTPRedirectHandler):
    def __init__(self, expected_origin: str):
        super().__init__()
        self.expected_origin = expected_origin

    def redirect_request(self, request, fp, code, message, headers, new_url):
        validate_public_url(new_url, resolve=True)
        if not same_origin(self.expected_origin, new_url):
            raise ValueError("A crawl redirect left the current website origin; the page was skipped.")
        return super().redirect_request(request, fp, code, message, headers, new_url)


def connect_public_host(host: str, port: int, timeout: int, source_address=None):
    """Resolve once, reject mixed/private DNS answers, and connect to a checked IP."""
    try:
        records = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as error:
        raise ValueError("The website address could not be resolved.") from error
    if not records:
        raise ValueError("The website address could not be resolved.")

    candidates = []
    for family, socktype, protocol, _, address in records:
        try:
            ip = ipaddress.ip_address(address[0].split("%")[0])
        except ValueError as error:
            raise ValueError("The website address resolved to an invalid network address.") from error
        if not ip.is_global:
            raise ValueError("The website address resolves to a private or reserved network.")
        candidates.append((family, socktype, protocol, address))

    last_error = None
    for family, socktype, protocol, address in candidates:
        connection = socket.socket(family, socktype, protocol)
        try:
            connection.settimeout(timeout)
            if source_address:
                connection.bind(source_address)
            connection.connect(address)
            return connection
        except OSError as error:
            last_error = error
            connection.close()
    if last_error:
        raise last_error
    raise OSError("No public network address was available.")


class PublicHTTPConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = connect_public_host(self.host, self.port, self.timeout, self.source_address)
        if self._tunnel_host:
            self._tunnel()


class PublicHTTPSConnection(http.client.HTTPSConnection):
    def connect(self):
        self.sock = connect_public_host(self.host, self.port, self.timeout, self.source_address)
        if self._tunnel_host:
            self._tunnel()
        server_hostname = self._tunnel_host or self.host
        self.sock = self._context.wrap_socket(self.sock, server_hostname=server_hostname)


class PublicHTTPHandler(HTTPHandler):
    def http_open(self, request):
        return self.do_open(PublicHTTPConnection, request)


class PublicHTTPSHandler(HTTPSHandler):
    def https_open(self, request):
        return self.do_open(
            PublicHTTPSConnection,
            request,
            context=self._context,
            check_hostname=self._check_hostname,
        )


def fetch_bytes(url: str, timeout: int = 8) -> tuple[bytes, str, str]:
    safe_url = validate_public_url(url, resolve=True)
    request = Request(safe_url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1",
    })
    parsed = urlsplit(safe_url)
    expected_origin = urlunsplit((parsed.scheme, parsed.netloc, "/", "", ""))
    opener = build_opener(
        ProxyHandler({}),
        SafeRedirectHandler(expected_origin),
        PublicHTTPHandler(),
        PublicHTTPSHandler(),
    )
    with opener.open(request, timeout=timeout) as response:
        content_type = response.headers.get("Content-Type", "").lower()
        body = response.read(MAX_BODY_BYTES + 1)
        if len(body) > MAX_BODY_BYTES:
            raise ValueError("The page exceeds the indexing size limit.")
        return body, response.geturl(), content_type


class PageParser(HTMLParser):
    SKIP_TAGS = {"script", "style", "noscript", "svg", "nav", "footer", "header"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title_parts = []
        self.text_parts = []
        self.links = []
        self.in_title = False
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "title":
            self.in_title = True
        if tag in self.SKIP_TAGS:
            self.skip_depth += 1
        if tag == "a" and self.skip_depth == 0:
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "title":
            self.in_title = False
        if tag in self.SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data):
        cleaned = " ".join(data.split())
        if not cleaned:
            return
        if self.in_title:
            self.title_parts.append(cleaned)
        elif not self.skip_depth:
            self.text_parts.append(cleaned)


def parse_html(source: str) -> tuple[str, str, list[str]]:
    parser = PageParser()
    parser.feed(source)
    title = " ".join(parser.title_parts).strip()[:500]
    body = " ".join(parser.text_parts).strip()[:MAX_TEXT_CHARS]
    return title, body, parser.links


def tokenize_query(query: str) -> list[str]:
    if not isinstance(query, str):
        return []
    return re.findall(r"[\w]{2,}", query.casefold(), flags=re.UNICODE)[:12]


def build_fts_query(query: str) -> str:
    """Build a parameter-safe FTS5 expression with AND terms and quoted phrases."""
    if not isinstance(query, str) or len(query) > 200:
        raise ValueError("Search phrases must contain between 1 and 200 characters.")
    parts = []
    token_count = 0
    for match in re.finditer(r'"([^"]+)"|([^"]+)', query):
        phrase, plain = match.group(1), match.group(2)
        if phrase is not None:
            tokens = re.findall(r"[\w]{2,}", phrase.casefold(), flags=re.UNICODE)
            tokens = tokens[:max(0, 12 - token_count)]
            if tokens:
                token_count += len(tokens)
                parts.append('"' + " ".join(tokens) + '"')
        else:
            tokens = re.findall(r"[\w]{2,}", plain.casefold(), flags=re.UNICODE)
            for token in tokens:
                token_count += 1
                parts.append('"' + token.replace('"', '""') + '"')
        if token_count >= 12:
            break
    if not parts:
        raise ValueError("Enter at least one search term containing two or more characters.")
    return " AND ".join(parts[:12])


class IndexStore:
    def __init__(self, path: str):
        self.path = path
        if path != ":memory:":
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with self.connect() as connection:
            connection.execute(
                "CREATE VIRTUAL TABLE IF NOT EXISTS page_index "
                "USING fts5(title, url UNINDEXED, body, tokenize='unicode61')"
            )

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def upsert(self, url: str, title: str, body: str):
        with self.connect() as connection:
            connection.execute("DELETE FROM page_index WHERE url = ?", (url,))
            connection.execute(
                "INSERT INTO page_index(title, url, body) VALUES (?, ?, ?)",
                (title[:500], url, body[:MAX_TEXT_CHARS]),
            )

    def count(self):
        with self.connect() as connection:
            return connection.execute("SELECT COUNT(*) FROM page_index").fetchone()[0]

    def search(self, query: str, limit: int = DEFAULT_SEARCH_LIMIT, offset: int = 0):
        if not isinstance(query, str) or len(query) > 200:
            raise ValueError("Search phrases must contain between 1 and 200 characters.")
        safe_query = build_fts_query(query)
        with self.connect() as connection:
            total = connection.execute(
                "SELECT COUNT(*) FROM page_index WHERE page_index MATCH ?", (safe_query,)
            ).fetchone()[0]
            rows = connection.execute(
                "SELECT title, url, snippet(page_index, 2, '', '', ' … ', 22) AS snippet, "
                "bm25(page_index, 8.0, 0.0, 1.0) AS rank FROM page_index "
                "WHERE page_index MATCH ? ORDER BY rank LIMIT ? OFFSET ?",
                (safe_query, limit, offset),
            ).fetchall()
        results = []
        for row in rows:
            rank = float(row["rank"])
            results.append({
                "title": row["title"] or urlsplit(row["url"]).hostname or row["url"],
                "url": row["url"],
                "snippet": row["snippet"],
                "engine": "Peanut Index",
                "score": 1.0 / (1.0 + abs(rank)),
            })
        return {"results": results, "totalResults": total}


def read_robots(origin: str):
    from urllib.robotparser import RobotFileParser

    robots_url = urljoin(origin, "/robots.txt")
    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        body, final_url, content_type = fetch_bytes(robots_url, timeout=5)
        if not same_origin(origin, final_url):
            raise ValueError("robots.txt redirected outside the submitted website; crawling stopped.")
        parser.set_url(final_url)
        parser.parse(body.decode("utf-8", errors="replace").splitlines())
    except HTTPError as error:
        if error.code == 404:
            parser.parse([])
        else:
            raise ValueError("robots.txt could not be checked; crawling stopped.") from error
    except ValueError:
        raise
    except (URLError, OSError) as error:
        raise ValueError("robots.txt could not be checked; crawling stopped.") from error
    return parser


def parse_sitemap_document(payload: bytes) -> tuple[str, list[str]]:
    """Return (index|urlset, loc values) from a bounded XML sitemap."""
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as error:
        raise ValueError("A sitemap contained invalid XML.") from error
    kind = root.tag.rsplit("}", 1)[-1].lower()
    if kind not in ("sitemapindex", "urlset"):
        raise ValueError("The XML document is not a supported sitemap.")
    locations = []
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1].lower() == "loc" and element.text:
            value = element.text.strip()
            if value and len(value) <= 2048:
                locations.append(value)
    return ("index" if kind == "sitemapindex" else "urlset"), locations


def discover_sitemap_urls(origin: str, robots) -> tuple[list[str], int]:
    """Read same-origin sitemap declarations and nested sitemap indexes."""
    declared = robots.site_maps() or [urljoin(origin, "/sitemap.xml")]
    pending = deque(declared[:MAX_SITEMAP_FILES])
    seen_sitemaps = set()
    page_urls = []
    seen_pages = set()
    read_count = 0

    while pending and read_count < MAX_SITEMAP_FILES and len(page_urls) < MAX_SITEMAP_URLS:
        candidate = pending.popleft()
        try:
            sitemap_url = urldefrag(validate_public_url(urljoin(origin, candidate)))[0]
        except ValueError:
            continue
        if not same_origin(origin, sitemap_url) or sitemap_url in seen_sitemaps:
            continue
        seen_sitemaps.add(sitemap_url)
        try:
            payload, final_url, content_type = fetch_bytes(sitemap_url, timeout=8)
            if not same_origin(origin, final_url):
                continue
            kind, locations = parse_sitemap_document(payload)
        except (HTTPError, URLError, OSError, ValueError):
            continue
        read_count += 1
        for location in locations:
            try:
                target = urldefrag(validate_public_url(urljoin(final_url, location)))[0]
            except ValueError:
                continue
            if not same_origin(origin, target):
                continue
            if kind == "index":
                if target not in seen_sitemaps and len(pending) < MAX_SITEMAP_FILES:
                    pending.append(target)
            elif target not in seen_pages and len(page_urls) < MAX_SITEMAP_URLS:
                seen_pages.add(target)
                page_urls.append(target)

    return page_urls, read_count


def crawl_site(seed_url: str, max_pages: int, store: IndexStore):
    seed = validate_public_url(seed_url, resolve=True)
    origin_parts = urlsplit(seed)
    origin = urlunsplit((origin_parts.scheme, origin_parts.netloc, "/", "", ""))
    robots = read_robots(origin)
    sitemap_urls, sitemaps_read = discover_sitemap_urls(origin, robots)
    queue = deque([seed])
    queued = {seed}
    for sitemap_url in sitemap_urls:
        if sitemap_url not in queued:
            queued.add(sitemap_url)
            queue.append(sitemap_url)

    # Follow public links across origins while applying each origin's robots
    # policy and crawl delay independently.
    robots_by_origin = {origin: robots}
    last_fetch_by_origin = {}
    visits_by_origin = {}
    indexed = 0
    visited = 0
    max_pages_per_origin = 3

    while queue and visited < max_pages:
        current = queue.popleft()
        parts = urlsplit(current)
        current_origin = urlunsplit((parts.scheme, parts.netloc, "/", "", ""))
        current_robots = robots_by_origin.get(current_origin)
        if current_robots is None:
            try:
                current_robots = read_robots(current_origin)
            except (HTTPError, URLError, OSError, ValueError):
                robots_by_origin[current_origin] = False
                continue
            robots_by_origin[current_origin] = current_robots
        if current_robots is False or not current_robots.can_fetch(USER_AGENT, current):
            continue

        host_key = (parts.hostname or "").lower()
        if visits_by_origin.get(host_key, 0) >= max_pages_per_origin:
            continue
        crawl_delay = current_robots.crawl_delay(USER_AGENT) or current_robots.crawl_delay("*") or 0.5
        delay = min(max(float(crawl_delay), 0.5), 5.0)
        elapsed = time.monotonic() - last_fetch_by_origin.get(current_origin, 0)
        if elapsed < delay:
            time.sleep(delay - elapsed)

        visited += 1
        visits_by_origin[host_key] = visits_by_origin.get(host_key, 0) + 1
        last_fetch_by_origin[current_origin] = time.monotonic()
        try:
            payload, final_url, content_type = fetch_bytes(current)
            if not same_origin(current_origin, final_url) or "html" not in content_type:
                continue
            title, body, links = parse_html(payload.decode("utf-8", errors="replace"))
            if not body:
                continue
            store.upsert(final_url, title or urlsplit(final_url).hostname or final_url, body)
            indexed += 1
            for href in links:
                try:
                    candidate = urldefrag(validate_public_url(urljoin(final_url, href)))[0]
                except ValueError:
                    continue
                candidate_parts = urlsplit(candidate)
                candidate_host = (candidate_parts.hostname or "").lower()
                if (candidate not in queued and len(queued) < max_pages * 12
                        and visits_by_origin.get(candidate_host, 0) < max_pages_per_origin):
                    queued.add(candidate)
                    queue.append(candidate)
        except (HTTPError, URLError, OSError, ValueError):
            continue

    return {"visited": visited, "indexed": indexed, "remaining": len(queue),
            "sitemapsRead": sitemaps_read, "sitemapPagesDiscovered": len(sitemap_urls),
            "originsChecked": len(robots_by_origin)}


class SearchHandler(BaseHTTPRequestHandler):

    def log_message(self, format_string, *args):
        return

    def send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        supplied = self.headers.get("X-API-Key", "")
        return bool(API_KEY) and hmac.compare_digest(supplied, API_KEY)

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == "/healthz":
            self.send_json(200, {"status": "ok", "indexedPages": self.server.store.count()})
            return
        if parsed.path != "/search":
            self.send_json(404, {"status": "error", "error": "Not found."})
            return
        if not self.authorized():
            self.send_json(401, {"status": "error", "error": "Unauthorized."})
            return
        params = parse_qs(parsed.query)
        query = params.get("q", [""])[0]
        try:
            limit = min(max(int(params.get("limit", [DEFAULT_SEARCH_LIMIT])[0]), 1), MAX_SEARCH_LIMIT)
            offset = min(max(int(params.get("offset", [0])[0]), 0), 100_000)
            result = self.server.store.search(query, limit, offset)
            self.send_json(200, {"status": "ok", **result})
        except (ValueError, sqlite3.Error) as error:
            self.send_json(400, {"status": "error", "error": str(error)})

    def do_POST(self):
        if urlsplit(self.path).path != "/crawl":
            self.send_json(404, {"status": "error", "error": "Not found."})
            return
        if not self.authorized():
            self.send_json(401, {"status": "error", "error": "Unauthorized."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 8192:
                raise ValueError("The crawl request must contain a small JSON body.")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("The crawl request must be a JSON object.")
            seed_url = payload.get("url")
            max_pages = int(payload.get("maxPages", DEFAULT_CRAWL_PAGES))
            if not 1 <= max_pages <= MAX_CRAWL_PAGES:
                raise ValueError("maxPages must be between 1 and 25.")
            result = crawl_site(seed_url, max_pages, self.server.store)
            self.send_json(200, {"status": "ok", "seed": seed_url, **result})
        except (ValueError, TypeError, json.JSONDecodeError, sqlite3.Error) as error:
            self.send_json(400, {"status": "error", "error": str(error)})

    def do_HEAD(self):
        self.send_response(405)
        self.send_header("Allow", "GET, POST")
        self.end_headers()


def main():
    if not API_KEY:
        raise SystemExit("PEANUT_SEARCH_API_KEY must be configured.")
    server = ThreadingHTTPServer(("0.0.0.0", 8081), SearchHandler)
    server.store = IndexStore(DATABASE_PATH)
    server.serve_forever()


if __name__ == "__main__":
    main()
