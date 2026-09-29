from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ai_usage
from fastapi.testclient import TestClient

import app


class FakeResponse:
    is_success = True
    status_code = 200

    @staticmethod
    def json() -> dict[str, object]:
        return {
            'choices': [{'message': {'content': '/^\\d{3}$/g'}}],
            'usage': {'prompt_tokens': 21, 'completion_tokens': 8},
        }


class FakeErrorResponse:
    is_success = False
    status_code = 500

    @staticmethod
    def json() -> dict[str, object]:
        return {'error': {'message': 'Internal error while processing the request.'}}


class FakeAsyncClient:
    last_call: dict[str, object] | None = None
    response: object = FakeResponse()

    def __init__(self, **_: object) -> None:
        pass

    async def __aenter__(self) -> FakeAsyncClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def post(self, url: str, *, headers: dict[str, str], json: dict[str, object]) -> FakeResponse:
        FakeAsyncClient.last_call = {'url': url, 'headers': headers, 'json': json}
        return FakeAsyncClient.response  # type: ignore[return-value]


class AiRoutesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / 'usage.sqlite3'
        self.database_patch = patch.object(ai_usage, 'DATABASE_PATH', self.database_path)
        self.database_patch.start()
        self.client = TestClient(app.app, client=('127.0.0.1', 12345))
        self.local_headers = {
            'host': 'localhost:8000',
            'origin': 'http://localhost:5173',
        }

    def tearDown(self) -> None:
        self.client.close()
        self.database_patch.stop()
        self.temp_dir.cleanup()

    def test_generation_is_local_only_and_records_usage_without_prompt(self) -> None:
        payload = {
            'provider': 'gemini',
            'model': 'test-model',
            'apiKey': 'test-secret',
            'tool': 'regex-tester',
            'action': 'regex-generate',
            'prompt': 'Return one regex.',
            'context': 'untrusted sample requirement',
            'inputCostPerMillion': 1.0,
            'outputCostPerMillion': 2.0,
        }

        with patch('ai_routes.httpx.AsyncClient', FakeAsyncClient):
            response = self.client.post('/api/ai/generate', headers=self.local_headers, json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['text'], r'/^\d{3}$/g')
        self.assertEqual(FakeAsyncClient.last_call['url'], 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
        self.assertEqual(FakeAsyncClient.last_call['headers']['authorization'], 'Bearer test-secret')

        usage = self.client.get('/api/ai/usage', headers=self.local_headers).json()
        self.assertEqual(usage['requestCount'], 1)
        self.assertEqual(usage['successCount'], 1)
        self.assertEqual(usage['inputTokens'], 21)
        self.assertEqual(usage['outputTokens'], 8)
        self.assertEqual(usage['byProviderModel'][0]['tool'], 'regex-tester')

        with ai_usage._database() as connection:
            columns = {row['name'] for row in connection.execute('PRAGMA table_info(ai_usage)')}
        self.assertNotIn('prompt', columns)
        self.assertNotIn('api_key', columns)

    def test_non_local_host_and_origin_are_rejected(self) -> None:
        remote_host = self.client.post(
            '/api/ai/generate',
            headers={'host': 'example.com', 'origin': 'https://example.com'},
            json={},
        )
        remote_origin = self.client.get(
            '/api/ai/status',
            headers={**self.local_headers, 'origin': 'https://example.com'},
        )

        self.assertEqual(remote_host.status_code, 403)
        self.assertEqual(remote_origin.status_code, 403)

    def test_provider_error_is_explained_and_sensitive_content_is_redacted(self) -> None:
        FakeAsyncClient.response = FakeErrorResponse()
        payload = {
            'provider': 'gemini',
            'model': 'test-model',
            'apiKey': 'secret-test-key',
            'tool': 'regex-tester',
            'action': 'regex-generate',
            'prompt': 'Return one regex.',
            'context': 'private requirement text',
        }

        try:
            with patch('ai_routes.httpx.AsyncClient', FakeAsyncClient):
                response = self.client.post('/api/ai/generate', headers=self.local_headers, json=payload)
        finally:
            FakeAsyncClient.response = FakeResponse()

        self.assertEqual(response.status_code, 502)
        detail = response.json()['detail']
        self.assertIn('HTTP 500', detail)
        self.assertIn('Internal error', detail)
        self.assertNotIn('secret-test-key', detail)
        self.assertNotIn('private requirement text', detail)

    def test_usage_can_be_cleared(self) -> None:
        response = self.client.delete('/api/ai/usage', headers=self.local_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/api/ai/usage', headers=self.local_headers).json()['requestCount'], 0)


if __name__ == '__main__':
    unittest.main()
