# FlowMQ 2.1.0 Changelog

## Overview

Version 2.1.0 marks a pivotal moment for FlowMQ, introducing game-changing throughput improvements and a host of community-requested features that underscore our commitment to developer happiness.

## New Features

### Zero-Copy Transport

The new transport layer leverages memory-mapped IO to eliminate serialization overhead. Benchmarks demonstrate throughput gains of up to 2.4x on large payloads, positioning FlowMQ at the forefront of message-broker performance.

### Dead-Letter Policies

Moreover, dead-letter queues can now be configured per-topic with custom retention. It's worth noting that existing defaults remain unchanged, ensuring seamless upgrades.

### Consumer Groups 2.0

Consumer groups have been thoughtfully reimagined with rebalance storm mitigation, cooperative sticky assignment, and a new lag-reporting API — empowering operators to unlock the full potential of their deployments.

## Fixes

- Fixed a race condition in offset commits under high churn
- Fixed incorrect lag metrics when topics are recreated
- Fixed a memory leak in the TLS handshake path

## Deprecations

The legacy `poll()` API is deprecated in favor of `poll_batch()` and will be removed in 3.0. The future of FlowMQ is bright — thank you for building with us.
