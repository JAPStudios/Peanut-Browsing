import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server as index_server
from server import IndexStore, parse_html, tokenize_query, validate_public_url


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
