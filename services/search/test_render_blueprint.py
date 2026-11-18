from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]


class RenderBlueprintTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with (ROOT / "render.yaml").open(encoding="utf-8") as stream:
            cls.blueprint = yaml.load(stream, Loader=yaml.BaseLoader)
        cls.services = {service["name"]: service for service in cls.blueprint["services"]}

    def test_index_service_uses_persistent_storage_and_generated_key(self):
        index = self.services["peanut-browsing-index"]
        self.assertEqual(index["type"], "pserv")
        self.assertEqual(index["runtime"], "docker")
        self.assertEqual(index["dockerContext"], "./services/index")
        self.assertEqual(index["disk"]["mountPath"], "/data")
        self.assertEqual(index["envVars"][1]["key"], "PEANUT_SEARCH_API_KEY")
        self.assertTrue(index["envVars"][1]["generateValue"])
        self.assertEqual(index["autoDeployTrigger"], "off")

    def test_public_gateway_receives_index_host_and_same_api_key(self):
        gateway = self.services["peanut-browsing-gateway"]
        variables = {item["key"]: item for item in gateway["envVars"]}
        self.assertEqual(gateway["type"], "web")
        self.assertEqual(gateway["healthCheckPath"], "/healthz")
        self.assertEqual(
            variables["PEANUT_SEARCH_API_KEY"]["fromService"],
            {
                "name": "peanut-browsing-index",
                "type": "pserv",
                "envVarKey": "PEANUT_SEARCH_API_KEY",
            },
        )
        self.assertEqual(
            variables["PEANUT_INDEX_HOST"]["fromService"],
            {
                "name": "peanut-browsing-index",
                "type": "pserv",
                "property": "hostport",
            },
        )
        self.assertEqual(gateway["autoDeployTrigger"], "off")

    def test_services_share_region_and_do_not_commit_credentials(self):
        index = self.services["peanut-browsing-index"]
        gateway = self.services["peanut-browsing-gateway"]
        self.assertEqual(index["region"], gateway["region"])
        self.assertNotIn("value", index["envVars"][1])
        self.assertNotIn("value", {item["key"]: item for item in gateway["envVars"]}["PEANUT_SEARCH_API_KEY"])


    def test_gateway_forwards_the_validated_api_key_to_the_index(self):
        for relative_path in (
            "services/search/gateway/default.conf.template",
            "services/search/gateway/render.conf.template",
        ):
            configuration = (ROOT / relative_path).read_text(encoding="utf-8")
            self.assertEqual(
                configuration.count("proxy_set_header X-API-Key $http_x_api_key;"),
                2,
                relative_path,
            )


if __name__ == "__main__":
    unittest.main()
