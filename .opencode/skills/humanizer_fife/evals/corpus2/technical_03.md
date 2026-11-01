# Migrating from Postgres 13 to Postgres 16: Upgrade Guide

## Introduction

This guide walks through migrating your DataHub deployment from PostgreSQL 13 to PostgreSQL 16. The upgrade unlocks significant performance improvements and positions your infrastructure for the future, but it requires careful planning.

## Before You Begin

First and foremost, take a full backup and verify it restores — a backup you haven't tested is not a backup. Additionally, review the deprecated extensions list; the legacy `plpython2u` language is no longer supported and must be removed prior to upgrade.

## The Migration Path

Because PostgreSQL 16 cannot upgrade in place across three major versions, the migration uses logical replication. Set up a 16-instance replica, and let it sync while your application continues running. Furthermore, validate row counts and checksums on your largest tables before cutting over.

Next, update your connection strings and run your integration test suite against the new instance. Moreover, watch for extension ABI changes; PostGIS users must run `postgis_upgrade()` after the switch.

## Rollback Plan

It's important to note that logical replication is one-directional. Keep the 13 cluster running for at least one week; it remains your rollback path.

With validation complete, the migration is a five-minute cutover. Happy upgrading!
