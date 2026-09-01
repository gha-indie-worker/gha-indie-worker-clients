import 'dart:convert';
import 'dart:typed_data';

import 'package:gha_indie_worker_client/gha_indie_worker_client.dart';
import 'package:test/test.dart';

void main() {
  final client = Client(const ClientConfig(baseUrl: 'https://worker.example'));

  test('decodes a valid health response', () {
    final body = Uint8List.fromList(utf8.encode('{"ok":true,"service":"api"}'));
    expect(client.decodeHealth(body).service, 'api');
  });

  test('rejects a structurally invalid response with a typed error', () {
    final body = Uint8List.fromList(utf8.encode('{}'));
    expect(
      () => client.decodeHealth(body),
      throwsA(
        isA<ClientException>().having(
          (error) => error.code,
          'code',
          ClientErrorCode.invalidShape,
        ),
      ),
    );
  });

  test('rejects malformed JSON with a typed error', () {
    final body = Uint8List.fromList(utf8.encode('{'));
    expect(
      () => client.decodeHealth(body),
      throwsA(
        isA<ClientException>().having(
          (error) => error.code,
          'code',
          ClientErrorCode.invalidJson,
        ),
      ),
    );
  });

  test('rejects a response above the configured byte limit', () {
    final boundedClient = Client(
      const ClientConfig(
        baseUrl: 'https://worker.example',
        maxResponseBytes: 8,
      ),
    );
    final body = Uint8List.fromList(utf8.encode('123456789'));
    expect(
      () => boundedClient.decodeHealth(body),
      throwsA(
        isA<ClientException>().having(
          (error) => error.code,
          'code',
          ClientErrorCode.tooLarge,
        ),
      ),
    );
  });
}
