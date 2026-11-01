# CloudMetrics API v3.0 Release Notes

## Overview

API v3.0 represents a transformative milestone in our developer platform, delivering a modernized interface that unlocks powerful new integration possibilities.

## Key Features

### GraphQL Endpoint

The new GraphQL endpoint empowers developers to query exactly the data they need, reducing over-fetching. Moreover, benchmarks demonstrate up to 60% fewer round trips for dashboard workloads.

### Webhooks 2.0

Webhook delivery has been comprehensively reimagined. Rather than simply retrying failures, the system now offers exponential backoff, signed payloads, and a replay console — ensuring reliable delivery even during incidents.

### Streamlined Authentication

Furthermore, OAuth 2.1 support replaces our legacy token scheme, providing enhanced security while maintaining full backward compatibility through 2027.

## Breaking Changes

It's important to note that the v2 pagination parameters are deprecated. Teams should migrate to cursor-based pagination prior to January 1st. Additionally, the legacy /v2/metrics endpoint has been retired.

## Looking Ahead

The roadmap for v3.1 includes streaming subscriptions, granular scopes, and expanded SDK coverage. The future of the CloudMetrics platform is bright, and we're excited to continue this journey with our developer community.
