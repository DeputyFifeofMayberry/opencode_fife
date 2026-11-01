# 3.3.0 rewrite — ai_technical_release.md

# DataPipeline v2.4 release notes

## Overview

Version 2.4 adds a redesigned batch processing engine, actionable error reporting, and a simpler REST API.

## Batch processing

The scheduler has been redesigned. It optimizes how work is allocated across distributed workers, and benchmarks show throughput improvements of up to 35% for mixed workloads.

## Error handling

Errors now come with diagnostics that point at the root cause instead of a bare log line. Retry policies are configurable per stage, so a transient fault in one stage no longer fails the whole run.

## REST API

The REST API stays fully backward compatible, and deprecated endpoints keep working through v3.x. New batch endpoints consolidate operations, which cuts round trips.

## Breaking changes

The legacy XML configuration format is no longer supported, so teams should move their configuration to YAML before upgrading. This release also drops Python 3.8; from now on, 3.10 or newer is required.

## Roadmap

Real-time streaming transforms, a plugin architecture, and expanded cloud integrations are planned for v2.5.
