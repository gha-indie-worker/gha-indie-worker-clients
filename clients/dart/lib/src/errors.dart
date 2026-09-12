enum ClientErrorCode {
  invalidBase,
  emptyToken,
  http,
  tooLarge,
  invalidJson,
  invalidShape,
}

class ClientException implements Exception {
  const ClientException(this.code);
  final ClientErrorCode code;
  @override
  String toString() => 'ClientException(${code.name})';
}

ClientException asClientException(Object error) => error is ClientException
    ? error
    : const ClientException(ClientErrorCode.http);
