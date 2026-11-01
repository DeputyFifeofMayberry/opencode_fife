# Orion Search 1.0 Release Notes

## Overview

We are thrilled to announce the general availability of Orion Search 1.0, a pivotal milestone that reimagines relevance for modern applications. This release delves into the challenges developers face with legacy search and emerges with a meticulously designed solution.

## Key Highlights

### Neural Relevance

At the heart of 1.0 is a hybrid ranking engine that marries classical BM25 with neural embeddings. Moreover, relevance tuning that once required specialist consultants is now a single API call, showcasing our commitment to developer experience.

### Zero-Downtime Reindexing

Furthermore, reindexing operations no longer require maintenance windows. The engine builds new indices in the background and swaps atomically, ensuring your users never notice.

### Comprehensive Analytics

Additionally, every query, click, and conversion is now queryable, fostering a data-informed approach to search optimization.

## Breaking Changes

It's important to note that the legacy `q` parameter is replaced by structured query DSL. Migration guides are available for all supported SDKs, and v0.9 remains operational through the end of the year.

## What's Next

The roadmap includes vector snapshots, multi-tenant isolation, and a facets API. The future of search is bright, and we're honored to build it with you. Happy searching!
