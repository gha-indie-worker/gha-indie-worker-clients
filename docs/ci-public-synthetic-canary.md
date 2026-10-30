# Public synthetic runner admission proof

This test contains **no private Oreslang source or Git tree**. It checks whether an alternate GitHub Actions runner executes actual steps with a pinned checkout of this public carrier repo, then validates a deterministic synthetic artifact and its SHA256. Negative tests reject changed commit, tree, checksum, payload, and false approval statements. The workflow has read-only permissions and cannot check out private repositories. Do not interpret this public carrier pass as private-source-transfer authorization or an Oreslang compiler test. A later private compiler mirror requires independently verified source and carrier approvals and exact-tree equality.

The v2 public canary also binds the immutable GitHub numeric repository ID and verifies the GitHub checkout working tree is clean before and after the synthetic receipt. This proves only a public runner, not any private Oreslang source workflow or export permission.
