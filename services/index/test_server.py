"""Tests for public-address-pinned crawler connections."""
import socket
import unittest
from unittest.mock import Mock, patch

from server import connect_public_host


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
