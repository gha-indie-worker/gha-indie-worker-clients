import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:gha_indie_worker_client/gha_indie_worker_client.dart';
import 'package:test/test.dart';

void main() {
  test('emits checking and available as immutable state variants', () async {
    final triggers = StreamController<void>();
    final client =
        Client(const ClientConfig(baseUrl: 'https://worker.example/'));
    final states = <HealthProbeState>[];
    final subscription = observeHealth(
      triggers: triggers.stream,
      client: client,
      request: (_) => Stream.value(
        Uint8List.fromList(utf8.encode('{"ok":true,"service":"api"}')),
      ),
    ).listen(states.add);

    triggers.add(null);
    await Future<void>.delayed(Duration.zero);

    expect(states, [isA<HealthChecking>(), isA<HealthAvailable>()]);
    expect((states.last as HealthAvailable).health.service, 'api');
    await subscription.cancel();
    await triggers.close();
  });

  test('switchMap cancels a stale request stream', () async {
    final triggers = StreamController<void>();
    final requests = <StreamController<Uint8List>>[];
    var cancellations = 0;
    final client =
        Client(const ClientConfig(baseUrl: 'https://worker.example'));
    final subscription = observeHealth(
      triggers: triggers.stream,
      client: client,
      request: (_) {
        late StreamController<Uint8List> controller;
        controller = StreamController<Uint8List>(
          onCancel: () {
            cancellations += 1;
          },
        );
        requests.add(controller);
        return controller.stream;
      },
    ).listen((_) {});

    triggers.add(null);
    await Future<void>.delayed(Duration.zero);
    triggers.add(null);
    await Future<void>.delayed(Duration.zero);

    expect(cancellations, 1);
    await requests.last.close();
    await subscription.cancel();
    await triggers.close();
  });

  test('decode and transport failures become typed unavailable states',
      () async {
    final cases =
        <({String name, HealthRequest request, ClientErrorCode code})>[
      (
        name: 'malformed JSON',
        request: (_) => Stream.value(Uint8List.fromList(utf8.encode('{'))),
        code: ClientErrorCode.invalidJson,
      ),
      (
        name: 'oversized body',
        request: (_) =>
            Stream.value(Uint8List.fromList(utf8.encode('123456789'))),
        code: ClientErrorCode.tooLarge,
      ),
      (
        name: 'transport error',
        request: (_) => Stream.error(StateError('connection reset')),
        code: ClientErrorCode.http,
      ),
    ];
    final client = Client(
      const ClientConfig(
        baseUrl: 'https://worker.example',
        maxResponseBytes: 8,
      ),
    );

    for (final testCase in cases) {
      final states = await observeHealth(
        triggers: Stream.value(null),
        client: client,
        request: testCase.request,
      ).toList();

      expect(states.last, isA<HealthUnavailable>(), reason: testCase.name);
      expect(
        (states.last as HealthUnavailable).error.code,
        testCase.code,
        reason: testCase.name,
      );
    }
  });

  test('concurrent and late subscribers share and replay one request',
      () async {
    final triggers = StreamController<void>.broadcast();
    final response = StreamController<Uint8List>();
    final client =
        Client(const ClientConfig(baseUrl: 'https://worker.example'));
    var requestCount = 0;
    final stream = observeHealth(
      triggers: triggers.stream,
      client: client,
      request: (_) {
        requestCount += 1;
        return response.stream;
      },
    );
    final firstStates = <HealthProbeState>[];
    final secondStates = <HealthProbeState>[];
    final lateStates = <HealthProbeState>[];
    final first = stream.listen(firstStates.add);
    final second = stream.listen(secondStates.add);

    triggers.add(null);
    await Future<void>.delayed(Duration.zero);
    expect(requestCount, 1);
    response.add(
      Uint8List.fromList(
        utf8.encode('{"ok":true,"service":"shared-result"}'),
      ),
    );
    await Future<void>.delayed(Duration.zero);

    final late = stream.listen(lateStates.add);
    await Future<void>.delayed(Duration.zero);
    expect(requestCount, 1);
    expect(firstStates.last, isA<HealthAvailable>());
    expect(secondStates.last, isA<HealthAvailable>());
    expect(lateStates.last, isA<HealthAvailable>());

    await first.cancel();
    await second.cancel();
    await late.cancel();
    await response.close();
    await triggers.close();
  });

  test('a later trigger recovers after an unavailable state', () async {
    final triggers = StreamController<void>.broadcast(sync: true);
    final states = <HealthProbeState>[];
    final client =
        Client(const ClientConfig(baseUrl: 'https://worker.example'));
    var requestCount = 0;
    final subscription = observeHealth(
      triggers: triggers.stream,
      client: client,
      request: (_) {
        requestCount += 1;
        if (requestCount == 1) {
          return Stream.error(StateError('temporary outage'));
        }
        return Stream.value(
          Uint8List.fromList(
            utf8.encode('{"ok":true,"service":"recovered-api"}'),
          ),
        );
      },
    ).listen(states.add);

    triggers.add(null);
    await Future<void>.delayed(Duration.zero);
    expect(states.last, isA<HealthUnavailable>());

    triggers.add(null);
    await Future<void>.delayed(Duration.zero);
    expect(requestCount, 2);
    expect(states.last, isA<HealthAvailable>());

    await subscription.cancel();
    await triggers.close();
  });
}
