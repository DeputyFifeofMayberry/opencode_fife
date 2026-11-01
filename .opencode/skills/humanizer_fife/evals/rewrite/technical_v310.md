# 3.1.0 rewrite — ai_technical_release.md

# DataPipeline v2.4 release notes

## Overview

Version 2.4 adds a redesigned batch processing engine, actionable error reporting, and a simplified REST API.

## Batch processing

The new batch processing engine uses a redesigned scheduler that optimizes resource allocation across distributed workers. Benchmarks show throughput improvements of up to 35% for mixed workloads.

## Error handling

Error reporting now provides actionable diagnostics that pinpoint the root cause of each issue instead of only logging failures. Automatic retry policies can be configured per stage, so operation continues through transient faults.

## REST API

The REST API has been refined to reduce complexity while maintaining full backward compatibility. Deprecated endpoints remain functional through v3.x, providing time for migration. The new batch endpoints reduce round trips by consolidating operations.

## Breaking changes

The legacy XML configuration format is no longer supported. Teams should migrate to YAML configuration before upgrading. Python 3.8 support has been dropped in favor of 3.10+.

## Roadmap

Version 2.5 will include real-time streaming transforms, an enhanced plugin architecture, and expanded cloud integrations.
