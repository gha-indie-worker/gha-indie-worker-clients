import 'dart:convert';
import 'dart:typed_data';

import 'config.dart';
import 'errors.dart';
import 'models.dart';

class Client {
  Client(this.config) {
    if (config.baseUrl.trim().isEmpty) {
      throw const ClientException(ClientErrorCode.invalidBase);
    }
  }

  final ClientConfig config;

  String healthUrl() =>
      '${config.baseUrl.replaceAll(RegExp(r'/$'), '')}/v1/health';

  Health decodeHealth(Uint8List body) {
    if (body.length > config.maxResponseBytes) {
      throw const ClientException(ClientErrorCode.tooLarge);
    }
    final Object? decoded;
    try {
      decoded = jsonDecode(utf8.decode(body));
    } on FormatException {
      throw const ClientException(ClientErrorCode.invalidJson);
    }
    if (decoded is! Map ||
        decoded['ok'] is! bool ||
        decoded['service'] is! String ||
        (decoded['service'] as String).isEmpty) {
      throw const ClientException(ClientErrorCode.invalidShape);
    }
    return Health(
        ok: decoded['ok'] as bool, service: decoded['service'] as String);
  }
}
