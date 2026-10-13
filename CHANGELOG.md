# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased

## 20261013

### Fixed
- `grel:date_diff`, `grel:math_even` and `grel:math_odd` return `grel:output_number` (`xsd:integer`), as their Java implementations do.

## 20261012

### Fixed
- Some (return) parameters to conform to GREL functions
- The return type of `grel:array_slice` must be `grel:output_array`.
- `grel:math_atan2` is described under its own IRI; its description used `grel:math_atan`.

## 20221012

### Added

- Math functions

## 20220308

### Fixed

- `xsd:number` --> `xsd:integer`

## 20210824

### Added

- a _lot_ more GREL functions
