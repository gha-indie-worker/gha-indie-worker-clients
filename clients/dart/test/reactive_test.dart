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
}
