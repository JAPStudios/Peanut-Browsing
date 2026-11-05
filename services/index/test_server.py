"""Tests for public-address-pinned crawler connections."""
import socket
import unittest
from unittest.mock import Mock, patch

from server import IndexStore, build_fts_query, connect_public_host, parse_sitemap_document


class PublicConnectionTests(unittest.TestCase):
    def test_rejects_a_dns_answer_set_containing_a_private_address(self):
        records = [
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("8.8.8.8", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("127.0.0.1", 443)),
        ]
        with patch("server.socket.getaddrinfo", return_value=records):
            with patch("server.socket.socket") as socket_factory:
                with self.assertRaisesRegex(ValueError, "private or reserved"):
                    connect_public_host("example.com", 443, 5)
                socket_factory.assert_not_called()

    def test_connects_to_the_validated_ip_instead_of_resolving_the_hostname_again(self):
        record = (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("8.8.8.8", 443))
        connection = Mock()
        with patch("server.socket.getaddrinfo", return_value=[record]):
            with patch("server.socket.socket", return_value=connection) as socket_factory:
                result = connect_public_host("example.com", 443, 5)
        self.assertIs(result, connection)
        socket_factory.assert_called_once_with(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP)
        connection.settimeout.assert_called_once_with(5)
        connection.connect.assert_called_once_with(("8.8.8.8", 443))

    def test_rejects_a_non_global_literal_ip_before_opening_a_socket(self):
        record = (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("10.0.0.8", 443))
        with patch("server.socket.getaddrinfo", return_value=[record]):
            with patch("server.socket.socket") as socket_factory:
                with self.assertRaisesRegex(ValueError, "private or reserved"):
                    connect_public_host("internal.example", 443, 5)
                socket_factory.assert_not_called()


if __name__ == "__main__":
    unittest.main()


class FirstPartySearchTests(unittest.TestCase):
    def test_unquoted_terms_require_all_terms(self):
        store = IndexStore(":memory:")
        store.upsert("https://peanut.example/browser", "Peanut Browser", "A browser built for independent websites")
        store.upsert("https://peanut.example/butter", "Peanut Butter", "A guide to peanut butter")
        result = store.search("peanut browser")
        self.assertEqual(result["totalResults"], 1)
        self.assertEqual(result["results"][0]["url"], "https://peanut.example/browser")

    def test_quoted_phrase_is_matched_as_a_phrase(self):
        store = IndexStore(":memory:")
        store.upsert("https://peanut.example/exact", "Peanut Browsing", "Create independent websites")
        store.upsert("https://peanut.example/separate", "Peanut and browsing", "Two words separated by another term")
        result = store.search('"peanut browsing"')
        self.assertEqual(result["totalResults"], 1)
        self.assertEqual(result["results"][0]["url"], "https://peanut.example/exact")

    def test_search_terms_are_quoted_before_fts_execution(self):
        expression = build_fts_query('peanut "browser search" OR index')
        self.assertEqual(expression, '"peanut" AND "browser search" AND "or" AND "index"')

    def test_rejects_queries_without_searchable_terms(self):
        store = IndexStore(":memory:")
        with self.assertRaisesRegex(ValueError, "at least one search term"):
            store.search("a + -")

    def test_parses_namespaced_sitemap_documents(self):
        payload = b'''<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.org/one</loc></url>
          <url><loc>https://example.org/two</loc></url>
        </urlset>'''
        kind, locations = parse_sitemap_document(payload)
        self.assertEqual(kind, "urlset")
        self.assertEqual(locations, ["https://example.org/one", "https://example.org/two"])
