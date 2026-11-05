import os
import socket
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server as index_server
from server import (IndexStore, discover_sitemap_urls, parse_html, parse_sitemap_document,
                    read_robots, tokenize_query, validate_public_url)


class SearchIndexTests(unittest.TestCase):
    def test_html_parser_extracts_title_text_and_links_without_script_content(self):
        title, body, links = parse_html(
            "<html><head><title>Peanut Search</title><script>secret()</script></head>"
            "<body><nav>menu</nav><main><p>Useful search content.</p>"
            "<a href='/about'>About</a></main></body></html>"
        )
        self.assertEqual(title, "Peanut Search")
        self.assertIn("Useful search content.", body)
        self.assertNotIn("secret", body)
        self.assertNotIn("menu", body)
        self.assertEqual(links, ["/about"])

    def test_robots_redirect_must_remain_on_submitted_origin(self):
        with patch(
            "server.fetch_bytes",
            return_value=(
                b"User-agent: *\\nDisallow: /private",
                "https://other.example/robots.txt",
                "text/plain",
            ),
        ):
            with self.assertRaisesRegex(ValueError, "redirected outside the submitted website"):
                read_robots("https://example.org/")

    def test_sitemap_parser_reads_urlset_locations(self):
        kind, locations = parse_sitemap_document(
            b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            b'<url><loc>https://example.org/one</loc></url>'
            b'<url><loc>https://example.org/two</loc></url></urlset>'
        )
        self.assertEqual(kind, "urlset")
        self.assertEqual(locations, ["https://example.org/one", "https://example.org/two"])

    def test_sitemap_discovery_follows_nested_indexes_and_rejects_other_origins(self):
        class Robots:
            def site_maps(self):
                return ["https://example.org/sitemap-index.xml"]

        index_xml = (
            b'<sitemapindex><sitemap><loc>https://example.org/nested.xml</loc>'
            b'</sitemap></sitemapindex>'
        )
        nested_xml = (
            b'<urlset><url><loc>https://example.org/one</loc></url>'
            b'<url><loc>https://example.org/two</loc></url>'
            b'<url><loc>https://other.example/page</loc></url></urlset>'
        )

        def fake_fetch(url, timeout=8):
            if url.endswith("sitemap-index.xml"):
                return index_xml, url, "application/xml"
            if url.endswith("nested.xml"):
                return nested_xml, url, "application/xml"
            raise AssertionError("Unexpected sitemap request: " + url)

        with patch("server.fetch_bytes", side_effect=fake_fetch):
            urls, count = discover_sitemap_urls("https://example.org/", Robots())

        self.assertEqual(count, 2)
        self.assertEqual(urls, ["https://example.org/one", "https://example.org/two"])

    def test_query_tokenizer_removes_operators_and_limits_terms(self):
        self.assertEqual(tokenize_query('Peanut AND browsing "engine"'), ["peanut", "and", "browsing", "engine"])
        self.assertEqual(len(tokenize_query("one two three four five six seven eight nine ten eleven twelve thirteen")), 12)
        self.assertEqual(tokenize_query("x"), [])

    def test_index_search_returns_ranked_matching_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            store = IndexStore(os.path.join(directory, "index.sqlite"))
            store.upsert("https://example.org/peanut", "Peanut Browsing", "A privacy focused search engine.")
            store.upsert("https://example.org/other", "Other page", "A recipe for apple pie.")
            result = store.search("privacy search", limit=10)
            self.assertEqual(result["totalResults"], 1)
            self.assertEqual(result["results"][0]["url"], "https://example.org/peanut")
            self.assertEqual(result["results"][0]["engine"], "Peanut Index")

    def test_search_prioritizes_title_matches(self):
        with tempfile.TemporaryDirectory() as directory:
            store = IndexStore(os.path.join(directory, "index.sqlite"))
            store.upsert(
                "https://example.org/title",
                "Privacy Browser",
                "A general guide to secure web access.",
            )
            store.upsert(
                "https://example.org/body",
                "General guide",
                "Privacy browser privacy browser privacy browser",
            )
            result = store.search("privacy browser", limit=10)
            self.assertEqual(result["totalResults"], 2)
            self.assertEqual(result["results"][0]["url"], "https://example.org/title")

    def test_search_returns_pages_matching_explicit_or_terms(self):
        with tempfile.TemporaryDirectory() as directory:
            store = IndexStore(os.path.join(directory, "index.sqlite"))
            store.upsert("https://example.org/peanut", "Peanut project", "A nut-related page.")
            store.upsert("https://example.org/browsing", "Browsing project", "A browser-related page.")
            result = store.search("peanut OR browsing", limit=10)
            self.assertEqual(result["totalResults"], 2)
            self.assertEqual(
                {item["url"] for item in result["results"]},
                {"https://example.org/peanut", "https://example.org/browsing"},
            )

    def test_http_search_endpoint_requires_key_and_returns_results(self):
        with tempfile.TemporaryDirectory() as directory:
            store = IndexStore(os.path.join(directory, "api.sqlite"))
            store.upsert("https://example.org/peanut", "Peanut Browsing", "Privacy search engine")
            original_key = index_server.API_KEY
            index_server.API_KEY = "test-api-key"
            httpd = ThreadingHTTPServer(("127.0.0.1", 0), index_server.SearchHandler)
            httpd.store = store
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            base = "http://127.0.0.1:" + str(httpd.server_address[1])
            try:
                with self.assertRaises(HTTPError) as error:
                    urlopen(base + "/search?q=privacy")
                self.assertEqual(error.exception.code, 401)
                request = Request(base + "/search?q=privacy", headers={"X-API-Key": "test-api-key"})
                with urlopen(request) as response:
                    payload = response.read().decode("utf-8")
                self.assertIn("https://example.org/peanut", payload)
                self.assertIn('"status": "ok"', payload)
            finally:
                httpd.shutdown()
                httpd.server_close()
                thread.join(timeout=2)
                index_server.API_KEY = original_key

    def test_crawler_follows_public_links_across_origins_with_each_robots_policy(self):
        class Robots:
            def can_fetch(self, agent, url):
                return True
            def crawl_delay(self, agent):
                return 0

        class Store:
            def __init__(self):
                self.pages = []
            def upsert(self, url, title, body):
                self.pages.append(url)

        def fake_fetch(url, timeout=8):
            if url == "https://one.example/":
                return (b'<title>One</title><p>First site</p><a href="https://two.example/page">Two</a>',
                        url, "text/html")
            if url == "https://two.example/page":
                return (b'<title>Two</title><p>Second site</p>', url, "text/html")
            raise AssertionError("Unexpected fetch: " + url)

        store = Store()
        with patch("server.read_robots", return_value=Robots()) as robots_reader, \
             patch("server.discover_sitemap_urls", return_value=([], 0)), \
             patch("server.fetch_bytes", side_effect=fake_fetch), \
             patch("server.socket.getaddrinfo", return_value=[
                 (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("8.8.8.8", 443))
             ]), \
             patch("server.time.sleep"):
            result = index_server.crawl_site("https://one.example/", 5, store)

        self.assertEqual(result["indexed"], 2)
        self.assertEqual(result["originsChecked"], 2)
        self.assertEqual(store.pages, ["https://one.example/", "https://two.example/page"])
        robots_reader.assert_called_once_with("https://two.example/")

    def test_public_url_validation_rejects_unsafe_destinations(self):
        for value in (
            "file:///etc/passwd",
            "http://localhost/",
            "http://127.0.0.1/",
            "http://192.168.1.5/",
            "https://example.local/",
            "https://user:pass@example.org/",
        ):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    validate_public_url(value)

    def test_public_url_validation_normalizes_fragment(self):
        self.assertEqual(
            validate_public_url("https://example.org/page#section"),
            "https://example.org/page",
        )


if __name__ == "__main__":
    unittest.main()
