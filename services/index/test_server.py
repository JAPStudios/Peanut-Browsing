"""Tests for public-address-pinned crawler connections."""
import os
import socket
import sqlite3
import tempfile
import unittest
from unittest.mock import Mock, patch

from server import IndexStore, build_fts_query, connect_public_host, parse_site_operator, parse_sitemap_document


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


class FirstPartySearchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = IndexStore(os.path.join(self.temp.name, "index.sqlite"))

    def tearDown(self):
        self.temp.cleanup()

    def test_unquoted_terms_require_all_terms(self):
        store = self.store
        store.upsert("https://peanut.example/browser", "Peanut Browser", "A browser built for independent websites")
        store.upsert("https://peanut.example/butter", "Peanut Butter", "A guide to peanut butter")
        result = store.search("peanut browser")
        self.assertEqual(result["totalResults"], 1)
        self.assertEqual(result["results"][0]["url"], "https://peanut.example/browser")

    def test_or_operator_matches_either_search_group(self):
        store = self.store
        store.upsert("https://peanut.example/peanut", "Peanut guide", "Peanut information")
        store.upsert("https://peanut.example/browser", "Browser guide", "Browser information")
        result = store.search("peanut OR browser")
        self.assertEqual(result["totalResults"], 2)

    def test_unquoted_terms_match_word_prefixes(self):
        self.store.upsert("https://peanut.example/browser", "Peanut Browser", "Independent website browsing")
        result = self.store.search("brows")
        self.assertEqual(result["totalResults"], 1)
        self.assertEqual(result["results"][0]["url"], "https://peanut.example/browser")

    def test_quoted_phrase_is_matched_as_a_phrase(self):
        store = self.store
        store.upsert("https://peanut.example/exact", "Peanut Browsing", "Create independent websites")
        store.upsert("https://peanut.example/separate", "Peanut and browsing", "Two words separated by another term")
        result = store.search('"peanut browsing"')
        self.assertEqual(result["totalResults"], 1)
        self.assertEqual(result["results"][0]["url"], "https://peanut.example/exact")

    def test_search_terms_are_quoted_before_fts_execution(self):
        expression = build_fts_query('peanut "browser search" OR index')
        self.assertEqual(expression, '"peanut"* AND "browser search" OR "index"*')
        self.assertEqual(build_fts_query("peanut OR browser"), '"peanut"* OR "browser"*')
        self.assertEqual(build_fts_query("peanut AND browser"), '"peanut"* AND "browser"*')
        self.assertEqual(build_fts_query('"peanut OR browser"'), '"peanut or browser"')

    def test_rejects_queries_without_searchable_terms(self):
        store = self.store
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


class SiteSearchOperatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = IndexStore(os.path.join(self.temp.name, "index.sqlite"))

    def tearDown(self):
        self.temp.cleanup()

    def test_site_operator_extracts_and_normalizes_a_hostname(self):
        self.assertEqual(
            parse_site_operator("peanut site:WWW.Example.com"),
            ("peanut", "www.example.com"),
        )
        self.assertEqual(
            parse_site_operator("site:https://example.com"),
            ("", "example.com"),
        )

    def test_site_operator_rejects_ambiguous_or_unsafe_hosts(self):
        for query in (
            "peanut site:",
            "peanut site:example.com site:other.example",
            "peanut site:example.com:8443",
            "peanut site:example.com/private",
            "peanut site:localhost",
            "peanut site:127.0.0.1",
        ):
            with self.subTest(query=query):
                with self.assertRaises(ValueError):
                    parse_site_operator(query)

    def test_search_site_filter_matches_domain_and_subdomains(self):
        self.store.upsert(
            "https://example.com/home",
            "Example home",
            "Peanut browser search",
        )
        self.store.upsert(
            "https://www.example.com/about",
            "Example subdomain",
            "Peanut browser search",
        )
        self.store.upsert(
            "https://other.example.net/home",
            "Other domain",
            "Peanut browser search",
        )

        result = self.store.search("peanut browser site:example.com")
        self.assertEqual(result["totalResults"], 2)
        self.assertEqual(
            {item["url"] for item in result["results"]},
            {
                "https://example.com/home",
                "https://www.example.com/about",
            },
        )

    def test_site_filter_can_list_a_domain_without_search_terms(self):
        self.store.upsert("https://example.com/home", "Example home", "A page")
        self.store.upsert("https://www.example.com/about", "Example about", "Another page")
        self.store.upsert("https://other.example.net/home", "Other", "A third page")

        result = self.store.search("site:example.com")
        self.assertEqual(result["totalResults"], 2)

    def test_existing_index_migrates_host_records_for_site_search(self):
        database_path = os.path.join(self.temp.name, "legacy.sqlite")
        with sqlite3.connect(database_path) as connection:
            connection.execute(
                "CREATE VIRTUAL TABLE page_index "
                "USING fts5(title, url UNINDEXED, body, tokenize='unicode61')"
            )
            connection.execute(
                "INSERT INTO page_index(title, url, body) VALUES (?, ?, ?)",
                ("Legacy page", "https://legacy.example/page", "Existing content"),
            )

        migrated_store = IndexStore(database_path)
        result = migrated_store.search("site:legacy.example")
        self.assertEqual(result["totalResults"], 1)
        self.assertEqual(result["results"][0]["url"], "https://legacy.example/page")


if __name__ == "__main__":
    unittest.main()
