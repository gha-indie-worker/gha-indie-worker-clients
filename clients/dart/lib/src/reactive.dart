import 'dart:typed_data';

import 'package:rxdart/rxdart.dart';

import 'client.dart';
import 'errors.dart';
import 'models.dart';

typedef HealthRequest = Stream<Uint8List> Function(String endpoint);

sealed class HealthProbeState {
  const HealthProbeState(this.endpoint);
  final String endpoint;
}

final class HealthChecking extends HealthProbeState {
  const HealthChecking(super.endpoint);
}

final class HealthAvailable extends HealthProbeState {
  const HealthAvailable(super.endpoint, this.health);
  final Health health;
}

final class HealthUnavailable extends HealthProbeState {
  const HealthUnavailable(super.endpoint, this.error);
  final ClientException error;
}

Stream<HealthProbeState> observeHealth({
  required Stream<void> triggers,
  required Client client,
  required HealthRequest request,
}) {
  final endpoint = client.healthUrl();

  return triggers
      .switchMap(
        (_) => Rx.concat<HealthProbeState>([
          Stream.value(HealthChecking(endpoint)),
          request(endpoint)
              .map<HealthProbeState>((body) =>
                  HealthAvailable(endpoint, client.decodeHealth(body)))
              .onErrorReturnWith(
                (error, _) =>
                    HealthUnavailable(endpoint, asClientException(error)),
              ),
        ]),
      )
      .distinct(healthProbeStateEquals)
      .shareReplay(maxSize: 1);
}

bool healthProbeStateEquals(HealthProbeState left, HealthProbeState right) {
  if (left.runtimeType != right.runtimeType ||
      left.endpoint != right.endpoint) {
    return false;
  }
  return switch ((left, right)) {
    (HealthChecking(), HealthChecking()) => true,
    (HealthAvailable(:final health), HealthAvailable(health: final other)) =>
      health.ok == other.ok && health.service == other.service,
    (HealthUnavailable(:final error), HealthUnavailable(error: final other)) =>
      error.code == other.code,
    _ => false,
  };
}
